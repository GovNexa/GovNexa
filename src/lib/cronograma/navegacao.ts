// Contrato de navegação do cronograma (E13): abas, endereço e "voltar" que valem antes e depois da E15.
import { voltaSegura } from '../carteira/ficha.ts';

export const ROTA_CRONOGRAMAS = '/plataforma/projetos-cronogramas/';
export const ROTA_RESPONSAVEIS = '/plataforma/gestao-responsaveis/';
export const ABAS_CRONOGRAMA = ['tarefas', 'tempo', 'quadro', 'envolvidos', 'dependencias', 'dados'] as const;
export type AbaCronograma = (typeof ABAS_CRONOGRAMA)[number];
export const abaCronograma = (v: string | null | undefined): AbaCronograma => (ABAS_CRONOGRAMA as readonly string[]).includes(v ?? '') ? (v as AbaCronograma) : 'tempo';
export const PREFIXOS_VOLTA_E13 = ['/plataforma/projeto/', '/plataforma/projetos-cronogramas/', '/plataforma/gestao-responsaveis/', '/plataforma/cronograma/', '/plataforma/projetos-parado/'] as const;

const CONTROLE = /[\u0000-\u001f\u007f]/;
const MAX_VOLTA = 2000;

/** Caminho interno seguro para o "voltar": o que `voltaSegura` (ficha) aceita, mais os prefixos da E13. Mesma origem, sempre. */
export function voltaCronograma(candidato: string | null | undefined, origem: string): string | null {
  const daFicha = voltaSegura(candidato, origem);
  if (daFicha) return daFicha;
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
  if (!PREFIXOS_VOLTA_E13.some((p) => destino.pathname.startsWith(p))) return null;
  return `${destino.pathname}${destino.search}${destino.hash}`;
}

export function rotuloVoltaCronograma(volta: string | null): string {
  if (!volta) return '← Todos os cronogramas';
  if (volta.startsWith('/plataforma/projeto/')) return '← Voltar para a ficha do projeto';
  if (volta.startsWith('/plataforma/projetos-cronogramas/')) return '← Voltar para Cronogramas';
  if (volta.startsWith('/plataforma/gestao-responsaveis/')) return '← Voltar para Responsáveis';
  if (volta.startsWith('/plataforma/cronograma/')) return '← Voltar para o cronograma';
  if (volta.startsWith('/plataforma/projetos-parado/')) return '← Voltar para Onde está parado';
  return '← Voltar';
}

export const ancoraTarefa = (id: string): string => 't-' + id.replace(/[^A-Za-z0-9_-]/g, '_');

// E20: aba "Envolvidos e recursos".
export const ancoraEnvolvidos = (id: string): string => 'ev-' + id.replace(/[^A-Za-z0-9_-]/g, '_');
export const ROTA_CSV_RECURSOS = '/plataforma/cronograma/recursos-csv/';

export function urlCronograma(id: string, op: { aba?: AbaCronograma | null; volta?: string | null; tarefa?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (op.aba && op.aba !== 'tempo') q.set('aba', op.aba);
  if (op.volta) q.set('volta', op.volta);
  const query = q.toString();
  return `/plataforma/cronograma/${encodeURIComponent(id)}/${query ? `?${query}` : ''}${op.tarefa ? `#${ancoraTarefa(op.tarefa)}` : ''}`;
}

export const urlEnvolvidos = (id: string, volta: string | null, tarefa?: string | null): string =>
  urlCronograma(id, { aba: 'envolvidos', volta }) + (tarefa ? `#${ancoraEnvolvidos(tarefa)}` : '');
