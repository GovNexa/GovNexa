// Visões da Carteira de Projetos (Kanban, Gantt, por órgão, prazo). Funções puras: sem leitura de arquivo nem relógio global.
import { MACROETAPAS } from './macroetapas.ts';
import { situacaoPrazoDe, type SituacaoPrazo } from './prazo.ts';
import type { Carteira, CodigoMacroetapa, Projeto } from './tipos.ts';

export const valorProjeto = (p: Projeto): number | null => p.valores.total ?? p.valores.obra ?? null;

/** Data prevista de fim da macroetapa atual do projeto (ISO) ou null. */
export function fimDaMacroetapaAtual(p: Projeto): string | null {
  const m = MACROETAPAS.find((x) => x.codigo === p.macroetapa);
  if (!m || !m.fimEm) return null;
  const v = p.datas[m.fimEm];
  return typeof v === 'string' ? v : null;
}

const porData = (a: Projeto, b: Projeto): number => {
  const fa = fimDaMacroetapaAtual(a);
  const fb = fimDaMacroetapaAtual(b);
  if (fa === fb) return 0;
  if (!fa) return 1;
  if (!fb) return -1;
  return fa < fb ? -1 : 1;
};

const somaValores = (l: Projeto[]): number => l.reduce((s, p) => s + (valorProjeto(p) ?? 0), 0);

export interface GrupoMacroetapa {
  codigo: CodigoMacroetapa | 'sem';
  nome: string;
  qtd: number;
  valor: number;
  projetos: Projeto[];
}

export function resumoPorMacroetapa(c: Carteira): GrupoMacroetapa[] {
  const grupos: GrupoMacroetapa[] = MACROETAPAS.map((m) => {
    const projetos = c.projetos.filter((p) => p.macroetapa === m.codigo).sort(porData);
    return { codigo: m.codigo, nome: m.nome, qtd: projetos.length, valor: somaValores(projetos), projetos };
  });
  const sem = c.projetos.filter((p) => p.macroetapa === null).sort(porData);
  if (sem.length) grupos.push({ codigo: 'sem', nome: 'Sem macroetapa', qtd: sem.length, valor: somaValores(sem), projetos: sem });
  return grupos;
}

export interface GrupoOrgao {
  orgao: string;
  qtd: number;
  valor: number;
  percentual: number;
  emAndamento: number;
  emPlanejamento: number;
  concluidos: number;
}

export function resumoPorOrgao(c: Carteira): GrupoOrgao[] {
  const total = somaValores(c.projetos);
  const mapa = new Map<string, Projeto[]>();
  for (const p of c.projetos) {
    const k = p.orgao ?? 'Sem órgão';
    mapa.set(k, [...(mapa.get(k) ?? []), p]);
  }
  return [...mapa.entries()]
    .map(([orgao, l]) => {
      const valor = somaValores(l);
      const conta = (cods: string[]) => l.filter((p) => p.macroetapa !== null && cods.includes(p.macroetapa)).length;
      return {
        orgao,
        qtd: l.length,
        valor,
        percentual: total > 0 ? (valor / total) * 100 : 0,
        emAndamento: conta(['03', '04', '05']),
        emPlanejamento: conta(['00', '01', '02']),
        concluidos: conta(['06']),
      };
    })
    .sort((a, b) => b.valor - a.valor);
}

export type { SituacaoPrazo } from './prazo.ts';
/** Situação de prazo do projeto em texto. `hoje` em ISO 'AAAA-MM-DD' (injetável para teste). */
export function situacaoPrazo(p: Projeto, hoje: string = new Date().toISOString().slice(0, 10)): SituacaoPrazo {
  return situacaoPrazoDe({ macroetapa: p.macroetapa, fimEtapa: fimDaMacroetapaAtual(p), encerramento: p.datas.encerramento, pendencias: p.pendencias.length }, hoje);
}

/** Valor do projeto que ainda não tem fonte (captado + contrapartida + custeio do município); null se não dá para estimar. */
export function saldoSemFonte(p: Projeto): number | null {
  const valor = valorProjeto(p);
  if (valor === null) return null;
  const fontes = [p.valores.captado, p.valores.contrapartida, p.valores.custeio_municipio].filter((v): v is number => v !== null);
  if (!fontes.length) return null;
  return Math.max(0, valor - fontes.reduce((s, v) => s + v, 0));
}

export interface SegmentoGantt {
  codigo: CodigoMacroetapa;
  inicio: string;
  fim: string;
}

const somaDias = (iso: string, dias: number): string => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

export function segmentosGantt(p: Projeto): SegmentoGantt[] {
  const d = p.datas;
  const fimExecucao = d.encerramento ?? (d.mobilizacao && d.execucao_dias !== null ? somaDias(d.mobilizacao, d.execucao_dias) : null);
  const pares: [CodigoMacroetapa, string | null, string | null][] = [
    ['00', d.inicio, d.pecas_tecnicas],
    ['01', d.pecas_tecnicas, d.planejamento],
    ['02', d.planejamento, d.preparatorio],
    ['03', d.preparatorio, d.contratacao],
    ['04', d.contratacao, d.mobilizacao],
    ['05', d.mobilizacao, fimExecucao],
  ];
  const saida: SegmentoGantt[] = [];
  for (const [codigo, inicio, fim] of pares) {
    if (!inicio || !fim || fim < inicio) continue;
    saida.push({ codigo, inicio, fim });
  }
  return saida;
}
