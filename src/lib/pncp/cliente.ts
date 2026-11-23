// Único ponto que chama o PNCP (E14a). Hosts fixos (https://pncp.gov.br), tempo-limite por chamada e por pedido, teto de bytes,
// uma chamada por vez, sem redirecionamento e pausa da instância depois de 429/503. Nada vindo do PNCP ou da pessoa entra em log.
import { criarLimitadorMemoria, type Limitador } from '../seguranca/limite.ts';
import { lerLimitado } from '../seguranca/ler-limitado.ts';
import {
  BASE_CONSULTA, BASE_PNCP, HOST_PNCP, MAX_BYTES_COMPRA, MAX_BYTES_ITENS, MAX_BYTES_RESULTADOS, MAX_CHAMADAS_PEDIDO, MAX_ITENS,
  MAX_RESULTADOS_ITEM, PAUSA_PNCP_MS, PEDIDOS_POR_MINUTO_PESSOA, PEDIDOS_POR_MINUTO_PREFEITURA, TAMANHO_PAGINA_ITENS, TEMPO_CHAMADA_MS,
  TEMPO_PEDIDO_MS, normalizarCnpj, numeroControle,
} from './regras.ts';
import { lerCompra, lerItens, lerResultados, type CompraPncp, type ItemPncp, type ResultadoPncp, type TrioPncp } from './validacao.ts';

export interface EstadoPncp { pausadoAte: number; porPessoa: Limitador; porPrefeitura: Limitador }
export interface DepsPncp {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  agora: () => number;
  estado: EstadoPncp;
}
export type Coleta =
  | { r: 'ok'; compra: CompraPncp; itens: ItemPncp[]; resultados: ResultadoPncp[]; itensTotal: number; incompleto: boolean }
  | { r: 'nao_encontrado' }
  | { r: 'erro'; motivo: string }
  | { r: 'formato'; motivo: string };

export function criarEstadoPncp(agora?: () => number): EstadoPncp {
  return {
    pausadoAte: 0,
    porPessoa: criarLimitadorMemoria({ limite: PEDIDOS_POR_MINUTO_PESSOA, agora }),
    porPrefeitura: criarLimitadorMemoria({ limite: PEDIDOS_POR_MINUTO_PREFEITURA, agora }),
  };
}

type Chamada =
  | { r: 'json'; json: unknown }
  | { r: 'vazio' }
  | { r: 'nao_encontrado' }
  | { r: 'parou' }
  | { r: 'erro'; motivo: string }
  | { r: 'formato'; motivo: string };

const cancelar = (r: Response): Promise<void> => Promise.resolve(r.body?.cancel()).then(() => undefined, () => undefined);

async function chamar(url: string, teto: number, deps: DepsPncp, prazo: number, contador: { n: number }, compra404 = false): Promise<Chamada> {
  let origem = '';
  try { origem = new URL(url).origin; } catch { /* origem vazia */ }
  if (origem !== HOST_PNCP) return { r: 'erro', motivo: 'Endereço fora do PNCP.' };
  if (deps.agora() < deps.estado.pausadoAte) return { r: 'erro', motivo: 'PNCP em pausa por excesso de pedidos' };
  const restante = prazo - deps.agora();
  if (restante <= 0 || contador.n >= MAX_CHAMADAS_PEDIDO) return { r: 'parou' };
  contador.n += 1;
  let resposta: Response;
  try {
    resposta = await deps.fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1, Math.min(TEMPO_CHAMADA_MS, restante))),
    });
  } catch {
    console.warn('[pncp] sem resposta');
    return { r: 'erro', motivo: 'sem resposta do PNCP' };
  }
  const status = resposta.status;
  if (status === 200) {
    let corpo: string | null;
    try { corpo = await lerLimitado(resposta, teto); } catch { console.warn('[pncp] leitura interrompida'); return { r: 'erro', motivo: 'sem resposta do PNCP' }; }
    if (corpo === null) { console.warn('[pncp] resposta grande demais'); return { r: 'erro', motivo: 'Resposta grande demais.' }; }
    try { return { r: 'json', json: JSON.parse(corpo) }; } catch { console.warn('[pncp] resposta ilegível'); return { r: 'formato', motivo: 'Resposta fora do formato esperado.' }; }
  }
  await cancelar(resposta);
  if (status === 204 && !compra404) return { r: 'vazio' };
  if (status === 404 && compra404) return { r: 'nao_encontrado' };
  if (status === 429 || status === 503) {
    deps.estado.pausadoAte = deps.agora() + PAUSA_PNCP_MS;
    console.warn('[pncp] recusou por excesso de pedidos');
    return { r: 'erro', motivo: `PNCP respondeu ${status}` };
  }
  console.warn('[pncp] status inesperado');
  return { r: 'erro', motivo: `PNCP respondeu ${status}` };
}

