// Relatório de inconsistências de dado da carteira (E10), para a equipe. Só leitura.
// Funções puras: `hoje` (ISO 'AAAA-MM-DD') e o mapa de bairros são injetados; nada consulta relógio, arquivo ou banco.
// Regras determinísticas, na ordem de REGRAS. Cada projeto entra no máximo uma vez por regra.
import { AREAS_PADRAO, nomeDaArea, sugerirArea, type Area } from '../carteira/area.ts';
import { SEI } from '../carteira/cadastro.ts';
import { MACROETAPAS, nomeMacroetapa } from '../carteira/macroetapas.ts';
import type { Carteira, DatasProjeto, Projeto } from '../carteira/tipos.ts';
import { fimDaMacroetapaAtual } from '../carteira/visoes.ts';
import { diasEntre } from '../cronograma/visoes.ts';
import { dataBr } from '../datas.ts';
import { celula } from '../log/visoes.ts';
import { localizarProjeto, type GeoBairros } from '../mapa/geo.ts';
import { ROTA_INCONSISTENCIAS, ROTA_INCONSISTENCIAS_CSV } from './equipe.ts';

export const REGRAS = [
  { id: 'sem_orgao', rotulo: 'Sem órgão', descricao: 'O projeto não tem órgão responsável.' },
  { id: 'sem_area', rotulo: 'Sem área', descricao: 'A área (saúde, educação, drenagem...) não foi informada.' },
  { id: 'sem_valor', rotulo: 'Sem valor', descricao: 'Não há valor total nem valor de obra.' },
  { id: 'sem_macroetapa', rotulo: 'Sem macroetapa', descricao: 'O projeto não está em nenhuma macroetapa.' },
  { id: 'datas_faltando', rotulo: 'Datas previstas faltando', descricao: 'Falta a data prevista de fim da macroetapa atual ou de uma das seguintes.' },
  { id: 'datas_fora_de_ordem', rotulo: 'Datas fora de ordem', descricao: 'Uma macroetapa termina antes da anterior.' },
  { id: 'macroetapa_vencida', rotulo: 'Macroetapa vencida', descricao: 'A data prevista de saída da macroetapa atual já passou.' },
  { id: 'sei_invalido', rotulo: 'SEI inválido', descricao: 'Número de processo SEI fora do formato 00.0.000000000-0.' },
  { id: 'sem_localizacao', rotulo: 'Sem localização', descricao: 'Sem localização cadastrada e sem bairro reconhecido no mapa.' },
  { id: 'outras_pendencias', rotulo: 'Outras pendências de dado', descricao: 'Pendências apontadas na carga da planilha (região, origem do valor, soma por ano).' },
] as const;
export type IdRegra = (typeof REGRAS)[number]['id'];
export const IDS_REGRAS: readonly IdRegra[] = REGRAS.map((r) => r.id);
export const rotuloRegra = (id: IdRegra): string => REGRAS.find((r) => r.id === id)?.rotulo ?? id;

/** Valor do filtro de órgão para os projetos sem órgão. */
export const SEM_ORGAO = '_sem';
export const ROTULO_SEM_ORGAO = 'Sem órgão';

/** Datas previstas de fim das macroetapas (aba PIPELINE), na ordem do ciclo. */
const DATAS_PIPELINE: { campo: keyof DatasProjeto; rotulo: string }[] = [
  { campo: 'pecas_tecnicas', rotulo: 'Peças técnicas' },
  { campo: 'planejamento', rotulo: 'Planejamento' },
  { campo: 'preparatorio', rotulo: 'Preparatório' },
  { campo: 'contratacao', rotulo: 'Contratação' },
  { campo: 'mobilizacao', rotulo: 'Mobilização' },
  { campo: 'encerramento', rotulo: 'Encerramento' },
];
/** Pendências da carga que já viram regra própria (calculada dos dados atuais); as outras entram em "Outras pendências de dado". */
const PENDENCIAS_COBERTAS = new Set(['Sem órgão', 'Sem macroetapa', 'Sem valor de obra', 'Datas previstas fora de ordem', 'SEI inválido']);

export interface ContextoInconsistencias {
  hoje: string;
  geo: GeoBairros;
  areas?: readonly Area[];
}
export interface Inconsistencia {
  regra: IdRegra;
  projeto: { id: string; nome: string; orgao: string | null };
  detalhe: string;
}

const limpo = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
const comparar = (a: string, b: string): number => a.localeCompare(b, 'pt-BR');

/** Datas que faltam para a macroetapa atual e as seguintes; todas sem macroetapa; nenhuma na conclusão. */
function datasQueFaltam(p: Projeto): string[] {
  if (p.macroetapa === '06') return [];
  const inicio = p.macroetapa === null ? 0 : Math.max(0, MACROETAPAS.findIndex((m) => m.codigo === p.macroetapa));
  const campos = new Set(MACROETAPAS.slice(inicio).map((m) => m.fimEm).filter((c): c is keyof DatasProjeto => c !== null));
  return DATAS_PIPELINE.filter((d) => campos.has(d.campo) && !limpo(p.datas[d.campo])).map((d) => d.rotulo);
}

