import astro from '@astrojs/cloudflare/entrypoints/server';
import { atender, type Env } from './index.ts';
export default {
 fetch(request: Request, env: Env, ctx: Parameters<typeof astro.fetch>[2]) {
  const path = new URL(request.url).pathname;
  if (/^\/(entrar|sair|api)(\/|$)/.test(path)) {
   return atender(request, env, async () => new Response(null, {status:404}));
  }
  return astro.fetch(request, env, ctx);
 }
};
