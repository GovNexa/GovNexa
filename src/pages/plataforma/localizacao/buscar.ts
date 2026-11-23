export const prerender = false;
// POST /plataforma/localizacao/buscar/ — procura rua, endereço ou bairro (E8). Protegido pelo login da plataforma; nada é gravado aqui.
// Toda a conferência (origem, perfil, formato, limite, tamanho, texto, cache e fila) fica em src/lib/mapa/busca-endereco.ts.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { depsDoAmbiente, responderBuscaEndereco } from '../../../lib/mapa/busca-endereco.ts';

export const POST: APIRoute = ({ request, locals }) =>
  responderBuscaEndereco(request, { usuario: locals.usuario, prefeituraId: locals.repositorio?.prefeituraId }, depsDoAmbiente(env, request));