/** Primeira data que termina antes da anterior (mesma sequência da carga da planilha), em texto; null se estão em ordem. */
function primeiraForaDeOrdem(p: Projeto): string | null {
  const presentes: { rotulo: string; valor: string }[] = [];
  for (const d of DATAS_PIPELINE) {
    const valor = limpo(p.datas[d.campo]);
    if (valor) presentes.push({ rotulo: d.rotulo, valor });
  }
  for (let i = 1; i < presentes.length; i++) {
    const antes = presentes[i - 1];
    const depois = presentes[i];
    if (depois.valor < antes.valor) return `${depois.rotulo} (${dataBr(depois.valor)}) termina antes de ${antes.rotulo} (${dataBr(antes.valor)}).`;
  }
  return null;
}

/** Inconsistências de um projeto, na ordem de REGRAS. */
export function inconsistenciasDoProjeto(p: Projeto, ctx: ContextoInconsistencias): Inconsistencia[] {
  const areas = ctx.areas ?? AREAS_PADRAO;
  const achados: [IdRegra, string][] = [];
  if (!limpo(p.orgao)) achados.push(['sem_orgao', 'Órgão não informado.']);
  if (!limpo(p.area)) {
    const sugestao = nomeDaArea(sugerirArea(p.orgao), areas);
    achados.push(['sem_area', sugestao ? `Área não informada (sugestão pelo órgão: ${sugestao}).` : 'Área não informada.']);
  }
  if (!p.valores.total && !p.valores.obra) achados.push(['sem_valor', 'Sem valor total e sem valor de obra.']);
  if (p.macroetapa === null) achados.push(['sem_macroetapa', 'Macroetapa não informada.']);
  const faltam = datasQueFaltam(p);
  if (faltam.length) achados.push(['datas_faltando', `Faltam: ${faltam.join(', ')}.`]);
  const fora = primeiraForaDeOrdem(p);
  if (fora) achados.push(['datas_fora_de_ordem', fora]);
  const fim = p.macroetapa !== '06' ? fimDaMacroetapaAtual(p) : null;
  if (fim && fim < ctx.hoje) {
    achados.push(['macroetapa_vencida', `Saída de ${nomeMacroetapa(p.macroetapa)} prevista para ${dataBr(fim)}: vencida há ${plural(diasEntre(fim, ctx.hoje), 'dia', 'dias')}.`]);
  }
  const seiRuins = p.sei.filter((s) => !SEI.test(s));
  if (seiRuins.length) achados.push(['sei_invalido', `Fora do formato 00.0.000000000-0: ${seiRuins.join(', ')}.`]);
  else if (p.pendencias.includes('SEI inválido')) achados.push(['sei_invalido', 'O número do SEI na planilha não foi reconhecido.']);
  if (!localizarProjeto(p, ctx.geo)) {
    const bairro = limpo(p.bairro);
    achados.push(['sem_localizacao', bairro ? `Sem localização cadastrada e o bairro ${bairro} não está no mapa.` : 'Sem localização cadastrada e sem bairro.']);
  }
  const outras = [...new Set(p.pendencias.map(limpo).filter((x) => x && !PENDENCIAS_COBERTAS.has(x)))];
  if (outras.length) achados.push(['outras_pendencias', `${outras.join('; ')}.`]);
  const projeto = { id: p.id, nome: p.nome, orgao: limpo(p.orgao) || null };
  return achados.map(([regra, detalhe]) => ({ regra, projeto, detalhe }));
}

export interface FiltrosRelatorio { orgao: string | null; regra: IdRegra | null }
export interface OpcoesRelatorio { orgaos: string[]; temSemOrgao: boolean }

/** Órgãos da carteira (lista fechada do filtro). */
export function opcoesRelatorio(carteira: Carteira): OpcoesRelatorio {
  const orgaos = [...new Set(carteira.projetos.map((p) => limpo(p.orgao)).filter(Boolean))].sort(comparar);
  return { orgaos, temSemOrgao: carteira.projetos.some((p) => !limpo(p.orgao)) };
}

/** Filtros do endereço por lista fechada: o que não está na lista é ignorado (e avisado). */
export function filtrosDaUrl(busca: URLSearchParams, opcoes: OpcoesRelatorio): FiltrosRelatorio & { orgaoInvalido: boolean; regraInvalida: boolean } {
  const o = busca.get('orgao') ?? '';
  const r = busca.get('regra') ?? '';
  const orgao = o === SEM_ORGAO ? SEM_ORGAO : opcoes.orgaos.includes(o) ? o : null;
  const regra = IDS_REGRAS.includes(r as IdRegra) ? (r as IdRegra) : null;
  return { orgao, regra, orgaoInvalido: o !== '' && orgao === null, regraInvalida: r !== '' && regra === null };
}

