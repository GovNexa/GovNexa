// Cor de cada área no mapa das obras (E4): a mesma da tela do prefeito (E3). O número 1 a 6 vem de `coresDasAreas`
// (src/lib/gestao/prioritarios.ts), calculado na carteira inteira; as outras áreas ficam cinza e "Sem área" cinza-claro.
// As cores são as variáveis --pp-cor-* de src/styles/prioritarios.css (com tema claro e escuro). Nada aqui vem do usuário.
import { SEM_AREA } from '../gestao/prioritarios.ts';
import type { CategoriaObra } from './tipos.ts';

export const SERIES_COR = ['mp-cor-1', 'mp-cor-2', 'mp-cor-3', 'mp-cor-4', 'mp-cor-5', 'mp-cor-6', 'mp-cor-outros', 'mp-cor-sem'] as const;
export type SerieCor = (typeof SERIES_COR)[number];

/** Valor CSS de cada série (só variáveis fixas; o dado do projeto nunca entra num estilo). */
export const VAR_COR: Readonly<Record<SerieCor, string>> = {
  'mp-cor-1': 'var(--pp-cor-1)',
  'mp-cor-2': 'var(--pp-cor-2)',
  'mp-cor-3': 'var(--pp-cor-3)',
  'mp-cor-4': 'var(--pp-cor-4)',
  'mp-cor-5': 'var(--pp-cor-5)',
  'mp-cor-6': 'var(--pp-cor-6)',
  'mp-cor-outros': 'var(--pp-cor-outros)',
  'mp-cor-sem': 'var(--pp-cor-sem)',
};

/** Classe da cor: só aceita número inteiro de 1 a 6 (o JSON do mapa é conferido antes de virar classe). */
export function serieDaCor(cor: unknown, area: unknown): SerieCor {
  if (typeof cor === 'number' && Number.isInteger(cor) && cor >= 1 && cor <= 6) return SERIES_COR[cor - 1];
  return area === SEM_AREA ? 'mp-cor-sem' : 'mp-cor-outros';
}

/** Desenho do marcador por área (reaproveita os glifos de icones.ts); área sem desenho próprio usa o de edificação. */
const GLIFO_POR_AREA: Readonly<Record<string, CategoriaObra>> = {
  saude: 'saude',
  educacao: 'educacao',
  assistencia_social: 'assistencia',
  drenagem: 'drenagem',
  parques_e_lazer: 'lazer',
  esporte: 'lazer',
  cultura: 'cultura',
  mobilidade_urbana: 'via',
};
export function glifoDaArea(codigo: unknown): CategoriaObra {
  return typeof codigo === 'string' && Object.hasOwn(GLIFO_POR_AREA, codigo) ? GLIFO_POR_AREA[codigo] : 'edificacao';
}
