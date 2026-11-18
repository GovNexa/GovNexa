export const prerender = false;
// POST /plataforma/projeto/criar/ — cadastra um projeto novo (entrega B2). Protegido pelo login da plataforma.
// Ordem: origem, perfil, formato, limite de requisições e tamanho ANTES de ler o corpo. A prefeitura e o autor vêm da sessão.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { LIMITE_CORPO_CADASTRO, cadastrarProjeto, podeCadastrar } from '../../../lib/carteira/cadastro.ts';
import { mesmaOrigem } from '../../../lib/documentos/http.ts';
import { dentroDoLimite, limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';

const json = (status: number, corpo: Record<string, unknown>): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Pedido recusado pelo tamanho: joga fora o que chegou (até 1 MB, sem guardar) para a conexão fechar limpa antes da resposta. Só roda depois do limite de requisições. */
async function descartar(request: Request, max = 1_048_576): Promise<void> {
  try {
    const leitor = request.body?.getReader();
    if (!leitor) return;
    for (let lidos = 0; lidos < max;) {
      const { done, value } = await leitor.read();
      if (done) return;
      lidos += value.byteLength;
    }
    await leitor.cancel();
  } catch { /* conexão já encerrada: nada a fazer */ }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio };
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  const pode = podeCadastrar(contexto);
  if (!pode.ok) return json(pode.status, { ok: false, erro: pode.erro });
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  if (!(await dentroDoLimite(limitadorDoAmbiente(env), contexto.repositorio.prefeituraId, contexto.usuario.email))) return json(429, { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.' });
  const cabecalhoTamanho = request.headers.get('content-length');
  const tamanho = Number(cabecalhoTamanho);
  if (cabecalhoTamanho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_CADASTRO) {
    await descartar(request);
    return json(413, { ok: false, erro: 'Cadastro grande demais.' });
  }
  const texto = await request.text().catch(() => '');
  if (texto.length > LIMITE_CORPO_CADASTRO) return json(413, { ok: false, erro: 'Cadastro grande demais.' });
  let corpo: unknown = null;
  try { corpo = JSON.parse(texto); } catch { return json(400, { ok: false, erro: 'Cadastro inválido.' }); }
  const r = await cadastrarProjeto(contexto, corpo);
  if (!r.ok) return json(r.status, { ok: false, erro: r.erro, ...(r.erros ? { erros: r.erros } : {}) });
  return json(201, { ok: true, projeto: r.projeto, pendencias: r.pendencias, avisos: r.avisos });
};
