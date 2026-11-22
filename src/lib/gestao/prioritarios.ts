// Tela do prefeito "Projetos prioritários" (E3). Funções puras: `hoje` ('AAAA-MM-DD'), projetos e catálogo de áreas são injetados.
// Sem farol, prazo vencido, "onde está parado", decisões pendentes nem convênios: essa lógica continua em dashboard.ts e painel.ts
// e vai para o painel da equipe na E10. Valores somados em centavos inteiros, para as partes somarem exatamente o total.
import { AREAS_PADRAO, areaDoProjeto, type Area } from '../carteira/area.ts';
import { dataEntrega, lerFiltros, orgaoDe } from '../carteira/filtros.ts';
import type { CodigoMacroetapa, Projeto } from '../carteira/tipos.ts';
import { valorProjeto } from '../carteira/visoes.ts';

export const FIM_LINHA_TEMPO = '2028-12';
export const MAX_AREAS_COM_COR = 6;
export const MAX_PROXIMAS = 8;
export const MAX_PRINCIPAIS = 5;
/** Chaves de grupo com hífen: o catálogo só aceita [a-z0-9_], então nunca colidem com um código real. */
export const SEM_AREA = '-sem';
export const OUTRAS = '-outros';
export const NOME_SEM_AREA = 'Sem área';
export const NOME_OUTRAS = 'Outros';
export const BASE = '/plataforma/';
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;

export type IdEtapa = 'execucao' | 'contratacao' | 'preparatorio' | 'planejamento' | 'estruturacao' | 'concluida' | 'sem';
export const ETAPAS: readonly { id: IdEtapa; nome: string; codigos: readonly (CodigoMacroetapa | null)[]; sempre: boolean }[] = [
  { id: 'execucao', nome: 'Execução', codigos: ['04', '05'], sempre: true },
  { id: 'contratacao', nome: 'Contratação', codigos: ['03'], sempre: true },
  { id: 'preparatorio', nome: 'Preparatório', codigos: ['02'], sempre: true },
  { id: 'planejamento', nome: 'Planejamento', codigos: ['01'], sempre: true },
  { id: 'estruturacao', nome: 'Estruturação', codigos: ['00'], sempre: true },
  { id: 'concluida', nome: 'Concluídas', codigos: ['06'], sempre: false },
  { id: 'sem', nome: 'Sem macroetapa', codigos: [null], sempre: false },
];
const IDS_ETAPA: string[] = ETAPAS.map((e) => e.id);

export interface FiltrosPrioritarios { prioritarios: boolean; orgao: string; area: string; regiao: string; etapa: IdEtapa | ''; de: string; ate: string }
export const FILTROS_PRIORITARIOS_VAZIOS: Readonly<FiltrosPrioritarios> = Object.freeze({ prioritarios: false, orgao: '', area: '', regiao: '', etapa: '', de: '', ate: '' });
export interface OpcaoArea { codigo: string; nome: string }
export interface OpcoesPrioritarios { orgaos: string[]; areas: OpcaoArea[]; regioes: string[] }
export const AVISOS_PRIORITARIOS = {
  regiao: 'A região do endereço não existe nesta carteira; o filtro de região foi ignorado.',
  etapa: 'A etapa do endereço não existe; o filtro de etapa foi ignorado.',
} as const;

const porNome = (a: string, b: string): number => a.localeCompare(b, 'pt-BR');

export function etapaDe(p: Projeto): IdEtapa {
  const m = p.macroetapa ?? null;
  return ETAPAS.find((e) => e.codigos.includes(m))?.id ?? 'sem';
}
export const nomeEtapa = (id: IdEtapa): string => ETAPAS.find((e) => e.id === id)?.nome ?? 'Sem macroetapa';

/** Área mostrada ao prefeito: a gravada; senão a sugerida pelo órgão (E1, D2); senão "Sem área". */
export function areaEfetiva(p: Projeto, areas: readonly Area[] = AREAS_PADRAO): OpcaoArea {
  const a = areaDoProjeto(p, areas);
  return a ? { codigo: a.codigo, nome: a.nome } : { codigo: SEM_AREA, nome: NOME_SEM_AREA };
}

export const regiaoDe = (p: Projeto): string => (typeof p.regiao === 'string' ? p.regiao.trim() : '');

