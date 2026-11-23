// Mapa de impacto: quais partes do código cada etapa do Fluxo usa.
// Serve para (1) saber quais etapas uma mudança afeta, (2) lembrar de atualizar o Fluxo e (3) escolher os testes a conferir.
// Padrões no estilo glob simples: '**' = qualquer caminho; '*' = qualquer nome dentro da pasta.

/** Partes usadas por TODAS as telas: mudança aqui afeta o sistema inteiro. */
export const TRANSVERSAL = [
  'src/layouts/**', 'src/styles/**', 'src/components/DataTable.astro', 'src/components/Icon.astro',
  'src/lib/govnexa/catalogo.ts', 'src/lib/marca.ts', 'src/lib/municipio-ativo.ts', 'src/pages/plataforma/[...module].astro',
  'worker/**', 'wrangler.jsonc', 'public/_headers', 'astro.config.*', 'package.json',
  'src/middleware.ts', 'src/lib/repositorio/cache.ts', // lê o banco e entrega os dados a todas as telas da plataforma
  'src/lib/navegacao/**', 'src/components/navegacao/**', // volta à tela de origem (E15): todas as telas
  'src/lib/usuarios/**', 'src/pages/plataforma/usuarios/**', // acesso e perfis valem para o sistema inteiro
  'scripts/db-local.mjs', // banco local de exemplo, usado pelos testes de interface
];

/** Mapa das obras e localização: pertence ao Painel do prefeito (mapa) e ao Cadastro do projeto (editor de localização). */
const MAPA = ['src/lib/mapa/**', 'src/components/mapa/**', 'src/styles/mapa.css', 'scripts/geocodificar-bairros.ts', 'src/pages/plataforma/localizacao/**'];

