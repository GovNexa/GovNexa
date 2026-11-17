import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { emailsLocais, type EnvEmail } from '../../lib/login/email.ts';
export const prerender=false;
export const GET:APIRoute=({request,params})=>{if(params.apoio!=='_emails-locais')return new Response(null,{status:404});const lista=emailsLocais(request,env as unknown as EnvEmail);return lista?Response.json(lista,{headers:{'Cache-Control':'private, no-store'}}):new Response(null,{status:404});};
