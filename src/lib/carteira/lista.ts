// Carteira de projetos (E5): "só prioritários", busca também pelo código, totais em centavos inteiros,
// grupos por macroetapa (entrega mais próxima primeiro), ID sem prefixo, valor em R$ e o endereço da antiga Visão por órgão.
// Funções puras: sem relógio global e sem leitura de arquivo.
import { nomeDaArea } from './area.ts';
import { filtrarProjetos, ordenarPorEntrega, type FiltrosProjetos } from './filtros.ts';
import { MACROETAPAS } from './macroetapas.ts';
import type { CodigoMacroetapa, Projeto } from './tipos.ts';
import { valorProjeto } from './visoes.ts';

export const URL_CARTEIRA = '/plataforma/projetos-carteira/';
export const PARAM_PRIORITARIOS = 'prioritarios';
export const SEM_MACROETAPA = 'Sem macroetapa';
export const TRACO = '\u2014';
const ID_PLANILHA = /^P-(\d{1,9})$/;
const ID_BUSCA = /^(?:[Pp]-?)?(\d{1,9})$/;
const CONTROLE = /[\u0000-\u001f\u007f]/g;
const MES_ANO = /^(\d{4})-(\d{2})$/;
const MAX_ORGAO = 200;
const FORMATO_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "Só prioritários" (D1): só o valor exato '1' liga o filtro. */
export const lerSoPrioritarios = (params: URLSearchParams): boolean => params.get(PARAM_PRIORITARIOS) === '1';

/** Busca que é um código ('P-901', 'p901', '901') vira o id 'P-901'; senão null. */
export function idDaBusca(busca: string): string | null {
  const m = busca.trim().match(ID_BUSCA);
  return m ? `P-${Number(m[1])}` : null;
}

/** Filtros da E2 + "só prioritários" + busca pelo código (links antigos usam ?q=P-...). Mantém a ordem recebida. */
export function filtrarCarteira(projetos: Projeto[], f: FiltrosProjetos, soPrioritarios: boolean): Projeto[] {
  const base = soPrioritarios ? projetos.filter((p) => p.prioritario === true) : projetos;
  const achados = new Set(filtrarProjetos(base, f));
  const alvo = f.busca ? idDaBusca(f.busca) : null;
  if (alvo) for (const p of filtrarProjetos(base, { ...f, busca: '' })) if (p.id === alvo) achados.add(p);
  return base.filter((p) => achados.has(p));
}

/** Valor usado na Carteira (total; senão obra). Número inválido conta como sem valor. */
export function valorValido(p: Projeto): number | null {
  const v = valorProjeto(p);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const centavosDe = (v: number): number => Math.round(v * 100);

export interface Totais { qtd: number; centavos: number; valor: number; semValor: number }

/** Soma em centavos inteiros (sem erro de arredondamento). Projeto sem valor conta na quantidade e em semValor. */
export function totaisCarteira(projetos: Projeto[]): Totais {
  let centavos = 0;
  let semValor = 0;
  for (const p of projetos) {
    const v = valorValido(p);
    if (v === null) semValor += 1;
    else centavos += centavosDe(v);
  }
  return { qtd: projetos.length, centavos, valor: centavos / 100, semValor };
}

const codigoDoGrupo = (p: Projeto): CodigoMacroetapa | 'sem' =>
  MACROETAPAS.some((m) => m.codigo === p.macroetapa) ? (p.macroetapa as CodigoMacroetapa) : 'sem';

export interface GrupoCarteira extends Totais { codigo: CodigoMacroetapa | 'sem'; rotulo: string; projetos: Projeto[] }

/** Grupos na ordem do ciclo (00 a 06) e "Sem macroetapa" por último; código desconhecido vai para "Sem macroetapa". Grupo vazio some. */
export function agruparPorMacroetapa(projetos: Projeto[]): GrupoCarteira[] {
  const ordem: { codigo: CodigoMacroetapa | 'sem'; rotulo: string }[] = [
    ...MACROETAPAS.map((m) => ({ codigo: m.codigo, rotulo: m.rotulo })),
    { codigo: 'sem', rotulo: SEM_MACROETAPA },
  ];
  return ordem
    .map((g) => {
      const lista = ordenarPorEntrega(projetos.filter((p) => codigoDoGrupo(p) === g.codigo));
      return { ...g, projetos: lista, ...totaisCarteira(lista) };
    })
    .filter((g) => g.qtd > 0);
}

/** ID discreto: só o número. 'P-900' vira '900'; fora do padrão usa o código legado; sem nada, o próprio id ou o traço. */
export function numeroDoId(p: Pick<Projeto, 'id' | 'codigo_legado'>): string {
  const id = typeof p.id === 'string' ? p.id.trim() : '';
  const m = id.match(ID_PLANILHA);
  if (m) return String(Number(m[1]));
  const c = p.codigo_legado as unknown;
  if (typeof c === 'number' && Number.isSafeInteger(c) && c >= 0) return String(c);
  return id || TRACO;
}

export const formatarReais = (v: number | null): string => (v === null || !Number.isFinite(v) ? TRACO : FORMATO_REAIS.format(v));

const mesAno = (aaaaMm: string): string => {
  const m = aaaaMm.match(MES_ANO);
  return m ? `${m[2]}/${m[1]}` : aaaaMm;
};

/** Filtros em texto, para o cabeçalho da impressão. */
export function descreverFiltros(f: FiltrosProjetos, soPrioritarios: boolean): string[] {
  const partes: string[] = [];
  if (f.busca) partes.push(`Busca: ${f.busca}`);
  if (f.orgao) partes.push(`Órgão: ${f.orgao}`);
  if (f.area) partes.push(`Área: ${nomeDaArea(f.area) ?? f.area}`);
  if (f.macro) partes.push(`Macroetapa: ${f.macro === 'sem' ? SEM_MACROETAPA : MACROETAPAS.find((m) => m.codigo === f.macro)?.rotulo ?? f.macro}`);
  if (f.de && f.ate) partes.push(`Entrega de ${mesAno(f.de)} a ${mesAno(f.ate)}`);
  else if (f.de) partes.push(`Entrega a partir de ${mesAno(f.de)}`);
  else if (f.ate) partes.push(`Entrega até ${mesAno(f.ate)}`);
  if (soPrioritarios) partes.push('Só prioritários');
  return partes.length ? partes : ['Sem filtros: carteira inteira'];
}

/** Destino fixo da antiga Visão por órgão: só o parâmetro 'orgao' passa, limpo e codificado. A Carteira valida o órgão. */
export function urlCarteiraPorOrgao(params: URLSearchParams): string {
  const orgao = (params.get('orgao') ?? '').replace(CONTROLE, ' ').trim().slice(0, MAX_ORGAO);
  if (!orgao) return URL_CARTEIRA;
  return `${URL_CARTEIRA}?${new URLSearchParams({ orgao }).toString()}`;
}
