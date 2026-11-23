export const prerender = false;
// POST /plataforma/gestao-licitacoes/gravar/ — todas as gravações da Gestão das licitações (E12). Login pelo middleware da plataforma.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { atenderGravacao } from '../../../lib/contratacoes/http.ts';
import { limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';
export const POST: APIRoute = ({ request, locals }) =>
  atenderGravacao(request, { usuario: locals.usuario, repositorio: locals.repositorio }, limitadorDoAmbiente(env));
