// Visão gerencial das contratações (E12): filtros, grandes números por etapa, próximos marcos e CSV. Funções puras.
import { dataBr } from '../datas.ts';
import { celula } from '../log/visoes.ts';
import type { Contratacao, MarcoPendente } from './repositorio.ts';
import {
  ETAPAS, ORDEM_TELA, ROTULO_AGUARDANDO, ROTULO_ETAPA, ROTULO_ETAPA_CURTO, ROTULO_MARCO, ROTULO_MODALIDADE,
  dataIsoValida, economia, percentualPago, reaisResumido, valorReferencia, type Etapa,
} from './regras.ts';

export interface FiltrosPainel {
  orgao: string | null;
  etapa: Etapa | null;
  aguardando: 'pgm' | 'outras_areas' | 'qualquer' | null;
  de: string | null;
  ate: string | null;
}
export const ROTA_LICITACOES = '/plataforma/gestao-licitacoes/';
export const ROTA_LICITACOES_CSV = '/plataforma/gestao-licitacoes/csv/';

export function lerFiltros(q: URLSearchParams, orgaosExistentes: string[]): { filtros: FiltrosPainel; avisos: string[] } {
  const avisos: string[] = [];
  const aviso = (m: string): void => { if (!avisos.includes(m)) avisos.push(m); };
  const pegar = (k: string): string | null => { const v = q.get(k); return v === null || v === '' ? null : v; };
  const filtros: FiltrosPainel = { orgao: null, etapa: null, aguardando: null, de: null, ate: null };
  const orgao = pegar('orgao');
  if (orgao !== null) { if (orgaosExistentes.includes(orgao)) filtros.orgao = orgao; else aviso('O órgão informado não existe nestas contratações.'); }
  const etapa = pegar('etapa');
  if (etapa !== null) { if ((ETAPAS as readonly string[]).includes(etapa)) filtros.etapa = etapa as Etapa; else aviso('A etapa informada não existe.'); }
  const aguardando = pegar('aguardando');
  if (aguardando !== null) {
    if (aguardando === 'pgm' || aguardando === 'outras_areas' || aguardando === 'qualquer') filtros.aguardando = aguardando;
    else aviso('Filtro de aguardando inválido.');
  }
  const de = pegar('de');
  const ate = pegar('ate');
  if (de !== null) { if (dataIsoValida(de)) filtros.de = de; else aviso('Período inválido.'); }
  if (ate !== null) { if (dataIsoValida(ate)) filtros.ate = ate; else aviso('Período inválido.'); }
  if (filtros.de && filtros.ate && filtros.de > filtros.ate) { filtros.de = null; filtros.ate = null; aviso('Período inválido.'); }
  return { filtros, avisos };
}

function consulta(f: Partial<FiltrosPainel>): string {
  const q = new URLSearchParams();
  if (f.orgao) q.set('orgao', f.orgao);
  if (f.etapa) q.set('etapa', f.etapa);
  if (f.aguardando) q.set('aguardando', f.aguardando);
  if (f.de) q.set('de', f.de);
  if (f.ate) q.set('ate', f.ate);
  const s = q.toString();
  return s ? `?${s}` : '';
}
export function urlPainel(f: Partial<FiltrosPainel>, base: string = ROTA_LICITACOES): string { return `${base}${consulta(f)}`; }
export function urlCsvPainel(f: Partial<FiltrosPainel>): string { return urlPainel(f, ROTA_LICITACOES_CSV); }

/** `datasMarcos` = datas dos marcos PENDENTES da contratação (todas, não só os 20 próximos). */
export function casaFiltros(c: Contratacao, datasMarcos: string[], f: FiltrosPainel, usarEtapa: boolean): boolean {
  if (f.orgao !== null && c.orgao !== f.orgao) return false;
  if (usarEtapa && f.etapa !== null && c.etapa !== f.etapa) return false;
  if (f.aguardando !== null) {
    if (f.aguardando === 'qualquer' ? c.aguardando === 'nao' : c.aguardando !== f.aguardando) return false;
  }
  if (f.de !== null || f.ate !== null) {
    const datas = [c.data_abertura, c.data_publicacao_prevista, c.data_marco, ...datasMarcos];
    const dentro = datas.some((d) => d !== null && (f.de === null || d >= f.de) && (f.ate === null || d <= f.ate));
    if (!dentro) return false;
  }
  return true;
}

export interface BlocoEtapa {
  etapa: Etapa; rotulo: string; qtd: number; valor: number;
  tipoValor: 'contratado' | 'propostas' | 'estimado'; economia: number | null; itens: Contratacao[];
}
export interface ProximoMarco { data: string; descricao: string; contratacaoId: string; nome: string; atrasado: boolean; }
export interface Painel {
  total: { qtd: number; valor: number };
  etapas: BlocoEtapa[];
  proximosMarcos: ProximoMarco[];
  aguardandoPgm: Contratacao[];
  aguardandoOutras: Contratacao[];
  filtradas: Contratacao[];
}

const comparar = (a: Contratacao, b: Contratacao): number => {
  if (a.data_abertura !== b.data_abertura) {
    if (a.data_abertura === null) return 1;
    if (b.data_abertura === null) return -1;
    return a.data_abertura < b.data_abertura ? -1 : 1;
  }
  return a.nome.localeCompare(b.nome, 'pt-BR');
};
const TIPO_VALOR: Record<Etapa, BlocoEtapa['tipoValor']> = {
  concluida: 'contratado', julgamento: 'propostas', publicada: 'estimado', ajustes: 'estimado', preparacao: 'estimado', finalizacao: 'estimado',
};

