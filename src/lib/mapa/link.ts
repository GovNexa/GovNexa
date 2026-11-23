// Endereço do mapa completo (Gestão) com os filtros da tela do prefeito que o mapa entende (E4): área, macroetapa e região.
// Os valores já chegam validados por lerFiltrosPrioritarios (E3); aqui só são codificados no endereço.
import type { FiltrosPrioritarios } from '../gestao/prioritarios.ts';

export const MAPA_COMPLETO = '/plataforma/gestao/';

export function urlMapaCompleto(f: Pick<FiltrosPrioritarios, 'area' | 'etapa' | 'regiao'>): string {
  const q = new URLSearchParams();
  if (f.area) q.set('areas', f.area);
  if (f.etapa) q.set('etapas', f.etapa);
  if (f.regiao) q.set('regiao', f.regiao);
  const s = q.toString();
  return `${MAPA_COMPLETO}${s ? `?${s}` : ''}#mapa`;
}
