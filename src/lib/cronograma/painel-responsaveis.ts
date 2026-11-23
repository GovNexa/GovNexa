// Painel "Responsáveis" (E13, áudio 31): com quem está cada tarefa aberta dos cronogramas e há quantos dias. Funções puras.
import { dataBr } from '../datas.ts';
import { celula } from '../log/visoes.ts';
import { chaveNome, tempoNaMao, type AlertaTempo } from './responsaveis.ts';
import { ROTA_RESPONSAVEIS } from './navegacao.ts';
import type { Cronograma } from './tipos.ts';

export const SEM = '__sem__';
export const ROTULO_SEM_PESSOA = 'Sem responsável';
export const ROTULO_SEM_AREA = 'Sem área';
export interface TarefaEmMaos { cronogramaId: string; cronograma: string; projetoId: string | null; projeto: string | null; tarefaId: string | null; tarefa: string; fase: string; responsavel: string | null; unidade: string | null; iniciada: boolean; desde: string | null; diasAtual: number; diasPessoa: number; diasArea: number; duracao: number | null; alerta: AlertaTempo }
export interface LinhaResponsavel { chave: string; nome: string; areas: string[]; emAndamento: number; aIniciar: number; dias: number; maisAntiga: { tarefa: string; cronograma: string; dias: number } | null; atencao: number; urgente: number }
export interface FiltrosResponsaveis { area: string | null; pessoa: string | null; soAlerta: boolean }

const texto = (v: string | null | undefined): string | null => { const s = (v ?? '').trim(); return s ? s : null; };

/** Só tarefas ABERTAS (sem fim real). `nomes` = nome do projeto por id. */
export function tarefasEmMaos(cs: Cronograma[], hoje: string, nomes: Map<string, string>): TarefaEmMaos[] {
  const itens: TarefaEmMaos[] = [];
  for (const c of cs) {
    for (const f of c.fases) {
      for (const e of f.etapas) {
        if (e.fim_real) continue;
        const t = tempoNaMao(e, hoje);
        itens.push({
          cronogramaId: c.id, cronograma: c.titulo, projetoId: c.projeto_id, projeto: c.projeto_id ? nomes.get(c.projeto_id) ?? null : null,
          tarefaId: e.id ?? null, tarefa: e.nome, fase: f.nome, responsavel: texto(t.responsavel), unidade: texto(t.unidade),
          iniciada: t.iniciada, desde: t.desde, diasAtual: t.diasAtual, diasPessoa: t.diasPessoa, diasArea: t.diasArea,
          duracao: e.duracao_prevista, alerta: t.alerta,
        });
      }
    }
  }
  return itens;
}

