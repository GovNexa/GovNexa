// Regras puras da integração com o PNCP (E14a). Usadas no servidor e no navegador: nada aqui toca a rede nem o banco.
// Nada que vem da pessoa ou do PNCP vira endereço de busca: o sistema monta as URLs só a partir de CNPJ, ano e sequencial validados.
import { dataBr } from '../datas.ts';
import { texto } from '../carteira/cadastro.ts';

export const HOST_PNCP = 'https://pncp.gov.br';
export const BASE_CONSULTA = HOST_PNCP + '/api/consulta/v1';
export const BASE_PNCP = HOST_PNCP + '/api/pncp/v1';
export const TEMPO_CHAMADA_MS = 10_000;
export const TEMPO_PEDIDO_MS = 25_000;
export const TEMPO_LOTE_MS = 50_000;
export const MAX_BYTES_COMPRA = 262_144;
export const MAX_BYTES_ITENS = 1_048_576;
export const MAX_BYTES_RESULTADOS = 524_288;
export const TAMANHO_PAGINA_ITENS = 50;
export const MAX_ITENS = 200;
export const MAX_RESULTADOS_ITEM = 50;
export const MAX_CHAMADAS_PEDIDO = 60;
export const MAX_VINCULOS_LOTE = 5;
export const TRAVA_OK_MS = 600_000;
export const TRAVA_ERRO_MS = 60_000;
export const COLETAS_POR_HORA_PREFEITURA = 120;
export const PEDIDOS_POR_MINUTO_PESSOA = 10;
export const PEDIDOS_POR_MINUTO_PREFEITURA = 60;
export const PAUSA_PNCP_MS = 60_000;
export const MAX_ORGAOS = 50;
export const LIMITE_CORPO_PNCP = 4096;
export const ID_ORGAO = /^O-[A-Za-z0-9_-]{1,40}$/;
export const ID_VINCULO = /^V-[A-Za-z0-9_-]{1,40}$/;

