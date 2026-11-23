// Tempo que a tarefa fica na mão de cada responsável (E13, áudio 31). Funções puras: "hoje" é sempre injetado.
import type { EtapaCronograma, TrocaResponsavel } from './tipos.ts';
import { diasEntre } from './visoes.ts';

export type AlertaTempo = 'atencao' | 'urgente' | null;
export interface PassagemTarefa { responsavel: string | null; unidade: string | null; inicio: string | null; fim: string | null; dias: number }
export interface TempoNaMao {
  responsavel: string | null; unidade: string | null; iniciada: boolean; concluida: boolean;
  desde: string | null; // início do relógio da passagem atual (null = não iniciada)
  diasAtual: number; // dias da passagem atual
  diasPessoa: number; // soma das passagens da pessoa atual nesta tarefa
  diasArea: number; // soma das passagens da área atual nesta tarefa
  alerta: AlertaTempo; passagens: PassagemTarefa[];
}

export const chaveNome = (v: string | null | undefined): string => (v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

interface Titular { responsavel: string | null; unidade: string | null; inicio: string | null }

function titulares(e: EtapaCronograma): Titular[] {
  const trocas: TrocaResponsavel[] = [...(e.trocas ?? [])].sort((a, b) =>
    a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.registrado_em < b.registrado_em ? -1 : a.registrado_em > b.registrado_em ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (trocas.length === 0) return [{ responsavel: e.responsavel, unidade: e.unidade, inicio: null }];
  const lista: Titular[] = [];
  if (trocas[0].tipo === 'troca') lista.push({ responsavel: trocas[0].de_responsavel, unidade: trocas[0].de_unidade, inicio: null });
  for (const t of trocas) lista.push({ responsavel: t.para_responsavel, unidade: t.para_unidade, inicio: t.desde });
  return lista;
}

const menor = (a: string, b: string): string => (a < b ? a : b);
const maior = (a: string, b: string): string => (a > b ? a : b);

export function passagensDaTarefa(e: EtapaCronograma, hoje: string): PassagemTarefa[] {
  const lista = titulares(e);
  if (!e.inicio_real) return lista.map((t) => ({ responsavel: t.responsavel, unidade: t.unidade, inicio: null, fim: null, dias: 0 }));
  const inicioReal = e.inicio_real;
  const fimRelogio = menor(e.fim_real ?? hoje, hoje);
  return lista.map((t, i) => {
    const ini = maior(inicioReal, t.inicio ?? inicioReal);
    const proximo = lista[i + 1]?.inicio ?? null;
    const fim = menor(fimRelogio, proximo ?? fimRelogio);
    const ultima = i === lista.length - 1;
    return {
      responsavel: t.responsavel, unidade: t.unidade, inicio: ini,
      fim: ultima && !e.fim_real ? null : fim,
      dias: Math.max(0, diasEntre(ini, fim)),
    };
  });
}

/** Atenção acima da duração prevista; urgente acima do dobro. Só para tarefa aberta e com duração. */
export function alertaDoTempo(dias: number, duracao: number | null, aberta: boolean): AlertaTempo {
  if (!aberta || !duracao || duracao <= 0) return null;
  if (dias > 2 * duracao) return 'urgente';
  if (dias > duracao) return 'atencao';
  return null;
}

export function tempoNaMao(e: EtapaCronograma, hoje: string): TempoNaMao {
  const passagens = passagensDaTarefa(e, hoje);
  const atual = passagens[passagens.length - 1];
  const iniciada = !!e.inicio_real;
  const concluida = !!e.fim_real;
  const pessoa = chaveNome(atual.responsavel);
  const area = chaveNome(atual.unidade);
  const diasPessoa = passagens.filter((p) => chaveNome(p.responsavel) === pessoa).reduce((s, p) => s + p.dias, 0);
  const diasArea = passagens.filter((p) => chaveNome(p.unidade) === area).reduce((s, p) => s + p.dias, 0);
  return {
    responsavel: atual.responsavel, unidade: atual.unidade, iniciada, concluida,
    desde: iniciada ? atual.inicio : null,
    diasAtual: atual.dias, diasPessoa, diasArea,
    // Sem responsável, somar as passagens "sem pessoa" de áreas diferentes seria enganoso: o alerta usa o tempo da área atual.
    alerta: alertaDoTempo(pessoa ? diasPessoa : diasArea, e.duracao_prevista, !e.fim_real && iniciada),
    passagens,
  };
}

const nDias = (n: number): string => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export function textoTempoNaMao(t: TempoNaMao): string {
  const base = t.responsavel ?? t.unidade ?? 'ninguém';
  const nome = t.responsavel && t.unidade ? `${t.responsavel} (${t.unidade})` : base;
  if (!t.iniciada) return `Com ${nome} · ainda não iniciada`;
  if (t.concluida) return `Concluída · ficou ${nDias(t.diasPessoa)} com ${nome}`;
  let texto = t.diasAtual === 0 ? `Com ${nome} desde hoje` : `Com ${nome} há ${nDias(t.diasAtual)}`;
  if (t.diasPessoa > t.diasAtual) texto += ` · ${t.diasPessoa} dias no total com ${base}`;
  return texto;
}
