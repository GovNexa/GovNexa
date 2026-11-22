// Filtros padrão das telas de Projetos (E2): nome, órgão, área, macroetapa e período de entrega.
// Funções puras: sem relógio global nem leitura de arquivo. O estado mora no endereço (query string).
import { MACROETAPAS } from './macroetapas.ts';
import type { CodigoMacroetapa, Projeto } from './tipos.ts';

export const SEM_ORGAO = 'Sem órgão';
export const MAX_BUSCA = 80;
export const ANO_MIN = 2000;
export const ANO_MAX = 2100;

export type MacroFiltro = CodigoMacroetapa | 'sem' | '';

export interface FiltrosProjetos {
  busca: string;
  orgao: string;
  area: string;
  macro: MacroFiltro;
  de: string; // 'AAAA-MM' ou ''
  ate: string; // 'AAAA-MM' ou ''
}

export interface OpcoesFiltros {
  orgaos: string[];
  /** Ausente ou vazia = a carteira ainda não tem área; o campo some da tela e o parâmetro é ignorado. */
  areas?: string[];
  anos: number[];
}

export const FILTROS_VAZIOS: Readonly<FiltrosProjetos> = Object.freeze({ busca: '', orgao: '', area: '', macro: '', de: '', ate: '' });

export const AVISOS = {
  orgao: 'O órgão do endereço não existe nesta carteira; o filtro de órgão foi ignorado.',
  area: 'A área do endereço não existe nesta carteira; o filtro de área foi ignorado.',
  macro: 'A macroetapa do endereço não existe; o filtro de macroetapa foi ignorado.',
  mes: 'Mês ou ano inválido no endereço; essa ponta do período foi ignorada.',
  semAno: 'Escolha também o ano para filtrar pelo mês.',
  invertido: 'O fim do período era anterior ao início; as duas datas foram trocadas.',
} as const;

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES = /^(0?[1-9]|1[0-2])$/;
const ANO = /^\d{4}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/g;
const MACROS_VALIDAS: string[] = [...MACROETAPAS.map((m) => m.codigo), 'sem'];

const normalizar = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const porNome = (a: string, b: string): number => a.localeCompare(b, 'pt-BR');

export function isoValido(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = v.match(DIA_ISO);
  if (!m) return false;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && new Date(Date.UTC(Number(m[1]), mes - 1, dia)).getUTCDate() === dia;
}

const somaDias = (iso: string, dias: number): string | null => {
  const data = new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000);
  return Number.isFinite(data.getTime()) ? data.toISOString().slice(0, 10) : null;
};

/** Data prevista de entrega (ISO): encerramento; senão mobilização + dias de execução; senão null. */
export function dataEntrega(p: Projeto): string | null {
  const d = p.datas;
  if (isoValido(d.encerramento)) return d.encerramento;
  const dias = d.execucao_dias;
  if (isoValido(d.mobilizacao) && typeof dias === 'number' && Number.isInteger(dias) && dias >= 0 && dias <= 36500) return somaDias(d.mobilizacao, dias);
  return null;
}

export const orgaoDe = (p: Projeto): string => p.orgao ?? SEM_ORGAO;

/** Área do projeto. O campo chega com a E1; até lá a leitura é tolerante e devolve null. */
export function areaDe(p: Projeto): string | null {
  const a = (p as Projeto & { area?: unknown }).area;
  return typeof a === 'string' && a.trim() ? a.trim() : null;
}

/** Listas para os campos: órgãos e áreas da carteira; anos das entregas mais o ano de `hojeIso` ('AAAA-MM-DD'). */
export function opcoesFiltros(projetos: Projeto[], hojeIso: string): OpcoesFiltros {
  const unicos = (l: string[]): string[] => [...new Set(l)].sort(porNome);
  const orgaos = unicos(projetos.map(orgaoDe));
  const areas = unicos(projetos.map(areaDe).filter((a): a is string => a !== null));
  const anosBrutos = [...projetos.map(dataEntrega).filter((d): d is string => d !== null).map((d) => Number(d.slice(0, 4))), Number(hojeIso.slice(0, 4))];
  const validos = anosBrutos.filter((a) => Number.isInteger(a) && a >= ANO_MIN && a <= ANO_MAX);
  const anos: number[] = [];
  if (validos.length) for (let a = Math.min(...validos); a <= Math.max(...validos); a++) anos.push(a);
  return areas.length ? { orgaos, areas, anos } : { orgaos, anos };
}

