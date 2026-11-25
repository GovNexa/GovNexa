// Situação de prazo de um projeto em texto objetivo (substitui o antigo semáforo de cores, retirado por decisão do dono em 23/11/2026).
// Sem dependências: roda no build, no Worker e no navegador (WhatsApp).
export type CodigoPrazo = 'etapa-vencida' | 'entrega-vencida' | 'dados-incompletos' | 'etapa-vencendo' | 'no-prazo';
export interface SituacaoPrazo { codigo: CodigoPrazo; texto: string; dias: number | null }
export interface EntradaPrazo { macroetapa: string | null; fimEtapa: string | null; encerramento: string | null; pendencias: number }
export const DIAS_PRAZO_PROXIMO = 15;
const dia = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const entre = (de: string, ate: string): number => Math.round((dia(ate) - dia(de)) / 86400000);
export const textoDias = (n: number): string => (n === 1 ? '1 dia' : `${n} dias`);
export const prazoVencido = (c: CodigoPrazo): boolean => c === 'etapa-vencida' || c === 'entrega-vencida';
/** Mesma ordem de checagem do antigo semáforo (não mudar): vencido → pendências → etapa vencendo → no prazo. `hoje` = 'AAAA-MM-DD'. */
export function situacaoPrazoDe(e: EntradaPrazo, hoje: string): SituacaoPrazo {
  if (e.macroetapa !== '06') {
    if (e.fimEtapa && e.fimEtapa < hoje) { const n = entre(e.fimEtapa, hoje); return { codigo: 'etapa-vencida', texto: `Prazo da macroetapa vencido há ${textoDias(n)}`, dias: n }; }
    if (e.encerramento && e.encerramento < hoje) { const n = entre(e.encerramento, hoje); return { codigo: 'entrega-vencida', texto: `Entrega prevista vencida há ${textoDias(n)}`, dias: n }; }
  }
  if (e.pendencias > 0) return { codigo: 'dados-incompletos', texto: `Dados incompletos: ${e.pendencias === 1 ? '1 pendência' : `${e.pendencias} pendências`}`, dias: null };
  if (e.macroetapa !== '06' && e.fimEtapa) {
    const n = entre(hoje, e.fimEtapa);
    if (n <= DIAS_PRAZO_PROXIMO) return { codigo: 'etapa-vencendo', texto: n === 0 ? 'Prazo da macroetapa vence hoje' : `Prazo da macroetapa vence em ${textoDias(n)}`, dias: n };
  }
  return { codigo: 'no-prazo', texto: e.macroetapa === '06' ? 'Concluído' : 'No prazo', dias: null };
}
