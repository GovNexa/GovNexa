// Etapa 3.3 (opção B): lista somente leitura de quem tem acesso à prefeitura do solicitante.
// Só quem tem a ação `gerenciar_usuarios` lê; a consulta sempre filtra pela prefeitura do próprio solicitante.
import type { BancoD1 } from '../repositorio/d1.ts';
import { usuarioPode, type Perfil, type Usuario } from './index.ts';

export interface UsuarioListado { nome: string; email: string; cargo: string | null; perfil: Perfil; ativo: boolean; criado_em: string; }

export const ROTULO_PERFIL: Record<Perfil, string> = { admin: 'Administrador', gestor: 'Gestor', editor: 'Editor', leitura: 'Leitura' };

/** Devolve `null` quando o solicitante não pode gerenciar usuários (a tela mostra "sem permissão"). */
export async function listarUsuarios(db: BancoD1, solicitante: Usuario | null | undefined): Promise<UsuarioListado[] | null> {
  if (!solicitante || !usuarioPode(solicitante, 'gerenciar_usuarios')) return null;
  const { results } = await db
    .prepare('SELECT nome, email, cargo, perfil, ativo, criado_em FROM usuario WHERE prefeitura_id = ? ORDER BY ativo DESC, lower(nome), email')
    .bind(solicitante.prefeitura_id)
    .all();
  return results.map((r) => ({ nome: String(r.nome ?? ''), email: String(r.email), cargo: r.cargo == null ? null : String(r.cargo), perfil: r.perfil as Perfil, ativo: Boolean(r.ativo), criado_em: String(r.criado_em) }));
}
