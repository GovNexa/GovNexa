import type { BancoD1 } from '../repositorio/d1.ts';
import { gravar } from './base.ts';
export async function contarTentativa(db: BancoD1, chave: string, maximo: number, janelaMs: number) {
 const janela=new Date(Math.floor(Date.now()/janelaMs)*janelaMs).toISOString();
 await gravar(db,`INSERT INTO limite_tentativa(chave,janela_inicio,contagem) VALUES(?,?,1)
 ON CONFLICT(chave) DO UPDATE SET contagem = CASE WHEN janela_inicio = excluded.janela_inicio THEN contagem + 1 ELSE 1 END, janela_inicio = excluded.janela_inicio`,chave,janela);
 const n=await db.prepare('SELECT contagem FROM limite_tentativa WHERE chave = ?').bind(chave).first<{contagem:number}>();
 return !!n && n.contagem<=maximo;
}
