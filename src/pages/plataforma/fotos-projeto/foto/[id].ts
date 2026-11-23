export const prerender = false;
// GET /plataforma/fotos-projeto/foto/<id>/ — mostra a foto (inline, tipo conferido no envio, nosniff). Sob /plataforma/ (login do Worker). E9.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { BucketR2 } from '../../../../lib/documentos/servico.ts';
import { verFoto } from '../../../../lib/fotos/servico.ts';
import { MENSAGENS_FOTOS } from '../../../../lib/fotos/mensagens.ts';

export const GET: APIRoute = async ({ params, locals }) => {
  const r = await verFoto(
    { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS },
    String(params.id ?? ''),
  );
  if (r instanceof Response) return r;
  return new Response(r.ok ? '' : MENSAGENS_FOTOS[r.codigo].texto, {
    status: r.ok ? 200 : r.status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};