const distintos = (valores: (string | null)[]): string[] => {
  const mapa = new Map<string, string>();
  for (const v of valores) if (v && !mapa.has(chaveNome(v))) mapa.set(chaveNome(v), v);
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

export function opcoesResponsaveis(itens: TarefaEmMaos[]): { areas: string[]; pessoas: string[] } {
  return { areas: distintos(itens.map((i) => i.unidade)), pessoas: distintos(itens.map((i) => i.responsavel)) };
}

function valorDoFiltro(busca: URLSearchParams, nome: string, lista: string[]): { valor: string | null; invalido: boolean } {
  const bruto = busca.get(nome);
  if (bruto === null || bruto.trim() === '') return { valor: null, invalido: false };
  if (bruto === SEM) return { valor: SEM, invalido: false };
  const achado = lista.find((o) => chaveNome(o) === chaveNome(bruto));
  return achado ? { valor: achado, invalido: false } : { valor: null, invalido: true };
}

/** Filtros por lista fechada: valor fora da lista é ignorado e avisado. */
export function filtrosDaUrl(busca: URLSearchParams, op: { areas: string[]; pessoas: string[] }): FiltrosResponsaveis & { areaInvalida: boolean; pessoaInvalida: boolean } {
  const a = valorDoFiltro(busca, 'area', op.areas);
  const p = valorDoFiltro(busca, 'pessoa', op.pessoas);
  return { area: a.valor, pessoa: p.valor, soAlerta: busca.get('alerta') === '1', areaInvalida: a.invalido, pessoaInvalida: p.invalido };
}

const bate = (valor: string | null, filtro: string | null): boolean =>
  filtro === null || (filtro === SEM ? chaveNome(valor) === '' : chaveNome(valor) === chaveNome(filtro));

export function filtrar(itens: TarefaEmMaos[], f: FiltrosResponsaveis): TarefaEmMaos[] {
  return itens.filter((i) => bate(i.unidade, f.area) && bate(i.responsavel, f.pessoa) && (!f.soAlerta || i.alerta !== null));
}

function agrupar(itens: TarefaEmMaos[], por: 'pessoa' | 'area'): LinhaResponsavel[] {
  const campo = (i: TarefaEmMaos): string | null => (por === 'pessoa' ? i.responsavel : i.unidade);
  const grupos = new Map<string, TarefaEmMaos[]>();
  for (const i of itens) {
    const k = chaveNome(campo(i)) || SEM;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const linhas: LinhaResponsavel[] = [...grupos.entries()].map(([chave, lista]) => {
    const iniciadas = lista.filter((i) => i.iniciada);
    const maisAntiga = iniciadas.reduce<TarefaEmMaos | null>((m, i) => (m === null || i.diasAtual > m.diasAtual ? i : m), null);
    return {
      chave,
      nome: chave === SEM ? (por === 'pessoa' ? ROTULO_SEM_PESSOA : ROTULO_SEM_AREA) : campo(lista[0])!,
      areas: por === 'pessoa' ? distintos(lista.map((i) => i.unidade)) : [],
      emAndamento: iniciadas.length, aIniciar: lista.length - iniciadas.length,
      dias: iniciadas.reduce((s, i) => s + (por === 'pessoa' ? i.diasPessoa : i.diasArea), 0),
      maisAntiga: maisAntiga ? { tarefa: maisAntiga.tarefa, cronograma: maisAntiga.cronograma, dias: maisAntiga.diasAtual } : null,
      atencao: lista.filter((i) => i.alerta === 'atencao').length, urgente: lista.filter((i) => i.alerta === 'urgente').length,
    };
  });
  return linhas.sort((a, b) =>
    (a.chave === SEM ? 1 : 0) - (b.chave === SEM ? 1 : 0) || b.urgente - a.urgente || b.atencao - a.atencao || b.dias - a.dias || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const porPessoa = (itens: TarefaEmMaos[]): LinhaResponsavel[] => agrupar(itens, 'pessoa');
export const porArea = (itens: TarefaEmMaos[]): LinhaResponsavel[] => agrupar(itens, 'area');

export function urlPainel(f: Partial<FiltrosResponsaveis>, base: string = ROTA_RESPONSAVEIS): string {
  const q = new URLSearchParams();
  if (f.area) q.set('area', f.area);
  if (f.pessoa) q.set('pessoa', f.pessoa);
  if (f.soAlerta) q.set('alerta', '1');
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
export const urlCsvResponsaveis = (f: Partial<FiltrosResponsaveis>): string => urlPainel(f, ROTA_RESPONSAVEIS + 'csv/');

export function situacaoDoItem(i: TarefaEmMaos): string {
  if (!i.iniciada) return 'A iniciar';
  if (i.alerta === 'urgente') return 'Urgente';
  if (i.alerta === 'atencao') return 'Atenção';
  return i.duracao && i.duracao > 0 ? 'No prazo' : 'Sem duração prevista';
}

/** Ordem da lista "Tarefas em mãos": mais dias com a pessoa primeiro, depois a tarefa. */
export const ordenarLista = (itens: TarefaEmMaos[]): TarefaEmMaos[] =>
  [...itens].sort((a, b) => b.diasPessoa - a.diasPessoa || a.tarefa.localeCompare(b.tarefa, 'pt-BR'));

const CABECALHO_CSV = ['Pessoa', 'Área', 'Tarefa', 'Fase', 'Cronograma', 'Projeto', 'Com a pessoa desde', 'Dias com a pessoa (agora)', 'Dias com a pessoa (total na tarefa)', 'Duração prevista (dias)', 'Situação'];

/** CSV com separador ';', toda célula protegida contra fórmula e linhas em CRLF. */
export function paraCsvResponsaveis(itens: TarefaEmMaos[]): string {
  const linhas = [CABECALHO_CSV.map(celula).join(';')];
  for (const i of ordenarLista(itens)) {
    linhas.push([
      i.responsavel ?? ROTULO_SEM_PESSOA, i.unidade ?? ROTULO_SEM_AREA, i.tarefa, i.fase, i.cronograma, i.projeto ?? '',
      i.desde ? dataBr(i.desde) : '', i.iniciada ? i.diasAtual : '', i.iniciada ? i.diasPessoa : '', i.duracao ?? '', situacaoDoItem(i),
    ].map(celula).join(';'));
  }
  return `${linhas.join('\r\n')}\r\n`;
}
export const nomeArquivoCsvResponsaveis = (hoje: string): string => `responsaveis-govnexa-${hoje}.csv`;

/** Os dados do painel já filtrados (as três listas), usados pela página e pelo CSV. */
export function montarPainel(cs: Cronograma[], hoje: string, nomes: Map<string, string>, busca: URLSearchParams) {
  const todos = tarefasEmMaos(cs, hoje, nomes);
  const opcoes = opcoesResponsaveis(todos);
  const filtros = filtrosDaUrl(busca, opcoes);
  const f: FiltrosResponsaveis = { area: filtros.area, pessoa: filtros.pessoa, soAlerta: filtros.soAlerta };
  const lista = ordenarLista(filtrar(todos, f));
  return {
    todos, opcoes, filtros: f, areaInvalida: filtros.areaInvalida, pessoaInvalida: filtros.pessoaInvalida,
    lista, pessoas: porPessoa(filtrar(todos, { ...f, pessoa: null })), areas: porArea(filtrar(todos, { ...f, area: null })),
  };
}
