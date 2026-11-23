// Regras puras da gestão das contratações (E12). Roda no servidor e no navegador: só importa datas e a ficha.
import { dataBr, FUSO_BRASILIA } from '../datas.ts';
import { ID_FICHA } from '../carteira/ficha.ts';

export const ETAPAS = ['finalizacao', 'preparacao', 'ajustes', 'publicada', 'julgamento', 'concluida'] as const;
export type Etapa = (typeof ETAPAS)[number];
/** Ordem do relatório (da mais adiantada para a menos). */
export const ORDEM_TELA: readonly Etapa[] = ['concluida', 'julgamento', 'publicada', 'ajustes', 'preparacao', 'finalizacao'];
export const ROTULO_ETAPA: Record<Etapa, string> = {
  concluida: 'Concluídas',
  julgamento: 'Em julgamento',
  publicada: 'Publicadas (aviso na praça)',
  ajustes: 'Editais em ajustes finais',
  preparacao: 'Em preparação (peças técnicas)',
  finalizacao: 'Projetos e orçamentos em finalização',
};
export const ROTULO_ETAPA_CURTO: Record<Etapa, string> = {
  concluida: 'Concluída',
  julgamento: 'Em julgamento',
  publicada: 'Publicada',
  ajustes: 'Edital em ajustes',
  preparacao: 'Em preparação',
  finalizacao: 'Projeto em finalização',
};

export const MODALIDADES = ['licitacao', 'adesao_ata', 'dispensa', 'inexigibilidade', 'credenciamento'] as const;
export const ROTULO_MODALIDADE: Record<(typeof MODALIDADES)[number], string> = {
  licitacao: 'Licitação', adesao_ata: 'Adesão a ata', dispensa: 'Dispensa', inexigibilidade: 'Inexigibilidade', credenciamento: 'Credenciamento',
};
export const MARCOS = ['homologada', 'contrato_assinado', 'os_emitida', 'em_execucao'] as const;
export const ROTULO_MARCO: Record<(typeof MARCOS)[number], string> = {
  homologada: 'Homologada', contrato_assinado: 'Contrato assinado', os_emitida: 'Ordem de serviço emitida', em_execucao: 'Em execução',
};
export const AGUARDANDO = ['nao', 'pgm', 'outras_areas'] as const;
export const ROTULO_AGUARDANDO: Record<(typeof AGUARDANDO)[number], string> = {
  nao: 'Não', pgm: 'Aguardando PGM', outras_areas: 'Aguardando outras áreas ou empresas',
};

export const ID_CONTRATACAO = /^C-[A-Za-z0-9_-]{1,40}$/;
export const ID_MARCO = /^M-[A-Za-z0-9_-]{1,40}$/;
export const ID_PROJETO_LIGADO = ID_FICHA;
/** Mesmo formato de `SEI` em src/lib/carteira/cadastro.ts (um teste confere). */
export const SEI_CONTRATACAO = /^\d{2}\.\d{1,2}\.\d{9}-\d$/;

export const MAX_VALOR_CENTAVOS = 1_000_000_000_000;
export const MAX_CONTRATACOES = 5000;
export const MAX_MARCOS = 50;
/** Teto TOTAL (ativas e removidas) por prefeitura: 4 vezes o das ativas. */
export const LIMITE_TOTAL_CONTRATACOES = 4 * MAX_CONTRATACOES;
export const MAX_MOTIVO = 500;
export const LIMITE_CORPO_CONTRATACAO = 16_384;

export const COLUNAS_EDITAVEIS = [
  'nome', 'objeto', 'orgao', 'projeto_id', 'modalidade', 'processo_sei', 'grupo', 'valor_estimado', 'valor_proposta',
  'valor_contratado', 'valor_pago', 'empresa', 'colocacao', 'marco', 'data_marco', 'data_abertura', 'data_publicacao_prevista',
  'publicacao_prevista_texto', 'onde_esta', 'situacao', 'aguardando', 'aguardando_quem', 'observacao',
] as const;
export type CampoEditavel = (typeof COLUNAS_EDITAVEIS)[number];

