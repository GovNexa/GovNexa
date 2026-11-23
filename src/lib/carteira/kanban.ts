// Kanban por macroetapa (E7): colunas de 00 a 05 (a Conclusão fica na Carteira e no Histórico), cards enxutos e a
// previsão de saída do marco de cada coluna (aba PIPELINE). Funções puras: sem relógio global nem leitura de arquivo.
import { dataEntrega, filtrarProjetos, isoValido, orgaoDe, type FiltrosProjetos } from './filtros.ts';
import { MACROETAPAS } from './macroetapas.ts';
import type { CodigoMacroetapa, Projeto } from './tipos.ts';

/** Colunas do quadro: de Em estruturação até Execução (sem a Conclusão). */
export const ETAPAS_KANBAN = MACROETAPAS.filter((m) => m.codigo !== '06');

/** O marco que encerra cada coluna, em texto simples para o topo da coluna. */
export const MARCO_SAIDA: Record<CodigoMacroetapa, string> = {
  '00': 'entrega das peças técnicas',
  '01': 'fim do planejamento',
  '02': 'fim do preparatório',
  '03': 'contratação',
  '04': 'mobilização',
  '05': 'entrega da obra',
  '06': '',
};

export type CodigoColuna = CodigoMacroetapa | 'sem';

export interface CardKanban {
  id: string;
  nome: string;
  orgao: string;
  macro: CodigoMacroetapa | null;
  /** Previsão de saída do marco da etapa atual (ISO 'AAAA-MM-DD') ou null. */
  saida: string | null;
}

export interface ColunaKanban {
  codigo: CodigoColuna;
  nome: string;
  /** Frase do topo da coluna: qual data o card mostra. */
  marco: string;
  cards: CardKanban[];
}

export interface QuadroKanban {
  colunas: ColunaKanban[];
  /** Cards no quadro (depois dos filtros, sem os concluídos). */
  total: number;
  /** Projetos dos filtros que estão em 06 – Conclusão (não aparecem no quadro). */
  concluidos: number;
}

/** Data prevista de saída do marco da etapa atual: a data `fimEm` da macroetapa; em Execução, a entrega prevista. */
export function saidaDoMarco(p: Pick<Projeto, 'macroetapa' | 'datas'>): string | null {
  const m = MACROETAPAS.find((x) => x.codigo === p.macroetapa);
  if (!m || !m.fimEm || !p.datas) return null;
  if (m.codigo === '05') return dataEntrega(p as Projeto);
  const v = p.datas?.[m.fimEm];
  return isoValido(v) ? v : null;
}

/** Frase do topo da coluna. */
export function textoMarco(codigo: CodigoColuna): string {
  if (codigo === 'sem' || codigo === '06') return 'Sem previsão de saída';
  return `Previsão de saída: ${MARCO_SAIDA[codigo]}`;
}

/** Texto da data no card. */
export const textoSaida = (iso: string | null, dataBr: (v: string) => string): string =>
  iso ? `Saída prevista: ${dataBr(iso)}` : 'Sem previsão de saída';

const porSaida = (a: CardKanban, b: CardKanban): number => {
  if (a.saida !== b.saida) {
    if (!a.saida) return 1;
    if (!b.saida) return -1;
    return a.saida < b.saida ? -1 : 1;
  }
  return a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id, 'pt-BR');
};

/** Monta o quadro com os filtros do padrão (E2). A coluna "Sem macroetapa" só aparece se houver projeto nela. */
export function montarKanban(projetos: Projeto[], filtros: FiltrosProjetos): QuadroKanban {
  const filtrados = filtrarProjetos(projetos, filtros);
  const card = (p: Projeto): CardKanban => ({ id: p.id, nome: p.nome, orgao: orgaoDe(p), macro: p.macroetapa, saida: saidaDoMarco(p) });
  const colunas: ColunaKanban[] = ETAPAS_KANBAN.map((m) => ({
    codigo: m.codigo,
    nome: m.nome,
    marco: textoMarco(m.codigo),
    cards: filtrados.filter((p) => p.macroetapa === m.codigo).map(card).sort(porSaida),
  }));
  const sem = filtrados.filter((p) => p.macroetapa === null).map(card).sort(porSaida);
  if (sem.length) colunas.push({ codigo: 'sem', nome: 'Sem macroetapa', marco: textoMarco('sem'), cards: sem });
  return {
    colunas,
    total: colunas.reduce((n, c) => n + c.cards.length, 0),
    concluidos: filtrados.filter((p) => p.macroetapa === '06').length,
  };
}

/** Destinos do diálogo "Mover": todas as macroetapas; a Conclusão avisa que o card sai do quadro. */
export const DESTINOS_MOVER = MACROETAPAS.map((m) => ({ codigo: m.codigo, rotulo: m.codigo === '06' ? `${m.nome} (sai do Kanban)` : m.nome }));
