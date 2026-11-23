// Visão Convênios (E11, áudios 01 e 31): convênios em execução, convênios em risco e regularidade no CAUC, a partir das
// coletas públicas que a Captação já usa (Transferegov e Tesouro Nacional). Nenhum dado novo. Funções puras: coleta e hoje injetados.
// "Em risco" segue a MESMA regra do cartão "Convênios em risco" do Painel da equipe (src/lib/gestao/dashboard.ts): alerta de
// convênio da central (sem desembolso há mais de 180 dias ou vigência em até 90 dias) ou vigência futura em até 180 dias.
import { alertasConvenios, paraIso, type ConvenioEntrada } from '../alertas/central.ts';
import { diasEntre } from '../cronograma/visoes.ts';

export const ROTA_CONVENIOS = '/plataforma/convenios/';
export const ROTA_ACOMPANHAMENTO = '/plataforma/captacao-acompanhamento/';
export const ROTA_ALERTAS_CAPTACAO = '/plataforma/captacao-alertas/';
export const ROTA_CAPTACAO = '/plataforma/captacao/';
/** Janela da vigência que já conta como risco (mesmo valor do cartão do Painel da equipe). */
export const DIAS_RISCO_VIGENCIA = 180;

export interface ConvenioColeta extends ConvenioEntrada { modalidade?: string | null; saldo_a_liberar?: number | null }
export interface ItemCaucColeta { item: string; descricao?: string | null; situacao?: string | null; validade?: string | null }
export interface EntradaVisaoConvenios {
  acompanhamento?: { proveniencia?: { data_coleta?: string | null }; convenios?: ConvenioColeta[] } | null;
  cauc?: { proveniencia?: { data_referencia?: unknown; data_coleta?: string | null }; situacao_geral?: string | null; itens?: ItemCaucColeta[]; itens_com_pendencia?: string[] } | null;
}

export interface ConvenioVisao {
  nr: string;
  objeto: string;
  concedente: string;
  modalidade: string | null;
  /** Fim da vigência em ISO (aaaa-mm-dd) ou null. */
  vigencia: string | null;
  /** Dias de hoje até o fim da vigência: negativo = já terminou. */
  dias: number | null;
  repasse: number | null;
  liberado: number | null;
  aLiberar: number | null;
  link: string;
}
export interface RiscoVisao extends ConvenioVisao { motivos: string[]; gravidade: 'vermelho' | 'amarelo' }
export interface ItemCaucVisao { item: string; descricao: string; situacao: string }
export type EstadoCauc = 'regular' | 'com_pendencia' | 'sem_dado';

export interface VisaoConvenios {
  hoje: string;
  /** Data e hora da coleta do Transferegov, como veio da coleta, ou null. */
  coletaConvenios: string | null;
  execucao: { disponivel: boolean; lista: ConvenioVisao[]; repasse: number | null; liberado: number | null; aLiberar: number | null };
  risco: { disponivel: boolean; lista: RiscoVisao[]; aLiberar: number | null; vermelhos: number };
  cauc: { disponivel: boolean; estado: EstadoCauc; referencia: string | null; coleta: string | null; total: number; regulares: number; pendencias: ItemCaucVisao[]; semInformacao: ItemCaucVisao[] };
}

const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
const texto = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Soma em centavos inteiros; null quando nenhum valor é conhecido. */
export function somaReais(valores: (number | null)[]): number | null {
  const conhecidos = valores.filter((v): v is number => v !== null);
  if (!conhecidos.length) return null;
  return conhecidos.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
}

/** Endereço do convênio no Acompanhamento (a busca da tabela acha pelo número). */
export const linkConvenio = (nr: string): string => `${ROTA_ACOMPANHAMENTO}?q=${encodeURIComponent(nr)}`;

const emExecucao = (c: ConvenioColeta): boolean => /^Em execu/i.test(c.situacao ?? '');

