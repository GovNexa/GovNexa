import type { BancoD1 } from '../repositorio/d1.ts';
import type { Acao, Perfil, Prefeitura, Usuario } from './tipos.ts';
export type { Acao, Perfil, Prefeitura, Usuario } from './tipos.ts';

const permissoes: Record<Perfil, readonly Acao[]> = {
 admin: ['ver', 'editar_projeto', 'aprovar_etapa', 'enviar_documento', 'gerenciar_usuarios', 'importar', 'gerenciar_secretarias_compradoras', 'dispensar_2fa'],
 gestor: ['ver', 'editar_projeto', 'aprovar_etapa', 'enviar_documento'],
 editor: ['ver', 'editar_projeto', 'enviar_documento'],
 leitura: ['ver'],
};
export function pode(perfil: Perfil | null | undefined, acao: Acao): boolean {
 return !!perfil && Object.hasOwn(permissoes, perfil) && permissoes[perfil].includes(acao);
}
export function usuarioPode(usuario: Usuario | null | undefined, acao: Acao): boolean {
 return !!usuario?.ativo && pode(usuario.perfil, acao);
}
export async function obterUsuarioAtivoPorEmail(db: BancoD1, email: string): Promise<Usuario | null> {
 email = email.trim().toLowerCase();
 if (!/^[\x21-\x7e]+$/.test(email)) return null;
 const row = await db.prepare('SELECT id,email,nome,cargo,perfil,prefeitura_id,ativo,criado_em,atualizado_em FROM usuario WHERE email = ? AND ativo = 1')
  .bind(email).first<Usuario>();
 return row ? { ...row, ativo: Boolean(row.ativo) } : null;
}
export async function prefeituraDoUsuario(db: BancoD1, usuario: Usuario | null | undefined): Promise<Prefeitura | null> {
 if (!usuario?.ativo) return null;
 const row = await db.prepare('SELECT p.id,p.codigo_ibge,p.nome,p.uf,p.binding_d1,p.ativa FROM prefeitura p JOIN usuario u ON u.prefeitura_id = p.id WHERE u.id = ? AND u.ativo = 1 AND p.ativa = 1')
  .bind(usuario.id).first<Prefeitura>();
 if (row && (row.id !== row.codigo_ibge || row.binding_d1 !== `DB_PREFEITURA_${row.codigo_ibge}`)) return null;
 return row ? { ...row, ativa: Boolean(row.ativa) } : null;
}
export function criarRepositorioUsuarios(db: BancoD1) {
 return {
  obterUsuarioAtivoPorEmail: (email: string) => obterUsuarioAtivoPorEmail(db, email),
  prefeituraDoUsuario: (usuario: Usuario | null | undefined) => prefeituraDoUsuario(db, usuario),
 };
}
