export type Perfil = 'admin' | 'gestor' | 'editor' | 'leitura';
export type Acao = 'ver' | 'editar_projeto' | 'aprovar_etapa' | 'enviar_documento' | 'gerenciar_usuarios' | 'importar' | 'dispensar_2fa';
export interface Usuario {
 id: string; email: string; nome: string; cargo: string | null; perfil: Perfil;
 prefeitura_id: number; ativo: boolean; criado_em: string; atualizado_em: string;
}
export interface Prefeitura {
 id: number; codigo_ibge: number; nome: string; uf: string; binding_d1: string; ativa: boolean;
}