/** Etapa do mapa geral (id de fluxo.ts) → partes do código. */
export const COMPONENTES: Record<string, string[]> = {
  acesso: ['src/lib/login/**', 'src/pages/entrar**', 'db/d1/central/**'],
  inicio: ['src/lib/carteira/modulos.ts', 'src/lib/carteira/visoes.ts', 'src/lib/carteira/lista.ts', 'src/components/carteira/CarteiraProjetos.astro', 'src/styles/carteira-lista.css'],
  planilha: ['src/lib/carteira/area.ts', 'scripts/importar-carteira.ts', 'scripts/importar-cronogramas.ts', 'scripts/importar-planilhas.ts', 'scripts/gerar-sql-carga.ts', 'scripts/lib/**', 'src/lib/carteira/carga.ts', 'src/lib/cronograma/carga.ts'],
  cadastro: ['src/lib/carteira/area.ts', 'src/lib/carteira/edicao.ts', 'src/lib/carteira/formulario.ts', 'src/components/carteira/CamposProjeto.astro', 'src/components/carteira/EditarProjeto.astro', 'src/components/carteira/NovoProjeto.astro', 'src/lib/carteira/movimentacao.ts', 'src/lib/carteira/cadastro.ts', 'src/lib/carteira/tipos.ts', 'src/lib/repositorio/**', 'db/migracoes/**', 'db/d1/**', 'src/lib/documentos/**', 'src/pages/plataforma/documentos-projeto/**', 'src/lib/fotos/**', 'src/pages/plataforma/fotos-projeto/**', 'src/styles/fotos.css', 'src/pages/plataforma/projeto/**', 'src/pages/plataforma/projetos-localizacao/**', 'src/lib/carteira/ficha.ts', 'src/lib/carteira/ficha-dados.ts', 'src/components/carteira/ficha/**', 'src/lib/seguranca/**', ...MAPA],
  estruturacao: ['src/lib/carteira/macroetapas.ts', 'src/scripts/painel-detalhes.ts', 'src/components/carteira/Kanban.astro', 'src/lib/carteira/modulos.ts', 'src/lib/carteira/kanban.ts', 'src/styles/kanban.css'],
  precisaRecurso: ['src/lib/carteira/visoes.ts'],
  fontesFederais: ['coletores/**', 'src/lib/dados/**', '.github/workflows/atualizar-dados*.yml'],
  casamento: ['src/lib/dados/captacao.ts', 'src/lib/carteira/modulos.ts'],
  oportunidade: ['src/lib/dados/captacao.ts', 'src/lib/dados/detalhes.ts', 'src/lib/projetos/**'],
  convenio: ['src/lib/dados/captacao.ts', 'src/lib/dados/detalhes-convenio.ts', 'src/lib/convenios/**', 'src/pages/plataforma/convenios/**', 'src/styles/convenios.css', 'src/lib/alertas/central.ts'],
  clausula: ['src/lib/dados/alertas.ts'],
  planejamento: ['src/lib/cronograma/**', 'src/components/cronograma/**', 'src/pages/plataforma/cronograma/**', 'db/d1/prefeitura/0009_*', 'db/d1/prefeitura/0012_*', 'src/components/carteira/Gantt.astro', 'src/components/carteira/FiltrosProjetos.astro', 'src/lib/carteira/filtros.ts'],
  portao: ['src/lib/carteira/movimentacao.ts', 'src/lib/carteira/simulacao.ts', 'src/components/carteira/PendenciasEtapa.astro', 'src/lib/carteira/mover.ts', 'src/lib/carteira/mover-cliente.ts', 'src/pages/plataforma/projeto/mover/**'],
  preparatorio: ['src/lib/carteira/macroetapas.ts', 'src/lib/cronograma/**'],
  juridico: ['src/lib/cronograma/visoes.ts', 'src/components/cronograma/Parado.astro'],
  sei: ['scripts/importar-cronogramas.ts', 'scripts/sei-ler.ts', 'src/lib/sei/**', 'src/components/sei/**'],
  publicacao: ['src/data/modules.json', 'src/lib/licitacao/**', 'src/components/licitacao/**', 'src/lib/prazos/**', 'src/components/prazos/**', 'data/config/feriados.json', 'data/config/prazos-internos.json', 'src/lib/contratacoes/**', 'src/pages/plataforma/gestao-licitacoes/**', 'src/scripts/contratacoes.ts', 'src/styles/contratacoes.css', 'db/d1/prefeitura/0010_*'],
  pncp: ['src/lib/pncp/**', 'src/components/licitacao/DadosPncp.astro', 'src/pages/plataforma/gestao-licitacoes/pncp.ts', 'src/pages/plataforma/gestao-licitacoes/secretarias/**', 'src/scripts/pncp.ts', 'data/exemplo/pncp/**', 'db/d1/prefeitura/0011_*'],
  julgamento: ['src/data/modules.json', 'src/lib/licitacao/**', 'src/components/licitacao/**', 'src/lib/contratacoes/**', 'src/pages/plataforma/gestao-licitacoes/**', 'src/scripts/contratacoes.ts', 'src/styles/contratacoes.css', 'db/d1/prefeitura/0010_*', 'src/lib/pncp/**', 'db/d1/prefeitura/0011_*'],
  habilitado: ['src/data/modules.json'],
  homologacao: ['src/data/modules.json', 'src/lib/licitacao/**', 'src/components/licitacao/**', 'src/lib/prazos/**', 'src/components/prazos/**', 'data/config/feriados.json', 'data/config/prazos-internos.json', 'src/lib/contratacoes/**', 'src/pages/plataforma/gestao-licitacoes/**', 'src/scripts/contratacoes.ts', 'src/styles/contratacoes.css', 'db/d1/prefeitura/0010_*', 'src/lib/pncp/**', 'db/d1/prefeitura/0011_*'],
  mobilizacao: ['src/lib/carteira/macroetapas.ts', 'src/components/carteira/Kanban.astro'],
  execucao: ['src/lib/carteira/macroetapas.ts', 'src/components/carteira/Gantt.astro', 'src/components/carteira/FiltrosProjetos.astro', 'src/lib/carteira/filtros.ts'],
  conclusao: ['src/lib/carteira/macroetapas.ts'],
  fim: ['src/lib/log/**'],
  reuniao: ['src/lib/reuniao/**', 'src/components/reuniao/**'],
  movimentacao: ['src/lib/carteira/movimentacao.ts', 'src/lib/carteira/simulacao.ts', 'src/components/carteira/Kanban.astro', 'src/components/carteira/PendenciasEtapa.astro', 'src/lib/carteira/kanban.ts', 'src/lib/carteira/mover.ts', 'src/lib/carteira/mover-cliente.ts', 'src/pages/plataforma/projeto/mover/**', 'src/styles/kanban.css'],
  alertas: ['src/lib/alertas/**', 'src/components/alertas/**', 'src/lib/dados/alertas.ts', 'src/lib/carteira/visoes.ts', 'src/lib/cronograma/visoes.ts', 'src/lib/dados/qualidade.ts', 'src/lib/prazos/**', 'src/components/prazos/**', 'data/config/feriados.json', 'data/config/prazos-internos.json'],
  parado: ['src/lib/cronograma/visoes.ts', 'src/lib/cronograma/dependencias.ts', 'src/components/cronograma/Parado.astro', 'src/lib/cronograma/responsaveis.ts', 'src/lib/cronograma/painel-responsaveis.ts', 'src/pages/plataforma/gestao-responsaveis/**', 'src/styles/responsaveis.css'],
  sala: ['src/lib/sala/**', 'src/components/sala/**', 'src/pages/plataforma/sala-de-guerra/**'],
  painel: ['src/components/carteira/VisaoOrgaos.astro', 'src/lib/govnexa/catalogo.ts', 'src/lib/gestao/**', 'src/components/gestao/**', 'src/pages/plataforma/index.astro', 'src/styles/prioritarios.css', 'src/pages/plataforma/gestao-licitacoes/**', ...MAPA],
  log: ['src/lib/log/**', 'src/components/log/**', 'db/migracoes/002_*'],
  equipe: ['src/lib/gestao/equipe.ts', 'src/lib/gestao/inconsistencias*.ts', 'src/lib/gestao/dashboard.ts', 'src/components/dashboard/**', 'src/styles/dashboard.css', 'src/styles/inconsistencias.css', 'src/pages/plataforma/gestao-equipe/**', 'src/pages/plataforma/gestao-inconsistencias/**', 'src/lib/alertas/central.ts'],
  whatsapp: ['src/lib/whatsapp/**', 'src/components/whatsapp/**', 'src/lib/gestao/painel.ts', 'src/lib/carteira/visoes.ts'],
};

