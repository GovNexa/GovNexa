import assert from 'node:assert/strict';
import { test } from 'node:test';
import { camposAlterados, enviar, pedidoReordenar, pedidoReordenarFase } from '../../src/lib/cronograma/editor-cliente.ts';
import { ERRO_REDE, ERRO_RESPOSTA } from '../../src/lib/carteira/mover-cliente.ts';

test('pedidoReordenar troca com o vizinho da mesma fase e devolve null nos limites', () => {
  assert.deepEqual(pedidoReordenar(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(pedidoReordenar(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.equal(pedidoReordenar(['a', 'b', 'c'], 'a', -1), null);
  assert.equal(pedidoReordenar(['a', 'b', 'c'], 'c', 1), null);
  assert.equal(pedidoReordenar(['a'], 'x', 1), null);
});

test('pedidoReordenarFase move o bloco inteiro e devolve null nos limites', () => {
  const t = [{ id: 'a', fase: 'F1' }, { id: 'b', fase: 'F1' }, { id: 'c', fase: 'F2' }, { id: 'd', fase: 'F3' }];
  assert.deepEqual(pedidoReordenarFase(t, 'F1', 1), ['c', 'a', 'b', 'd']);
  assert.deepEqual(pedidoReordenarFase(t, 'F3', -1), ['a', 'b', 'd', 'c']);
  assert.equal(pedidoReordenarFase(t, 'F1', -1), null);
  assert.equal(pedidoReordenarFase(t, 'F3', 1), null);
});

test('camposAlterados: só o que mudou e "" vira null', () => {
  const antes = { nome: 'A', duracao_prevista: 10, inicio_real: null, fim_real: '2026-01-01' };
  assert.deepEqual(camposAlterados(antes, { nome: 'A', duracao_prevista: 10, inicio_real: '', fim_real: '2026-01-01' }), {});
  assert.deepEqual(camposAlterados(antes, { nome: 'B', duracao_prevista: null, inicio_real: '2026-02-02', fim_real: '' }), { nome: 'B', duracao_prevista: null, inicio_real: '2026-02-02', fim_real: null });
});

const resposta = (status: number, corpo: unknown): typeof fetch => (async () => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status })) as typeof fetch;

test('enviar: sucesso, 409, resposta estranha e falha de rede', async () => {
  let visto: RequestInit | undefined;
  const espiao = (async (_u: string, init?: RequestInit) => { visto = init; return new Response(JSON.stringify({ ok: true, revisao: 3 }), { status: 200 }); }) as unknown as typeof fetch;
  const ok = await enviar('/x/', { a: 1 }, espiao);
  assert.deepEqual(ok, { ok: true, dados: { ok: true, revisao: 3 } });
  assert.equal(visto?.method, 'POST');
  assert.equal(visto?.credentials, 'same-origin');
  assert.deepEqual(visto?.headers, { 'content-type': 'application/json' });
  assert.equal(visto?.body, '{"a":1}');

  const conflito = await enviar('/x/', {}, resposta(409, { ok: false, erro: 'O cronograma foi alterado por outra pessoa.' }));
  assert.deepEqual(conflito, { ok: false, status: 409, erro: 'O cronograma foi alterado por outra pessoa.' });
  const lista = await enviar('/x/', {}, resposta(400, { ok: false, erro: 'Pedido inválido.', erros: ['Nome: obrigatório.', 7] }));
  assert.deepEqual(lista, { ok: false, status: 400, erro: 'Pedido inválido.', erros: ['Nome: obrigatório.'] });
  assert.deepEqual(await enviar('/x/', {}, resposta(500, '<html>')), { ok: false, status: 500, erro: ERRO_RESPOSTA });
  const queda = (async () => { throw new TypeError('rede'); }) as unknown as typeof fetch;
  assert.deepEqual(await enviar('/x/', {}, queda), { ok: false, status: 0, erro: ERRO_REDE });
});
