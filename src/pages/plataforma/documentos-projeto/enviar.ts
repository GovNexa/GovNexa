export const prerender = false;
// POST /plataforma/documentos-projeto/enviar/ — envia um arquivo para um projeto. Protegido pelo Cloudflare Access (rota sob /plataforma/).
// Ordem de conferência: origem, perfil e tamanho ANTES de abrir o formulário (o projeto vem no corpo e é conferido depois) (assim quem não pode não gasta memória do Worker).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { enviarDocumento, podeEnviar, type BucketR2 } from '../../../lib/documentos/servico.ts';
import { ID_PROJETO, LIMITE_BYTES } from '../../../lib/documentos/regras.ts';
import { codigoDe } from '../../../lib/documentos/mensagens.ts';
import { mesmaOrigem } from '../../../lib/documentos/http.ts';
import { dentroDoLimite, limitadorDoAmbiente } from '../../../lib/seguranca/limite.ts';

const BASE = '/plataforma/documentos-projeto/';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS };
  if (!mesmaOrigem(request)) return redirect(`${BASE}?r=origem`, 303);
  const pode = podeEnviar(contexto);
  if (!pode.ok) return redirect(`${BASE}?r=${codigoDe(pode)}`, 303);
  const tamanho = Number(request.headers.get('content-length'));
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > LIMITE_BYTES + 1024 * 1024) return redirect(`${BASE}?r=tamanho`, 303);
  if (!(await dentroDoLimite(limitadorDoAmbiente(env), contexto.repositorio.prefeituraId, contexto.usuario.email))) return redirect(`${BASE}?r=limite`, 303);
  let form: FormData;
  try { form = await request.formData(); } catch { return redirect(`${BASE}?r=vazio`, 303); }
  const projeto = String(form.get('projeto') ?? '');
  if (!ID_PROJETO.test(projeto)) return redirect(`${BASE}?r=projeto`, 303);
  const destino = (r: string) => `${BASE}projeto/${encodeURIComponent(projeto)}/?r=${r}`;
  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return redirect(destino('vazio'), 303);
  if (arquivo.size > LIMITE_BYTES) return redirect(destino('tamanho'), 303);
  const r = await enviarDocumento(contexto, projeto, arquivo.name, arquivo);
  return redirect(destino(r.ok ? 'ok' : codigoDe(r)), 303);
};
