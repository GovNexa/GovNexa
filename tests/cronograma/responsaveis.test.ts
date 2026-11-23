import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertaDoTempo, chaveNome, tempoNaMao, textoTempoNaMao } from '../../src/lib/cronograma/responsaveis.ts';
import type { EtapaCronograma, TrocaResponsavel } from '../../src/lib/cronograma/tipos.ts';

const HOJE = '2026-11-20';
const etapa = (p: Partial<EtapaCronograma> = {}): EtapaCronograma => ({
  id: 'C-x#1', ordem: 1, nome: 'Tarefa Teste', fase: 'Fase', unidade: 'Unidade Teste', responsavel: 'Pessoa Teste 1', situacao_planilha: null,
  duracao_prevista: 10, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, status: 'a_fazer', ciclo: null, pendencias: [], origem: null, ...p,
});
let n = 0;
const troca = (p: Partial<TrocaResponsavel>): TrocaResponsavel => ({
  id: `troca-${++n}`, tipo: 'troca', de_responsavel: null, de_unidade: null, para_responsavel: null, para_unidade: null,
  desde: '2026-11-10', motivo: null, registrado_por: 'a@exemplo.invalid', registrado_em: '2026-11-10T10:00:00.000Z', ...p,
});

test('sem início real: zero dias e "ainda não iniciada"', () => {
  const t = tempoNaMao(etapa(), HOJE);
  assert.equal(t.iniciada, false);
  assert.equal(t.diasAtual, 0);
  assert.equal(t.desde, null);
  assert.equal(t.alerta, null);
  assert.equal(textoTempoNaMao(t), 'Com Pessoa Teste 1 (Unidade Teste) · ainda não iniciada');
});

test('tarefa da carga iniciada há 10 dias conta 10 dias com o responsável da planilha', () => {
  const t = tempoNaMao(etapa({ inicio_real: '2026-11-10' }), HOJE);
  assert.equal(t.diasAtual, 10);
  assert.equal(t.diasPessoa, 10);
  assert.equal(t.desde, '2026-11-10');
  assert.equal(textoTempoNaMao(t), 'Com Pessoa Teste 1 (Unidade Teste) há 10 dias');
});

test('A, depois B, depois A: soma as passagens de A', () => {
  const e = etapa({
    inicio_real: '2026-11-01', responsavel: 'Pessoa Teste 1', unidade: null,
    trocas: [
      troca({ de_responsavel: 'Pessoa Teste 1', para_responsavel: 'Pessoa Teste 2', desde: '2026-11-06' }),
      troca({ de_responsavel: 'Pessoa Teste 2', para_responsavel: 'Pessoa Teste 1', desde: '2026-11-10' }),
    ],
  });
  const t = tempoNaMao(e, HOJE);
  assert.deepEqual(t.passagens.map((p) => p.dias), [5, 4, 10]);
  assert.equal(t.diasAtual, 10);
  assert.equal(t.diasPessoa, 15);
  assert.equal(textoTempoNaMao(t), 'Com Pessoa Teste 1 há 10 dias · 15 dias no total com Pessoa Teste 1');
});

test('fim real para o relógio', () => {
  const t = tempoNaMao(etapa({ inicio_real: '2026-11-01', fim_real: '2026-11-04' }), HOJE);
  assert.equal(t.concluida, true);
  assert.equal(t.diasPessoa, 3);
  assert.equal(t.alerta, null);
  assert.equal(textoTempoNaMao(t), 'Concluída · ficou 3 dias com Pessoa Teste 1 (Unidade Teste)');
});

test('troca com desde antes do início real é cortada no início real', () => {
  const t = tempoNaMao(etapa({ inicio_real: '2026-11-10', trocas: [troca({ de_responsavel: 'Pessoa Teste 1', para_responsavel: 'Pessoa Teste 2', desde: '2026-11-05' })] }), HOJE);
  assert.deepEqual(t.passagens.map((p) => p.dias), [0, 10]);
  assert.equal(t.passagens[1].inicio, '2026-11-10');
});

test('primeira troca do tipo inicial abre o titular no desde', () => {
  const e = etapa({ responsavel: 'Pessoa Teste 1', unidade: null, inicio_real: '2026-11-01', trocas: [troca({ tipo: 'inicial', para_responsavel: 'Pessoa Teste 1', desde: '2026-11-03' })] });
  const t = tempoNaMao(e, HOJE);
  assert.equal(t.passagens.length, 1);
  assert.equal(t.passagens[0].inicio, '2026-11-03');
  assert.equal(t.diasAtual, 17);
});

test('nome com espaços e maiúsculas diferentes conta como a mesma pessoa', () => {
  assert.equal(chaveNome('  Pessoa   TESTE 1 '), chaveNome('pessoa teste 1'));
  const e = etapa({
    inicio_real: '2026-11-01', responsavel: 'pessoa teste 1', unidade: null,
    trocas: [troca({ de_responsavel: 'pessoa teste 1', para_responsavel: 'Pessoa Teste 2', desde: '2026-11-06' }), troca({ para_responsavel: '  PESSOA  TESTE 1', desde: '2026-11-10' })],
  });
  assert.equal(tempoNaMao(e, HOJE).diasPessoa, 15);
});

test('alerta: dias iguais à duração = nenhum; +1 atenção; 2x+1 urgente; sem duração ou concluída = nenhum', () => {
  assert.equal(alertaDoTempo(10, 10, true), null);
  assert.equal(alertaDoTempo(11, 10, true), 'atencao');
  assert.equal(alertaDoTempo(20, 10, true), 'atencao');
  assert.equal(alertaDoTempo(21, 10, true), 'urgente');
  assert.equal(alertaDoTempo(50, null, true), null);
  assert.equal(alertaDoTempo(50, 0, true), null);
  assert.equal(alertaDoTempo(50, 10, false), null);
  assert.equal(tempoNaMao(etapa({ inicio_real: '2026-11-09', duracao_prevista: 10 }), HOJE).alerta, 'atencao'); // 11 dias
  assert.equal(tempoNaMao(etapa({ inicio_real: '2026-10-30', duracao_prevista: 10 }), HOJE).alerta, 'urgente'); // 21 dias
});

test('textos: desde hoje, há 1 dia, há 3 dias', () => {
  assert.equal(textoTempoNaMao(tempoNaMao(etapa({ inicio_real: HOJE, unidade: null }), HOJE)), 'Com Pessoa Teste 1 desde hoje');
  assert.equal(textoTempoNaMao(tempoNaMao(etapa({ inicio_real: '2026-11-19', unidade: null }), HOJE)), 'Com Pessoa Teste 1 há 1 dia');
  assert.equal(textoTempoNaMao(tempoNaMao(etapa({ inicio_real: '2026-11-17', unidade: null }), HOJE)), 'Com Pessoa Teste 1 há 3 dias');
  assert.equal(textoTempoNaMao(tempoNaMao(etapa({ responsavel: null, unidade: null, inicio_real: '2026-11-17' }), HOJE)), 'Com ninguém há 3 dias');
});
