export const prerender = false;
// POST /plataforma/fotos-projeto/remover/<id>/?projeto=<id>&volta=<tela> — remoção lógica da foto (o arquivo continua guardado). E9.
// O formulário não leva campos: corpo grande é abuso e não é lido.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { BucketR2 } from '../../../../lib/documentos/servico.ts';
import { mesmaOrigem } from '../../../../lib/documentos/http.ts';
import { podeGerirFotos, removerFoto } from '../../../../lib/fotos/servico.ts';
import { destinoFotos } from '../../../../lib/fotos/mensagens.ts';
import { dentroDoLimite, limitadorDoAmbiente } from '../../../../lib/seguranca/limite.ts';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const contexto = { usuario: locals.usuario, repositorio: locals.repositorio, bucket: (env as unknown as { DOCUMENTOS?: BucketR2 }).DOCUMENTOS };
  const url = new URL(request.url);
  const destino = (codigo: Parameters<typeof destinoFotos>[3]) => destinoFotos(url.searchParams.get('projeto'), url.searchParams.get('volta'), url.origin, codigo);
  if (!mesmaOrigem(request)) return redirect(destino('origem'), 303);
  const pode = podeGerirFotos(contexto);
  if (!pode.ok) return redirect(destino(pode.codigo), 303);
  const cabecalhoTamanho = request.headers.get('content-length');
  const tamanho = Number(cabecalhoTamanho);
  if (cabecalhoTamanho === null || !Number.isFinite(tamanho) || tamanho < 0 || tamanho > 1024) return redirect(destino('tamanho'), 303);
  if (!(await dentroDoLimite(limitadorDoAmbiente(env), contexto.repositorio.prefeituraId, contexto.usuario.email))) return redirect(destino('limite'), 303);
  const r = await removerFoto(contexto, String(params.id ?? ''));
  return redirect(destino(r.ok ? 'removida' : r.codigo), 303);
};
