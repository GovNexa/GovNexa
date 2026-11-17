import { modoLocal } from './base.ts';
export interface Email {para:string;assunto:string;texto:string;html:string;}
export interface EnvEmail { EMAIL?: {send(m: {from:{name:string;email:string};to:string;subject:string;text:string;html:string}):Promise<unknown>}; EMAIL_SIMULADO?:string; }
const emails: Email[]=[];
export function emailsLocais(r: Request, env: EnvEmail) {return modoLocal(r)&&env.EMAIL_SIMULADO==='1' ? [...emails] : null;}
export async function enviarEmail(env: EnvEmail, email: Email, request: Request) {
 if(env.EMAIL_SIMULADO==='1' && modoLocal(request)){console.log('[email-simulado]',email.para,email.assunto);emails.push(email);if(emails.length>20)emails.shift();return;}
 if(!env.EMAIL)throw new Error('Envio de e-mail indisponível.');
 await env.EMAIL.send({from:{name:'GovNexa',email:'nao-responda@govnexa.com.br'},to:email.para,subject:email.assunto,text:email.texto,html:email.html});
}
