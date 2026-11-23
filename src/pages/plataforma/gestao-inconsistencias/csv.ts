// CSV do relatório de inconsistências (E10). GET sob /plataforma/ (login do middleware), só para a equipe e só leitura.
import type { APIRoute } from 'astro';
import { podeVerEquipe } from '../../../lib/gestao/equipe.ts';
import { nomeArquivoCsv, paraCsvInconsistencias } from '../../../lib/gestao/inconsistencias.ts';
import { relatorioDaRequisicao } from '../../../lib/gestao/inconsistencias-carga.ts';

export const prerender = false;
const SEM_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = async ({ locals, url }) => {
  if (!podeVerEquipe(locals.usuario)) {
    return new Response('Sem permissão.', { status: 403, headers: { ...SEM_CACHE, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const tela = await relatorioDaRequisicao(locals.repositorio, url.searchParams);
  // A marca inicial (BOM) faz o Excel abrir o arquivo em UTF-8; o código-fonte continua sem BOM.
  return new Response(`\uFEFF${paraCsvInconsistencias(tela.relatorio.itens)}`, {
    headers: {
      ...SEM_CACHE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivoCsv(tela.hoje)}"`,
    },
  });
};
