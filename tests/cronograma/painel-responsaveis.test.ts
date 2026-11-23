import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROTULO_SEM_AREA, ROTULO_SEM_PESSOA, SEM, filtrar, filtrosDaUrl, nomeArquivoCsvResponsaveis, opcoesResponsaveis, paraCsvResponsaveis, porArea, porPessoa,
  tarefasEmMaos, urlCsvResponsaveis, urlPainel,
} from '../../src/lib/cronograma/painel-responsaveis.ts';
import type { Cronograma, EtapaCronograma } from '../../src/lib/cronograma/tipos.ts';

const HOJE = '2026-11-20';
let n = 0;
const etapa = (p: Partial<EtapaCronograma>): EtapaCronograma => ({
  id: `T-${++n}`, ordem: n, nome: `Tarefa ${n}`, fase: 'Fase', unidade: 'Unidade Teste', responsavel: 'Pessoa Teste 1', situacao_planilha: null,
  duracao_prevista: 10, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, status: 'a_fazer', ciclo: null, pendencias: [], origem: null, ...p,
});
const crono = (etapas: EtapaCronograma[], id = 'C-teste'): Cronograma => ({
  id, aba: 'A', titulo: 'Cronograma Teste', endereco: null, sei: [], projeto_id: 'P-1', casamento: null, pendencias: [],
  fases: [{ nome: 'Fase', ordem: 1, etapas }],
});
const nomes = new Map([['P-1', 'Projeto Teste']]);
const itens = tarefasEmMaos([crono([
  etapa({ nome: 'Em atraso grande', responsavel: 'Pessoa Teste 1', unidade: 'Unidade Teste', inicio_real: '2026-10-01' }), // 50 dias, duração 10 -> urgente
  etapa({ nome: 'Um pouco atrasada', responsavel: 'pessoa  teste 1', unidade: 'unidade teste', inicio_real: '2026-11-05' }), // 15 dias -> atenção
  etapa({ nome: 'A iniciar', responsavel: 'Pessoa Teste 2', unidade: 'Outra Unidade' }),
  etapa({ nome: 'Sem dono', responsavel: null, unidade: null, inicio_real: '2026-11-18' }),
  etapa({ nome: 'Concluída', responsavel: 'Pessoa Teste 2', inicio_real: '2026-11-01', fim_real: '2026-11-03' }),
])], HOJE, nomes);

test('só entram tarefas abertas (sem fim real) e o projeto vem pelo nome', () => {
  assert.equal(itens.length, 4);
  assert.ok(!itens.some((i) => i.tarefa === 'Concluída'));
  assert.equal(itens[0].projeto, 'Projeto Teste');
});

test('por pessoa: grafias diferentes juntas, contagens e "Sem responsável" por último', () => {
  const l = porPessoa(itens);
  assert.deepEqual(l.map((x) => x.nome), ['Pessoa Teste 1', 'Pessoa Teste 2', ROTULO_SEM_PESSOA]);
  const p1 = l[0];
  assert.equal(p1.emAndamento, 2);
  assert.equal(p1.aIniciar, 0);
  assert.equal(p1.urgente, 1);
  assert.equal(p1.atencao, 1);
  assert.equal(p1.maisAntiga?.tarefa, 'Em atraso grande');
  assert.equal(l[1].aIniciar, 1);
  assert.equal(l[2].chave, SEM);
});

test('por área: grafias juntas e "Sem área" por último', () => {
  const l = porArea(itens);
  assert.deepEqual(l.map((x) => x.nome), ['Unidade Teste', 'Outra Unidade', ROTULO_SEM_AREA]);
  assert.equal(l[0].emAndamento, 2);
});

test('filtros por lista fechada: valor inválido é avisado e ignorado; SEM é aceito', () => {
  const op = opcoesResponsaveis(itens);
  assert.deepEqual(op.pessoas, ['Pessoa Teste 1', 'Pessoa Teste 2']);
  const ruim = filtrosDaUrl(new URLSearchParams('area=Inventada&pessoa=Fulano'), op);
  assert.deepEqual({ a: ruim.area, p: ruim.pessoa, ai: ruim.areaInvalida, pi: ruim.pessoaInvalida }, { a: null, p: null, ai: true, pi: true });
  const bom = filtrosDaUrl(new URLSearchParams(`pessoa=${SEM}&area=unidade%20teste&alerta=1`), op);
  assert.deepEqual({ a: bom.area, p: bom.pessoa, s: bom.soAlerta, ai: bom.areaInvalida }, { a: 'Unidade Teste', p: SEM, s: true, ai: false });
  assert.deepEqual(filtrar(itens, { area: null, pessoa: SEM, soAlerta: false }).map((i) => i.tarefa), ['Sem dono']);
  assert.deepEqual(filtrar(itens, { area: null, pessoa: null, soAlerta: true }).map((i) => i.tarefa).sort(), ['Em atraso grande', 'Um pouco atrasada']);
});

test('urlPainel e urlCsvResponsaveis', () => {
  assert.equal(urlPainel({}), '/plataforma/gestao-responsaveis/');
  assert.equal(urlPainel({ pessoa: 'Pessoa Teste 1', soAlerta: true }), '/plataforma/gestao-responsaveis/?pessoa=Pessoa+Teste+1&alerta=1');
  assert.equal(urlCsvResponsaveis({ area: SEM }), `/plataforma/gestao-responsaveis/csv/?area=${SEM}`);
  assert.equal(nomeArquivoCsvResponsaveis(HOJE), 'responsaveis-govnexa-2026-11-20.csv');
});

test('CSV: cabeçalho, separador ;, CRLF, fórmula protegida e datas brasileiras', () => {
  const perigosa = tarefasEmMaos([crono([etapa({ nome: '=1+1', inicio_real: '2026-11-10' })])], HOJE, nomes);
  const linhas = paraCsvResponsaveis(perigosa).split('\r\n');
  assert.equal(linhas[0], '"Pessoa";"Área";"Tarefa";"Fase";"Cronograma";"Projeto";"Com a pessoa desde";"Dias com a pessoa (agora)";"Dias com a pessoa (total na tarefa)";"Duração prevista (dias)";"Situação"');
  assert.match(linhas[1], /"'=1\+1"/);
  assert.match(linhas[1], /"10\/11\/2026";"10";"10";"10";"No prazo"/);
  assert.equal(linhas[2], '');
  assert.ok(paraCsvResponsaveis(itens).includes('"A iniciar"'));
});
