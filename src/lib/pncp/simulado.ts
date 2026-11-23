// Respostas fictícias do PNCP para a máquina local e para os testes (E14a). Nada aqui chama a internet.
import dados from '../../../data/exemplo/pncp/compras.json' with { type: 'json' };
import { modoLocal } from '../login/base.ts';
import { BASE_CONSULTA, BASE_PNCP, TAMANHO_PAGINA_ITENS } from './regras.ts';
import { criarEstadoPncp, type DepsPncp } from './cliente.ts';

type Registro = { compra: unknown; itens: unknown[]; resultados: Record<string, unknown[]> };
const COMPRAS = (dados as unknown as { compras: Record<string, Registro> }).compras;
const CNPJ_PRINCIPAL = '90000001000129';

const json = (corpo: unknown): Response => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
const vazio = (status: number): Response => new Response(status === 204 ? null : '', { status });

/** Responde como o PNCP responderia (compra, itens paginados e resultados). Só aceita endereços do PNCP; qualquer outro = 404. */
export async function fetchSimulado(url: string): Promise<Response> {
  let u: URL;
  try { u = new URL(url); } catch { return vazio(404); }
  const consulta = url.startsWith(BASE_CONSULTA + '/');
  if (!consulta && !url.startsWith(BASE_PNCP + '/')) return vazio(404);
  const m = /\/orgaos\/([0-9A-Z]{14})\/compras\/(\d{4})\/(\d{1,6})(?:\/itens(?:\/(\d{1,5})\/resultados)?)?$/.exec(u.pathname);
  if (!m) return vazio(404);
  const [, cnpj, ano, seq, itemTxt] = m;
  if (cnpj === CNPJ_PRINCIPAL && ano === '2026' && seq === '7') return vazio(500);
  if (cnpj === CNPJ_PRINCIPAL && ano === '2026' && seq === '8') return vazio(429);
  const reg = COMPRAS[`${cnpj}/${ano}/${Number(seq)}`];
  if (!reg) return vazio(404);
  const ehItens = u.pathname.endsWith('/itens');
  const ehResultados = itemTxt !== undefined;
  if (!ehItens && !ehResultados) return consulta ? json(reg.compra) : vazio(404);
  if (consulta) return vazio(404);
  if (ehItens) {
    const pagina = Math.max(1, Number(u.searchParams.get('pagina')) || 1);
    const tamanho = Math.min(TAMANHO_PAGINA_ITENS, Math.max(1, Number(u.searchParams.get('tamanhoPagina')) || TAMANHO_PAGINA_ITENS));
    return json(reg.itens.slice((pagina - 1) * tamanho, pagina * tamanho));
  }
  const lista = reg.resultados[String(Number(itemTxt))];
  return !lista || lista.length === 0 ? vazio(204) : json(lista);
}

const ESTADO_REAL = criarEstadoPncp();
const ESTADO_SIMULADO = criarEstadoPncp();

type AmbientePncp = { AMBIENTE?: string; PNCP_REAL?: string };
/** Máquina local (AMBIENTE=local, 127.0.0.1, sem cf-ray) usa as respostas fictícias, salvo PNCP_REAL=1. */
export function depsPncpDoAmbiente(env: unknown, request: Request): DepsPncp {
  const e = (env ?? {}) as AmbientePncp;
  const simulado = modoLocal(request, e) && e.PNCP_REAL !== '1';
  return simulado
    ? { fetch: (u) => fetchSimulado(u), agora: () => Date.now(), estado: ESTADO_SIMULADO }
    : { fetch: (u, i) => fetch(u, i), agora: () => Date.now(), estado: ESTADO_REAL };
}
