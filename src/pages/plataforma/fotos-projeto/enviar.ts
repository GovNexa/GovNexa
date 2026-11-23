export const prerender = false;
// POST /plataforma/fotos-projeto/enviar/?projeto=<id>&volta=<tela> — envia UMA foto da obra (E9). Sob /plataforma/ (login do Worker).
// O projeto vem no endereço só para saber para onde voltar; ele é conferido no banco da prefeitura da sessão pelo serviço.
// Ordem: origem, perfil e armazenamento, formato e tamanho do corpo e limite por pessoa ANTES de abrir o formulário.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { BucketR2 } from '../../../lib/documentos/servico.ts';
import { mesmaOrigem } from '../../../lib/documentos/http.ts';
import { LIMITE_FOTO_BYTES } from '../../../lib/fotos/regras.ts';
import { enviarFoto, podeGerirFotos } from '../../../lib/fotos/servico.ts';
import { destinoFotos } from '../../../lib/fotos/mensagens.ts';
import { dentroDoLimite, limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';

/** Folga para os campos de texto e as marcas do formulário, além da foto. */
const FOLGA_FORMULARIO = 256 * 1024;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS };
  const url = new URL(request.url);
  const projeto = url.searchParams.get('projeto');
  const destino = (codigo: Parameters<typeof destinoFotos>[3]) => destinoFotos(projeto, url.searchParams.get('volta'), url.origin, codigo);
  if (!mesmaOrigem(request)) return redirect(destino('origem'), 303);
  const pode = podeGerirFotos(contexto);
  if (!pode.ok) return redirect(destino(pode.codigo), 303);
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('content-type') ?? '')) return redirect(destino('vazio'), 303);
  const tamanho = Number(request.headers.get('content-length'));
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > LIMITE_FOTO_BYTES + FOLGA_FORMULARIO) return redirect(destino('tamanho'), 303);
  if (!(await dentroDoLimite(limitadorDoAmbiente(env), contexto.repositorio.prefeituraId, contexto.usuario.email))) return redirect(destino('limite'), 303);
  let form: FormData;
  try { form = await request.formData(); } catch { return redirect(destino('vazio'), 303); }
  const arquivo = form.get('foto');
  if (!(arquivo instanceof File) || arquivo.size === 0) return redirect(destino('vazio'), 303);
  const r = await enviarFoto(contexto, projeto ?? '', arquivo, arquivo.name, form.get('legenda'), form.get('data'));
  return redirect(destino(r.ok ? 'enviada' : r.codigo), 303);
};
