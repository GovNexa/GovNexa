// Navegador (E13): envia as mudanças do cronograma às rotas POST e confere a resposta. A resposta só vira texto na tela (textContent).
import { ERRO_REDE, ERRO_RESPOSTA, ESPERA_MAX_MS } from '../carteira/mover-cliente.ts';

export const ROTA_GRAVAR = '/plataforma/cronograma/gravar/';
export const ROTA_CRIAR = '/plataforma/cronograma/criar/';

/** Troca a tarefa com o vizinho da MESMA fase; null no limite. `ids` = ids da fase, na ordem em tela. */
export function pedidoReordenar(ids: string[], id: string, direcao: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const novo = [...ids];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}

/** Move o bloco inteiro da fase uma posição; devolve TODOS os ids na nova ordem, ou null no limite. */
export function pedidoReordenarFase(tarefas: { id: string; fase: string }[], fase: string, direcao: -1 | 1): string[] | null {
  const fases: string[] = [];
  for (const t of tarefas) if (!fases.includes(t.fase)) fases.push(t.fase);
  const i = fases.indexOf(fase);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= fases.length) return null;
  [fases[i], fases[j]] = [fases[j], fases[i]];
  return fases.flatMap((f) => tarefas.filter((t) => t.fase === f).map((t) => t.id));
}

/** Só o que mudou; texto vazio vira null. */
export function camposAlterados(antes: Record<string, unknown>, depois: Record<string, unknown>): Record<string, unknown> {
  const limpo = (v: unknown): unknown => (v === '' || v === undefined ? null : v);
  const saida: Record<string, unknown> = {};
  for (const k of Object.keys(depois)) {
    const novo = limpo(depois[k]);
    if (novo !== limpo(antes[k])) saida[k] = novo;
  }
  return saida;
}

export type RespostaEnvio = { ok: true; dados: any } | { ok: false; status: number; erro: string; erros?: string[]; existente?: string };

export async function enviar(url: string, corpo: unknown, buscar: typeof fetch = fetch): Promise<RespostaEnvio> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ESPERA_MAX_MS);
  try {
    const r = await buscar(url, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo), signal: controle.signal,
    });
    let dados: any = null;
    try { dados = await r.json(); } catch { dados = null; }
    if (r.ok && dados && dados.ok === true) return { ok: true, dados };
    if (!dados || typeof dados !== 'object' || typeof dados.erro !== 'string') return { ok: false, status: r.status, erro: ERRO_RESPOSTA };
    const erros = Array.isArray(dados.erros) ? dados.erros.filter((e: unknown): e is string => typeof e === 'string').slice(0, 20) : undefined;
    return {
      ok: false, status: r.status, erro: dados.erro.slice(0, 300), ...(erros?.length ? { erros } : {}),
      ...(typeof dados.existente === 'string' ? { existente: dados.existente } : {}),
    };
  } catch {
    return { ok: false, status: 0, erro: ERRO_REDE };
  } finally {
    clearTimeout(timer);
  }
}
