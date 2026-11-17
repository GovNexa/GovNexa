// Envio, download e remoção de documentos (etapa 3.4). Sem dependência do Astro: recebe o R2, o repositório e o usuário.
// Segurança: permissão por perfil, projeto da própria prefeitura, chave do R2 gerada aqui (nunca vinda do navegador),
// tipo conferido pelo conteúdo, download sempre como anexo e remoção só lógica.
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { LIMITE_BYTES, ID_DOCUMENTO, ID_PROJETO, cabecalhoDownload, sha256Hex, validarArquivo } from './regras.ts';

export interface BucketR2 {
  put(chave: string, valor: ArrayBuffer | Uint8Array | Blob, opcoes?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(chave: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(chave: string): Promise<void>;
}
export interface Contexto { usuario: Usuario; repositorio: RepositorioProjetos; bucket: BucketR2 | undefined; }
export type Resultado = { ok: true; id?: string; aviso?: string } | { ok: false; status: number; erro: string };

const falha = (status: number, erro: string): Resultado => ({ ok: false, status, erro });
const prontos = (c: Contexto) => !!c.bucket && !!c.repositorio.documentos && c.repositorio.prefeituraId !== undefined;

/** Limite de envios por pessoa por hora (protege o armazenamento e o custo). */
export const LIMITE_ENVIOS_POR_HORA = 30;

/** Confere só o perfil e o armazenamento, sem ler o corpo do pedido: as rotas chamam antes de abrir o formulário. */
export function podeEnviar(c: Contexto): Resultado {
  if (!usuarioPode(c.usuario, 'enviar_documento')) return falha(403, 'Seu perfil não permite enviar documentos.');
  if (!prontos(c)) return falha(503, 'Armazenamento de documentos indisponível.');
  return { ok: true };
}

export async function enviarDocumento(c: Contexto, projetoId: string, nome: string, arquivo: Blob): Promise<Resultado> {
  const pode = podeEnviar(c);
  if (!pode.ok) return pode;
  if (!ID_PROJETO.test(projetoId) || !(await c.repositorio.obterProjeto(projetoId))) return falha(404, 'Projeto não encontrado.');
  const cabecalho = new Uint8Array(await arquivo.slice(0, 16).arrayBuffer());
  const v = validarArquivo(nome, cabecalho, arquivo.size);
  if (!v.ok) return falha(400, v.erro);
  const docs = c.repositorio.documentos!;
  const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
  if ((await docs.enviosDesde(c.usuario.email, umaHoraAtras)) >= LIMITE_ENVIOS_POR_HORA) return falha(429, 'Muitos envios em pouco tempo. Tente de novo mais tarde.');
  const hash = await sha256Hex(arquivo);
  const repetido = await docs.duplicado(projetoId, hash);
  if (repetido) return falha(409, `Este arquivo já foi enviado neste projeto (“${repetido.nome_original}”).`);
  const id = crypto.randomUUID();
  const chave = `${c.repositorio.prefeituraId}/${projetoId}/${id}`;
  try {
    await c.bucket!.put(chave, arquivo, { httpMetadata: { contentType: v.mime } });
  } catch {
    return falha(503, 'Armazenamento de documentos indisponível.');
  }
  try {
    await docs.registrar({ id, projeto_id: projetoId, nome_original: v.nome, chave_r2: chave, tipo_mime: v.mime, tamanho_bytes: arquivo.size, sha256: hash, enviado_por: c.usuario.email });
  } catch (erro) {
    await c.bucket!.delete(chave).catch(() => console.warn('[documentos] arquivo órfão no R2 (limpeza falhou)', chave));
    // Dois envios iguais ao mesmo tempo: o índice único do banco deixa passar só um.
    if (/UNIQUE constraint failed/i.test(String(erro))) return falha(409, 'Este arquivo já foi enviado neste projeto.');
    return falha(503, 'Não foi possível registrar o documento. Tente de novo.');
  }
  return { ok: true, id };
}

export async function baixarDocumento(c: Contexto, id: string): Promise<Response | Resultado> {
  if (!usuarioPode(c.usuario, 'ver')) return falha(403, 'Sem permissão.');
  if (!prontos(c)) return falha(503, 'Armazenamento de documentos indisponível.');
  if (!ID_DOCUMENTO.test(id)) return falha(404, 'Documento não encontrado.');
  const d = await c.repositorio.documentos!.obter(id);
  if (!d) return falha(404, 'Documento não encontrado.');
  const objeto = await c.bucket!.get(d.chave_r2);
  if (!objeto) return falha(404, 'Arquivo não encontrado no armazenamento.');
  return new Response(objeto.body, {
    headers: {
      'Content-Type': d.tipo_mime, 'Content-Length': String(objeto.size),
      'Content-Disposition': cabecalhoDownload(d.nome_original),
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    },
  });
}

export async function removerDocumento(c: Contexto, id: string): Promise<Resultado> {
  if (!usuarioPode(c.usuario, 'enviar_documento')) return falha(403, 'Seu perfil não permite remover documentos.');
  if (!prontos(c)) return falha(503, 'Armazenamento de documentos indisponível.');
  if (!ID_DOCUMENTO.test(id)) return falha(404, 'Documento não encontrado.');
  return (await c.repositorio.documentos!.remover(id, c.usuario.email)) ? { ok: true } : falha(404, 'Documento não encontrado.');
}

export { LIMITE_BYTES };
