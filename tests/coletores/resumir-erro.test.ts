import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resumirErro } from '../../coletores/lib/resumir-erro.ts';

const SAIDA_NODE = [
  'file:///D:/repo/coletores/cauc.ts:3',
  '    try { await fetch(url); } catch (e) { if (tentativa === 3) throw new Error(`CAUC: ${(e         ).message}`); }',
  '                                                                                       ^',
  '',
  'Error: CAUC: fetch failed',
  '    at f (file:///D:/repo/coletores/cauc.ts:3:88)',
  '',
  'Node.js v26.7.0',
].join('\n');

test('resumirErro: pega a linha Error e não o trecho de código que o Node imprime antes', () => {
  assert.equal(resumirErro(SAIDA_NODE), 'Error: CAUC: fetch failed');
});

test('resumirErro: o motivo nunca é um trecho de código', () => {
  const r = resumirErro(SAIDA_NODE);
  assert.ok(!/throw\s+new|\$\{|=>|if\s*\(/.test(r), r);
});

test('resumirErro: vários tipos de erro e mensagens com HTTP', () => {
  assert.equal(resumirErro('TypeError: fetch failed\n    at x (file:///a.ts:1:1)'), 'TypeError: fetch failed');
  assert.equal(resumirErro('Error: INEP: HTTP 503 em https://exemplo.invalid/a.zip\n    at y'), 'Error: INEP: HTTP 503 em https://exemplo.invalid/a.zip');
  assert.equal(resumirErro('AggregateError [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:1'), 'AggregateError [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:1');
});

test('resumirErro: sem linha Error, usa a primeira com timeout/HTTP e nunca código; sem nada, usa o código de saída', () => {
  assert.equal(resumirErro('algo deu errado: HTTP 502 do servidor'), 'algo deu errado: HTTP 502 do servidor');
  assert.equal(resumirErro('  \n', 3), 'saiu com código 3');
  assert.equal(resumirErro('', null), 'saiu com código desconhecido');
});

test('resumirErro: remove caminhos de disco e limita o tamanho', () => {
  assert.ok(!/D:\\|Users|file:\/\/\//.test(resumirErro('Error: falhou ao ler C:\\Users\\alguem\\dados\\arquivo.csv e /home/runner/work/x/y.json')));
  assert.ok(resumirErro('Error: ' + 'x'.repeat(1000)).length <= 400);
});
