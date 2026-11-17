export const prerender = false;
// GET /plataforma/documentos-projeto/arquivo/<id> — baixa o documento (sempre como anexo). Protegido pelo Cloudflare Access.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { baixarDocumento, type BucketR2 } from '../../../../lib/documentos/servico.ts';

export const GET: APIRoute = async ({ params, locals }) => {
  const r = await baixarDocumento(
    { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS },
    String(params.id ?? ''),
  );
  if (r instanceof Response) return r;
  return new Response(r.ok ? '' : r.erro, { status: r.ok ? 200 : r.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } });
};