/** O próprio mapa: mudar estes arquivos é mudar o Fluxo (sem exigir outra atualização). */
export const ARQUIVOS_DO_FLUXO = ['src/lib/govnexa/fluxo.ts', 'src/lib/govnexa/subfluxos.ts', 'src/lib/govnexa/impacto.ts', 'src/components/fluxo/**', 'src/pages/plataforma/fluxo/**'];

const paraRegex = (padrao: string): RegExp =>
  new RegExp('^' + padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
export const casa = (arquivo: string, padrao: string): boolean => paraRegex(padrao).test(arquivo.replace(/\\/g, '/'));

/** Para uma lista de arquivos alterados: etapas afetadas, se é transversal, se o Fluxo foi atualizado e o que ficou sem mapa. */
export function etapasAfetadas(arquivos: string[]): { etapas: string[]; transversal: string[]; fluxoAtualizado: boolean; semMapa: string[] } {
  const etapas = new Set<string>();
  const transversal: string[] = [];
  const semMapa: string[] = [];
  let fluxoAtualizado = false;
  for (const a of arquivos) {
    const arq = a.replace(/\\/g, '/');
    if (ARQUIVOS_DO_FLUXO.some((p) => casa(arq, p))) { fluxoAtualizado = true; continue; }
    if (TRANSVERSAL.some((p) => casa(arq, p))) { transversal.push(arq); continue; }
    let achou = false;
    for (const [etapa, padroes] of Object.entries(COMPONENTES)) if (padroes.some((p) => casa(arq, p))) { etapas.add(etapa); achou = true; }
    if (!achou && /^(src|scripts|db|coletores)\//.test(arq)) semMapa.push(arq);
  }
  return { etapas: [...etapas].sort(), transversal, fluxoAtualizado, semMapa };
}
