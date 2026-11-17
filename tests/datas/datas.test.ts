import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataBr, dataHoraBr, dataOuDataHoraBr } from '../../src/lib/datas.ts';

test('só o dia: DD/MM/AAAA, sem deslocar pelo fuso', () => {
  assert.equal(dataBr('2026-11-09'), '09/11/2026');
  assert.equal(dataBr('2026-01-01'), '01/01/2026');
});

test('dia e hora: DD/MM/AAAA HH:MM:SS no horário de Brasília', () => {
  assert.equal(dataHoraBr('2026-11-17T12:05:09Z'), '17/11/2026 09:05:09');
  assert.equal(dataHoraBr(new Date('2026-11-17T15:00:00.123Z')), '17/11/2026 12:00:00');
});

test('envio depois das 21h de Brasília não muda de dia', () => {
  assert.equal(dataHoraBr('2026-11-18T01:30:00Z'), '17/11/2026 22:30:00');
  assert.equal(dataBr('2026-11-18T01:30:00Z'), '17/11/2026');
});

test('escolhe o formato pelo que a fonte tem', () => {
  assert.equal(dataOuDataHoraBr('2026-11-16'), '16/11/2026');
  assert.equal(dataOuDataHoraBr('2026-11-16T13:00:00Z'), '16/11/2026 10:00:00');
});

test('valor inválido volta como veio', () => {
  assert.equal(dataHoraBr('sem data'), 'sem data');
});
