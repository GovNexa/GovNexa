import type { BancoD1 } from '../repositorio/d1.ts';
import { aleatorio, b64, hash, iso, depois } from './base.ts';
export type TipoToken = 'convite' | 'redefinicao';
export const tokenAleatorio = () => b64(aleatorio());
export async function criarToken(db: BancoD1, usuario: string, tipo: TipoToken, autor: string | null = null) {
 const token = tokenAleatorio(), agora = iso(), expira = depois(tipo === 'convite' ? 86400000 : 3600000);
 await db.batch([
 db.prepare('UPDATE token_email SET usado_em = ? WHERE usuario_id = ? AND tipo = ? AND usado_em IS NULL').bind(agora,usuario,tipo),
 db.prepare('INSERT INTO token_email(id_hash,usuario_id,tipo,criado_em,expira_em,criado_por) VALUES(?,?,?,?,?,?)').bind(await hash(token),usuario,tipo,agora,expira,autor)
 ]);
 return {token, expira};
}
export async function consultarToken(db: BancoD1, token: string, tipo: TipoToken) { return db.prepare('SELECT * FROM token_email WHERE id_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > ?').bind(await hash(token),tipo,iso()).first<{id_hash:string;usuario_id:string}>(); }
