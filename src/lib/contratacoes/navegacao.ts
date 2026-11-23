import { voltaSegura } from '../carteira/ficha.ts';
import { ROTA_LICITACOES } from './painel.ts';
/** Única porta de entrada da E12 para o "volta". Antes da E15: VOLTAS_PERMITIDAS inclui as duas rotas abaixo. Depois: a E15 generaliza `voltaSegura`; esta função não muda. */
export function voltaContratacao(candidato: string | null | undefined, origem: string): { href: string; rotulo: string } {
  const v = voltaSegura(candidato, origem);
  if (v?.startsWith('/plataforma/projeto/')) return { href: v, rotulo: 'Voltar para o projeto' };
  if (v && !v.startsWith(ROTA_LICITACOES)) return { href: v, rotulo: 'Voltar para a tela anterior' };
  return { href: v ?? ROTA_LICITACOES, rotulo: 'Voltar para Gestão das licitações' };
}
export function hrefContratacao(id: string, volta?: string | null): string {
  return `${ROTA_LICITACOES}${encodeURIComponent(id)}/${volta ? `?volta=${encodeURIComponent(volta)}` : ''}`;
}
