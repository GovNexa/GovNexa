/**
 * Funções puras: coleta e hoje injetados, sem consultar repositório ou relógio.
 * Somas usam só valores conhecidos + cobertura { comValor, total }; nenhum = null.
 * Médias usam pares válidos com cobertura própria; secundário parcial informa "n de m".
 * Cobertura do cartão refere-se ao valor; detalhe.coberturas discrimina soma e média.
 * Saldo sem fonte soma saldos identificáveis; itens sem valor preservam null.
 * Cronogramas sem vínculo ficam fora. Risco = união sem duplicar dos alertas existentes
 * com vigência futura em até 180 dias; valor em risco = repasse ainda não desembolsado.
 * Programas da coleta já são elegíveis ao município; prazo segue a guia Captação.
 * Não há regra confiável projeto × programa (temas são rascunho): sugestões vazias.
 * CAUC conta pendências no número e informa a regularidade no secundário.
 * Quebras municipais sem dimensão conhecida ficam vazias; não se inventa localização.
 */
import type { Carteira, Projeto } from '../carteira/tipos.ts';
import { farol, saldoSemFonte, valorProjeto } from '../carteira/visoes.ts';
import { MACROETAPAS, nomeMacroetapa } from '../carteira/macroetapas.ts';
import type { Cronograma } from '../cronograma/tipos.ts';
import { diasEntre } from '../cronograma/visoes.ts';
import { PRAZOS } from '../prazos/lei14133.ts';
import { alertasConvenios, alertasPrazoLei, alertasSemFonte, paraIso, type ConvenioEntrada, type EventoPrazo } from '../alertas/central.ts';
import { montarPainel, rankPrioridade, reaisAbreviado, resumoCaptacaoDaColeta } from './painel.ts';

