import { verificarAccess } from './access.ts';
export interface Env {
 ASSETS: { fetch(request: Request): Promise<Response> };
 ACCESS_TEAM_DOMAIN: string;
 ACCESS_AUD: string;
 ACESSO_LOCAL_LIVRE?: string;
}
const seguranca: Record<string,string> = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()", "Strict-Transport-Security": "max-age=63072000; includeSubDomains", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
function resposta(status: number, texto: string, location?: string): Response {
 return new Response(location ? null : `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${texto}</title><h1>${texto}</h1></html>`, {
 status, headers: {...seguranca, 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store', ...(location ? {Location:location} : {})}
 });
}
export default {
 async fetch(request: Request, env: Env): Promise<Response> {
 const { pathname: path, hostname } = new URL(request.url);
 if(path === '/entrar' || path.startsWith('/entrar/')) return resposta(302,'','/plataforma/');
 if(path === '/api/logout' || path === '/api/logout/' || path === '/sair' || path === '/sair/') return resposta(302,'','/cdn-cgi/access/logout');
 if(path === '/api' || path.startsWith('/api/')) return resposta(404,'Página não encontrada');
 if(path === '/plataforma' || path.startsWith('/plataforma/')) {
 if(!(env.ACESSO_LOCAL_LIVRE === '1' && (hostname === 'localhost' || hostname === '127.0.0.1'))) {
 if(!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return resposta(503,'acesso não configurado');
 if(!await verificarAccess(request.headers.get('Cf-Access-Jwt-Assertion'),env.ACCESS_TEAM_DOMAIN,env.ACCESS_AUD)) return resposta(403,'Acesso negado');
 }
 const asset = await env.ASSETS.fetch(request);
 const headers = new Headers(asset.headers);
 headers.set('Cache-Control','private, no-store');
 for (const [nome, valor] of Object.entries(seguranca)) headers.set(nome, valor);
 return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
 }
 return env.ASSETS.fetch(request);
 }
};