/** Endereço do relatório (ou do CSV) com os filtros; sem filtro, o endereço limpo. */
export function urlRelatorio(f: Partial<FiltrosRelatorio>, base: string = ROTA_INCONSISTENCIAS): string {
  const q = new URLSearchParams();
  if (f.orgao) q.set('orgao', f.orgao);
  if (f.regra) q.set('regra', f.regra);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
export const urlCsv = (f: Partial<FiltrosRelatorio>): string => urlRelatorio(f, ROTA_INCONSISTENCIAS_CSV);
export const rotuloOrgao = (orgao: string | null): string => (orgao === null || orgao === SEM_ORGAO ? ROTULO_SEM_ORGAO : orgao);

const doOrgao = (orgaoDoProjeto: string | null, filtro: string | null): boolean =>
  filtro === null || (filtro === SEM_ORGAO ? orgaoDoProjeto === null : orgaoDoProjeto === filtro);
const ORDEM_REGRA = new Map<IdRegra, number>(REGRAS.map((r, i) => [r.id, i]));
const semOrgaoPorUltimo = (a: string | null, b: string | null): number => (a === null ? 1 : 0) - (b === null ? 1 : 0) || comparar(a ?? '', b ?? '');

export interface RelatorioInconsistencias {
  filtros: FiltrosRelatorio;
  /** Projetos do órgão escolhido (todos, sem filtro de órgão). */
  totalProjetos: number;
  /** Projetos com ao menos uma inconsistência, no órgão e na regra escolhidos. */
  projetosComInconsistencia: number;
  /** Contagem de projetos por regra no órgão escolhido (todas as regras, inclusive as zeradas). */
  porRegra: { id: IdRegra; rotulo: string; descricao: string; qtd: number }[];
  /** Por órgão, na regra escolhida (sem órgão por último). */
  porOrgao: { orgao: string | null; projetos: number; qtd: number }[];
  /** Lista no órgão e na regra escolhidos: órgão, nome, código e regra. */
  itens: Inconsistencia[];
}

export function montarRelatorio(carteira: Carteira, ctx: ContextoInconsistencias, filtros: FiltrosRelatorio): RelatorioInconsistencias {
  const todos = carteira.projetos.flatMap((p) => inconsistenciasDoProjeto(p, ctx));
  const naRegra = (i: Inconsistencia) => filtros.regra === null || i.regra === filtros.regra;
  const noOrgao = todos.filter((i) => doOrgao(i.projeto.orgao, filtros.orgao));
  const itens = noOrgao.filter(naRegra).sort((a, b) =>
    semOrgaoPorUltimo(a.projeto.orgao, b.projeto.orgao) || comparar(a.projeto.nome, b.projeto.nome) || comparar(a.projeto.id, b.projeto.id)
    || (ORDEM_REGRA.get(a.regra) ?? 0) - (ORDEM_REGRA.get(b.regra) ?? 0));
  const grupos = new Map<string | null, { ids: Set<string>; qtd: number }>();
  for (const i of todos.filter(naRegra)) {
    const g = grupos.get(i.projeto.orgao) ?? { ids: new Set<string>(), qtd: 0 };
    g.ids.add(i.projeto.id);
    g.qtd++;
    grupos.set(i.projeto.orgao, g);
  }
  return {
    filtros: { orgao: filtros.orgao, regra: filtros.regra },
    totalProjetos: carteira.projetos.filter((p) => doOrgao(limpo(p.orgao) || null, filtros.orgao)).length,
    projetosComInconsistencia: new Set(itens.map((i) => i.projeto.id)).size,
    porRegra: REGRAS.map((r) => ({ id: r.id, rotulo: r.rotulo, descricao: r.descricao, qtd: noOrgao.filter((i) => i.regra === r.id).length })),
    porOrgao: [...grupos].map(([orgao, g]) => ({ orgao, projetos: g.ids.size, qtd: g.qtd })).sort((a, b) => semOrgaoPorUltimo(a.orgao, b.orgao)),
    itens,
  };
}

const CABECALHO_CSV = ['Órgão', 'Código do projeto', 'Projeto', 'Regra', 'O que corrigir'];

/** CSV com separador ';', todas as células entre aspas e proteção contra fórmula (mesma célula do Histórico); linhas em CRLF. */
export function paraCsvInconsistencias(itens: Inconsistencia[]): string {
  const linhas = [CABECALHO_CSV.map(celula).join(';')];
  for (const i of itens) linhas.push([rotuloOrgao(i.projeto.orgao), i.projeto.id, i.projeto.nome, rotuloRegra(i.regra), i.detalhe].map(celula).join(';'));
  return `${linhas.join('\r\n')}\r\n`;
}
export const nomeArquivoCsv = (hoje: string): string => `inconsistencias-govnexa-${hoje}.csv`;
