export const prerender = false;
// POST /plataforma/gestao-licitacoes/secretarias/gravar/ — cadastro das secretarias compradoras (permissão própria; hoje só o administrador).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { atenderOrgao } from '../../../../lib/pncp/http.ts';
import { limitadorDoAmbiente } from '../../../../lib/seguranca/limite.ts';
export const POST: APIRoute = ({ request, locals }) =>
  atenderOrgao(request, { usuario: locals.usuario, repositorio: locals.repositorio }, limitadorDoAmbiente(env));
