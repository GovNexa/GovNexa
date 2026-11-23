// Envio, exibição e remoção das fotos da obra (E9). Sem dependência do Astro: recebe o R2, o repositório e o usuário.
// Segurança (mesmo padrão dos documentos): perfil com `editar_projeto` para enviar e remover, `ver` para ver; projeto da
// própria prefeitura; chave do R2 gerada aqui (nunca vinda do navegador); tipo conferido pelo conteúdo; remoção só lógica.
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import type { BucketR2 } from '../documentos/servico.ts';
import { ID_PROJETO, sha256Hex } from '../documentos/regras.ts';
import type { CodigoFoto } from './mensagens.ts';
import {
  ID_FOTO, TIPOS_FOTO_MIME, cabecalhoFoto, chaveDaPrefeitura, chaveFoto, descricaoEnvio, descricaoRemocao,
  hojeBrasilia, legendaSegura, validarDataFoto, validarFoto,
} from './regras.ts';

export interface ContextoFotos { usuario: Usuario; repositorio: RepositorioProjetos; bucket: BucketR2 | undefined; agora?: () => Date; }
export type ResultadoFoto = { ok: true; id?: string } | { ok: false; status: number; codigo: CodigoFoto };

/** Teto de envios por pessoa por hora (por prefeitura) e de fotos ativas por projeto. */
export const LIMITE_FOTOS_POR_HORA = 60;
export const LIMITE_FOTOS_POR_PROJETO = 200;

const falha = (status: number, codigo: CodigoFoto): ResultadoFoto => ({ ok: false, status, codigo });
const prontos = (c: ContextoFotos) => !!c.bucket && !!c.repositorio.fotos && c.repositorio.prefeituraId !== undefined;
const agoraDe = (c: ContextoFotos) => (c.agora ?? (() => new Date()))();

/** O que a aba Fotos mostra para este perfil. */
export function permissaoFotos(usuario: Usuario | null | undefined, disponivel: boolean): { podeGerir: boolean; aviso: string | null } {
  if (!disponivel) return { podeGerir: false, aviso: 'O envio de fotos só funciona com o banco de dados configurado.' };
  if (!usuarioPode(usuario, 'editar_projeto')) return { podeGerir: false, aviso: 'Seu perfil permite apenas ver as fotos.' };
  return { podeGerir: true, aviso: null };
}

/** Confere só o perfil e o armazenamento, sem ler o corpo do pedido: as rotas chamam antes de abrir o formulário. */
export function podeGerirFotos(c: ContextoFotos): ResultadoFoto {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return falha(403, 'permissao');
  if (!prontos(c)) return falha(503, 'indisponivel');
  return { ok: true };
}

export async function enviarFoto(c: ContextoFotos, projetoId: string, arquivo: Blob, nome: string, legendaBruta: unknown, dataBruta: unknown): Promise<ResultadoFoto> {
  const pode = podeGerirFotos(c);
  if (!pode.ok) return pode;
  if (!ID_PROJETO.test(projetoId) || !(await c.repositorio.obterProjeto(projetoId))) return falha(404, 'projeto');
  const legenda = legendaSegura(legendaBruta);
  if (!legenda.ok) return falha(400, 'legenda');
  const agora = agoraDe(c);
  const data = validarDataFoto(dataBruta, hojeBrasilia(agora));
  if (!data.ok) return falha(400, 'data');
  const v = validarFoto(nome, new Uint8Array(await arquivo.slice(0, 16).arrayBuffer()), arquivo.size);
  if (!v.ok) return falha(400, v.codigo);
  const fotos = c.repositorio.fotos!;
  const desde = new Date(agora.getTime() - 3600_000).toISOString();
  if ((await fotos.enviosDesde(c.usuario.email, desde)) >= LIMITE_FOTOS_POR_HORA) return falha(429, 'limite');
  if ((await fotos.contarAtivas(projetoId)) >= LIMITE_FOTOS_POR_PROJETO) return falha(409, 'cheio');
  const hash = await sha256Hex(arquivo);
  if (await fotos.duplicada(projetoId, hash)) return falha(409, 'duplicada');
  const id = crypto.randomUUID();
  const chave = chaveFoto(c.repositorio.prefeituraId!, projetoId, id);
  try {
    await c.bucket!.put(chave, arquivo, { httpMetadata: { contentType: v.mime } });
  } catch {
    return falha(503, 'indisponivel');
  }
  const limpar = () => c.bucket!.delete(chave).catch(() => console.warn('[fotos] arquivo órfão no R2 (limpeza falhou)', chave));
  let r: 'ok' | 'limite';
  try {
    r = await fotos.registrar(
      { id, projeto_id: projetoId, arquivo_chave: chave, tipo_mime: v.mime, tamanho_bytes: arquivo.size, legenda: legenda.valor, tirada_em: data.valor, enviada_por: c.usuario.email, sha256: hash },
      { porProjeto: LIMITE_FOTOS_POR_PROJETO, porHora: LIMITE_FOTOS_POR_HORA, desdeIso: desde },
      descricaoEnvio(legenda.valor, data.valor), agora.toISOString(),
    );
  } catch (erro) {
    await limpar();
    // Dois envios da mesma foto ao mesmo tempo: o índice único do banco deixa passar só um.
    if (/UNIQUE constraint failed/i.test(String(erro))) return falha(409, 'duplicada');
    return falha(503, 'indisponivel');
  }
  if (r !== 'ok') {
    await limpar();
    return (await fotos.contarAtivas(projetoId)) >= LIMITE_FOTOS_POR_PROJETO ? falha(409, 'cheio') : falha(429, 'limite');
  }
  return { ok: true, id };
}

export async function verFoto(c: ContextoFotos, id: string): Promise<Response | ResultadoFoto> {
  if (!usuarioPode(c.usuario, 'ver')) return falha(403, 'permissao');
  if (!prontos(c)) return falha(503, 'indisponivel');
  if (!ID_FOTO.test(id)) return falha(404, 'naoencontrada');
  const f = await c.repositorio.fotos!.obter(id);
  if (!f || !chaveDaPrefeitura(f.arquivo_chave, c.repositorio.prefeituraId!) || !(TIPOS_FOTO_MIME as readonly string[]).includes(f.tipo_mime)) return falha(404, 'naoencontrada');
  const objeto = await c.bucket!.get(f.arquivo_chave);
  if (!objeto) return falha(404, 'naoencontrada');
  return new Response(objeto.body, {
    headers: {
      'Content-Type': f.tipo_mime, 'Content-Length': String(objeto.size),
      'Content-Disposition': cabecalhoFoto(f.id, f.tipo_mime),
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

export async function removerFoto(c: ContextoFotos, id: string): Promise<ResultadoFoto> {
  const pode = podeGerirFotos(c);
  if (!pode.ok) return pode;
  if (!ID_FOTO.test(id)) return falha(404, 'naoencontrada');
  const fotos = c.repositorio.fotos!;
  const f = await fotos.obter(id);
  if (!f) return falha(404, 'naoencontrada');
  const ok = await fotos.remover(id, f.projeto_id, c.usuario.email, descricaoRemocao(f.legenda, f.tirada_em), agoraDe(c).toISOString());
  return ok ? { ok: true, id } : falha(404, 'naoencontrada');
}
