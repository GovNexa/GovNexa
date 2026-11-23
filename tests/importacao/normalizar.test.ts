import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataIso, numero } from '../../scripts/lib/normalizar.ts';

test('dataIso: data impossível (31/02/2026) vira null com pendência', () => {
  const pend: string[] = [];
  assert.equal(dataIso('31/02/2026', 'DATA INÍCIO', pend), null);
  assert.deepEqual(pend, ['Data não reconhecida em DATA INÍCIO: 31/02/2026']);
  assert.equal(dataIso('29/02/2026', 'X', []), null); // 2026 não é bissexto
  assert.equal(dataIso('29/02/2028', 'X', []), '2028-02-29');
  assert.equal(dataIso('15/3/2026', 'X', []), '2026-03-15');
  assert.equal(dataIso('texto qualquer', 'X', pend), null);
  assert.equal(pend.length, 2);
});

test('numero: mínimo recusa duração negativa (-3) com pendência', () => {
  const pend: string[] = [];
  assert.equal(numero('-3', 'DURAÇÃO', pend, 0), null);
  assert.deepEqual(pend, ['Valor negativo em DURAÇÃO: -3']);
  assert.equal(numero(5, 'DURAÇÃO', [], 0), 5);
  assert.equal(numero(0, 'DURAÇÃO', [], 0), 0);
  assert.equal(numero(-3, 'OUTRO', []), -3); // sem mínimo, como antes
});
