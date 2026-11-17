import { tempoMinimo } from '../src/lib/login/http.ts';
import { mesmaOrigem } from '../src/lib/documentos/http.ts';
import { servicoLogin, type EnvLogin } from '../src/lib/login/servico.ts';
import { lerCookie, cookieSessao } from '../src/lib/login/sessao.ts';
import { voltaSegura } from '../src/lib/login/base.ts';
import { claimsAccess } from './access.ts';
import { obterUsuarioAtivoPorEmail, type Usuario } from '../src/lib/usuarios/index.ts';
import { repositorioDoUsuario } from '../src/lib/repositorio/index.ts';
import type { BancoD1 } from '../src/lib/repositorio/d1.ts';
import type { RepositorioProjetos } from '../src/lib/repositorio/tipos.ts';
export interface Env extends EnvLogin {
 [binding: string]: unknown;
 ASSETS: { fetch(request: Request): Promise<Response> };
 ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string;
 ACESSO_LOCAL_LIVRE?: string; DEV_EMAIL?: string;
 DB_CENTRAL: BancoD1;
}
export const seguranca: Record<string,string> = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()", "Strict-Transport-Security": "max-age=63072000; includeSubDomains", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
export function resposta(status: number, texto: string, location?: string, detalhe = ''): Response {
 return new Response(location ? null : `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${texto}</title><h1>${texto}</h1>${detalhe}</html>`, {
 status, headers: {...seguranca, 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store', ...(location ? {Location:location} : {})}
 });
}

const escapar = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function atender(request: Request, env: Env, next: (usuario?: Usuario, repositorio?: RepositorioProjetos) => Promise<Response>): Promise<Response> {
 const { pathname: path, hostname } = new URL(request.url);
 if(path === '/entrar' || path.startsWith('/entrar/')) {
  const inicio=performance.now();try {
  if(request.method==='POST'&&!mesmaOrigem(request)){const r=resposta(403,'Pedido inválido');r.headers.set('Referrer-Policy','same-origin');return r;}
  try {
  const r = await next(); const h = new Headers(r.headers);
  for(const [k,v] of Object.entries(seguranca)) h.set(k,v);
  h.set('Cache-Control','private, no-store'); h.set('Referrer-Policy','same-origin');
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
  } catch {const r=resposta(503,'Serviço indisponível');r.headers.set('Referrer-Policy','same-origin');return r;}
  }finally{if(request.method==='POST')await tempoMinimo(inicio);}
 }
 if(env.LOGIN_MODO === 'senha' && (path === '/sair' || path.startsWith('/sair/') || path === '/api/logout' || path.startsWith('/api/logout/'))) {
  if(request.method==='GET')return resposta(200,'Sair da plataforma',undefined,'<form method="post" action="/sair"><button type="submit">Sair</button></form>');
  if(request.method!=='POST')return resposta(405,'Método não permitido');
  if(!mesmaOrigem(request))return resposta(403,'Pedido inválido');
  await servicoLogin(env,request).sair(lerCookie(request,env));
  const r=resposta(302,'','/entrar/?saiu=1');r.headers.set('Set-Cookie',cookieSessao(request,'',true,env));return r;
 }
 if(path === '/sair' || path.startsWith('/sair/') || path === '/api/logout' || path.startsWith('/api/logout/')) return resposta(302,'','/cdn-cgi/access/logout');
 if(path === '/api' || path.startsWith('/api/')) return resposta(404,'Página não encontrada');
 if(path !== '/plataforma' && !path.startsWith('/plataforma/')) return next();
 if(env.LOGIN_MODO === 'senha') {
  try {
   const usuario=await servicoLogin(env,request).usuarioDaSessao(lerCookie(request,env));
   if(!usuario) return resposta(302,'','/entrar/?volta='+encodeURIComponent(voltaSegura(new URL(request.url).pathname+new URL(request.url).search)));
   const repo=await repositorioDoUsuario(env,usuario), r=await next(usuario,repo), h=new Headers(r.headers);
   for(const [k,v] of Object.entries(seguranca))h.set(k,v);h.set('Cache-Control','private, no-store');
   return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
  } catch {return resposta(503,'Serviço indisponível');}
 }
 let email: string | undefined;
 if(env.ACESSO_LOCAL_LIVRE === '1' && !request.headers.has('cf-ray') && ['localhost','127.0.0.1'].includes(hostname)) email = env.DEV_EMAIL;
 else {
  if(!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return resposta(503,'acesso não configurado');
  const claims = await claimsAccess(request.headers.get('Cf-Access-Jwt-Assertion'),env.ACCESS_TEAM_DOMAIN,env.ACCESS_AUD);
  if(!claims) return resposta(403,'Acesso negado');
  email = typeof claims.email === 'string' ? claims.email : undefined;
 }
 try {
 const usuario = email ? await obterUsuarioAtivoPorEmail(env.DB_CENTRAL,email) : null;
 if(!usuario) {
  console.warn('[access] sem cadastro ativo');
  return resposta(403,'Sem permissão',undefined,`<p>${escapar(email ?? '')}</p><p>Procure um administrador.</p>`);
 }
 let repositorio: RepositorioProjetos;
 try { repositorio = await repositorioDoUsuario(env,usuario); }
 catch { return resposta(503,'Serviço indisponível'); }
 const r = await next(usuario, repositorio);
 const headers = new Headers(r.headers);
 headers.set('Cache-Control','private, no-store');
 for(const [k,v] of Object.entries(seguranca)) headers.set(k,v);
 return new Response(r.body,{status:r.status,statusText:r.statusText,headers});
 } catch { return resposta(503,'Serviço indisponível'); }
}