function paraVisao(c: ConvenioColeta, hoje: string): ConvenioVisao {
  const nr = String(c.nr_convenio ?? '');
  const vigencia = paraIso(c.vigencia_fim ?? null);
  const repasse = numero(c.valor_repasse);
  const liberado = numero(c.valor_desembolsado);
  const saldo = numero(c.saldo_a_liberar);
  return {
    nr,
    objeto: texto(c.objeto) || `Convênio ${nr}`,
    concedente: texto(c.orgao_superior) || 'Concedente não informado',
    modalidade: texto(c.modalidade) || null,
    vigencia,
    dias: vigencia ? diasEntre(hoje, vigencia) : null,
    repasse,
    liberado,
    // Mesmo cálculo do Painel da equipe (repasse − liberado); o saldo da coleta só entra quando falta um dos dois.
    aLiberar: repasse !== null && liberado !== null ? Math.max(0, repasse - liberado) : saldo,
    link: linkConvenio(nr),
  };
}

/** Da vigência mais próxima para a mais distante; sem data por último; empate pelo número. */
export function porVigencia(a: ConvenioVisao, b: ConvenioVisao): number {
  if (a.vigencia !== b.vigencia) {
    if (a.vigencia === null) return 1;
    if (b.vigencia === null) return -1;
    return comparar(a.vigencia, b.vigencia);
  }
  return comparar(a.nr, b.nr);
}

export function montarVisaoConvenios(e: EntradaVisaoConvenios, hoje: string): VisaoConvenios {
  const convenios = e.acompanhamento?.convenios;
  const ativos = (convenios ?? []).filter(emExecucao);
  const lista = ativos.map((c) => paraVisao(c, hoje)).sort(porVigencia);

  const alertas = alertasConvenios(convenios ?? [], hoje);
  const risco: RiscoVisao[] = [];
  for (const c of lista) {
    const meus = alertas.filter((a) => a.convenio === c.nr);
    const naJanela = c.dias !== null && c.dias >= 0 && c.dias <= DIAS_RISCO_VIGENCIA;
    if (!meus.length && !naJanela) continue;
    risco.push({
      ...c,
      motivos: meus.length ? meus.map((a) => a.titulo) : [`Vigência termina em até ${DIAS_RISCO_VIGENCIA} dias`],
      gravidade: meus.some((a) => a.gravidade === 'vermelho') ? 'vermelho' : 'amarelo',
    });
  }

  const cauc = e.cauc;
  const itens = cauc?.itens ?? [];
  const pendentes = cauc?.itens_com_pendencia;
  const estado: EstadoCauc = !cauc
    ? 'sem_dado'
    : pendentes?.length
      ? 'com_pendencia'
      : cauc.situacao_geral === 'regular' && Array.isArray(pendentes)
        ? 'regular'
        : 'sem_dado';
  const descricao = (id: string) => texto(itens.find((i) => i.item === id)?.descricao) || `Item ${id}`;
  const pendencias = (pendentes ?? []).map((id) => ({ item: texto(id), descricao: descricao(id), situacao: texto(itens.find((i) => i.item === id)?.situacao) || 'pendente' }));
  const semInformacao = itens
    .filter((i) => (i.situacao === 'indisponivel' || i.situacao === 'sem_informacao') && !(pendentes ?? []).includes(i.item))
    .map((i) => ({ item: texto(i.item), descricao: texto(i.descricao) || `Item ${i.item}`, situacao: i.situacao === 'indisponivel' ? 'indisponível' : 'sem informação' }));
  const referencia = paraIso(typeof cauc?.proveniencia?.data_referencia === 'string' ? cauc.proveniencia.data_referencia : null);

  return {
    hoje,
    coletaConvenios: texto(e.acompanhamento?.proveniencia?.data_coleta) || null,
    execucao: {
      disponivel: Array.isArray(convenios),
      lista,
      repasse: somaReais(lista.map((c) => c.repasse)),
      liberado: somaReais(lista.map((c) => c.liberado)),
      aLiberar: somaReais(lista.map((c) => c.aLiberar)),
    },
    risco: { disponivel: Array.isArray(convenios), lista: risco, aLiberar: somaReais(risco.map((c) => c.aLiberar)), vermelhos: risco.filter((c) => c.gravidade === 'vermelho').length },
    cauc: {
      disponivel: !!cauc,
      estado,
      referencia,
      coleta: texto(cauc?.proveniencia?.data_coleta) || null,
      total: itens.length,
      regulares: itens.filter((i) => i.situacao === 'regular').length,
      pendencias,
      semInformacao: semInformacao.sort((a, b) => comparar(a.item, b.item)),
    },
  };
}
