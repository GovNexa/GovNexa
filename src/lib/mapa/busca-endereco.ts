// Busca de endereço da localização pelo servidor (E8, decisão D4 do dono: OpenStreetMap/Nominatim, gratuito).
// Ordem: origem, perfil, formato, limite por pessoa e tamanho ANTES de ler o corpo; depois texto, cache, vez na fila e só então o serviço.
// Política de uso do Nominatim: identificação do produto, no máximo 1 pedido por segundo (por instância), cache, nenhuma busca a cada tecla.
// Privacidade: o texto da busca nunca vai a log; os logs só dizem o tipo da falha. Nada é gravado aqui: gravar continua pela rota da B1.
import { mesmaOrigem } from '../documentos/http.ts';
import { modoLocal } from '../login/base.ts';
import { chaveLimite, criarLimitadorMemoria, limitadorDoAmbiente, type Limitador } from '../seguranca/limite.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { AGENTE_BUSCA, lerResultados, montarUrlBusca, normalizarConsulta, type ResultadoBusca } from './busca-endereco-regras.ts';

export const LIMITE_CORPO_BUSCA = 1024;
export const MAX_RESPOSTA_BUSCA = 262_144;
export const TEMPO_LIMITE_BUSCA_MS = 5000;
export const INTERVALO_NOMINATIM_MS = 1100;
export const ESPERA_MAX_MS = 2500;
export const PAUSA_PADRAO_MS = 60_000;
export const PAUSA_MAX_MS = 600_000;
export const BUSCAS_POR_MINUTO = 10;
export const CACHE_TTL_MS = 86_400_000;
export const CACHE_VAZIO_TTL_MS = 3_600_000;
export const CACHE_MAX = 500;

export interface CacheBusca { ler(chave: string): ResultadoBusca[] | null; gravar(chave: string, valor: ResultadoBusca[]): void }
export interface FilaBusca { reservar(): { ok: true; esperaMs: number } | { ok: false; motivo: 'pausado' | 'ocupado' }; pausar(ms: number): void }
export interface EstadoBusca { cache: CacheBusca; fila: FilaBusca; porPessoa: Limitador }
export interface DepsBusca {
  modo: 'real' | 'simulado';
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Limite entre instâncias (ligação LIMITE_API), com chave própria da busca. */
  limitador: Limitador;
  estado: EstadoBusca;
  dormir?: (ms: number) => Promise<void>;
}
export interface ContextoBusca { usuario: Usuario | null | undefined; prefeituraId: unknown }

/** Cache por instância: guarda texto JSON (ninguém altera o que está guardado), vence por tempo e descarta o mais antigo. */
export function criarCacheMemoria(opcoes: { agora?: () => number; max?: number; ttlMs?: number; ttlVazioMs?: number } = {}): CacheBusca {
  const agora = opcoes.agora ?? Date.now;
  const max = opcoes.max ?? CACHE_MAX;
  const itens = new Map<string, { expira: number; json: string }>();
  return {
    ler(chave) {
      const it = itens.get(chave);
      if (!it) return null;
      itens.delete(chave);
      if (it.expira <= agora()) return null;
      itens.set(chave, it);
      return JSON.parse(it.json) as ResultadoBusca[];
    },
    gravar(chave, valor) {
      itens.delete(chave);
      while (itens.size >= max) itens.delete(itens.keys().next().value as string);
      const ttl = valor.length === 0 ? (opcoes.ttlVazioMs ?? CACHE_VAZIO_TTL_MS) : (opcoes.ttlMs ?? CACHE_TTL_MS);
      itens.set(chave, { expira: agora() + ttl, json: JSON.stringify(valor) });
    },
  };
}

/** No máximo 1 pedido a cada 1,1 s por instância (espaça o início dos pedidos); espera longa demais = ocupado; depois de um 429 fica pausada. */
export function criarFila(opcoes: { agora?: () => number; intervaloMs?: number; esperaMaxMs?: number } = {}): FilaBusca {
  const agora = opcoes.agora ?? Date.now;
  const intervalo = opcoes.intervaloMs ?? INTERVALO_NOMINATIM_MS;
  const esperaMax = opcoes.esperaMaxMs ?? ESPERA_MAX_MS;
  let proxima = 0;
  let pausadoAte = 0;
  return {
    reservar() {
      const t = agora();
      if (t < pausadoAte) return { ok: false, motivo: 'pausado' };
      const inicio = Math.max(t, proxima);
      if (inicio - t > esperaMax) return { ok: false, motivo: 'ocupado' };
      proxima = inicio + intervalo;
      return { ok: true, esperaMs: inicio - t };
    },
    pausar(ms) { pausadoAte = Math.max(pausadoAte, agora() + ms); },
  };
}

