// CSV do painel Responsáveis (E13). GET sob /plataforma/ (login do middleware), só leitura.
import type { APIRoute } from 'astro';
import { carregarCarteira } from '../../../lib/carteira/carga.ts';
import { carregarCronogramas } from '../../../lib/cronograma/carga.ts';
import { montarPainel, nomeArquivoCsvResponsaveis, paraCsvResponsaveis } from '../../../lib/cronograma/painel-responsaveis.ts';
import { usuarioPode } from '../../../lib/usuarios/index.ts';
import { hojeEmBrasilia } from '../../../lib/datas.ts';

export const prerender = false;
const SEM_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = ({ locals, url }) => {
  if (!usuarioPode(locals.usuario, 'ver')) {
    return new Response('Sem permissão.', { status: 403, headers: { ...SEM_CACHE, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const hoje = hojeEmBrasilia();
  const nomes = new Map(carregarCarteira().projetos.map((p) => [p.id, p.nome]));
  const painel = montarPainel(carregarCronogramas().cronogramas, hoje, nomes, url.searchParams);
  // A marca inicial (BOM) faz o Excel abrir o arquivo em UTF-8; o código-fonte continua sem BOM.
  return new Response(`\uFEFF${paraCsvResponsaveis(painel.lista)}`, {
    headers: {
      ...SEM_CACHE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivoCsvResponsaveis(hoje)}"`,
    },
  });
};
