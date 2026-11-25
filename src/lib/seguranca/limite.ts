// Limite de requisições por pessoa (entrega 1.0). Chave sempre prefeitura + usuário: nunca global, nunca só por IP.
// Produção: ligação `LIMITE_API` (Rate Limiting da Cloudflare, wrangler.jsonc). Testes: versão em memória com relógio injetável.
// Falha da ligação = recusa (fail-closed): só rotas de gravação usam o limite, e recusar por um instante custa menos que gravar sem freio.

export interface Limitador { permitir(chave: string): Promise<boolean>; }

/** Precisa ser igual a `ratelimits[LIMITE_API].simple` no wrangler.jsonc (um teste confere). */
export const LIMITE_POR_MINUTO = 30;
export const JANELA_MS = 60_000;
const MAX_CHAVES = 10_000;

/** Chave do limite: `<prefeitura>:<e-mail normalizado>`; null quando falta prefeitura válida ou e-mail. */
export function chaveLimite(prefeituraId: unknown, email: unknown): string | null {
  if (typeof prefeituraId !== 'number' || !Number.isInteger(prefeituraId) || prefeituraId <= 0) return null;
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!e || e.length > 254) return null;
  return `${prefeituraId}:${e}`;
}

/** Confere o limite da pessoa. Sem chave válida, recusa sem contar; erro do limitador também recusa. */
export async function dentroDoLimite(limitador: Limitador, prefeituraId: unknown, email: unknown): Promise<boolean> {
  const chave = chaveLimite(prefeituraId, email);
  if (!chave) return false;
  try { return (await limitador.permitir(chave)) === true; } catch { return false; }
}

/** Janela fixa de 1 minuto (como a Cloudflare). Só para testes e desenvolvimento. */
export function criarLimitadorMemoria(opcoes: { limite?: number; janelaMs?: number; agora?: () => number } = {}): Limitador {
  const limite = opcoes.limite ?? LIMITE_POR_MINUTO;
  const janelaMs = opcoes.janelaMs ?? JANELA_MS;
  const agora = opcoes.agora ?? Date.now;
  const contagens = new Map<string, { janela: number; n: number }>();
  return {
    async permitir(chave) {
      const janela = Math.floor(agora() / janelaMs);
      if (contagens.size >= MAX_CHAVES) {
        for (const [k, v] of contagens) if (v.janela !== janela) contagens.delete(k);
        if (contagens.size >= MAX_CHAVES) contagens.clear();
      }
      const atual = contagens.get(chave);
      const c = atual && atual.janela === janela ? atual : { janela, n: 0 };
      if (c.n >= limite) return false;
      c.n += 1;
      contagens.set(chave, c);
      return true;
    },
  };
}

export interface LigacaoRateLimit { limit(opcoes: { key: string }): Promise<{ success: boolean }>; }

/** Adaptador da ligação da Cloudflare. Ausente, com erro ou sem `success: true` = recusa (fail-closed). */
export function criarLimitadorCloudflare(ligacao: LigacaoRateLimit | undefined): Limitador {
  return {
    async permitir(chave) {
      if (!ligacao || typeof ligacao.limit !== 'function') { console.warn('[limite] ligação LIMITE_API ausente'); return false; }
      try { return (await ligacao.limit({ key: chave }))?.success === true; }
      catch { console.warn('[limite] falha na ligação LIMITE_API'); return false; }
    },
  };
}

/** Teto do limite dos testes locais. */
export const LIMITE_TESTE_LOCAL_MAX = 100_000;

/**
 * Limite maior SÓ para os testes locais (medida 8, 25/11/2026): vale apenas com `AMBIENTE=local` E `LIMITE_TESTE_LOCAL`
 * (inteiro de 31 a 100000), as duas passadas só na linha de comando do `wrangler dev` dos testes (playwright.config.ts).
 * O wrangler.jsonc de produção não declara nenhuma das duas (um teste confere). Qualquer outro caso: null (limite normal).
 */
export function limiteTesteLocal(env: unknown): number | null {
  const e = env as { AMBIENTE?: unknown; LIMITE_TESTE_LOCAL?: unknown } | undefined;
  if (e?.AMBIENTE !== 'local' || typeof e.LIMITE_TESTE_LOCAL !== 'string' || !/^[0-9]{1,6}$/.test(e.LIMITE_TESTE_LOCAL)) return null;
  const n = Number(e.LIMITE_TESTE_LOCAL);
  return n > LIMITE_POR_MINUTO && n <= LIMITE_TESTE_LOCAL_MAX ? n : null;
}

let limitadorTeste: { limite: number; limitador: Limitador } | null = null;

/** Limitador das rotas: usa a ligação `LIMITE_API` do ambiente do Worker (no teste local, a memória com o limite maior). */
export function limitadorDoAmbiente(env: unknown): Limitador {
  const teste = limiteTesteLocal(env);
  if (teste !== null) {
    if (limitadorTeste?.limite !== teste) {
      // Aviso visível no `wrangler tail`: em produção esta linha nunca deve aparecer.
      console.warn(`[limite] LIMITE_TESTE_LOCAL ativo: limite de teste em memória (${teste} por minuto)`);
      limitadorTeste = { limite: teste, limitador: criarLimitadorMemoria({ limite: teste }) };
    }
    return limitadorTeste.limitador;
  }
  return criarLimitadorCloudflare((env as { LIMITE_API?: LigacaoRateLimit } | undefined)?.LIMITE_API);
}