export interface Filtros { regiao?: string; orgao?: string; prioridade?: string; compromisso?: 'decidido' | 'condicionado' | 'ideia' }
export const IDS_CARTOES = ['carteira', 'execucao', 'contratacao', 'entregas', 'atencao', 'falta_financiar', 'convenios', 'convenios_risco', 'cauc', 'oportunidades'] as const;
export type IdCartao = typeof IDS_CARTOES[number];
export type Situacao = 'ok' | 'atencao' | 'critico' | 'neutro';
export interface Cobertura { comValor: number; total: number }
export interface Quebra { nome: string; qtd: number; valor: number | null; cobertura: Cobertura }
export interface ItemDetalhe {
  id: string; nome: string; linha1: string; linha2: string; valor: number | null; situacao: Situacao; link: string;
  prazo?: string | null; percentual?: number | null; programas?: { id: string; nome: string }[];
}
export interface Detalhe { coberturas?: Record<string, Cobertura>; resumo: Record<string, number | null>; quebras: { porOrgao: Quebra[]; porRegiao: Quebra[]; porMacroetapa: Quebra[] }; itens: ItemDetalhe[] }
export interface Cartao {
  id: IdCartao; titulo: string; valorPrincipal: number | null; unidade: 'qtd' | 'reais' | 'percentual'; secundario: string;
  cobertura?: Cobertura; situacao: Situacao; fonte: string; abrangencia: 'carteira' | 'municipio'; detalhe: Detalhe;
}
interface Coleta { proveniencia?: { fonte?: string; data_coleta?: string; data_referencia?: unknown } }
export interface Acompanhamento extends Coleta { resumo?: Record<string, unknown>; convenios?: ConvenioEntrada[] }
export interface Cauc extends Coleta { situacao_geral?: string; itens?: { item: string; descricao?: string; validade?: string | null }[]; itens_com_pendencia?: string[] }
export interface Programa { codigo: string; nome: string; orgao_superior?: string; prazos?: { proposta_ate?: string | null; emendas_ate?: string | null; beneficiario_especifico_ate?: string | null } }
export interface EntradaDashboard {
  carteira: Carteira; cronogramas: Cronograma[]; cronogramasImportadosEm?: string | null; acompanhamento?: Acompanhamento | null;
  cauc?: Cauc | null; programasAbertos?: (Coleta & { programas?: Programa[] }) | null; eventosLei?: EventoPrazo[];
}
export interface ValoresValidos { regioes: string[]; orgaos: string[]; prioridades: string[]; projetos?: string[] }
const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
export function filtrarCarteira(carteira: Carteira, filtros: Filtros = {}): Carteira {
  return { ...carteira, projetos: carteira.projetos.filter(p => (!filtros.regiao || p.regiao === filtros.regiao) && (!filtros.orgao || p.orgao === filtros.orgao) && (!filtros.prioridade || p.prioridade === filtros.prioridade) && (!filtros.compromisso || p.compromisso === filtros.compromisso)) };
}
export function opcoesFiltros(carteira: Carteira): ValoresValidos {
  const lista = (k: 'regiao' | 'orgao' | 'prioridade') => [...new Set(carteira.projetos.map(p => p[k]).filter((v): v is string => !!v))].sort(comparar);
  return { regioes: lista('regiao'), orgaos: lista('orgao'), prioridades: lista('prioridade') };
}
export function parametrosDaUrl(url: URL, validos: ValoresValidos): { filtros: Filtros; cartao?: IdCartao; projeto?: string } {
  const filtros: Filtros = {};
  for (const [chave, lista] of [['regiao', validos.regioes], ['orgao', validos.orgaos], ['prioridade', validos.prioridades]] as const) {
    const v = url.searchParams.get(chave); if (v && lista.includes(v)) filtros[chave] = v;
  }
  const c = url.searchParams.get('compromisso');
  if (c === 'decidido' || c === 'condicionado' || c === 'ideia') filtros.compromisso = c;
  const cartao = url.searchParams.get('cartao'); const projeto = url.searchParams.get('projeto');
  return { filtros, ...(IDS_CARTOES.includes(cartao as IdCartao) ? { cartao: cartao as IdCartao } : {}), ...(projeto && validos.projetos?.includes(projeto) ? { projeto } : {}) };
}
export function urlCom(filtros: Filtros, cartao?: IdCartao, projeto?: string, base = '/plataforma/'): string {
  const q = new URLSearchParams();
  for (const k of ['regiao', 'orgao', 'prioridade', 'compromisso'] as const) if (filtros[k]) q.set(k, filtros[k]);
  if (cartao && IDS_CARTOES.includes(cartao)) q.set('cartao', cartao);
  if (projeto) q.set('projeto', projeto);
  return `${base}${q.size ? `?${q}` : ''}`;
}
const cobertura = (l: (number | null)[]): Cobertura => ({ comValor: l.filter(v => v !== null).length, total: l.length });
const soma = (l: (number | null)[]): number | null => {
  const conhecidos = l.filter((v): v is number => v !== null);
  return conhecidos.length ? conhecidos.reduce((s, v) => s + v, 0) : null;
};
const textoCobertura = (c: Cobertura, unidade = 'projetos'): string => c.comValor < c.total ? ` · ${c.comValor} de ${c.total} ${unidade} com valor` : '';
const dinheiro = (v: number | null): string => v === null ? '—' : reaisAbreviado(v);
const vazias = (): Detalhe['quebras'] => ({ porOrgao: [], porRegiao: [], porMacroetapa: [] });
function agrupar<T>(itens: T[], nome: (v: T) => string, valor: (v: T) => number | null): Quebra[] {
  const grupos = new Map<string, T[]>();
  for (const i of itens) { const n = nome(i); grupos.set(n, [...(grupos.get(n) ?? []), i]); }
  return [...grupos].sort(([a], [b]) => comparar(a, b)).map(([nome, l]) => ({ nome, qtd: l.length, valor: soma(l.map(valor)), cobertura: cobertura(l.map(valor)) }));
}
const porPrazo = (a: ItemDetalhe, b: ItemDetalhe) => comparar(a.prazo ?? '9999-12-31', b.prazo ?? '9999-12-31') || comparar(a.nome, b.nome);
const cor = (v: 'verde' | 'amarelo' | 'vermelho'): Situacao => v === 'vermelho' ? 'critico' : v === 'amarelo' ? 'atencao' : 'ok';

