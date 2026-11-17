import { defineMiddleware } from 'astro:middleware';
import { atender, resposta, type Env } from '../worker/index.ts';
import { contextoDados } from './lib/repositorio/contexto.ts';
import { lerComCache } from './lib/repositorio/cache.ts';
export const onRequest = defineMiddleware(async (context, next) => {
 if (context.isPrerendered) return next();
 const { env } = await import('cloudflare:workers');
 return atender(context.request, env as unknown as Env, async (usuario, repositorio) => {
  if (!usuario || !repositorio) return next();
  context.locals.usuario = usuario;
  context.locals.repositorio = repositorio;
  try {
  // Leitura do banco com cache curto por prefeitura (ver src/lib/repositorio/cache.ts): só o 1º acesso de cada 30 s lê e decodifica.
  const dados = await lerComCache(repositorio.prefeituraId ?? usuario.prefeitura_id, async () => {
   const [projetos, cronogramas, registros] = await Promise.all([
    repositorio.listarProjetos(), repositorio.listarCronogramas(), repositorio.listarHistorico()
   ]);
   const fonte = {arquivo:'D1', hash:'', importado_em:'', ficticio:false};
   return {
    carteira:{prefeitura_id:usuario.prefeitura_id,fonte,projetos},
    cronogramas:{prefeitura_id:usuario.prefeitura_id,fonte,cronogramas},
    historico:{registros}
   };
  });
  return await contextoDados.run(dados, next);
  } catch { return resposta(503, 'Serviço indisponível'); }
 });
});
