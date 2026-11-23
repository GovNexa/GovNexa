// Ficha única do projeto (E6): abas, endereço de volta e permissão de edição. Funções puras, usadas no servidor e no navegador. Regra de volta: src/lib/navegacao/volta.ts (E15).
import { nomeTela } from '../navegacao/volta.ts';
export { voltaSegura, MAX_VOLTA } from '../navegacao/volta.ts';
export const ABAS = [
  { id: 'cadastro', rotulo: 'Cadastro' }, { id: 'recurso', rotulo: 'Recurso' }, { id: 'entrega', rotulo: 'Entrega' },
  { id: 'localizacao', rotulo: 'Localização' }, { id: 'fotos', rotulo: 'Fotos' }, { id: 'documentos', rotulo: 'Documentos' },
  { id: 'sei', rotulo: 'Processos SEI' }, { id: 'cronograma', rotulo: 'Cronograma' }, { id: 'historico', rotulo: 'Histórico' },
  { id: 'governanca', rotulo: 'Governança' },
] as const;
export type Aba = (typeof ABAS)[number]['id'];
export const ABA_PADRAO: Aba = 'cadastro';
export const ID_FICHA = /^P-[A-Za-z0-9_-]{1,40}$/;
export const VOLTA_PADRAO = '/plataforma/projetos-carteira/';
/** Obsoleto desde a E15: voltaSegura aceita qualquer tela sob /plataforma/. Mantido só para as entregas paralelas compilarem; não use. */
export const VOLTAS_PERMITIDAS = ['/plataforma/projetos-carteira/', '/plataforma/gestao/', '/plataforma/projetos-kanban/', '/plataforma/projetos-gantt/', '/plataforma/gestao-equipe/', '/plataforma/gestao-inconsistencias/'] as const;
export function abaValida(valor: string | null | undefined): Aba {
  const v = (valor ?? '').trim();
  return ABAS.find((a) => a.id === v)?.id ?? ABA_PADRAO;
}
const ROTULOS_FIXOS: readonly (readonly [string, string])[] = [
  ['/plataforma/gestao/', 'Fechar e voltar ao mapa'], ['/plataforma/projetos-kanban/', 'Fechar e voltar ao Kanban'],
  ['/plataforma/projetos-gantt/', 'Fechar e voltar ao Gantt'], ['/plataforma/gestao-equipe/', 'Fechar e voltar ao painel da equipe'],
  ['/plataforma/gestao-inconsistencias/', 'Fechar e voltar ao relatório'],
];
export function rotuloVolta(volta: string | null): string {
  if (!volta || volta.startsWith('/plataforma/projetos-carteira/')) return 'Fechar e voltar à Carteira';
  for (const [prefixo, rotulo] of ROTULOS_FIXOS) if (volta.startsWith(prefixo)) return rotulo;
  return `Fechar e voltar para ${nomeTela(volta)}`;
}
/** Endereço da ficha. `volta` = tela de onde veio (com filtros); `aba` = aba aberta. */
export function hrefFicha(id: string, volta?: string | null, aba?: string | null): string {
  const q = new URLSearchParams();
  const a = abaValida(aba);
  if (a !== ABA_PADRAO) q.set('aba', a);
  if (volta) q.set('volta', volta);
  const s = q.toString();
  return `/plataforma/projeto/${encodeURIComponent(id)}/${s ? `?${s}` : ''}`;
}
/** Link para a ficha a partir de outra tela. Se esta tela foi aberta pela ficha do MESMO projeto, devolve essa volta (não cria ciclo); senão abre a ficha com `volta` = esta tela. */
export function linkFicha(id: string, volta: string | null, aqui: string | null, aba?: string | null): string {
  const caminho = `/plataforma/projeto/${encodeURIComponent(id)}/`;
  if (volta && volta.split(/[?#]/)[0] === caminho) return volta;
  return hrefFicha(id, aqui, aba);
}
export function podeEditarFicha(c: { podeEditar: boolean; podeGravar: boolean; temEditar: boolean; revisao: number | null }): boolean {
  return c.podeEditar && c.podeGravar && c.temEditar && c.revisao !== null;
}
