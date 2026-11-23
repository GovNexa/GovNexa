// Regras puras das fotos da obra (E9): tipos, tamanho, legenda, data, chave no R2 e cabeçalho de exibição.
// Reaproveita dos documentos a conferência do conteúdo pela assinatura, o nome seguro e o formato do id.
import { ID_DOCUMENTO, TIPOS, extensaoDe, nomeSeguro } from '../documentos/regras.ts';
import { FUSO_BRASILIA, dataBr } from '../datas.ts';

/** Igual à trava da tabela projeto_foto (migração 0001): até 10 MB. */
export const LIMITE_FOTO_BYTES = 10 * 1024 * 1024;
/** Igual à trava da tabela projeto_foto: legenda até 200 caracteres. */
export const LIMITE_LEGENDA = 200;
/** Fotos não aceitam SVG, GIF, HEIC nem PDF: só imagem de pixels que o navegador mostra sem executar nada. */
export const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const TIPOS_FOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ID_FOTO = ID_DOCUMENTO;
export const DATA_MINIMA = '2000-01-01';

export type CodigoArquivo = 'vazio' | 'tamanho' | 'tipo' | 'conteudo';
export type ResultadoFotoArquivo = { ok: true; mime: (typeof TIPOS_FOTO_MIME)[number]; extensao: 'jpg' | 'png' | 'webp' } | { ok: false; codigo: CodigoArquivo };

/** `bytes` basta ser o começo do arquivo (a assinatura); `tamanho` é o tamanho total. A extensão e o conteúdo precisam concordar. */
export function validarFoto(nomeBruto: string, bytes: Uint8Array, tamanho: number = bytes.byteLength): ResultadoFotoArquivo {
  if (tamanho === 0) return { ok: false, codigo: 'vazio' };
  if (tamanho > LIMITE_FOTO_BYTES) return { ok: false, codigo: 'tamanho' };
  const ext = extensaoDe(nomeSeguro(nomeBruto));
  if (!(EXTENSOES_FOTO as readonly string[]).includes(ext)) return { ok: false, codigo: 'tipo' };
  const tipo = TIPOS[ext];
  if (!tipo.confere(bytes)) return { ok: false, codigo: 'conteudo' };
  return { ok: true, mime: tipo.mime as (typeof TIPOS_FOTO_MIME)[number], extensao: ext === 'jpeg' ? 'jpg' : (ext as 'jpg' | 'png' | 'webp') };
}

// Controle, marcas de direção do texto e caracteres invisíveis viram espaço (não escondem nem invertem o texto da legenda).
const INVISIVEIS = /[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;

/** Legenda opcional: texto limpo de até 200 caracteres; vazia vira null. Valor que não é texto (arquivo, lista) é recusado. */
export function legendaSegura(bruto: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  if (typeof bruto !== 'string') return { ok: false };
  const v = bruto.normalize('NFC').replace(INVISIVEIS, ' ').replace(/\s+/g, ' ').trim();
  if (v.length > LIMITE_LEGENDA) return { ok: false };
  return { ok: true, valor: v || null };
}

/** Dia de hoje (AAAA-MM-DD) no horário de Brasília. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_BRASILIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Data da foto: obrigatória, dia que existe, de 01/01/2000 até hoje (Brasília). */
export function validarDataFoto(bruto: unknown, hoje: string): { ok: true; valor: string } | { ok: false } {
  if (typeof bruto !== 'string') return { ok: false };
  const v = bruto.trim();
  const m = SO_DIA.exec(v);
  if (!m) return { ok: false };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== v) return { ok: false };
  if (v < DATA_MINIMA || v > hoje) return { ok: false };
  return { ok: true, valor: v };
}

/** Chave no R2, gerada pelo servidor: prefixo próprio das fotos, prefeitura da sessão, projeto conferido no banco e id aleatório. */
export function chaveFoto(prefeituraId: number, projetoId: string, id: string): string {
  return `fotos/${prefeituraId}/${projetoId}/${id}`;
}
/** A chave gravada só vale se for das fotos DESTA prefeitura (defesa extra além do filtro do banco). */
export function chaveDaPrefeitura(chave: string, prefeituraId: number): boolean {
  return chave.startsWith(`fotos/${prefeituraId}/`);
}

const EXTENSAO_DO_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Exibição no navegador (inline) com nome gerado pelo sistema: nunca o nome enviado pelo usuário. */
export function cabecalhoFoto(id: string, mime: string): string {
  return `inline; filename="foto-${id}.${EXTENSAO_DO_MIME[mime] ?? 'bin'}"`;
}

const textoFoto = (legenda: string | null, data: string | null) => `${legenda ?? 'sem legenda'}${data ? ` (foto de ${dataBr(data)})` : ''}`;
/** Frases do Histórico. */
export const descricaoEnvio = (legenda: string | null, data: string | null): string => `Foto enviada: ${textoFoto(legenda, data)}`;
export const descricaoRemocao = (legenda: string | null, data: string | null): string => `Foto removida: ${textoFoto(legenda, data)}`;
