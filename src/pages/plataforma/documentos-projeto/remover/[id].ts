export const prerender = false;
// POST /plataforma/documentos-projeto/remover/<id>/ — remoção lógica (o arquivo continua guardado). Protegido pelo Cloudflare Access.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { podeEnviar, removerDocumento, type BucketR2 } from '../../../../lib/documentos/servico.ts';
import { codigoDe } from '../../../../lib/documentos/mensagens.ts';
import { mesmaOrigem } from '../../../../lib/documentos/http.ts';
import { ID_PROJETO } from '../../../../lib/documentos/regras.ts';

const BASE = '/plataforma/documentos-projeto/';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS };
  if (!mesmaOrigem(request)) return redirect(`${BASE}?r=origem`, 303);
  const pode = podeEnviar(contexto);
  if (!pode.ok) return redirect(`${BASE}?r=${codigoDe(pode)}`, 303);
  // O formulário só leva o código do projeto: corpo grande é abuso e não é lido.
  const tamanho = Number(request.headers.get('content-length'));
  if (!Number.isFinite(tamanho) || tamanho < 0 || tamanho > 4096) return redirect(`${BASE}?r=tamanho`, 303);
  const form = await request.formData().catch(() => null);
  const projeto = String(form?.get('projeto') ?? '');
  const base = ID_PROJETO.test(projeto) ? `${BASE}projeto/${encodeURIComponent(projeto)}/` : BASE;
  const r = await removerDocumento(contexto, String(params.id ?? ''));
  return redirect(`${base}?r=${r.ok ? 'removido' : codigoDe(r)}`, 303);
};