export function montarPainel(lista: Contratacao[], pendentes: MarcoPendente[], f: FiltrosPainel, hoje: string, datasPendentes?: Map<string, string[]>): Painel {
  const marcosDe = new Map<string, MarcoPendente[]>();
  for (const m of pendentes) marcosDe.set(m.contratacao_id, [...(marcosDe.get(m.contratacao_id) ?? []), m]);
  const datas = (c: Contratacao): string[] => (datasPendentes ? datasPendentes.get(c.id) : marcosDe.get(c.id)?.map((m) => m.data)) ?? [];
  // Grandes números: órgão, aguardando e período, mas NÃO a etapa (o clique num número não zera os outros).
  const grandes = lista.filter((c) => casaFiltros(c, datas(c), f, false));
  const filtradas = lista.filter((c) => casaFiltros(c, datas(c), f, true));
  const ordemEtapa = (c: Contratacao): number => ORDEM_TELA.indexOf(c.etapa);
  const etapas: BlocoEtapa[] = ORDEM_TELA.map((etapa) => {
    const dela = grandes.filter((c) => c.etapa === etapa);
    const economias = dela.map(economia).filter((e): e is number => e !== null);
    return {
      etapa, rotulo: ROTULO_ETAPA[etapa], qtd: dela.length, valor: dela.reduce((s, c) => s + valorReferencia(c), 0),
      tipoValor: TIPO_VALOR[etapa], economia: economias.length ? economias.reduce((s, e) => s + e, 0) : null,
      itens: filtradas.filter((c) => c.etapa === etapa).sort(comparar),
    };
  });
  const idsFiltradas = new Set(filtradas.map((c) => c.id));
  const nomes = new Map(lista.map((c) => [c.id, c.nome]));
  const proximosMarcos = pendentes
    .filter((m) => idsFiltradas.has(m.contratacao_id))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1))
    .slice(0, 20)
    .map((m) => ({ data: m.data, descricao: m.descricao, contratacaoId: m.contratacao_id, nome: nomes.get(m.contratacao_id) ?? m.nome, atrasado: m.data < hoje }));
  const ordenadas = [...filtradas].sort((a, b) => ordemEtapa(a) - ordemEtapa(b) || comparar(a, b));
  return {
    total: { qtd: grandes.length, valor: grandes.reduce((s, c) => s + valorReferencia(c), 0) },
    etapas,
    proximosMarcos,
    aguardandoPgm: ordenadas.filter((c) => c.aguardando === 'pgm'),
    aguardandoOutras: ordenadas.filter((c) => c.aguardando === 'outras_areas'),
    filtradas: ordenadas,
  };
}

export function subtituloBloco(b: BlocoEtapa): string {
  const base = b.tipoValor === 'contratado' ? 'valor contratado' : b.tipoValor === 'propostas' ? 'valor das propostas' : 'valor estimado';
  if (b.economia === null || b.economia <= 0) return base;
  return `${base} · ${b.tipoValor === 'propostas' ? 'economia prevista de' : 'economia de'} ${reaisResumido(b.economia)}`;
}

const CABECALHO_CSV = [
  'Etapa', 'Código', 'Contratação', 'Órgão', 'Projeto', 'Modalidade', 'Processo SEI', 'Processo ou lote', 'Valor estimado',
  'Valor da proposta', 'Valor contratado', 'Valor pago', '% pago', 'Empresa', 'Colocação', 'Marco', 'Data do marco', 'Abertura',
  'Publicação prevista', 'Previsão (texto)', 'Onde está', 'Situação', 'Aguardando', 'Aguardando quem', 'Observação',
];
const reaisCsv = (c: number | null): string => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));
const dataCsv = (d: string | null): string => (d ? dataBr(d) : '');
const rotuloDe = (mapa: Record<string, string>, v: string | null): string => (v ? mapa[v] ?? v : '');

export function paraCsvContratacoes(itens: Contratacao[]): string {
  const linhas = [CABECALHO_CSV.map(celula).join(';')];
  for (const c of itens) {
    const pct = percentualPago(c);
    linhas.push([
      ROTULO_ETAPA_CURTO[c.etapa], c.id, c.nome, c.orgao ?? '', c.projeto_id ?? '', rotuloDe(ROTULO_MODALIDADE, c.modalidade), c.processo_sei ?? '',
      c.grupo ?? '', reaisCsv(c.valor_estimado), reaisCsv(c.valor_proposta), reaisCsv(c.valor_contratado), reaisCsv(c.valor_pago),
      pct === null ? '' : String(pct).replace('.', ','), c.empresa ?? '', c.colocacao ?? '', rotuloDe(ROTULO_MARCO, c.marco), dataCsv(c.data_marco),
      dataCsv(c.data_abertura), dataCsv(c.data_publicacao_prevista), c.publicacao_prevista_texto ?? '', c.onde_esta ?? '', c.situacao ?? '',
      ROTULO_AGUARDANDO[c.aguardando as keyof typeof ROTULO_AGUARDANDO] ?? c.aguardando, c.aguardando_quem ?? '', c.observacao ?? '',
    ].map(celula).join(';'));
  }
  return linhas.join('\r\n') + '\r\n';
}

export const nomeArquivoCsvLicitacoes = (hoje: string): string => `licitacoes-govnexa-${hoje}.csv`;
