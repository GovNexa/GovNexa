export const prerender = false;
// POST /plataforma/cronograma/criar/ — cria o cronograma de um projeto da carteira, direto na tela (E13).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { atenderCriacao } from '../../../lib/cronograma/http.ts';
import { limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';

export const POST: APIRoute = ({ request, locals }) =>
  atenderCriacao(request, { usuario: locals.usuario, repositorio: locals.repositorio }, limitadorDoAmbiente(env));
