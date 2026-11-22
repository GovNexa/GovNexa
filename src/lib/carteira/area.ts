import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import type { Projeto } from './tipos.ts';

export interface Area { codigo: string; nome: string }

export const AREAS_PADRAO: readonly (Area & { ordem: number })[] = [
  { codigo: 'saude', nome: 'Saúde', ordem: 10 },
  { codigo: 'educacao', nome: 'Educação', ordem: 20 },
  { codigo: 'assistencia_social', nome: 'Assistência social', ordem: 30 },
  { codigo: 'drenagem', nome: 'Drenagem', ordem: 40 },
  { codigo: 'parques_e_lazer', nome: 'Parques e lazer', ordem: 50 },
  { codigo: 'cultura', nome: 'Cultura', ordem: 60 },
  { codigo: 'mobilidade_urbana', nome: 'Mobilidade urbana', ordem: 70 },
  { codigo: 'habitacao', nome: 'Habitação', ordem: 80 },
  { codigo: 'esporte', nome: 'Esporte', ordem: 90 },
  { codigo: 'administracao', nome: 'Administração', ordem: 100 },
  { codigo: 'outros', nome: 'Outros', ordem: 110 },
];

export const CODIGO_AREA = /^[a-z0-9_]{2,40}$/;

// Sugestões provisórias por órgão, conforme a decisão D2.
export const SUGESTAO_AREA_POR_ORGAO: Readonly<Record<string, string>> = {
  SMS: 'saude',
  SME: 'educacao',
  SEMASDH: 'assistencia_social',
  SECULT: 'cultura',
};

export function sugerirArea(orgao: string | null | undefined): string | null {
  const sigla = orgao?.trim().toUpperCase();
  return sigla && Object.hasOwn(SUGESTAO_AREA_POR_ORGAO, sigla) ? SUGESTAO_AREA_POR_ORGAO[sigla] : null;
}

export function codigoDeArea(texto: string | null | undefined): string | null {
  const codigo = texto?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return codigo && CODIGO_AREA.test(codigo) ? codigo : null;
}

export async function areasDaPrefeitura(repo: Pick<RepositorioProjetos, 'listarAreas'>): Promise<Area[]> {
  return repo.listarAreas ? await repo.listarAreas() : AREAS_PADRAO.map(({ codigo, nome }) => ({ codigo, nome }));
}

export function nomeDaArea(codigo: string | null | undefined, areas: readonly Area[] = AREAS_PADRAO): string | null {
  return areas.find((area) => area.codigo === codigo)?.nome ?? null;
}

export function areaDoProjeto(
  p: Pick<Projeto, 'area' | 'orgao'>,
  areas: readonly Area[] = AREAS_PADRAO,
  areasAtivas: readonly Area[] = areas,
): { codigo: string; nome: string; sugerida: boolean } | null {
  if (p.area) return { codigo: p.area, nome: nomeDaArea(p.area, areas) ?? nomeDaArea(p.area, AREAS_PADRAO) ?? p.area, sugerida: false };
  const codigo = sugerirArea(p.orgao);
  const nome = nomeDaArea(codigo, areasAtivas);
  return codigo && nome ? { codigo, nome, sugerida: true } : null;
}