export type ClasseObra = 'sim' | 'provavel' | 'nao_identificado';
export const ROTULO_OBRA: Record<ClasseObra, string> = {
  sim: 'Obra ou serviço de engenharia',
  provavel: 'Provável obra ou serviço de engenharia (pelo texto do objeto)',
  nao_identificado: 'Não identificada como obra ou serviço de engenharia',
};
export const ROTULO_STATUS: Record<string, string> = {
  ok: 'Atualizado',
  erro: 'O PNCP não respondeu',
  nao_encontrado: 'Compra não encontrada no PNCP',
  formato: 'O PNCP respondeu em formato inesperado',
};

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CNPJ numérico ou alfanumérico (2026): 12 posições de [0-9A-Z] + 2 dígitos verificadores. Sem pontuação, em maiúsculas. */
export function cnpjValido(s: string): boolean {
  if (typeof s !== 'string' || !/^[0-9A-Z]{12}\d{2}$/.test(s)) return false;
  if (/^(.)\1{13}$/.test(s)) return false;
  const v = Array.from(s, (ch) => ch.charCodeAt(0) - 48);
  const dv = (pesos: number[]): number => {
    const soma = pesos.reduce((a, p, i) => a + p * v[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(PESOS_DV1) === v[12] && dv(PESOS_DV2) === v[13];
}

/** Tira pontuação e espaços, põe em maiúsculas e devolve só se for um CNPJ válido. */
export function normalizarCnpj(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 30) return null;
  const c = v.replace(/[.\/\-\s]/g, '').toUpperCase();
  return cnpjValido(c) ? c : null;
}

export function formatarCnpj(c: string): string {
  return /^[0-9A-Z]{12}\d{2}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
}

export function numeroControle(cnpj: string, ano: number, seq: number): string {
  return `${cnpj}-1-${String(seq).padStart(6, '0')}/${ano}`;
}
export function linkPublico(cnpj: string, ano: number, seq: number): string {
  return `${HOST_PNCP}/app/editais/${cnpj}/${ano}/${seq}`;
}

const ERRO_FORMATO = 'Cole o número de controle do PNCP (ex.: 90000001000129-1-000001/2026) ou o link da página da compra no PNCP.';
const ERRO_CNPJ = 'CNPJ do número de controle inválido.';
const ERRO_ANO = 'Ano da compra inválido.';
const ERRO_SEQ = 'Número sequencial da compra inválido.';
/** Conferência única de CNPJ, ano e sequencial (número de controle, link e pedido de ligar). Texto NÃO vira número: só number inteiro seguro. */
export function validarTrio(cnpj: unknown, ano: unknown, sequencial: unknown, anoAtual: number): { ok: true; cnpj: string; ano: number; sequencial: number } | { ok: false; erro: string } {
  const c = normalizarCnpj(cnpj);
  if (!c) return { ok: false, erro: ERRO_CNPJ };
  if (typeof ano !== 'number' || !Number.isSafeInteger(ano) || ano < 2021 || ano > anoAtual + 1) return { ok: false, erro: ERRO_ANO };
  if (typeof sequencial !== 'number' || !Number.isSafeInteger(sequencial) || sequencial < 1 || sequencial > 999_999) return { ok: false, erro: ERRO_SEQ };
  return { ok: true, cnpj: c, ano, sequencial };
}
export type EntradaPncp = { ok: true; cnpj: string; ano: number; sequencial: number } | { ok: false; erro: string };

const NUMERO_CONTROLE = /^([0-9A-Za-z.\/\-]{14,18})-1-(\d{6})\/(\d{4})$/;
const CAMINHO_LINK = /^\/app\/editais\/([0-9A-Za-z.\/-]{14,18}?)\/(\d{4})\/(\d{1,6})\/?$/;
const HOSTS_PNCP = ['pncp.gov.br', 'www.pncp.gov.br'];

/** Aceita SÓ o número de controle ou o link público da compra no PNCP. Nunca devolve URL para buscar. */
export function lerEntradaPncp(v: unknown, anoAtual: number): EntradaPncp {
  if (typeof v !== 'string') return { ok: false, erro: ERRO_FORMATO };
  const s = v.trim();
  if (!s || Array.from(s).length > 300 || /[\u0000-\u001f\u007f-\u009f]/.test(s)) return { ok: false, erro: ERRO_FORMATO };
  let cnpjBruto: string;
  let anoTxt: string;
  let seqTxt: string;
  const n = NUMERO_CONTROLE.exec(s);
  if (n) {
    [, cnpjBruto, seqTxt, anoTxt] = n;
  } else {
    let url: URL;
    try { url = new URL(s); } catch { return { ok: false, erro: ERRO_FORMATO }; }
    if (url.protocol !== 'https:' || !HOSTS_PNCP.includes(url.hostname) || url.username || url.password || url.port) return { ok: false, erro: ERRO_FORMATO };
    const m = CAMINHO_LINK.exec(url.pathname);
    if (!m) return { ok: false, erro: ERRO_FORMATO };
    [, cnpjBruto, anoTxt, seqTxt] = m;
  }
  return validarTrio(cnpjBruto, Number(anoTxt), Number(seqTxt), anoAtual);
}

const semAcento = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const PALAVRAS_OBRA = /\b(?:obra|obras|engenharia|construcao|reforma|ampliacao|pavimentacao|recapeamento|asfalt\w*|drenagem|terraplenagem|edificacao|urbanizacao|saneamento|ponte|viaduto|calcada\w*|meio-fio|galeria|recuperacao estrutural|manutencao predial)\b/;
const AMPARO_OBRA = [18, 84];
const MODALIDADE_CONCORRENCIA = [4, 5, 16, 17];
const AMPARO_CONCORRENCIA = [2, 172, 173];

/** O PNCP não tem campo confiável para obra: usa amparo legal, modalidade e as palavras do objeto (decisão P1, 23/11/2026). */
export function classificarObra(c: { modalidadeId: number | null; amparoCodigo: number | null; objeto: string | null }): ClasseObra {
  if (c.amparoCodigo !== null && AMPARO_OBRA.includes(c.amparoCodigo)) return 'sim';
  const palavra = c.objeto !== null && PALAVRAS_OBRA.test(semAcento(c.objeto));
  const concorrencia = (c.modalidadeId !== null && MODALIDADE_CONCORRENCIA.includes(c.modalidadeId))
    || (c.amparoCodigo !== null && AMPARO_CONCORRENCIA.includes(c.amparoCodigo));
  if (concorrencia && palavra) return 'sim';
  return palavra ? 'provavel' : 'nao_identificado';
}

/** Texto do PNCP: tira controles e corta no máximo. Nunca interpreta HTML (a tela só usa interpolação ou textContent). */
export function textoPncp(v: unknown, max: number): string | null {
  return texto(v, max);
}

/** Valor em reais (número) → centavos inteiros; fora de 0 a 10 bilhões vira null. */
export function centavosPncp(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000_000) return null;
  return Math.round(v * 100);
}

const DATA_PNCP = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DATA_PNCP_EXATA = new RegExp(DATA_PNCP.source + '$');
function diaExiste(a: number, m: number, d: number): boolean {
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}
/** 'AAAA-MM-DD' (10 caracteres) ou 'AAAA-MM-DDTHH:MM:SS' (19; 'HH:MM' vira ':00'), horário de Brasília como vem do PNCP.
 * Qualquer outra forma (milissegundos, fuso, DD/MM/AAAA) ou data que não existe = null. `soDia` guarda só o dia (resultado: de 2000 a 2100). */
export function dataPncp(v: unknown, soDia = false): string | null {
  if (typeof v !== 'string') return null;
  const m = DATA_PNCP_EXATA.exec(v);
  if (!m || !diaExiste(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  if (soDia) return Number(m[1]) >= 2000 && Number(m[1]) <= 2100 ? dia : null;
  if (m[4] === undefined) return dia;
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59)) return null;
  return `${dia}T${m[4]}:${m[5]}:${m[6] ?? '00'}`;
}

/** LGPD: troca por *** toda sequência de 11 dígitos (CPF, com ou sem pontuação) que não faça parte de um CNPJ. */
export function mascararCpf(t: string | null): string | null {
  return t === null ? null : t.replace(/(?<![0-9A-Za-z.\/-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![0-9]|[.\/-][0-9])/g, '***');
}

export const ROTULO_EVENTO_ORGAO: Record<string, string> = {
  orgao_cadastrado: 'Secretaria cadastrada',
  orgao_editado: 'Secretaria editada',
  orgao_desativado: 'Secretaria desativada',
  orgao_reativado: 'Secretaria reativada',
};

/** Exibição de data do PNCP: só o dia → DD/MM/AAAA; com hora → DD/MM/AAAA HH:MM direto do texto (já é Brasília: sem converter fuso). */
export function dataHoraPncp(v: string | null): string {
  if (!v) return '—';
  const m = DATA_PNCP.exec(v);
  if (!m) return '—';
  const dia = dataBr(`${m[1]}-${m[2]}-${m[3]}`);
  return m[4] === undefined ? dia : `${dia} ${m[4]}:${m[5]}`;
}
