// Catálogo de módulos do GovNexa. Desde a E11 (áudio 31) o menu lateral tem TRÊS VISÕES: Gerencial (o que o prefeito vê),
// Governança da execução (o trabalho da equipe) e Convênios (captação e repasses); depois vêm Licitações (demonstrativo,
// a gestão das licitações (E12) fica na Visão gerencial) e Conta. Os endereços das telas não mudaram.
import type { Acao } from '../usuarios/index.ts';

export type ModuloId = 'gerencial' | 'governanca' | 'convenios' | 'licitacoes' | 'conta';

export const MODULOS: { id: ModuloId; nome: string; descricao: string; ativo: boolean }[] = [
  { id: 'gerencial', nome: 'Visão gerencial', descricao: 'O que o prefeito vê para decidir: projetos prioritários, carteira, mapa, licitações, Kanban e Gantt.', ativo: true },
  { id: 'governanca', nome: 'Governança da execução', descricao: 'O trabalho da equipe: painel da equipe, cronogramas, onde está parado, inconsistências, pendências, reunião, sala de guerra e histórico.', ativo: true },
  { id: 'convenios', nome: 'Convênios', descricao: 'Captação e repasses: convênios em execução e em risco, CAUC, oportunidades e alertas.', ativo: true },
  { id: 'licitacoes', nome: 'Licitações', descricao: 'Demonstrativo: operação, planejamento, preços, automação, mercado e cadastros.', ativo: true },
  { id: 'conta', nome: 'Conta', descricao: 'Usuários, Fluxo do sistema, WhatsApp, relatórios, perfil e configurações.', ativo: true },
];

/** Telas de cada visão, na ordem do menu (slug '' = /plataforma/). Toda tela do catálogo fica em exatamente um lugar. */
export const ITENS_DA_VISAO: Record<Exclude<ModuloId, 'licitacoes'>, readonly string[]> = {
  gerencial: ['', 'projetos-carteira', 'gestao', 'gestao-licitacoes', 'projetos-kanban', 'projetos-gantt'],
  governanca: ['gestao-equipe', 'projetos', 'projetos-cronogramas', 'projetos-parado', 'gestao-inconsistencias', 'projetos-pendencias', 'projetos-reuniao', 'projetos-sala', 'projetos-log', 'gestao-alertas', 'projetos-sei'],
  convenios: ['convenios', 'captacao', 'captacao-acompanhamento', 'captacao-alertas', 'captacao-oportunidades', 'captacao-projetos', 'captacao-comparativo', 'captacao-qualidade'],
  conta: ['usuarios', 'projetos-fluxo', 'gestao-whatsapp', 'relatorios', 'perfil', 'configuracoes'],
};

/** O que sobra do catálogo vai para Licitações (demonstrativo), agrupado pelo grupo de origem. */
export const GRUPO_PARA_MODULO: Record<string, ModuloId> = {
  Operação: 'licitacoes',
  Planejamento: 'licitacoes',
  Preços: 'licitacoes',
  Automação: 'licitacoes',
  Mercado: 'licitacoes',
  Cadastros: 'licitacoes',
  Prazos: 'licitacoes',
};

/** Nome no menu quando difere do título do catálogo (o item '' de modules.json chama-se "Painel" desde o protótipo). */
export const TITULO_NO_MENU: Record<string, string> = { '': 'Projetos prioritários' };

/** Telas que o perfil precisa poder abrir para vê-las no menu (a própria página também confere e responde 403). */
export const PERMISSAO_DO_ITEM: Record<string, Acao> = {
  usuarios: 'gerenciar_usuarios',
  'gestao-equipe': 'editar_projeto',
  'gestao-inconsistencias': 'editar_projeto',
};

const textosGestao: Record<string, string> = {
  gerencial: 'Projetos prioritários, carteira, mapa, licitações, Kanban e Gantt',
  governanca: 'Cronogramas, onde está parado, inconsistências e pendências',
  convenios: 'Convênios em execução e em risco e regularidade no CAUC',
};

const tela = (slug: string, title: string, group: string, source: string) => ({
  slug, title, group, columns: [] as string[], rows: [] as (string | number)[][], fields: [] as string[], source,
});

