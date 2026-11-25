// Situação de prazo do WhatsApp (mesma regra de situacaoPrazo da carteira), recalculada no navegador com a data de hoje.
import { situacaoPrazoDe } from '../carteira/prazo.ts';
import type { ProjetoWhats } from './tipos.ts';
export function prazoWhats(p: Pick<ProjetoWhats, 'macroetapa' | 'fimEtapa' | 'encerramento' | 'pendencias'>, hoje: string): Pick<ProjetoWhats, 'prazo' | 'motivo'> {
  const s = situacaoPrazoDe(p, hoje);
  return { prazo: s.codigo, motivo: s.texto };
}
