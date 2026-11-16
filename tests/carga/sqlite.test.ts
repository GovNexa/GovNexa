import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoTeste } from '../helpers/d1.ts';

import { carregarExemplo } from '../helpers/carga.ts';
test('carga SQLite aplica os exemplos duas vezes sem duplicar', () => {
 const { sqlite } = bancoTeste();
 try {
  const sql = carregarExemplo(sqlite);
  const antes = sqlite.prepare('SELECT count(*) AS n FROM log_alteracoes').get();
  const revisao = Number(sqlite.prepare('SELECT revisao FROM projeto LIMIT 1').get()!.revisao);
  sqlite.exec(sql);
  assert.equal(sqlite.prepare('SELECT revisao FROM projeto LIMIT 1').get()!.revisao, revisao + 1);
  assert.deepEqual(sqlite.prepare('SELECT count(*) AS n FROM log_alteracoes').get(), antes);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM projeto').get()!.n, 14);
 } finally { sqlite.close(); }
});