export function criarEstadoBusca(opcoes: { agora?: () => number; intervaloMs?: number; buscasPorMinuto?: number } = {}): EstadoBusca {
  return {
    cache: criarCacheMemoria({ agora: opcoes.agora }),
    fila: criarFila({ agora: opcoes.agora, intervaloMs: opcoes.intervaloMs }),
    porPessoa: criarLimitadorMemoria({ limite: opcoes.buscasPorMinuto ?? BUSCAS_POR_MINUTO, agora: opcoes.agora }),
  };
}

const ESTADO_REAL = criarEstadoBusca();
const ESTADO_SIMULADO = criarEstadoBusca({ intervaloMs: 0, buscasPorMinuto: 60 });

/** Respostas fictícias da máquina local: os testes e a prévia nunca chamam o Nominatim de verdade.
 * "fora do ar" = serviço com erro; "sem resultado" = nada encontrado; "outra cidade" = só resultado fora da área; o resto = 3 resultados. */
export async function fetchSimulado(url: string): Promise<Response> {
  const q = (new URL(url).searchParams.get('q') ?? '').toLowerCase();
  const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
  if (q.includes('fora do ar')) return new Response('falha simulada', { status: 500 });
  const fora = { lat: '-15.7939', lon: '-47.8828', display_name: 'Esplanada dos Ministérios, Brasília, Distrito Federal, Brasil', category: 'highway', type: 'primary', addresstype: 'road' };
  if (q.includes('sem resultado')) return json([]);
  if (q.includes('outra cidade')) return json([fora]);
  return json([
    { lat: '-16.68000', lon: '-49.25500', display_name: `${new URL(url).searchParams.get('q')}, Setor Central, Goiânia, Goiás, Brasil`, category: 'highway', type: 'primary', addresstype: 'road' },
    { lat: '-16.70500', lon: '-49.27000', display_name: 'Setor Oeste, Goiânia, Goiás, Brasil', category: 'place', type: 'suburb', addresstype: 'suburb' },
    { lat: '-16.72000', lon: '-49.30000', display_name: '100, Rua Exemplo, Jardim América, Goiânia, Goiás, 74000-000, Brasil', category: 'building', type: 'house', addresstype: 'building' },
    fora,
  ]);
}

type AmbienteBusca = { AMBIENTE?: string; BUSCA_ENDERECO_REAL?: string; LIMITE_API?: unknown };
/** Máquina local (AMBIENTE=local, 127.0.0.1, sem cf-ray) usa as respostas fictícias, salvo BUSCA_ENDERECO_REAL=1 para a prévia. */
export function depsDoAmbiente(env: unknown, request: Request): DepsBusca {
  const e = (env ?? {}) as AmbienteBusca;
  const simulado = modoLocal(request, e) && e.BUSCA_ENDERECO_REAL !== '1';
  return simulado
    ? { modo: 'simulado', fetch: (u) => fetchSimulado(u), limitador: limitadorDoAmbiente(e), estado: ESTADO_SIMULADO }
    : { modo: 'real', fetch: (u, i) => fetch(u, i), limitador: limitadorDoAmbiente(e), estado: ESTADO_REAL };
}

