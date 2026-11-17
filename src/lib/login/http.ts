import { mesmaOrigem } from '../documentos/http.ts';
import { modoLocal } from './base.ts';
import type { EnvLogin } from './servico.ts';
export function conferirPost(r:Request){if(!mesmaOrigem(r))throw new Error('Pedido inválido. Recarregue a página.');const tamanho=Number(r.headers.get('content-length'));if(tamanho>16384)throw new Error('Formulário muito grande.');}
export async function conferirTurnstile(env:EnvLogin,r:Request,f:FormData){
 if(!env.TURNSTILE_SITE_KEY){if(modoLocal(r))return;throw new Error('Acesso temporariamente indisponível.');}
 if(!env.TURNSTILE_SECRET)throw new Error('Acesso temporariamente indisponível.');
 const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:String(f.get('cf-turnstile-response')??'')});
 const ip=r.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
 const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});
 const json=await result.json() as {success?:boolean;hostname?:string};
 if(!result.ok||!json.success||(!modoLocal(r)&&json.hostname!==new URL(r.url).hostname))throw new Error('Confira a verificação e tente novamente.');
}
export const campo=(f:FormData,nome:string)=>String(f.get(nome)??'');

/** Erros de infraestrutura nunca são enviados ao navegador. */
export function mensagemPublica(e:unknown,fallback='Serviço temporariamente indisponível. Tente novamente mais tarde.') {
 const m=e instanceof Error?e.message:'';
 return /^(E-mail ou senha incorretos\.|Código inválido ou expirado\.|Use uma senha |Escolha uma senha |A senha não pode |As senhas precisam |Link inválido ou expirado\.|Entre novamente |Pedido inválido\.|Formulário muito grande\.|Confira a verificação |Acesso temporariamente indisponível\.)/.test(m)?m:fallback;
}
