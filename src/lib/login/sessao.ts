import type { BancoD1 } from '../repositorio/d1.ts';
import { hash, iso, depois, gravar, modoLocal } from './base.ts';
import { tokenAleatorio } from './tokens.ts';
export type Etapa = 'segundo_fator' | 'configurar_2fa' | 'completa';
export interface Sessao {id_hash:string;usuario_id:string;etapa:Etapa;criada_em:string;expira_em:string;ultimo_uso_em:string;revogada_em:string|null;tentativas_codigo:number;via_excecao:number;}
export function cookieSessao(r: Request, valor: string, apagar = false, env: {AMBIENTE?:string} = {}) {return `${modoLocal(r,env)?'govnexa_local':'__Host-govnexa'}=${valor}; HttpOnly; Path=/; SameSite=Lax${modoLocal(r,env)?'':'; Secure'}; Max-Age=${apagar?0:43200}`;}
export function lerCookie(r: Request, env: {AMBIENTE?:string} = {}) { const nome=modoLocal(r,env)?'govnexa_local':'__Host-govnexa';return r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(nome+'='))?.slice(nome.length+1) ?? ''; }
export async function criarSessao(db: BancoD1, usuario: string, etapa: Etapa, agente = '', viaExcecao = false) { const valor=tokenAleatorio(), agora=iso();await gravar(db,'INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em,agente,via_excecao) VALUES(?,?,?,?,?,?,?,?)',await hash(valor),usuario,etapa,agora,depois(etapa==='completa'?43200000:600000),agora,agente.slice(0,256),viaExcecao?1:0);return valor; }
export async function obterSessao(db: BancoD1, valor: string) {
 if(!/^[\w-]{43}$/.test(valor))return null;
 const s=await db.prepare('SELECT * FROM sessao WHERE id_hash = ? AND revogada_em IS NULL AND expira_em > ?').bind(await hash(valor),iso()).first<Sessao>();
 if(!s || (s.etapa==='completa' && Date.parse(s.ultimo_uso_em)<=Date.now()-7200000) || (s.etapa!=='completa' && s.tentativas_codigo>=5))return null;
 if(Date.parse(s.ultimo_uso_em)<=Date.now()-300000)await gravar(db,'UPDATE sessao SET ultimo_uso_em = ? WHERE id_hash = ?',iso(),s.id_hash);
 return s;
}
export async function revogarSessoes(db: BancoD1, usuario: string) {await gravar(db,'UPDATE sessao SET revogada_em = ? WHERE usuario_id = ? AND revogada_em IS NULL',iso(),usuario);}
