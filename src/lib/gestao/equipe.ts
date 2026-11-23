// Painel da equipe e relatório de inconsistências (E10): endereços e quem pode ver. Sem leitura de dados.
import { usuarioPode, type Usuario } from '../usuarios/index.ts';

export const ROTA_PAINEL_EQUIPE = '/plataforma/gestao-equipe/';
export const ROTA_INCONSISTENCIAS = '/plataforma/gestao-inconsistencias/';
export const ROTA_INCONSISTENCIAS_CSV = '/plataforma/gestao-inconsistencias/csv/';

/** As duas telas são da equipe que mantém os dados: administrador, gestor e editor. O perfil leitura não vê. */
export function podeVerEquipe(usuario: Usuario | null | undefined): boolean {
  return usuarioPode(usuario, 'editar_projeto');
}

export const AVISO_SEM_PERMISSAO = 'Sem permissão: esta tela é da equipe que mantém os dados (perfis administrador, gestor e editor).';
