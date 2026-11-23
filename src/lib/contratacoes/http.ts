// Entrada HTTP das gravações da Gestão das licitações (E12). Ordem: origem, perfil, formato, limite de requisições e tamanho
// ANTES de ler o corpo. A prefeitura e o autor vêm da sessão.
import { mesmaOrigem } from '../documentos/http.ts';
import { dentroDoLimite, type Limitador } from '../seguranca/limite.ts';
import { executarAcao, podeGravarContratacao, type ContextoContratacao } from './servico.ts';
import { LIMITE_CORPO_CONTRATACAO } from './regras.ts';

const json = (status: number, corpo: Record<string, unknown>): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Pedido recusado pelo tamanho: joga fora o que chegou (até 1 MB, sem guardar) para a conexão fechar limpa antes da resposta. Só roda depois do limite de requisições. */
export async function descartar(request: Request, max = 1_048_576): Promise<void> {
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

export async function atenderGravacao(request: Request, c: ContextoContratacao, limitador: Limitador): Promise<Response> {
  if (!mesmaOrigem(request)) return json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' });
  const pode = podeGravarContratacao(c);
  if (!pode.ok) return json(pode.status, { ok: false, erro: pode.erro });
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { ok: false, erro: 'Formato do pedido inválido.' });
  if (!(await dentroDoLimite(limitador, c.repositorio.prefeituraId, c.usuario!.email))) return json(429, { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.' });
  const cabecalhoTamanho = request.headers.get('content-length');
  const tamanho = Number(cabecalhoTamanho);
  if (cabecalhoTamanho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_CONTRATACAO) {
    await descartar(request);
    return json(413, { ok: false, erro: 'Pedido grande demais.' });
  }
  const texto = await request.text().catch(() => '');
  if (new TextEncoder().encode(texto).byteLength > LIMITE_CORPO_CONTRATACAO) return json(413, { ok: false, erro: 'Pedido grande demais.' });
  let corpo: unknown = null;
  try { corpo = JSON.parse(texto); } catch { return json(400, { ok: false, erro: 'Pedido inválido.' }); }
  const r = await executarAcao(c, corpo);
  if (!r.ok) return json(r.status, { ok: false, erro: r.erro, ...(r.erros ? { erros: r.erros } : {}) });
  return json(200, { ok: true, id: r.id, revisao: r.revisao, mudou: r.mudou, avisos: r.avisos });
}
