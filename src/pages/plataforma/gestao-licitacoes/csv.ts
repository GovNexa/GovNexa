// CSV da Gestão das licitações (E12). GET sob /plataforma/ (login do middleware); todos os perfis veem a tela, então todos baixam.
import type { APIRoute } from 'astro';
import { lerFiltros, montarPainel, nomeArquivoCsvLicitacoes, paraCsvContratacoes } from '../../../lib/contratacoes/painel.ts';
import { hojeBrasilia } from '../../../lib/contratacoes/regras.ts';

export const prerender = false;
const SEM_CACHE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export const GET: APIRoute = async ({ locals, url }) => {
  const repo = locals.repositorio.contratacoes;
  if (!repo) return new Response('Indisponível.', { status: 503, headers: { ...SEM_CACHE, 'Content-Type': 'text/plain; charset=utf-8' } });
  const lista = await repo.listar();
  const pendentes = await repo.listarMarcosPendentes(200);
  const datasPendentes = await repo.datasMarcosPendentes();
  const orgaos = [...new Set(lista.map((c) => c.orgao).filter((o): o is string => !!o))];
  const { filtros } = lerFiltros(url.searchParams, orgaos);
  const hoje = hojeBrasilia();
  const painel = montarPainel(lista, pendentes, filtros, hoje, datasPendentes);
  // A marca inicial (BOM) faz o Excel abrir o arquivo em UTF-8; o código-fonte continua sem BOM.
  return new Response(`\uFEFF${paraCsvContratacoes(painel.filtradas)}`, {
    headers: {
      ...SEM_CACHE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivoCsvLicitacoes(hoje)}"`,
    },
  });
};
