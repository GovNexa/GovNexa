// Ficha única do projeto (E6): abas, endereço de volta e permissão de edição. Funções puras, usadas no servidor e no navegador.
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
export const VOLTAS_PERMITIDAS = ['/plataforma/projetos-carteira/', '/plataforma/gestao/', '/plataforma/projetos-kanban/', '/plataforma/projetos-gantt/', '/plataforma/gestao-equipe/', '/plataforma/gestao-inconsistencias/'] as const;
export const MAX_VOLTA = 2000;
const CONTROLE = /[\u0000-\u001f\u007f]/;
export function abaValida(valor: string | null | undefined): Aba {
  const v = (valor ?? '').trim();
  return ABAS.find((a) => a.id === v)?.id ?? ABA_PADRAO;
}
/** Caminho interno seguro para o X da ficha, ou null. Só aceita as telas de VOLTAS_PERMITIDAS, na mesma origem. */
export function voltaSegura(candidato: string | null | undefined, origem: string): string | null {
  if (typeof candidato !== 'string' || candidato.length === 0 || candidato.length > MAX_VOLTA) return null;
  if (!candidato.startsWith('/') || candidato.startsWith('//') || candidato.includes('\\') || CONTROLE.test(candidato)) return null;
  let destino: URL;
  let base: URL;
  try {
    base = new URL(origem);
    destino = new URL(candidato, base);
  } catch {
    return null;
  }
  if (destino.origin !== base.origin) return null;
  if (!VOLTAS_PERMITIDAS.some((p) => destino.pathname.startsWith(p))) return null;
  return `${destino.pathname}${destino.search}${destino.hash}`;
}
export function rotuloVolta(volta: string | null): string {
  if (volta?.startsWith('/plataforma/gestao/')) return 'Fechar e voltar ao mapa';
  if (volta?.startsWith('/plataforma/projetos-kanban/')) return 'Fechar e voltar ao Kanban';
  if (volta?.startsWith('/plataforma/projetos-gantt/')) return 'Fechar e voltar ao Gantt';
  if (volta?.startsWith('/plataforma/gestao-equipe/')) return 'Fechar e voltar ao painel da equipe';
  if (volta?.startsWith('/plataforma/gestao-inconsistencias/')) return 'Fechar e voltar ao relatório';
  return 'Fechar e voltar à Carteira';
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
export function podeEditarFicha(c: { podeEditar: boolean; podeGravar: boolean; temEditar: boolean; revisao: number | null }): boolean {
  return c.podeEditar && c.podeGravar && c.temEditar && c.revisao !== null;
}