export const NOVOS_MODULOS = [
  // Conteúdo de "Projetos · Início" montado a partir da carteira em src/lib/carteira/modulos.ts (montarInicio).
  tela('projetos', 'Projetos · Início', 'Projetos', 'govnexa-roteiro'),
  tela('projetos-fluxo', 'Fluxo do sistema', 'Projetos', 'govnexa-fluxo'),
  tela('projetos-novo', 'Novo projeto', 'Projetos', 'govnexa-cadastro'),
  tela('projetos-carteira', 'Carteira de projetos', 'Projetos', 'govnexa-carteira'),
  tela('projetos-localizacao', 'Obras sem localização', 'Projetos', 'govnexa-localizacao'),
  tela('projetos-kanban', 'Kanban por macroetapa', 'Projetos', 'govnexa-carteira'),
  tela('projetos-gantt', 'Gantt geral', 'Projetos', 'govnexa-carteira'),
  tela('projetos-cronogramas', 'Cronogramas', 'Projetos', 'govnexa-cronogramas'),
  tela('projetos-parado', 'Onde está parado', 'Projetos', 'govnexa-cronogramas'),
  tela('projetos-pendencias', 'Pendências de etapa', 'Projetos', 'govnexa-carteira'),
  tela('projetos-reuniao', 'Reunião semanal', 'Projetos', 'govnexa-reuniao'),
  tela('projetos-sala', 'Sala de guerra', 'Projetos', 'govnexa-sala'),
  tela('usuarios', 'Usuários', 'Conta', 'govnexa-usuarios'),
  tela('projetos-log', 'Histórico de alterações', 'Projetos', 'govnexa-log'),
  tela('projetos-sei', 'Processos no SEI', 'Projetos', 'govnexa-sei'),
  tela('licitacoes-detalhe', 'Licitação em detalhe', 'Operação', 'govnexa-licitacao'),
  tela('licitacoes-prazos', 'Prazos da Lei 14.133', 'Prazos', 'govnexa-prazos'),
  {
    ...tela('gestao', 'Mapa e painel', 'Gestão', 'govnexa-modulos'),
    columns: ['Visão', 'Situação', 'O que mostra'],
    rows: MODULOS.filter((m) => m.id in textosGestao).map((m) => [m.nome, 'Ativo', textosGestao[m.id]]),
  },
  tela('gestao-equipe', 'Painel da equipe', 'Gestão', 'govnexa-equipe'),
  tela('gestao-inconsistencias', 'Inconsistências de dados', 'Gestão', 'govnexa-inconsistencias'),
  tela('gestao-licitacoes', 'Gestão das licitações', 'Gestão', 'govnexa-licitacoes'),
  tela('gestao-whatsapp', 'WhatsApp', 'Gestão', 'govnexa-whatsapp'),
  tela('gestao-alertas', 'Alertas', 'Gestão', 'govnexa-alertas'),
  // E11: tela própria em src/pages/plataforma/convenios/ (o grupo Captação liga a tela ao Fluxo).
  tela('convenios', 'Visão Convênios', 'Captação', 'govnexa-convenios'),
];

/** Base seguida dos módulos novos. Cast único: a forma dos novos itens espelha a de modules.json (slug, title, group, columns, rows, fields, source). */
export function catalogoCompleto<T>(base: T[]): T[] {
  return [...base, ...(NOVOS_MODULOS as unknown as T[])];
}

/** Páginas que existem mas não aparecem no menu lateral (abertas por botão em outra tela). */
export const FORA_DO_MENU = ['projetos-novo', 'projetos-localizacao'];

/** Visão (módulo do menu) de uma tela; erro se a tela não tiver lugar. */
export function moduloDoItem(item: { group: string; slug?: string }): ModuloId {
  const slug = item.slug ?? '';
  for (const [id, slugs] of Object.entries(ITENS_DA_VISAO)) if (slugs.includes(slug)) return id as ModuloId;
  const destino = GRUPO_PARA_MODULO[item.group];
  if (!destino) throw new Error(`Tela sem lugar no menu: ${slug || '(início)'} (grupo ${item.group})`);
  return destino;
}

/** A tela aparece no menu para quem tem a permissão dela (sem regra = todos os perfis). */
export function itemVisivel(slug: string | undefined, pode: (acao: Acao) => boolean): boolean {
  const acao = PERMISSAO_DO_ITEM[slug ?? ''];
  return !acao || pode(acao);
}

/**
 * Menu lateral: uma entrada por visão, na ordem de MODULOS. As três visões e a Conta são listas simples, na ordem de
 * ITENS_DA_VISAO; Licitações mantém os grupos de origem (Operação, Planejamento...). `pode` esconde as telas que o perfil não abre.
 */
export function menuPorModulo<T extends { group: string; slug?: string; title?: string }>(lista: T[], pode?: (acao: Acao) => boolean) {
  const resultado: { id: ModuloId; nome: string; grupos: { grupo: string; itens: T[] }[] }[] = [];
  const doMenu = lista.filter((item) => !(item.slug !== undefined && FORA_DO_MENU.includes(item.slug)));
  for (const mod of MODULOS) {
    if (!mod.ativo) continue;
    const itens = doMenu
      .filter((item) => moduloDoItem(item) === mod.id)
      .filter((item) => !pode || itemVisivel(item.slug, pode))
      .map((item) => (TITULO_NO_MENU[item.slug ?? ''] !== undefined ? { ...item, title: TITULO_NO_MENU[item.slug ?? ''] } : item));
    const ordem = mod.id === 'licitacoes' ? null : ITENS_DA_VISAO[mod.id];
    const grupos: { grupo: string; itens: T[] }[] = [];
    if (ordem) {
      const ordenados = [...itens].sort((a, b) => ordem.indexOf(a.slug ?? '') - ordem.indexOf(b.slug ?? ''));
      if (ordenados.length) grupos.push({ grupo: mod.nome, itens: ordenados });
    } else {
      for (const item of itens) {
        let g = grupos.find((x) => x.grupo === item.group);
        if (!g) grupos.push((g = { grupo: item.group, itens: [] }));
        g.itens.push(item);
      }
    }
    if (grupos.length) resultado.push({ id: mod.id, nome: mod.nome, grupos });
  }
  return resultado;
}