function ponta(params: URLSearchParams, prefixo: 'de' | 'ate', avisos: Set<string>): string {
  const mes = (params.get(`${prefixo}_mes`) ?? '').trim();
  const ano = (params.get(`${prefixo}_ano`) ?? '').trim();
  if (!mes && !ano) return '';
  const anoOk = ANO.test(ano) && Number(ano) >= ANO_MIN && Number(ano) <= ANO_MAX;
  if ((mes && !MES.test(mes)) || (ano && !anoOk)) {
    avisos.add(AVISOS.mes);
    return '';
  }
  if (!ano) {
    avisos.add(AVISOS.semAno);
    return '';
  }
  return `${ano}-${mes ? mes.padStart(2, '0') : prefixo === 'de' ? '01' : '12'}`;
}

/** Lê e valida os filtros do endereço. Valor inválido é ignorado com aviso de texto fixo. */
export function lerFiltros(params: URLSearchParams, opcoes: OpcoesFiltros): { filtros: FiltrosProjetos; avisos: string[] } {
  const avisos = new Set<string>();
  const busca = (params.get('q') ?? '').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_BUSCA);
  let orgao = (params.get('orgao') ?? '').trim();
  if (orgao && !opcoes.orgaos.includes(orgao)) {
    avisos.add(AVISOS.orgao);
    orgao = '';
  }
  let area = (params.get('area') ?? '').trim();
  if (!opcoes.areas?.length) area = '';
  else if (area && !opcoes.areas.includes(area)) {
    avisos.add(AVISOS.area);
    area = '';
  }
  let macro = (params.get('macro') ?? '').trim();
  if (macro && !MACROS_VALIDAS.includes(macro)) {
    avisos.add(AVISOS.macro);
    macro = '';
  }
  let de = ponta(params, 'de', avisos);
  let ate = ponta(params, 'ate', avisos);
  if (de && ate && de > ate) {
    [de, ate] = [ate, de];
    avisos.add(AVISOS.invertido);
  }
  return { filtros: { busca, orgao, area, macro: macro as MacroFiltro, de, ate }, avisos: [...avisos] };
}

export const filtrosAtivos = (f: FiltrosProjetos): boolean => Object.values(f).some((v) => v !== '');

/** Endereço dos filtros (para links entre telas): '' quando não há filtro; senão '?q=...'. */
export function paraQuery(f: FiltrosProjetos): string {
  const q = new URLSearchParams();
  if (f.busca) q.set('q', f.busca);
  if (f.orgao) q.set('orgao', f.orgao);
  if (f.area) q.set('area', f.area);
  if (f.macro) q.set('macro', f.macro);
  if (f.de) { q.set('de_mes', f.de.slice(5, 7)); q.set('de_ano', f.de.slice(0, 4)); }
  if (f.ate) { q.set('ate_mes', f.ate.slice(5, 7)); q.set('ate_ano', f.ate.slice(0, 4)); }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function filtrarProjetos(projetos: Projeto[], f: FiltrosProjetos): Projeto[] {
  const termo = normalizar(f.busca);
  return projetos.filter((p) => {
    if (termo && !normalizar(p.nome).includes(termo)) return false;
    if (f.orgao && orgaoDe(p) !== f.orgao) return false;
    if (f.area && areaDe(p) !== f.area) return false;
    if (f.macro === 'sem' && p.macroetapa !== null) return false;
    if (f.macro && f.macro !== 'sem' && p.macroetapa !== f.macro) return false;
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

/** Da entrega mais próxima para a mais distante; sem data por último; empate pelo nome e depois pelo id. Não altera a lista recebida. */
export function ordenarPorEntrega(projetos: Projeto[]): Projeto[] {
  return [...projetos].sort((a, b) => {
    const ea = dataEntrega(a);
    const eb = dataEntrega(b);
    if (ea !== eb) {
      if (!ea) return 1;
      if (!eb) return -1;
      return ea < eb ? -1 : 1;
    }
    return porNome(a.nome, b.nome) || porNome(a.id, b.id);
  });
}

export const aplicarFiltros = (projetos: Projeto[], f: FiltrosProjetos): Projeto[] => ordenarPorEntrega(filtrarProjetos(projetos, f));
