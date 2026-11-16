import { defineMiddleware } from 'astro:middleware';
import { atender, resposta, type Env } from '../worker/index.ts';
import { contextoDados } from './lib/repositorio/contexto.ts';
export const onRequest = defineMiddleware(async (context, next) => {
 if (context.isPrerendered) return next();
 const { env } = await import('cloudflare:workers');
 return atender(context.request, env as unknown as Env, async (usuario, repositorio) => {
  if (!usuario || !repositorio) return next();
  context.locals.usuario = usuario;
  context.locals.repositorio = repositorio;
  try {
  const [projetos, cronogramas, registros] = await Promise.all([
   repositorio.listarProjetos(), repositorio.listarCronogramas(), repositorio.listarHistorico()
  ]);
  const fonte = {arquivo:'D1', hash:'', importado_em:'', ficticio:false};
  return await contextoDados.run({
   carteira:{prefeitura_id:usuario.prefeitura_id,fonte,projetos},
   cronogramas:{prefeitura_id:usuario.prefeitura_id,fonte,cronogramas},
   historico:{registros}
  }, next);
  } catch { return resposta(503, 'Serviço indisponível'); }
 });
});
