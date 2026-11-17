export const prerender = false;
// POST /plataforma/projeto/localizacao/<id>/ — grava a localização do projeto (ponto ou ruas e trechos). Protegido pelo login da plataforma.
// Ordem: origem, perfil, tamanho e limite ANTES de ler o corpo. A prefeitura vem da sessão; o projeto é conferido no banco.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { mesmaOrigem } from '../../../../lib/documentos/http.ts';
import { LIMITE_CORPO_LOCALIZACAO, podeEditarLocalizacao, salvarLocalizacao } from '../../../../lib/mapa/servico.ts';
import { dentroDoLimite, limitadorDoAmbiente } from '../../../../lib/seguranca/limite.ts';

const json = (status: number, corpo: Record<string, unknown>): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Pedido recusado pelo tamanho: joga fora o que chegou (até 1 MB, sem guardar) para a conexão fechar limpa antes da resposta. */
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

export const POST: APIRoute = async ({ request, params, locals }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio };
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  const pode = podeEditarLocalizacao(contexto);
  if (!pode.ok) return json(pode.status, { ok: false, erro: pode.erro });
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  const cabecalhoTamanho = request.headers.get('content-length');
  const tamanho = Number(cabecalhoTamanho);
  if (cabecalhoTamanho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_LOCALIZACAO) {
    await descartar(request);
    return json(413, { ok: false, erro: 'Localização grande demais.' });
  }
  if (!(await dentroDoLimite(limitadorDoAmbiente(env), contexto.repositorio.prefeituraId, contexto.usuario.email))) return json(429, { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.' });
  const texto = await request.text().catch(() => '');
  if (texto.length > LIMITE_CORPO_LOCALIZACAO) return json(413, { ok: false, erro: 'Localização grande demais.' });
  let corpo: unknown = null;
  try { corpo = JSON.parse(texto); } catch { return json(400, { ok: false, erro: 'Localização inválida.' }); }
  const r = await salvarLocalizacao(contexto, String(params.id ?? ''), corpo);
  if (!r.ok) return json(r.status, { ok: false, erro: r.erro, ...(r.erros ? { erros: r.erros } : {}) });
  return json(200, { ok: true, mudou: r.mudou, localizacao: r.localizacao });
};