/** Centavos inteiros de um valor conhecido e não negativo; null = sem valor informado. */
export function centavos(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

/** "R$ 1,3 bi", "R$ 350 mi", "R$ 12,5 mil"; abaixo de mil, o valor inteiro (mesma regra do reaisAbreviado do painel). */
export function reaisCurtos(c: number): string {
  const n = c / 100;
  const f = (v: number, sufixo: string): string => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 1 })} ${sufixo}`;
  if (n >= 1e9) return f(n / 1e9, 'bi');
  if (n >= 1e6) return f(n / 1e6, 'mi');
  if (n >= 1e3) return f(n / 1e3, 'mil');
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export function opcoesPrioritarios(projetos: Projeto[], areas: readonly Area[] = AREAS_PADRAO): OpcoesPrioritarios {
  const orgaos = [...new Set(projetos.map(orgaoDe))].sort(porNome);
  const mapa = new Map<string, string>();
  for (const p of projetos) { const a = areaEfetiva(p, areas); mapa.set(a.codigo, a.nome); }
  const lista = [...mapa].map(([codigo, nome]) => ({ codigo, nome }))
    .sort((a, b) => (a.codigo === SEM_AREA ? 1 : 0) - (b.codigo === SEM_AREA ? 1 : 0) || porNome(a.nome, b.nome));
  const regioes = [...new Set(projetos.map(regiaoDe).filter((r) => r !== ''))].sort(porNome);
  return { orgaos, areas: lista, regioes };
}

/** Lê o endereço. Órgão, área e período passam pela validação da E2 (mesmos nomes de parâmetro); o resto por lista fechada. */
export function lerFiltrosPrioritarios(params: URLSearchParams, opcoes: OpcoesPrioritarios): { filtros: FiltrosPrioritarios; avisos: string[] } {
  const so = new URLSearchParams();
  for (const k of ['orgao', 'area', 'de_mes', 'de_ano', 'ate_mes', 'ate_ano']) { const v = params.get(k); if (v !== null) so.set(k, v); }
  const e2 = lerFiltros(so, { orgaos: opcoes.orgaos, areas: opcoes.areas.map((a) => a.codigo), anos: [] });
  const avisos = [...e2.avisos];
  let regiao = (params.get('regiao') ?? '').trim();
  if (regiao && !opcoes.regioes.includes(regiao)) { avisos.push(AVISOS_PRIORITARIOS.regiao); regiao = ''; }
  let etapa = (params.get('etapa') ?? '').trim();
  if (etapa && !IDS_ETAPA.includes(etapa)) { avisos.push(AVISOS_PRIORITARIOS.etapa); etapa = ''; }
  return {
    filtros: { prioritarios: params.get('prioritarios') === '1', orgao: e2.filtros.orgao, area: e2.filtros.area, regiao, etapa: etapa as IdEtapa | '', de: e2.filtros.de, ate: e2.filtros.ate },
    avisos,
  };
}

export function filtrarPrioritarios(projetos: Projeto[], f: FiltrosPrioritarios, areas: readonly Area[] = AREAS_PADRAO): Projeto[] {
  return projetos.filter((p) => {
    if (f.prioritarios && p.prioritario !== true) return false;
    if (f.orgao && orgaoDe(p) !== f.orgao) return false;
    if (f.area && areaEfetiva(p, areas).codigo !== f.area) return false;
    if (f.regiao && regiaoDe(p) !== f.regiao) return false;
    if (f.etapa && etapaDe(p) !== f.etapa) return false;
    if (f.de || f.ate) {
      const e = dataEntrega(p);
      if (!e) return false;
      const mes = e.slice(0, 7);
      if (f.de && mes < f.de) return false;
      if (f.ate && mes > f.ate) return false;
    }
    return true;
  });
}

/** Endereço da tela com os filtros, sempre na mesma ordem de parâmetros; sem filtro = '/plataforma/'. */
export function urlPrioritarios(f: FiltrosPrioritarios): string {
  const q = new URLSearchParams();
  if (f.prioritarios) q.set('prioritarios', '1');
  if (f.orgao) q.set('orgao', f.orgao);
  if (f.area) q.set('area', f.area);
  if (f.regiao) q.set('regiao', f.regiao);
  if (f.etapa) q.set('etapa', f.etapa);
  if (f.de) { q.set('de_mes', f.de.slice(5, 7)); q.set('de_ano', f.de.slice(0, 4)); }
  if (f.ate) { q.set('ate_mes', f.ate.slice(5, 7)); q.set('ate_ano', f.ate.slice(0, 4)); }
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** Clicar no que já está ativo desliga o filtro; clicar em outro troca. */
export function alternar(f: FiltrosPrioritarios, chave: 'area' | 'etapa' | 'orgao' | 'regiao', valor: string): FiltrosPrioritarios {
  return { ...f, [chave]: f[chave] === valor ? '' : valor } as FiltrosPrioritarios;
}
export function alternarMes(f: FiltrosPrioritarios, mes: string): FiltrosPrioritarios {
  return f.de === mes && f.ate === mes ? { ...f, de: '', ate: '' } : { ...f, de: mes, ate: mes };
}

export interface Parte { id: IdEtapa; nome: string; qtd: number; centavos: number; semValor: number }
export interface Resumo { qtd: number; centavos: number; semValor: number; porEtapa: Parte[] }

/** Quantidade e valor por etapa. As cinco etapas principais aparecem sempre; Concluídas e Sem macroetapa só quando existem. */
export function resumoPorEtapa(projetos: Projeto[]): Resumo {
  const partes = ETAPAS.map((e) => ({ id: e.id, nome: e.nome, qtd: 0, centavos: 0, semValor: 0, sempre: e.sempre }));
  let total = 0;
  let semValor = 0;
  for (const p of projetos) {
    const parte = partes.find((x) => x.id === etapaDe(p))!;
    parte.qtd++;
    const c = centavos(valorProjeto(p));
    if (c === null) { parte.semValor++; semValor++; } else { parte.centavos += c; total += c; }
  }
  return { qtd: projetos.length, centavos: total, semValor, porEtapa: partes.filter((x) => x.sempre || x.qtd > 0).map(({ sempre: _s, ...x }) => x) };
}

/** Cor fixa por área (1 a 6), calculada na carteira INTEIRA: um filtro não repinta as áreas. "Outros" do catálogo e "Sem área" ficam cinza. */
export function coresDasAreas(todos: Projeto[], areas: readonly Area[] = AREAS_PADRAO): Map<string, number> {
  const contagem = new Map<string, { nome: string; qtd: number }>();
  for (const p of todos) {
    const a = areaEfetiva(p, areas);
    if (a.codigo === SEM_AREA || a.codigo === 'outros') continue;
    const atual = contagem.get(a.codigo) ?? { nome: a.nome, qtd: 0 };
    atual.qtd++;
    contagem.set(a.codigo, atual);
  }
  const ordem = [...contagem].sort(([, a], [, b]) => b.qtd - a.qtd || porNome(a.nome, b.nome)).slice(0, MAX_AREAS_COM_COR);
  return new Map(ordem.map(([codigo], i) => [codigo, i + 1]));
}

export interface ParteArea { codigo: string; nome: string; qtd: number; cor: number | null }
export function obrasPorArea(projetos: Projeto[], cores: Map<string, number>, areas: readonly Area[] = AREAS_PADRAO): ParteArea[] {
  const grupos = new Map<string, ParteArea>();
  for (const p of projetos) {
    const a = areaEfetiva(p, areas);
    const g = grupos.get(a.codigo) ?? { codigo: a.codigo, nome: a.nome, qtd: 0, cor: cores.get(a.codigo) ?? null };
    g.qtd++;
    grupos.set(a.codigo, g);
  }
  return [...grupos.values()].sort((a, b) => (a.codigo === SEM_AREA ? 1 : 0) - (b.codigo === SEM_AREA ? 1 : 0) || b.qtd - a.qtd || porNome(a.nome, b.nome));
}

export function mesesEntre(inicio: string, fim: string): string[] {
  if (!MES_ISO.test(inicio) || !MES_ISO.test(fim) || inicio > fim) return [];
  const r: string[] = [];
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(5, 7));
  while (r.length < 1200) {
    const s = `${ano}-${String(mes).padStart(2, '0')}`;
    if (s > fim) break;
    r.push(s);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return r;
}
export const rotuloMes = (mes: string): string => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
/** Rótulos do eixo: janeiro e julho; o primeiro mês só quando o próximo rótulo está a 4 meses ou mais (não se sobrepõem a 390 px). */
export function rotulosDoEixo(meses: string[]): string[] {
  const marca = (m: string): boolean => m.endsWith('-01') || m.endsWith('-07');
  const r = meses.map((m) => (marca(m) ? rotuloMes(m) : ''));
  const proxima = meses.findIndex(marca);
  if (meses.length && (proxima === -1 || proxima >= 4)) r[0] = rotuloMes(meses[0]);
  return r;
}

export interface Serie { id: string; nome: string; cor: number | null }
export interface MesLinha { mes: string; rotulo: string; total: number; porSerie: number[] }
export interface LinhaTempo { meses: MesLinha[]; series: Serie[]; maximo: number; total: number; fora: { semData: number; antes: number; depois: number } }

/** Entregas não concluídas por mês, do mês de `hoje` até dez/2028, empilhadas por área (6 com cor; o resto em "Outros"; "Sem área" à parte). */
export function linhaDoTempo(projetos: Projeto[], hoje: string, cores: Map<string, number>, areas: readonly Area[] = AREAS_PADRAO): LinhaTempo {
  const inicio = hoje.slice(0, 7);
  const meses = mesesEntre(inicio, FIM_LINHA_TEMPO);
  const fora = { semData: 0, antes: 0, depois: 0 };
  const nomes = new Map<string, string>();
  const contagem = new Map<string, Map<string, number>>();
  for (const p of projetos) {
    if (etapaDe(p) === 'concluida') continue;
    const e = dataEntrega(p);
    if (!e) { fora.semData++; continue; }
    const mes = e.slice(0, 7);
    if (mes < inicio) { fora.antes++; continue; }
    if (mes > FIM_LINHA_TEMPO) { fora.depois++; continue; }
    const a = areaEfetiva(p, areas);
    const serie = cores.has(a.codigo) ? a.codigo : a.codigo === SEM_AREA ? SEM_AREA : OUTRAS;
    nomes.set(serie, serie === OUTRAS ? NOME_OUTRAS : a.nome);
    const porMes = contagem.get(serie) ?? new Map<string, number>();
    porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
    contagem.set(serie, porMes);
  }
  const peso = (id: string): number => cores.get(id) ?? (id === OUTRAS ? 100 : 101);
  const series: Serie[] = [...nomes].map(([id, nome]) => ({ id, nome, cor: cores.get(id) ?? null })).sort((a, b) => peso(a.id) - peso(b.id));
  const linhas = meses.map((mes) => {
    const porSerie = series.map((s) => contagem.get(s.id)?.get(mes) ?? 0);
    return { mes, rotulo: rotuloMes(mes), total: porSerie.reduce((t, n) => t + n, 0), porSerie };
  });
  return { meses: linhas, series, maximo: Math.max(0, ...linhas.map((l) => l.total)), total: linhas.reduce((t, l) => t + l.total, 0), fora };
}

export interface ItemObra { id: string; nome: string; orgao: string; area: string; etapa: string; entrega: string | null; centavos: number | null; prioritario: boolean }
const item = (p: Projeto, areas: readonly Area[]): ItemObra => ({
  id: p.id, nome: p.nome, orgao: orgaoDe(p), area: areaEfetiva(p, areas).nome, etapa: nomeEtapa(etapaDe(p)),
  entrega: dataEntrega(p), centavos: centavos(valorProjeto(p)), prioritario: p.prioritario === true,
});

/** Próximas entregas: não concluídas, com entrega de hoje em diante, da mais próxima para a mais distante (empate: nome, depois id). */
export function proximasEntregas(projetos: Projeto[], hoje: string, areas: readonly Area[] = AREAS_PADRAO, limite = MAX_PROXIMAS): { itens: ItemObra[]; total: number } {
  const lista = projetos.map((p) => item(p, areas)).filter((i, n) => etapaDe(projetos[n]) !== 'concluida' && i.entrega !== null && i.entrega >= hoje)
    .sort((a, b) => (a.entrega! < b.entrega! ? -1 : a.entrega! > b.entrega! ? 1 : porNome(a.nome, b.nome) || porNome(a.id, b.id)));
  return { itens: lista.slice(0, limite), total: lista.length };
}

/** Principais obras: não concluídas; marcadas como prioritárias primeiro, depois o maior valor (sem valor por último), depois o nome. */
export function principaisObras(projetos: Projeto[], areas: readonly Area[] = AREAS_PADRAO, limite = MAX_PRINCIPAIS): ItemObra[] {
  return projetos.filter((p) => etapaDe(p) !== 'concluida').map((p) => item(p, areas))
    .sort((a, b) => Number(b.prioritario) - Number(a.prioritario) || (b.centavos ?? -1) - (a.centavos ?? -1) || porNome(a.nome, b.nome) || porNome(a.id, b.id))
    .slice(0, limite);
}

export interface TelaPrioritarios {
  opcoes: OpcoesPrioritarios; filtros: FiltrosPrioritarios; avisos: string[]; vazia: boolean; projetos: Projeto[];
  resumo: Resumo; porArea: ParteArea[]; linha: LinhaTempo; proximas: { itens: ItemObra[]; total: number }; principais: ItemObra[]; cores: Map<string, number>;
}
export function montarPrioritarios(todos: Projeto[], params: URLSearchParams, hoje: string, areas: readonly Area[] = AREAS_PADRAO): TelaPrioritarios {
  const opcoes = opcoesPrioritarios(todos, areas);
  const { filtros, avisos } = lerFiltrosPrioritarios(params, opcoes);
  const projetos = filtrarPrioritarios(todos, filtros, areas);
  const cores = coresDasAreas(todos, areas);
  return {
    opcoes, filtros, avisos, vazia: todos.length === 0, projetos, cores,
    resumo: resumoPorEtapa(projetos), porArea: obrasPorArea(projetos, cores, areas), linha: linhaDoTempo(projetos, hoje, cores, areas),
    proximas: proximasEntregas(projetos, hoje, areas), principais: principaisObras(projetos, areas),
  };
}
