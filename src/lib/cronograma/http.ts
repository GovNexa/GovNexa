// Atendimento HTTP da gravação e da criação de cronograma (E13). Testável sem `cloudflare:workers`.
// Ordem (igual a projeto/editar/[id].ts): origem, perfil, formato, limite de requisições e tamanho ANTES de ler o corpo.
import { mesmaOrigem } from '../documentos/http.ts';
import { dentroDoLimite, type Limitador } from '../seguranca/limite.ts';
import { criarCronograma, gravarCronograma, LIMITE_CORPO_CRONOGRAMA, podeEditarCronograma, type ContextoCronograma } from './edicao.ts';
import { urlCronograma, voltaCronograma } from './navegacao.ts';

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

/** Confere tudo antes do serviço e devolve o corpo já lido, ou a resposta de recusa. */
async function lerPedido(request: Request, c: ContextoCronograma, limitador: Limitador): Promise<{ corpo: unknown } | { resposta: Response }> {
  if (!mesmaOrigem(request)) return { resposta: json(403, { ok: false, erro: 'Pedido recusado: origem diferente do site.' }) };
  const pode = podeEditarCronograma(c);
  if (!pode.ok) return { resposta: json(pode.status, { ok: false, erro: pode.erro }) };
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return { resposta: json(415, { ok: false, erro: 'Formato do pedido inválido.' }) };
  if (!(await dentroDoLimite(limitador, c.repositorio.prefeituraId, c.usuario.email))) return { resposta: json(429, { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.' }) };
  const cabecalhoTamanho = request.headers.get('content-length');
  const tamanho = Number(cabecalhoTamanho);
  if (cabecalhoTamanho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > LIMITE_CORPO_CRONOGRAMA) {
    await descartar(request);
    return { resposta: json(413, { ok: false, erro: 'Pedido grande demais.' }) };
  }
  const texto = await request.text().catch(() => '');
  if (new TextEncoder().encode(texto).byteLength > LIMITE_CORPO_CRONOGRAMA) return { resposta: json(413, { ok: false, erro: 'Pedido grande demais.' }) };
  try { return { corpo: JSON.parse(texto) }; } catch { return { resposta: json(400, { ok: false, erro: 'Pedido inválido.' }) }; }
}

export async function atenderGravacao(request: Request, contexto: ContextoCronograma, limitador: Limitador, cronogramaId: string): Promise<Response> {
  const p = await lerPedido(request, contexto, limitador);
  if ('resposta' in p) return p.resposta;
  const r = await gravarCronograma(contexto, cronogramaId, p.corpo);
  if (!r.ok) return json(r.status, { ok: false, erro: r.erro, ...(r.erros ? { erros: r.erros } : {}) });
  return json(200, { ok: true, mudou: r.mudou, revisao: r.revisao, ...(r.tarefa_id ? { tarefa_id: r.tarefa_id } : {}) });
}

export async function atenderCriacao(request: Request, contexto: ContextoCronograma, limitador: Limitador): Promise<Response> {
  const p = await lerPedido(request, contexto, limitador);
  if ('resposta' in p) return p.resposta;
  const r = await criarCronograma(contexto, p.corpo);
  if (!r.ok) return json(r.status, { ok: false, erro: r.erro, ...(r.erros ? { erros: r.erros } : {}), ...(r.existente ? { existente: r.existente } : {}) });
  const volta = (p.corpo as { volta?: unknown } | null)?.volta;
  const url = urlCronograma(r.id, { aba: 'tarefas', volta: voltaCronograma(typeof volta === 'string' ? volta : null, new URL(request.url).origin) });
  return json(200, { ok: true, id: r.id, url });
}