export function montarDashboard(e: EntradaDashboard, hoje: string, filtros: Filtros = {}) {
  const carteira = filtrarCarteira(e.carteira, filtros); const projetos = carteira.projetos;
  const ids = new Set(projetos.map(p => p.id));
  const painel = montarPainel(carteira, e.cronogramas.filter(c => c.projeto_id !== null && ids.has(c.projeto_id)), [], null, hoje);
  const fontes = [{ nome: 'Carteira', data: carteira.fonte.importado_em || null }, { nome: 'Cronogramas', data: e.cronogramasImportadosEm ?? null },
    ...(['acompanhamento', 'cauc', 'programasAbertos'] as const).map(k => ({ nome: e[k]?.proveniencia?.fonte ?? k, data: e[k]?.proveniencia?.data_coleta ?? null }))];
  const cartoes: Cartao[] = [];
  const adicionar = (id: IdCartao, titulo: string, lista: Projeto[], situacao: Situacao = 'neutro') => {
    const valores = lista.map(valorProjeto); const valor = soma(valores); const coberturaValor = cobertura(valores);
    const c: Cartao = { id, titulo, valorPrincipal: lista.length, unidade: 'qtd', secundario: dinheiro(valor) + textoCobertura(coberturaValor), cobertura: coberturaValor, situacao, fonte: 'Carteira', abrangencia: 'carteira', detalhe: {
      resumo: { qtd: lista.length, valor }, coberturas: { valor: coberturaValor }, quebras: { porOrgao: agrupar(lista, p => p.orgao ?? 'Sem órgão', valorProjeto), porRegiao: agrupar(lista, p => p.regiao ?? 'Sem região', valorProjeto), porMacroetapa: agrupar(lista, p => nomeMacroetapa(p.macroetapa), valorProjeto) },
      itens: lista.map(p => ({ id: p.id, nome: p.nome, linha1: p.orgao ?? 'Sem órgão', linha2: nomeMacroetapa(p.macroetapa), valor: valorProjeto(p), situacao: cor(farol(p, hoje).cor), link: urlCom(filtros, id, p.id) })) } };
    cartoes.push(c); return c;
  };
  adicionar('carteira', 'Carteira de projetos', projetos);
  const exec = adicionar('execucao', 'Em execução', projetos.filter(p => p.macroetapa === '05'));
  const percentuais = painel.execucao.lista.filter(p => p.percentual !== null && p.percentual >= 0);
  const peso = percentuais.reduce((s, p) => s + (p.valor as number), 0);
  exec.detalhe.resumo.percentual = peso > 0 ? percentuais.reduce((s, p) => s + (p.executado as number), 0) / peso * 100 : null;
  exec.detalhe.itens = exec.detalhe.itens.map(i => ({ ...i, percentual: percentuais.find(p => p.id === i.id)?.percentual ?? null })).sort((a, b) => (a.percentual ?? Infinity) - (b.percentual ?? Infinity) || comparar(a.nome, b.nome));
  const coberturaPercentual = { comValor: percentuais.length, total: exec.detalhe.itens.length };
  exec.detalhe.coberturas!.percentual = coberturaPercentual;
  exec.secundario += `; ${exec.detalhe.resumo.percentual === null ? '—' : `${exec.detalhe.resumo.percentual.toFixed(1)}%`} executado${textoCobertura(coberturaPercentual)}`;
  const contratacao = adicionar('contratacao', 'Em contratação', projetos.filter(p => p.macroetapa === '02' || p.macroetapa === '03'));
  const eventos = (e.eventosLei ?? []).filter(v => v.projetoId && contratacao.detalhe.itens.some(p => p.id === v.projetoId) && !v.concluidoEm && PRAZOS.some(p => p.id === v.prazoId && p.tipo === 'teto'));
  const alertas = alertasPrazoLei(eventos, carteira, hoje, carteira.prefeitura_id);
  contratacao.situacao = eventos.length ? alertas.some(a => a.gravidade === 'vermelho') ? 'critico' : alertas.length ? 'atencao' : 'ok' : 'neutro';
  if (!eventos.length) contratacao.secundario += '; sem prazos da Lei cadastrados';
  contratacao.detalhe.itens = contratacao.detalhe.itens.map(i => {
    const l = alertas.filter(a => a.projeto?.id === i.id); const tem = eventos.some(v => v.projetoId === i.id);
    return { ...i, situacao: (l.some(a => a.gravidade === 'vermelho') ? 'critico' : l.length ? 'atencao' : tem ? 'ok' : 'neutro') as Situacao, linha2: l.map(a => a.titulo).join('; ') || (tem ? 'Dentro dos prazos cadastrados' : 'sem prazos da Lei cadastrados') };
  });
  const entregas = adicionar('entregas', 'Entregas em 90 dias', projetos.filter(p => painel.entregas.lista.some(i => i.id === p.id)));
  entregas.detalhe.itens = entregas.detalhe.itens.map(i => { const prazo = projetos.find(p => p.id === i.id)!.datas.encerramento; return { ...i, prazo, linha2: prazo! }; }).sort(porPrazo);
  const vermelhos = projetos.filter(p => p.macroetapa !== '06' && farol(p, hoje).cor === 'vermelho').sort((a, b) => rankPrioridade(a.prioridade) - rankPrioridade(b.prioridade) || comparar(a.nome, b.nome));
  const atencao = adicionar('atencao', 'Projetos em atenção', vermelhos, vermelhos.length ? 'critico' : 'ok');
  atencao.detalhe.itens = atencao.detalhe.itens.map(i => { const p = projetos.find(p => p.id === i.id)!; return { ...i, linha1: farol(p, hoje).motivo, linha2: p.prioridade ?? 'Sem prioridade' }; });
  const semFonte = new Set(alertasSemFonte(carteira).map(a => a.projeto?.id));
  const falta = adicionar('falta_financiar', 'Falta financiar', projetos.filter(p => semFonte.has(p.id)), semFonte.size ? 'atencao' : 'neutro');
  const elegiveis = projetos.filter(p => p.macroetapa !== '06'); const saldo = soma(elegiveis.map(saldoSemFonte));
  falta.cobertura = cobertura(elegiveis.map(saldoSemFonte)); falta.detalhe.coberturas = { valor: falta.cobertura };
  falta.valorPrincipal = saldo; falta.unidade = 'reais'; falta.secundario = `${falta.detalhe.itens.length} projetos com saldo identificado`; falta.detalhe.resumo.valor = saldo;
  const comSaldo = projetos.filter(p => semFonte.has(p.id));
  falta.detalhe.quebras = { porOrgao: agrupar(comSaldo, p => p.orgao ?? 'Sem órgão', saldoSemFonte), porRegiao: agrupar(comSaldo, p => p.regiao ?? 'Sem região', saldoSemFonte), porMacroetapa: agrupar(comSaldo, p => nomeMacroetapa(p.macroetapa), saldoSemFonte) };
  falta.detalhe.itens = falta.detalhe.itens.map(i => ({ ...i, valor: saldoSemFonte(projetos.find(p => p.id === i.id)!), programas: [] })).sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity) || comparar(a.nome, b.nome));

  const municipal = (id: IdCartao, titulo: string, valorPrincipal: number | null, resumo: Detalhe['resumo'], itens: ItemDetalhe[], fonte: string, situacao: Situacao = 'neutro') => {
    const c: Cartao = { id, titulo, valorPrincipal, unidade: 'qtd', secundario: '', situacao, abrangencia: 'municipio', fonte, detalhe: { resumo, quebras: vazias(), itens } }; cartoes.push(c); return c;
  };
  const convenios = e.acompanhamento?.convenios; const ativos = convenios?.filter(c => /^Em execu/i.test(c.situacao ?? ''));
  const bruto = e.acompanhamento?.resumo; const r = resumoCaptacaoDaColeta(bruto ?? {});
  // Não propagar os zeros de fallback do painel legado para campos ausentes.
  const numero = (k: string, v: number): number | null => typeof bruto?.[k] === 'number' && Number.isFinite(bruto[k]) ? v : null;
  const resumo = { pactuado: numero('valor_repasse_pactuado_em_execucao', r.pactuado), liberado: numero('valor_desembolsado_em_execucao', r.liberado), saldoALiberar: numero('saldo_a_liberar_em_execucao', r.saldoALiberar) };
  const convenioItem = (c: ConvenioEntrada): ItemDetalhe => ({ id: String(c.nr_convenio), nome: c.objeto ?? `Convênio ${c.nr_convenio}`, linha1: c.orgao_superior ?? 'Sem órgão concedente', linha2: paraIso(c.vigencia_fim) ?? 'Sem vigência cadastrada', valor: c.valor_repasse ?? null, situacao: 'neutro', prazo: paraIso(c.vigencia_fim), link: `/plataforma/captacao-acompanhamento/?q=${encodeURIComponent(String(c.nr_convenio))}` });
  const conv = municipal('convenios', 'Convênios em execução', numero('em_execucao', r.emExecucao), resumo, (ativos ?? []).map(convenioItem).sort(porPrazo), fontes[2].nome);
  conv.secundario = dinheiro(resumo.pactuado); conv.detalhe.quebras.porOrgao = agrupar(ativos ?? [], c => c.orgao_superior ?? 'Sem órgão concedente', c => c.valor_repasse ?? null);
  const riscos = alertasConvenios(convenios ?? [], hoje);
  const emRisco = ativos?.filter(c => riscos.some(a => a.convenio === String(c.nr_convenio)) || (() => { const fim = paraIso(c.vigencia_fim); return fim !== null && diasEntre(hoje, fim) >= 0 && diasEntre(hoje, fim) <= 180; })());
  const valorRisco = (c: ConvenioEntrada) => c.valor_repasse == null || c.valor_desembolsado == null ? null : Math.max(0, c.valor_repasse - c.valor_desembolsado);
  const risco = municipal('convenios_risco', 'Convênios em risco', emRisco?.length ?? null, { qtd: emRisco?.length ?? null, valor: emRisco ? soma(emRisco.map(valorRisco)) : null }, (emRisco ?? []).map(c => {
    const l = riscos.filter(a => a.convenio === String(c.nr_convenio));
    return { ...convenioItem(c), valor: valorRisco(c), linha2: `${l.map(a => a.titulo).join('; ') || 'Vigência em até 180 dias'}; ${paraIso(c.vigencia_fim) ?? 'sem prazo'}`, situacao: (l.some(a => a.gravidade === 'vermelho') ? 'critico' : 'atencao') as Situacao };
  }).sort(porPrazo), fontes[2].nome, emRisco?.length ? 'atencao' : 'neutro');
  risco.cobertura = cobertura((emRisco ?? []).map(valorRisco)); risco.detalhe.coberturas = { valor: risco.cobertura };
  risco.secundario = dinheiro(risco.detalhe.resumo.valor) + textoCobertura(risco.cobertura, 'convênios'); if (risco.detalhe.itens.some(i => i.situacao === 'critico')) risco.situacao = 'critico';
  risco.detalhe.quebras.porOrgao = agrupar(emRisco ?? [], c => c.orgao_superior ?? 'Sem órgão concedente', valorRisco);
  const cauc = e.cauc; const pendencias = cauc?.itens_com_pendencia;
  const estado = pendencias?.length ? 'com pendência' : cauc?.situacao_geral === 'regular' && pendencias?.length === 0 ? 'regular' : 'sem dado';
  const consulta = paraIso(typeof cauc?.proveniencia?.data_referencia === 'string' ? cauc.proveniencia.data_referencia : null) ?? paraIso(cauc?.proveniencia?.data_coleta);
  const caucCartao = municipal('cauc', 'Regularidade CAUC', estado === 'sem dado' ? null : pendencias!.length, { pendencias: estado === 'sem dado' ? null : pendencias!.length, itens: cauc?.itens?.length ?? null }, (pendencias ?? []).map(id => {
    const p = cauc?.itens?.find(p => p.item === id);
    return { id, nome: p?.descricao ?? id, linha1: 'Pendência CAUC', linha2: consulta ?? 'Sem data de consulta', valor: null, situacao: 'critico', prazo: paraIso(p?.validade), link: '/plataforma/captacao/' };
  }), fontes[3].nome, estado === 'regular' ? 'ok' : estado === 'com pendência' ? 'critico' : 'neutro');
  caucCartao.secundario = `${estado}; consulta: ${consulta ?? 'sem dado'}`;
  const oportunidades = e.programasAbertos?.programas?.flatMap(p => {
    const prazo = paraIso(p.prazos?.proposta_ate ?? p.prazos?.emendas_ate ?? p.prazos?.beneficiario_especifico_ate);
    return prazo && diasEntre(hoje, prazo) >= 0 && diasEntre(hoje, prazo) <= 30 ? [{ id: p.codigo, nome: p.nome, linha1: p.orgao_superior ?? 'Sem órgão concedente', linha2: prazo, prazo, valor: null, situacao: 'atencao' as const, link: `/plataforma/captacao-oportunidades/?q=${encodeURIComponent(p.codigo)}` }] : [];
  }).sort(porPrazo);
  const op = municipal('oportunidades', 'Oportunidades em 30 dias', oportunidades?.length ?? null, { qtd: oportunidades?.length ?? null, orgaos: oportunidades ? new Set(oportunidades.map(p => p.linha1).filter(n => n !== 'Sem órgão concedente')).size : null }, oportunidades ?? [], fontes[4].nome, oportunidades?.length ? 'atencao' : 'neutro');
  op.secundario = 'Programas elegíveis ao município'; op.detalhe.quebras.porOrgao = agrupar(oportunidades ?? [], p => p.linha1, () => null);
  return { atualizadoEm: hoje, fontes, cartoes,
    funil: MACROETAPAS.map(m => { const l = projetos.filter(p => p.macroetapa === m.codigo); return { codigo: m.codigo, nome: m.nome, qtd: l.length, valor: soma(l.map(valorProjeto)), cobertura: cobertura(l.map(valorProjeto)) }; }),
    parado: painel.parado, regioes: agrupar(projetos, p => p.regiao ?? 'Sem região', valorProjeto),
    decisoes: painel.atencao.vermelhos.top.map(p => ({ ...p, motivo: p.motivo.replace(/\s+/g, ' ') })),
  };
}