function trioSeguro(trio: TrioPncp): TrioPncp | null {
  const cnpj = normalizarCnpj(trio.cnpj);
  return cnpj && Number.isInteger(trio.ano) && Number.isInteger(trio.sequencial) ? { cnpj, ano: trio.ano, sequencial: trio.sequencial } : null;
}
const caminho = (t: TrioPncp): string =>
  `/orgaos/${encodeURIComponent(t.cnpj)}/compras/${encodeURIComponent(String(t.ano))}/${encodeURIComponent(String(t.sequencial))}`;

async function buscarCompraInterna(t: TrioPncp, deps: DepsPncp, prazo: number, contador: { n: number }): Promise<{ r: 'ok'; compra: CompraPncp } | Exclude<Coleta, { r: 'ok' }>> {
  const c = await chamar(`${BASE_CONSULTA}${caminho(t)}`, MAX_BYTES_COMPRA, deps, prazo, contador, true);
  if (c.r === 'nao_encontrado') return { r: 'nao_encontrado' };
  if (c.r === 'parou') return { r: 'erro', motivo: 'tempo esgotado' };
  if (c.r === 'erro' || c.r === 'formato') return c;
  if (c.r === 'vazio') return { r: 'formato', motivo: 'Resposta vazia.' };
  const compra = lerCompra(c.json, t);
  return compra ? { r: 'ok', compra } : { r: 'formato', motivo: 'Compra com identidade ou campos fora do formato.' };
}

/** Só a compra (prévia antes de ligar). `prazo` = instante limite em ms do relógio injetado. */
export async function buscarCompra(trio: TrioPncp, deps: DepsPncp, prazo: number = deps.agora() + TEMPO_PEDIDO_MS): Promise<{ r: 'ok'; compra: CompraPncp } | Exclude<Coleta, { r: 'ok' }>> {
  const t = trioSeguro(trio);
  if (!t) return { r: 'erro', motivo: 'Compra inválida.' };
  return buscarCompraInterna(t, deps, prazo, { n: 0 });
}

/** Compra + itens (páginas de 50 até MAX_ITENS) + resultados de cada item com resultado. Uma chamada por vez. */
export async function coletar(trio: TrioPncp, deps: DepsPncp, prazo: number = deps.agora() + TEMPO_PEDIDO_MS): Promise<Coleta> {
  const t = trioSeguro(trio);
  if (!t) return { r: 'erro', motivo: 'Compra inválida.' };
  const contador = { n: 0 };
  const c = await buscarCompraInterna(t, deps, prazo, contador);
  if (c.r !== 'ok') return c;
  const controle = numeroControle(t.cnpj, t.ano, t.sequencial);
  let incompleto = false;
  const itens: ItemPncp[] = [];
  const vistos = new Set<number>();
  for (let pagina = 1; ; pagina++) {
    const r = await chamar(`${BASE_PNCP}${caminho(t)}/itens?pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA_ITENS}`, MAX_BYTES_ITENS, deps, prazo, contador);
    if (r.r === 'parou') { incompleto = true; break; }
    if (r.r === 'erro' || r.r === 'formato') return r;
    if (r.r === 'nao_encontrado') return { r: 'erro', motivo: 'PNCP respondeu 404' };
    const lista = r.r === 'vazio' ? [] : lerItens(r.json);
    if (!lista) return { r: 'formato', motivo: 'Itens fora do formato esperado.' };
    for (const it of lista) {
      if (vistos.has(it.numeroItem)) return { r: 'formato', motivo: 'Itens fora do formato esperado.' };
      vistos.add(it.numeroItem);
      if (itens.length < MAX_ITENS) itens.push(it); else incompleto = true;
    }
    if (lista.length < TAMANHO_PAGINA_ITENS) break;
    if (itens.length >= MAX_ITENS) { incompleto = true; break; }
  }
  const resultados: ResultadoPncp[] = [];
  for (const it of itens) {
    if (!it.temResultado) continue;
    const r = await chamar(`${BASE_PNCP}${caminho(t)}/itens/${encodeURIComponent(String(it.numeroItem))}/resultados`, MAX_BYTES_RESULTADOS, deps, prazo, contador);
    if (r.r === 'parou') { incompleto = true; break; }
    if (r.r === 'erro' || r.r === 'formato') return r;
    if (r.r === 'nao_encontrado') return { r: 'erro', motivo: 'PNCP respondeu 404' };
    if (r.r === 'vazio') continue;
    const lista = lerResultados(r.json, it.numeroItem, controle);
    if (!lista) return { r: 'formato', motivo: 'Resultados fora do formato esperado.' };
    if (Array.isArray(r.json) && r.json.length > MAX_RESULTADOS_ITEM) incompleto = true;
    resultados.push(...lista);
  }
  return { r: 'ok', compra: c.compra, itens, resultados, itensTotal: itens.length, incompleto };
}