const json = (status: number, corpo: Record<string, unknown>, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const INDISPONIVEL = 'A busca de endereços não respondeu agora. Tente de novo em instantes ou marque o ponto no mapa.';

async function descartar(request: Request, max = 65_536): Promise<void> {
  try {
    const leitor = request.body?.getReader();
    if (!leitor) return;
    for (let lidos = 0; lidos < max;) {
      const { done, value } = await leitor.read();
      if (done) return;
      lidos += value.byteLength;
    }
    await leitor.cancel();
  } catch { /* conexão já encerrada */ }
}

/** Lê a resposta do serviço até o teto; acima disso desiste (null). */
async function lerLimitado(r: Response, max: number): Promise<string | null> {
  const leitor = r.body?.getReader();
  if (!leitor) return '';
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await leitor.cancel().catch(() => undefined); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { tudo.set(p, pos); pos += p.byteLength; }
  return new TextDecoder().decode(tudo);
}

function pausaDe(r: Response): number {
  const s = Number(r.headers.get('retry-after'));
  return Number.isFinite(s) && s > 0 ? Math.min(Math.max(s * 1000, PAUSA_PADRAO_MS), PAUSA_MAX_MS) : PAUSA_PADRAO_MS;
}

async function consultar(texto: string, deps: DepsBusca): Promise<ResultadoBusca[] | 'falha'> {
  let r: Response;
  try {
    r = await deps.fetch(montarUrlBusca(texto).toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': AGENTE_BUSCA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TEMPO_LIMITE_BUSCA_MS),
    });
  } catch {
    console.warn('[busca-endereco] sem resposta do serviço');
    return 'falha';
  }
  if (r.status === 429 || r.status === 403) {
    deps.estado.fila.pausar(r.status === 403 ? PAUSA_MAX_MS : pausaDe(r));
    console.warn(`[busca-endereco] serviço recusou (${r.status})`);
    await r.body?.cancel().catch(() => undefined);
    return 'falha';
  }
  if (r.status !== 200) {
    console.warn(`[busca-endereco] resposta ${r.status}`);
    await r.body?.cancel().catch(() => undefined);
    return 'falha';
  }
  const tamanho = Number(r.headers.get('content-length'));
  if (Number.isFinite(tamanho) && tamanho > MAX_RESPOSTA_BUSCA) { await r.body?.cancel().catch(() => undefined); return 'falha'; }
  try {
    const textoResposta = await lerLimitado(r, MAX_RESPOSTA_BUSCA);
    if (textoResposta === null) return 'falha';
    const lista = lerResultados(JSON.parse(textoResposta));
    if (!lista) { console.warn('[busca-endereco] formato inesperado'); return 'falha'; }
    return lista;
  } catch {
    console.warn('[busca-endereco] resposta ilegível');
    return 'falha';
  }
}

export function podeBuscarEndereco(usuario: Usuario | null | undefined): boolean {
  return usuarioPode(usuario, 'editar_projeto');
}

/** POST { q } → { ok, resultados: [{ rotulo, lat, lng, tipo }] }. Não grava nada. */
export async function responderBuscaEndereco(request: Request, contexto: ContextoBusca, deps: DepsBusca): Promise<Response> {
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  if (!podeBuscarEndereco(contexto.usuario)) return json(403, { ok: false, erro: 'Seu perfil não permite alterar a localização.' });
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  const chave = chaveLimite(contexto.prefeituraId, contexto.usuario?.email);
  // Sessão sem prefeitura ou e-mail válidos: recusa como falta de permissão (não é excesso de buscas).
  if (!chave) return json(403, { ok: false, erro: 'Seu perfil não permite alterar a localização.' });
  let dentro = false;
  {
    try { dentro = (await deps.estado.porPessoa.permitir(chave)) === true && (await deps.limitador.permitir(`busca:${chave}`)) === true; } catch { dentro = false; }
  }
  if (!dentro) return json(429, { ok: false, erro: 'Muitas buscas em pouco tempo. Espere um minuto e tente de novo.' });
  const cabecalho = request.headers.get('content-length');
  const tamanho = Number(cabecalho);
  if (cabecalho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_BUSCA) {
    await descartar(request);
    return json(413, { ok: false, erro: 'Busca grande demais.' });
  }
  const texto = await request.text().catch(() => '');
  if (texto.length > LIMITE_CORPO_BUSCA) return json(413, { ok: false, erro: 'Busca grande demais.' });
  let corpo: unknown = null;
  try { corpo = JSON.parse(texto); } catch { return json(400, { ok: false, erro: 'Busca inválida.' }); }
  const consulta = normalizarConsulta(corpo && typeof corpo === 'object' ? (corpo as { q?: unknown }).q : undefined);
  if (!consulta.ok) return json(400, { ok: false, erro: consulta.erro });

  const guardado = deps.estado.cache.ler(consulta.chave);
  if (guardado) return json(200, { ok: true, resultados: guardado });
  const vez = deps.estado.fila.reservar();
  if (!vez.ok) return json(503, { ok: false, erro: INDISPONIVEL }, { 'retry-after': vez.motivo === 'ocupado' ? '2' : '60' });
  if (vez.esperaMs > 0) await (deps.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))))(vez.esperaMs);
  const resultado = await consultar(consulta.texto, deps);
  if (resultado === 'falha') return json(503, { ok: false, erro: INDISPONIVEL });
  deps.estado.cache.gravar(consulta.chave, resultado);
  return json(200, { ok: true, resultados: resultado });
}
