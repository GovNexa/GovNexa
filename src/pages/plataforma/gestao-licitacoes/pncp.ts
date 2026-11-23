export const prerender = false;
// POST /plataforma/gestao-licitacoes/pncp/ — prévia, ligar, desligar e atualizar dados do PNCP (E14a). Login pelo middleware da plataforma.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { atenderPncp } from '../../../lib/pncp/http.ts';
import { depsPncpDoAmbiente } from '../../../lib/pncp/simulado.ts';
import { limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';
export const POST: APIRoute = ({ request, locals }) =>
  atenderPncp(request, { usuario: locals.usuario, repositorio: locals.repositorio }, limitadorDoAmbiente(env), depsPncpDoAmbiente(env, request));
