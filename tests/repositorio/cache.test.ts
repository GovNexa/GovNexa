import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { comInvalidacao, invalidarCache, lerComCache, TTL_CACHE_MS } from '../../src/lib/repositorio/cache.ts';
import type { RepositorioProjetos } from '../../src/lib/repositorio/tipos.ts';
import { comCarteira } from '../../src/lib/carteira/modulos.ts';
import { comCronogramas } from '../../src/lib/cronograma/modulos.ts';
import { modulosComDadosReais } from '../../src/lib/dados/captacao.ts';

beforeEach(() => invalidarCache());

/** Espera uma CONDIÇÃO (até 2 s) em vez de um tempo fixo. */
async function esperarCondicao(cond: () => boolean): Promise<void> {
  const fim = Date.now() + 2000;
  while (!cond() && Date.now() < fim) await new Promise((r) => setTimeout(r, 1));
  assert.ok(cond(), 'condição não atingida em 2 s');
}

test('cache: só a primeira leitura vai ao banco dentro do prazo; depois do prazo, lê de novo', async () => {
  let leituras = 0;
  const carregar = async () => ({ n: ++leituras });
  const a = await lerComCache(1, carregar, 1_000);
  const b = await lerComCache(1, carregar, 1_000 + TTL_CACHE_MS - 1);
  assert.equal(leituras, 1);
  assert.equal(a, b); // mesmo objeto: dado compartilhado
  const c = await lerComCache(1, carregar, 1_000 + TTL_CACHE_MS + 1);
  assert.equal(leituras, 2);
  assert.notEqual(a, c);
});

test('cache: cada prefeitura tem o seu (isolamento)', async () => {
  const a = await lerComCache(1, async () => 'A', 0);
  const b = await lerComCache(2, async () => 'B', 0);
  assert.equal(a, 'A');
  assert.equal(b, 'B');
  assert.equal(await lerComCache(1, async () => 'novo', 1), 'A');
});

test('cache: nunca guarda leitura em andamento (cada acesso simultâneo faz a sua); depois do 1º resultado, os outros reaproveitam', async () => {
  let leituras = 0;
  let liberar!: () => void;
  const portao = new Promise<void>((r) => { liberar = r; });
  const carregar = async () => {
    leituras++;
    await portao;
    return leituras;
  };
  const todas = Promise.all([lerComCache(1, carregar, 0), lerComCache(1, carregar, 0), lerComCache(1, carregar, 0)]);
  await esperarCondicao(() => leituras === 3); // as três leituras estão em andamento ao mesmo tempo
  liberar();
  await todas;
  assert.equal(leituras, 3); // Workers: esperar a promessa de outro acesso pode travar se ele for cancelado
  await lerComCache(1, carregar, 1);
  assert.equal(leituras, 3); // já com resultado guardado
});

test('cache: leitura que termina depois de uma gravação não guarda dado velho', async () => {
  let versao = 'antiga';
  let iniciadas = 0;
  let abrir!: () => void;
  const portao = new Promise<void>((r) => { abrir = r; });
  const lenta = async () => {
    iniciadas++;
    const lida = versao;
    await portao;
    return lida;
  };
  const emAndamento = lerComCache(1, lenta, 0);
  await esperarCondicao(() => iniciadas === 1);
  versao = 'nova';
  invalidarCache(1); // gravação aconteceu enquanto a leitura estava em andamento
  abrir();
  assert.equal(await emAndamento, 'antiga'); // quem estava lendo recebe o que leu
  assert.equal(await lerComCache(1, async () => versao, 1), 'nova'); // mas o cache não guardou o dado velho
  invalidarCache();
  const outra = lerComCache(2, lenta, 0);
  invalidarCache(); // limpeza geral também vale para leituras em andamento
  await outra;
  assert.equal(await lerComCache(2, async () => 'depois', 1), 'depois');
});

test('repositório com invalidação informa a prefeitura usada como chave', () => {
  const falso = { podeGravar: true } as unknown as RepositorioProjetos;
  assert.equal(comInvalidacao(falso, 5208707).prefeituraId, 5208707);
});

test('cache: leitura que falha não fica guardada', async () => {
  let tentativas = 0;
  const falha = async () => {
    tentativas++;
    throw new Error('banco indisponível');
  };
  await assert.rejects(lerComCache(1, falha, 0), /banco indisponível/);
  await new Promise((r) => setTimeout(r, 0));
  const ok = await lerComCache(1, async () => 'ok', 1);
  assert.equal(ok, 'ok');
  assert.equal(tentativas, 1);
});

test('cache: gravação limpa o cache da prefeitura (com sucesso ou com erro)', async () => {
  const falso = {
    podeGravar: true,
    listarProjetos: async () => [], obterProjeto: async () => null, historico: async () => [], listarHistorico: async () => [], listarCronogramas: async () => [],
    aplicar: async () => ({ ok: true as const, historico: [] }),
    criarProjeto: async () => {
      throw new Error('falhou');
    },
  } as unknown as RepositorioProjetos;
  const repo = comInvalidacao(falso, 7);
  let leituras = 0;
  const carregar = async () => ++leituras;
  await lerComCache(7, carregar, 0);
  await lerComCache(8, carregar, 0);
  await repo.aplicar({} as never);
  await lerComCache(7, carregar, 1); // limpou: lê de novo
  assert.equal(leituras, 3);
  await assert.rejects(repo.criarProjeto({ nome: 'x', orgao: 'y' }, 'a'), /falhou/);
  await lerComCache(7, carregar, 2); // limpou mesmo com erro
  assert.equal(leituras, 4);
  await lerComCache(8, carregar, 3); // a outra prefeitura não foi afetada
  assert.equal(leituras, 4);
  assert.equal(repo.podeGravar, true);
  assert.deepEqual(await repo.listarProjetos(), []);
});

test('guias: com `somente` só a guia pedida é montada; sem `somente`, todas (igual a antes)', () => {
  const base = [{ slug: 'projetos' }, { slug: 'projetos-carteira' }, { slug: 'projetos-cronogramas' }, { slug: 'captacao' }, { slug: 'outra' }];
  const todas = modulosComDadosReais(comCronogramas(comCarteira(base)));
  const so = (alvo: string) => modulosComDadosReais(comCronogramas(comCarteira(base, alvo), alvo), alvo);
  for (const alvo of ['projetos', 'projetos-carteira', 'projetos-cronogramas', 'captacao']) {
    const lista = so(alvo);
    const montado = lista.filter((m) => 'columns' in m || 'rows' in m || 'title' in m);
    assert.ok(montado.some((m) => m.slug === alvo), `${alvo} montada`);
    assert.equal(montado.length, 1, `${alvo}: só ela foi montada`);
    // a guia pedida sai igual à montada pelo caminho completo
    assert.deepEqual(lista.find((m) => m.slug === alvo), todas.find((m) => m.slug === alvo), `${alvo} igual ao caminho completo`);
  }
  assert.deepEqual(so('outra'), base); // guia sem dados reais: nada é montado
});
