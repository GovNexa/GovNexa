import astro from '@astrojs/cloudflare/entrypoints/server';
import { atender, type Env } from './index.ts';
export default {
 fetch(request: Request, env: Env, ctx: Parameters<typeof astro.fetch>[2]) {
  const path = new URL(request.url).pathname;
  if (path === '/entrar') {
   return atender(request, env, async () => new Response(null, {status:301, headers:{Location:'/entrar/'}}));
  }
  if (path.startsWith('/entrar/')) {
   return atender(request, env, async () => astro.fetch(request, env, ctx));
  }
  if (/^\/(sair|api)(\/|$)/.test(path)) {
   return atender(request, env, async () => new Response(null, {status:404}));
  }
  return astro.fetch(request, env, ctx);
 }
};
