// Cache curto das leituras da plataforma (carteira, cronogramas e histórico), por prefeitura e por instância do Worker.
// Por quê: cada acesso lia e decodificava o banco inteiro (~334 projetos, 13 cronogramas e o histórico). Com o cache, só o
// primeiro acesso de cada 30 s paga essa leitura; os outros reaproveitam o resultado já decodificado.
// Regras:
// - Só o RESULTADO pronto é guardado, nunca a leitura em andamento: no Cloudflare Workers, esperar uma promessa criada por
//   outro acesso pode travar se aquele acesso for cancelado. Acessos simultâneos sem cache fazem cada um a sua leitura.
// - Os dados em cache são COMPARTILHADOS entre acessos: nenhuma tela pode alterá-los no lugar (ordenar cópia, não o original).
// - Toda gravação deve passar pelo repositório de `repositorioDoUsuario` (que limpa o cache da prefeitura na hora, na mesma
//   instância). Outras instâncias do Worker mostram o dado antigo por até TTL_CACHE_MS (30 s).
// - Leitura que falha não fica guardada: o acesso seguinte tenta de novo. Leitura que termina depois de uma gravação
//   (invalidação) não é guardada, para não gravar dado velho no cache.
import type { RepositorioProjetos } from './tipos.ts';

export const TTL_CACHE_MS = 30_000;
interface Entrada { ate: number; valor: unknown }
const entradas = new Map<number, Entrada>();
const geracoes = new Map<number, number>();
let geracaoGeral = 0;
const geracaoDe = (id: number): number => geracaoGeral * 1_000_000 + (geracoes.get(id) ?? 0);

export async function lerComCache<T>(prefeituraId: number, carregar: () => Promise<T>, agora: number = Date.now()): Promise<T> {
  const e = entradas.get(prefeituraId);
  if (e && e.ate > agora) return e.valor as T;
  const geracao = geracaoDe(prefeituraId);
  const valor = await carregar();
  if (geracaoDe(prefeituraId) === geracao) entradas.set(prefeituraId, { ate: agora + TTL_CACHE_MS, valor });
  return valor;
}

/** Sem argumento, limpa tudo (testes). */
export function invalidarCache(prefeituraId?: number): void {
  if (prefeituraId === undefined) {
    entradas.clear();
    geracaoGeral++;
  } else {
    entradas.delete(prefeituraId);
    geracoes.set(prefeituraId, (geracoes.get(prefeituraId) ?? 0) + 1);
  }
}

/** Repositório que limpa o cache da prefeitura depois de qualquer gravação (com ou sem sucesso) e informa a prefeitura que usa como chave. */
export function comInvalidacao(repo: RepositorioProjetos, prefeituraId: number): RepositorioProjetos {
  return {
    ...repo,
    prefeituraId,
    criarProjeto: async (dados, autor) => {
      try {
        return await repo.criarProjeto(dados, autor);
      } finally {
        invalidarCache(prefeituraId);
      }
    },
    ...(repo.definirLocalizacao ? {
      definirLocalizacao: async (projetoId, localizacao, autor, descricao) => {
        try {
          return await repo.definirLocalizacao!(projetoId, localizacao, autor, descricao);
        } finally {
          invalidarCache(prefeituraId);
        }
      },
    } : {}),
    aplicar: async (evento) => {
      try {
        return await repo.aplicar(evento);
      } finally {
        invalidarCache(prefeituraId);
      }
    },
  };
}
