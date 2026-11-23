// Entrada HTTP do PNCP (E14a). Mesma ordem de atenderGravacao: origem, perfil, formato, limite de requisições e tamanho ANTES de ler o corpo.
// A prefeitura e o autor vêm da sessão. Falha do PNCP vira resposta 200 com status (nunca 500); nada vindo do PNCP vai a log.
import { descartar } from '../contratacoes/http.ts';
import { mesmaOrigem } from '../documentos/http.ts';
import { chaveLimite, dentroDoLimite, type Limitador } from '../seguranca/limite.ts';
import type { DepsPncp } from './cliente.ts';
import { LIMITE_CORPO_PNCP } from './regras.ts';
import { executarAcaoOrgao, executarAcaoPncp, podeCadastrarSecretaria, podeUsarPncp, type ContextoPncp, type RespostaPncp } from './servico.ts';

const json = (status: number, corpo: Record<string, unknown>): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const MSG_429_PESSOA = 'Muitas consultas em pouco tempo. Espere um minuto e tente de novo.';

/** Corpo JSON com tamanho limitado (cabeçalho e bytes reais); devolve o objeto ou a resposta de erro. */
async function lerJson(request: Request): Promise<{ ok: true; corpo: unknown } | { ok: false; resposta: Response }> {
  const cabecalho = request.headers.get('content-length');
  const tamanho = Number(cabecalho);
  if (cabecalho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_PNCP) {
    await descartar(request);
    return { ok: false, resposta: json(413, { ok: false, erro: 'Pedido grande demais.' }) };
  }
  const texto = await request.text().catch(() => '');
  if (new TextEncoder().encode(texto).byteLength > LIMITE_CORPO_PNCP) return { ok: false, resposta: json(413, { ok: false, erro: 'Pedido grande demais.' }) };
  try { return { ok: true, corpo: JSON.parse(texto) }; } catch { return { ok: false, resposta: json(400, { ok: false, erro: 'Pedido inválido.' }) }; }
}

const responder = (r: RespostaPncp): Response => (r.ok ? json(200, r.corpo) : json(r.status, { ok: false, erro: r.erro }));
const tipoJson = (request: Request): boolean => /^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '');

export async function atenderPncp(request: Request, c: ContextoPncp, limitador: Limitador, deps: DepsPncp, relogio: () => Date = () => new Date()): Promise<Response> {
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  const pode = podeUsarPncp(c);
  if (!pode.ok) return json(pode.status, { ok: false, erro: pode.erro });
  if (!tipoJson(request)) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  const chave = chaveLimite(c.repositorio.prefeituraId, c.usuario!.email);
  if (!chave) return json(403, { ok: false, erro: 'Seu perfil não permite alterar contratações.' });
  let dentro = false;
  try { dentro = (await deps.estado.porPessoa.permitir(chave)) === true && (await limitador.permitir('pncp:' + chave)) === true; } catch { dentro = false; }
  if (!dentro) return json(429, { ok: false, erro: MSG_429_PESSOA });
  const corpo = await lerJson(request);
  if (!corpo.ok) return corpo.resposta;
  return responder(await executarAcaoPncp(c, corpo.corpo, deps, relogio()));
}

export async function atenderOrgao(request: Request, c: ContextoPncp, limitador: Limitador, relogio: () => Date = () => new Date()): Promise<Response> {
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  const pode = podeCadastrarSecretaria(c);
  if (!pode.ok) return json(pode.status, { ok: false, erro: pode.erro });
  if (!tipoJson(request)) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  if (!(await dentroDoLimite(limitador, c.repositorio.prefeituraId, c.usuario!.email))) return json(429, { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.' });
  const corpo = await lerJson(request);
  if (!corpo.ok) return corpo.resposta;
  return responder(await executarAcaoOrgao(c, corpo.corpo, relogio()));
}
