// Navegador (E7/B3): envia a mudança de etapa à rota POST /plataforma/projeto/mover/<id>/ e confere a resposta.
// A resposta só vira texto na tela (textContent); nada dela vira HTML.
import { MACROETAPAS } from './macroetapas.ts';
import type { CodigoMacroetapa } from './tipos.ts';

export const ROTA_MOVER = '/plataforma/projeto/mover/';
export const ERRO_REDE = 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.';
export const ERRO_RESPOSTA = 'Resposta inesperada do servidor. Recarregue a página e tente de novo.';
export const ESPERA_MAX_MS = 15_000;
const MAX_FALTANDO = 20;
const MAX_TEXTO = 300;
const CODIGOS: readonly string[] = MACROETAPAS.map((m) => m.codigo);
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface PedidoMover {
  id: string;
  revisao: number;
  de: CodigoMacroetapa | null;
  para: CodigoMacroetapa;
  motivo?: string;
  forcar?: boolean;
  origem: 'kanban' | 'pendencia';
}
export type RespostaMover =
  | { ok: true; revisao: number; macroetapa: CodigoMacroetapa; saida: string | null; forcado: boolean }
  | { ok: false; status: number; erro: string; faltando: string[]; forcavel: boolean };

const curto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? Array.from(v.trim()).slice(0, MAX_TEXTO).join('') : null);

/** Confere o formato da resposta (função pura). Qualquer coisa fora do esperado vira erro com texto fixo. */
export function lerResposta(status: number, corpo: unknown): RespostaMover {
  const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  if (status === 200 && c?.ok === true) {
    const { revisao, macroetapa, saida, forcado } = c;
    if (typeof revisao === 'number' && Number.isSafeInteger(revisao) && revisao >= 0 && typeof macroetapa === 'string' && CODIGOS.includes(macroetapa)
      && (saida === null || (typeof saida === 'string' && DIA.test(saida)))) {
      return { ok: true, revisao, macroetapa: macroetapa as CodigoMacroetapa, saida: saida as string | null, forcado: forcado === true };
    }
    return { ok: false, status, erro: ERRO_RESPOSTA, faltando: [], forcavel: false };
  }
  const faltando = Array.isArray(c?.faltando) ? (c!.faltando as unknown[]).map(curto).filter((x): x is string => x !== null).slice(0, MAX_FALTANDO) : [];
  return { ok: false, status, erro: curto(c?.erro) ?? ERRO_RESPOSTA, faltando, forcavel: status === 422 && c?.forcavel === true };
}

/** Envia o pedido (mesma origem, JSON) com prazo máximo de espera. */
export async function enviarMovimento(p: PedidoMover, buscar: typeof fetch = fetch): Promise<RespostaMover> {
  const corpo = JSON.stringify({ revisao: p.revisao, de: p.de, para: p.para, origem: p.origem, ...(p.motivo?.trim() ? { motivo: p.motivo.trim() } : {}), ...(p.forcar ? { forcar: true } : {}) });
  let resposta: Response;
  try {
    resposta = await buscar(`${ROTA_MOVER}${encodeURIComponent(p.id)}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: corpo,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(ESPERA_MAX_MS),
    });
  } catch {
    return { ok: false, status: 0, erro: ERRO_REDE, faltando: [], forcavel: false };
  }
  const dados = await resposta.json().catch(() => null);
  return lerResposta(resposta.status, dados);
}
