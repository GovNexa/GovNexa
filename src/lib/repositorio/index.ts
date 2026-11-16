import { criarRepositorioD1, type BancoD1 } from './d1.ts';
import { criarRepositorioJson } from './json.ts';
import { comInvalidacao } from './cache.ts';
import { prefeituraDoUsuario, type Usuario } from '../usuarios/index.ts';
import type { RepositorioProjetos } from './tipos.ts';
export function repositorio(): RepositorioProjetos { return criarRepositorioJson(); }
export function repositorioD1ParaTestes(db: BancoD1, prefeituraId: number): RepositorioProjetos { return criarRepositorioD1(db, prefeituraId); }
export async function repositorioDoUsuario(env: { DB_CENTRAL: BancoD1; [binding: string]: unknown }, usuario: Usuario | null | undefined): Promise<RepositorioProjetos> {
 const prefeitura = await prefeituraDoUsuario(env.DB_CENTRAL, usuario);
 if (!prefeitura) throw new Error('Prefeitura indisponível para o usuário.');
 const db = env[prefeitura.binding_d1] as BancoD1 | undefined;
 if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new Error('Binding D1 indisponível.');
 return comInvalidacao(criarRepositorioD1(db, prefeitura.id), prefeitura.id);
}