export interface DefCampo {
  campo: CampoEditavel;
  rotulo: string;
  tipo: 'texto' | 'longo' | 'moeda' | 'inteiro' | 'data' | 'opcao';
  max?: number;
  opcoes?: readonly string[];
}
export const CAMPOS: readonly DefCampo[] = [
  { campo: 'nome', rotulo: 'Contratação', tipo: 'texto', max: 200 },
  { campo: 'objeto', rotulo: 'Objeto', tipo: 'longo', max: 2000 },
  { campo: 'orgao', rotulo: 'Órgão', tipo: 'texto', max: 120 },
  { campo: 'projeto_id', rotulo: 'Projeto da carteira', tipo: 'texto', max: 42 },
  { campo: 'modalidade', rotulo: 'Modalidade', tipo: 'opcao', opcoes: MODALIDADES },
  { campo: 'processo_sei', rotulo: 'Processo SEI', tipo: 'texto', max: 40 },
  { campo: 'grupo', rotulo: 'Processo ou lote', tipo: 'texto', max: 120 },
  { campo: 'valor_estimado', rotulo: 'Valor estimado', tipo: 'moeda' },
  { campo: 'valor_proposta', rotulo: 'Valor da proposta', tipo: 'moeda' },
  { campo: 'valor_contratado', rotulo: 'Valor contratado', tipo: 'moeda' },
  { campo: 'valor_pago', rotulo: 'Valor pago', tipo: 'moeda' },
  { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto', max: 200 },
  { campo: 'colocacao', rotulo: 'Colocação', tipo: 'inteiro' },
  { campo: 'marco', rotulo: 'Marco', tipo: 'opcao', opcoes: MARCOS },
  { campo: 'data_marco', rotulo: 'Data do marco', tipo: 'data' },
  { campo: 'data_abertura', rotulo: 'Abertura', tipo: 'data' },
  { campo: 'data_publicacao_prevista', rotulo: 'Publicação prevista', tipo: 'data' },
  { campo: 'publicacao_prevista_texto', rotulo: 'Previsão (texto)', tipo: 'texto', max: 200 },
  { campo: 'onde_esta', rotulo: 'Onde está', tipo: 'texto', max: 120 },
  { campo: 'situacao', rotulo: 'Situação', tipo: 'longo', max: 500 },
  { campo: 'aguardando', rotulo: 'Aguardando', tipo: 'opcao', opcoes: AGUARDANDO },
  { campo: 'aguardando_quem', rotulo: 'Aguardando quem', tipo: 'texto', max: 120 },
  { campo: 'observacao', rotulo: 'Observação', tipo: 'longo', max: 2000 },
];
const DEF_POR_CAMPO = new Map<string, DefCampo>(CAMPOS.map((d) => [d.campo, d]));

export interface ValoresContratacao {
  etapa: Etapa;
  valor_estimado: number | null;
  valor_proposta: number | null;
  valor_contratado: number | null;
  valor_pago: number | null;
}

export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_BRASILIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function dataIsoValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const a = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (a < 2000 || a > 2100) return false;
  const t = new Date(Date.UTC(a, mes - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === mes - 1 && t.getUTCDate() === d;
}

/** Texto em reais ("1.234,5", "R$ 10") → centavos. Vazio → null. */
export function centavosDeTexto(s: string): number | null | 'invalido' {
  const limpo = String(s).replace(/R\$/gi, '').replace(/\s/g, '');
  if (limpo === '') return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(limpo) && !/^\d+(,\d{1,2})?$/.test(limpo)) return 'invalido';
  const [inteira, frac = ''] = limpo.replaceAll('.', '').split(',');
  const total = Number(inteira) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(total) && total <= MAX_VALOR_CENTAVOS ? total : 'invalido';
}

export function reaisCompleto(c: number | null): string {
  if (c === null || c === undefined) return '—';
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Mesma regra de `reaisAbreviado` (src/lib/gestao/painel.ts), aplicada a centavos. */
export function reaisResumido(c: number | null): string {
  if (c === null || c === undefined) return '—';
  const n = c / 100;
  const f = (v: number, sufixo: string): string => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 1 })} ${sufixo}`;
  const a = Math.abs(n);
  if (a >= 1e9) return f(n / 1e9, 'bi');
  if (a >= 1e6) return f(n / 1e6, 'mi');
  if (a >= 1e3) return f(n / 1e3, 'mil');
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export function percentualPago(c: { valor_pago: number | null; valor_contratado: number | null }): number | null {
  if (c.valor_pago === null || c.valor_contratado === null || c.valor_contratado === 0) return null;
  return Math.round((c.valor_pago * 1000) / c.valor_contratado) / 10;
}

export function valorReferencia(c: ValoresContratacao): number {
  if (c.etapa === 'concluida') return c.valor_contratado ?? c.valor_estimado ?? 0;
  if (c.etapa === 'julgamento') return c.valor_proposta ?? c.valor_estimado ?? 0;
  return c.valor_estimado ?? 0;
}

export function economia(c: ValoresContratacao): number | null {
  if (c.etapa === 'concluida' && c.valor_estimado !== null && c.valor_contratado !== null) return c.valor_estimado - c.valor_contratado;
  if (c.etapa === 'julgamento' && c.valor_estimado !== null && c.valor_proposta !== null) return c.valor_estimado - c.valor_proposta;
  return null;
}

const ROTULOS_OPCAO: Record<string, Record<string, string>> = {
  modalidade: ROTULO_MODALIDADE, marco: ROTULO_MARCO, aguardando: ROTULO_AGUARDANDO,
};
export function formatarCampo(campo: CampoEditavel, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const def = DEF_POR_CAMPO.get(campo);
  if (def?.tipo === 'moeda') return typeof valor === 'number' ? reaisCompleto(valor) : '—';
  if (def?.tipo === 'data') return dataBr(String(valor));
  if (def?.tipo === 'opcao') return ROTULOS_OPCAO[campo]?.[String(valor)] ?? String(valor);
  if (campo === 'colocacao') return `${String(valor)}º colocado`;
  return String(valor);
}

export type CamposNormalizados = Partial<Record<CampoEditavel, string | number | null>> & { etapa?: Etapa; etapa_desde?: string | null };
export type ResultadoNormalizar = { ok: true; campos: CamposNormalizados; avisos: string[] } | { ok: false; erros: string[] };

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex
const CONTROLE_COM_QUEBRA = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export function normalizarCampos(bruto: unknown, modo: 'criar' | 'editar'): ResultadoNormalizar {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { ok: false, erros: ['Dados inválidos.'] };
  const entrada = bruto as Record<string, unknown>;
  const erros: string[] = [];
  const avisos: string[] = [];
  const campos: CamposNormalizados = {};
  for (const chave of Object.keys(entrada)) {
    const valor = entrada[chave];
    if (chave === 'etapa') {
      if (modo === 'editar') { erros.push('A etapa muda pelo botão Mudar etapa.'); continue; }
      if (typeof valor === 'string' && (ETAPAS as readonly string[]).includes(valor)) campos.etapa = valor as Etapa;
      else erros.push('Etapa: valor não permitido.');
      continue;
    }
    if (chave === 'etapa_desde' && modo === 'criar') {
      if (valor === null || valor === undefined || valor === '') continue;
      if (dataIsoValida(valor)) campos.etapa_desde = valor;
      else erros.push('Data da etapa: data inválida.');
      continue;
    }
    const def = DEF_POR_CAMPO.get(chave);
    if (!def || !Object.hasOwn(entrada, chave)) { erros.push(`Campo desconhecido: ${chave}.`); continue; }
    const { campo, rotulo } = def;
    if (def.tipo === 'texto' || def.tipo === 'longo') {
      if (valor !== null && typeof valor !== 'string') { erros.push(`${rotulo}: valor inválido.`); continue; }
      const limpo = valor === null ? '' : valor.replace(def.tipo === 'longo' ? CONTROLE_COM_QUEBRA : CONTROLE, ' ').trim();
      const final = limpo === '' ? null : limpo;
      if (final !== null && Array.from(final).length > (def.max ?? 0)) { erros.push(`${rotulo}: até ${def.max} caracteres.`); continue; }
      if (campo === 'nome' && final === null) { erros.push('Contratação: informe o nome.'); continue; }
      if (campo === 'processo_sei' && final !== null && !SEI_CONTRATACAO.test(final)) { erros.push('Processo SEI: use o formato 00.0.000000000-0.'); continue; }
      if (campo === 'projeto_id' && final !== null && !ID_PROJETO_LIGADO.test(final)) { erros.push('Projeto da carteira: código inválido.'); continue; }
      campos[campo] = final;
    } else if (def.tipo === 'moeda') {
      if (valor === null) campos[campo] = null;
      else if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 && valor <= MAX_VALOR_CENTAVOS) campos[campo] = valor;
      else erros.push(`${rotulo}: valor inválido.`);
    } else if (def.tipo === 'inteiro') {
      if (valor === null) campos[campo] = null;
      else if (typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 99) campos[campo] = valor;
      else erros.push(`${rotulo}: valor inválido.`);
    } else if (def.tipo === 'opcao') {
      if (valor === null && campo !== 'aguardando') campos[campo] = null;
      else if (typeof valor === 'string' && (def.opcoes ?? []).includes(valor)) campos[campo] = valor;
      else erros.push(`${rotulo}: valor não permitido.`);
    } else if (def.tipo === 'data') {
      if (valor === null) campos[campo] = null;
      else if (dataIsoValida(valor)) campos[campo] = valor;
      else erros.push(`${rotulo}: data inválida.`);
    }
  }
  if (modo === 'criar') {
    if (!Object.hasOwn(campos, 'nome') && !erros.includes('Contratação: informe o nome.')) erros.push('Contratação: informe o nome.');
    if (campos.etapa === undefined && !erros.includes('Etapa: valor não permitido.')) erros.push('Etapa: valor não permitido.');
  }
  if (erros.length) return { ok: false, erros };
  if (campos.aguardando === 'nao') campos.aguardando_quem = null;
  const pago = campos.valor_pago;
  const contratado = campos.valor_contratado;
  if (typeof pago === 'number' && typeof contratado === 'number' && pago > contratado) avisos.push('Valor pago maior que o contratado: confira.');
  return { ok: true, campos, avisos };
}

/** Avisos sobre os valores FINAIS da contratação (não bloqueiam). */
export function avisosFinais(v: { valor_pago: number | null; valor_contratado: number | null; colocacao: number | null; empresa: string | null }): string[] {
  const a: string[] = [];
  if (v.valor_pago !== null && v.valor_contratado !== null && v.valor_pago > v.valor_contratado) a.push('Valor pago maior que o contratado: confira.');
  if (v.colocacao !== null && v.empresa === null) a.push('Colocação sem empresa: confira.');
  return a;
}

export function camposEsperados(etapa: Etapa): CampoEditavel[] {
  switch (etapa) {
    case 'concluida': return ['valor_contratado', 'empresa', 'marco', 'data_marco'];
    case 'julgamento': return ['data_abertura', 'valor_proposta'];
    case 'publicada': return ['data_abertura', 'valor_estimado'];
    case 'ajustes': return ['valor_estimado', 'onde_esta'];
    case 'preparacao': return ['valor_estimado', 'onde_esta'];
    case 'finalizacao': return ['valor_estimado'];
  }
}

export function proximaEtapa(e: Etapa): Etapa | null {
  return ETAPAS[ETAPAS.indexOf(e) + 1] ?? null;
}

export function regraMudanca(de: Etapa, para: Etapa, motivo: string | null): { ok: true } | { ok: false; erro: string } {
  if (de === para) return { ok: false, erro: 'A contratação já está nessa etapa.' };
  if (ETAPAS.indexOf(para) === ETAPAS.indexOf(de) + 1) return { ok: true };
  if (!motivo) return { ok: false, erro: 'Para pular ou voltar etapa, informe o motivo.' };
  return { ok: true };
}
