export const prerender = false;
// GET /plataforma/cronograma/recursos-csv/<id>/ — CSV de envolvidos e recursos do cronograma (E20). Só leitura, sob o login da plataforma.
import type { APIRoute } from 'astro';
import { ID_CRONOGRAMA } from '../../../../lib/cronograma/edicao.ts';
import { nomeArquivoCsvRecursos, paraCsvRecursos } from '../../../../lib/cronograma/recursos-csv.ts';
import { usuarioPode } from '../../../../lib/usuarios/index.ts';
import { hojeEmBrasilia } from '../../../../lib/whatsapp/farol.ts';

const SEM_CACHE = { 'Cache-Control': 'private, no-store' };
const texto = (status: number, corpo: string): Response => new Response(corpo, { status, headers: { ...SEM_CACHE, 'Content-Type': 'text/plain; charset=utf-8' } });

export const GET: APIRoute = async ({ locals, params }) => {
  if (!usuarioPode(locals.usuario, 'ver')) return texto(403, 'Sem permissão.');
  const id = String(params.id ?? '');
  if (!ID_CRONOGRAMA.test(id)) return texto(404, 'Cronograma não encontrado.');
  const repo = locals.repositorio;
  if (!repo?.obterCronograma || !repo.listarItensCronograma) return texto(404, 'Envolvidos e recursos indisponíveis neste ambiente.');
  const achado = await repo.obterCronograma(id);
  if (!achado) return texto(404, 'Cronograma não encontrado.');
  const itens = await repo.listarItensCronograma(id);
  // A marca inicial (BOM) faz o Excel abrir o arquivo em UTF-8; o código-fonte continua sem BOM.
  return new Response(`﻿${paraCsvRecursos(achado.cronograma, itens)}`, {
    headers: {
      ...SEM_CACHE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivoCsvRecursos(id, hojeEmBrasilia())}"`,
    },
  });
};
