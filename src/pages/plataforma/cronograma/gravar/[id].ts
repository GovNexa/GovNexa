export const prerender = false;
// POST /plataforma/cronograma/gravar/<id>/ — grava uma mudança do cronograma (E13). Protegido pelo login da plataforma.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { atenderGravacao } from '../../../../lib/cronograma/http.ts';
import { limitadorDoAmbiente } from '../../../../lib/seguranca/limite.ts';

export const POST: APIRoute = ({ request, locals, params }) =>
  atenderGravacao(request, { usuario: locals.usuario, repositorio: locals.repositorio }, limitadorDoAmbiente(env), String(params.id ?? ''));
