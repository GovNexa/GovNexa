import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_VALOR_CENTAVOS } from '../../src/lib/contratacoes/regras.ts';
import { normalizarOperacaoItem, planejarItem, type EstadoItens } from '../../src/lib/cronograma/recursos-regras.ts';
import { CABECALHO_CSV_RECURSOS, nomeArquivoCsvRecursos, paraCsvRecursos } from '../../src/lib/cronograma/recursos-csv.ts';
import {
  centesimosDeTexto, decimalCsv, linhasResumoFicha, plural, quantidadeTexto, reaisDeCentavos, resumoItens, resumoPorTarefa, textoResumoTarefa,
  TETO_QUANTIDADE_CENTESIMOS, TETO_VALOR_CENTAVOS, valorEditavel,
  type DadosRecurso, type Envolvido, type ItensCronograma, type Recurso,
} from '../../src/lib/cronograma/recursos.ts';
import type { Cronograma } from '../../src/lib/cronograma/tipos.ts';

const V = TETO_VALOR_CENTAVOS;

test('centesimosDeTexto: formato brasileiro, teto e entradas inválidas', () => {
  assert.equal(centesimosDeTexto('1.234,56', V), 123456);
  assert.equal(centesimosDeTexto('10', V), 1000);
  assert.equal(centesimosDeTexto('2,5', V), 250);
  assert.equal(centesimosDeTexto('0,05', V), 5);
  assert.equal(centesimosDeTexto('R$ 10.000.000.000,00', V), 1e12);
  assert.equal(centesimosDeTexto('r$10', V), 1000);
  assert.equal(centesimosDeTexto('10.000.000.000,01', V), 'invalido');
  for (const ruim of ['1,234', '-1', '1e3', '1.23', '1,5e3', 'abc', '1..000']) assert.equal(centesimosDeTexto(ruim, V), 'invalido', ruim);
  assert.equal(centesimosDeTexto('', V), null);
  assert.equal(centesimosDeTexto(null, V), null);
  assert.equal(centesimosDeTexto(undefined, V), null);
  assert.equal(centesimosDeTexto(12, V), 'invalido');
  assert.equal(centesimosDeTexto('1234567890123456', V), 'invalido'); // 16 dígitos
  assert.equal(centesimosDeTexto('999999999999999', V), 'invalido');
  assert.equal(centesimosDeTexto('1.000.000.000', TETO_QUANTIDADE_CENTESIMOS), 1e11);
  assert.equal(centesimosDeTexto('1.000.000.001', TETO_QUANTIDADE_CENTESIMOS), 'invalido');
});

test('formatação: reais, valor editável, quantidade e decimal do CSV (ida e volta)', () => {
  assert.equal(reaisDeCentavos(0), 'R$ 0,00');
  assert.equal(reaisDeCentavos(5), 'R$ 0,05');
  assert.equal(reaisDeCentavos(123456), 'R$ 1.234,56');
  assert.equal(reaisDeCentavos(200n * 1_000_000_000_000n), 'R$ 2.000.000.000.000,00');
  assert.equal(reaisDeCentavos(null), '—');
  assert.equal(reaisDeCentavos(undefined), '—');
  assert.equal(valorEditavel(123456), '1.234,56');
  assert.equal(valorEditavel(100), '1,00');
  assert.equal(valorEditavel(null), '');
  for (const x of [0, 1, 99, 100, 123456, 100_000_000, V]) assert.equal(centesimosDeTexto(valorEditavel(x), V), x);
  assert.equal(quantidadeTexto(1000), '10');
  assert.equal(quantidadeTexto(250), '2,5');
  assert.equal(quantidadeTexto(1234567), '12.345,67');
  assert.equal(quantidadeTexto(5), '0,05');
  assert.equal(quantidadeTexto(null), '');
  for (const x of [1, 5, 250, 1000, 1234567, TETO_QUANTIDADE_CENTESIMOS]) assert.equal(centesimosDeTexto(quantidadeTexto(x), TETO_QUANTIDADE_CENTESIMOS), x);
  assert.equal(decimalCsv(123456), '1234,56');
  assert.equal(decimalCsv(5), '0,05');
  assert.equal(decimalCsv(null), '');
  assert.equal(plural(1, 'item', 'itens'), '1 item');
  assert.equal(plural(2, 'item', 'itens'), '2 itens');
});

test('o teto de valor é o mesmo da E12', () => assert.equal(TETO_VALOR_CENTAVOS, MAX_VALOR_CENTAVOS));

const AUTORIA = { criado_por: 'a@exemplo.invalid', criado_em: '2026-11-23T12:00:00.000Z', atualizado_por: null, atualizado_em: null };
const env = (id: string, tarefa_id: string, nome: string | null, area: string | null = null, papel: string | null = null, observacao: string | null = null): Envolvido => ({ id: 'E-' + id, tarefa_id, nome, area, papel, observacao, ...AUTORIA });
const rec = (id: string, tarefa_id: string, p: Partial<DadosRecurso> = {}): Recurso => ({
  id: 'R-' + id, tarefa_id, tipo: 'material', descricao: 'Item', quantidade_centesimos: null, unidade: null, valor_estimado_centavos: null, valor_utilizado_centavos: null, data_uso: null, observacao: null, ...p, ...AUTORIA,
});

test('resumos: soma bigint exata (200 x 1e12), por tipo na ordem fixa, por tarefa', () => {
  const recursos = Array.from({ length: 200 }, (_, i) => rec(`m${i}`, i % 2 ? 'T-b' : 'T-a', { valor_estimado_centavos: V, valor_utilizado_centavos: i === 0 ? null : 1 }));
  const itens: ItensCronograma = { envolvidos: [env('1', 'T-a', 'Pessoa Teste 1'), env('2', 'T-a', null, 'Unidade Teste')], recursos };
  const r = resumoItens(itens);
  assert.equal(r.estimado, 200n * 1_000_000_000_000n);
  assert.equal(r.utilizado, 199n);
  assert.equal(r.comEstimado, 200);
  assert.equal(r.comUtilizado, 199);
  assert.deepEqual(r.porTipo.map((t) => t.tipo), ['humano', 'material', 'financeiro']);
  assert.equal(r.porTipo[1].itens, 200);
  assert.equal(r.porTipo[0].itens, 0);
  assert.equal(r.envolvidos, 2);
  assert.equal(r.tarefasComEnvolvidos, 1);
  assert.equal(r.tarefasComRecursos, 2);
  const porTarefa = resumoPorTarefa(itens);
  assert.equal(porTarefa.get('T-a')!.recursos, 100);
  assert.equal(porTarefa.get('T-a')!.envolvidos, 2);
  assert.equal(textoResumoTarefa(porTarefa.get('T-a')), '2 envolvidos · 100 recursos');
  assert.equal(textoResumoTarefa(porTarefa.get('T-b')), '100 recursos');
  assert.equal(textoResumoTarefa(undefined), '');
});

test('linhasResumoFicha: vazio, singular e plural', () => {
  assert.deepEqual(linhasResumoFicha(resumoItens({ envolvidos: [], recursos: [] })), []);
  const um = resumoItens({ envolvidos: [env('1', 'T-a', 'Pessoa Teste 1')], recursos: [rec('1', 'T-a', { tipo: 'humano' })] });
  assert.deepEqual(linhasResumoFicha(um), [
    { rotulo: 'Envolvidos', valor: '1 pessoa ou área em 1 tarefa' },
    { rotulo: 'Recursos', valor: '1 item: 1 humano' },
  ]);
  const varios = resumoItens({
    envolvidos: [env('1', 'T-a', 'Pessoa Teste 1'), env('2', 'T-b', 'Pessoa Teste 2')],
    recursos: [rec('1', 'T-a', { tipo: 'material', valor_estimado_centavos: 123456 }), rec('2', 'T-b', { tipo: 'material', valor_utilizado_centavos: 100 }), rec('3', 'T-b', { tipo: 'financeiro', valor_estimado_centavos: 0 })],
  });
  assert.deepEqual(linhasResumoFicha(varios), [
    { rotulo: 'Envolvidos', valor: '2 pessoas ou áreas em 2 tarefas' },
    { rotulo: 'Recursos', valor: '3 itens: 2 materiais ou equipamentos, 1 financeiro' },
    { rotulo: 'Valor estimado', valor: 'R$ 1.234,56' },
    { rotulo: 'Valor utilizado', valor: 'R$ 1,00' },
  ]);
});

const ID = (p: string) => (v: unknown): string => (typeof v === 'string' ? v : p);
const norm = (acao: Parameters<typeof normalizarOperacaoItem>[0], bruto: Record<string, unknown>) => {
  const erros: string[] = [];
  const op = normalizarOperacaoItem(acao, { tarefa_id: 'C-x#1', ...bruto }, ID(''), erros);
  return { op, erros };
};
const UUID = '123e4567-e89b-12d3-a456-426614174000';

test('normalizarOperacaoItem: mensagens de cada regra', () => {
  assert.deepEqual(norm('incluir_envolvido', { envolvido: { nome: ' ', area: '' } }).erros, ['Informe o nome ou a área do envolvido.']);
  assert.deepEqual(norm('incluir_envolvido', {}).erros, ['Informe o nome ou a área do envolvido.']);
  assert.deepEqual(norm('editar_envolvido', { item_id: 'E-x', envolvido: { nome: 'A' } }).erros, ['Item inválido.']);
  assert.deepEqual(norm('editar_envolvido', { item_id: 'R-' + UUID, envolvido: { nome: 'A' } }).erros, ['Item inválido.']);
  assert.deepEqual(norm('remover_recurso', { item_id: 'E-' + UUID }).erros, ['Item inválido.']);
  const e = norm('incluir_envolvido', { envolvido: { nome: ' Pessoa Teste 1 ', papel: 'Fiscal', observacao: 'Nota' } });
  assert.deepEqual(e.erros, []);
  assert.deepEqual(e.op, { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: { nome: 'Pessoa Teste 1', area: null, papel: 'Fiscal', observacao: 'Nota' } });
  const rm = norm('remover_envolvido', { item_id: 'E-' + UUID, motivo: ' Engano ' });
  assert.deepEqual(rm.op, { acao: 'remover_envolvido', tarefa_id: 'C-x#1', item_id: 'E-' + UUID, motivo: 'Engano' });

  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'outro', descricao: 'X' } }).erros, ['Tipo do recurso: escolha humano, material ou financeiro.']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: ' ' } }).erros, ['Descrição: obrigatória.']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', quantidade: '1,234' } }).erros, ['Quantidade: use um número como 10 ou 2,5.']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', quantidade: '0' } }).erros, ['Quantidade: precisa ser maior que zero.']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', unidade: 'kg' } }).erros, ['Unidade: informe também a quantidade.']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', valor_estimado: '1,5e3' } }).erros, ['Valor estimado: use um valor como 1.234,56 (até R$ 10 bilhões).']);
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', valor_utilizado: '10.000.000.000,01' } }).erros, ['Valor utilizado: use um valor como 1.234,56 (até R$ 10 bilhões).']);
  for (const d of ['2026-02-30', '1999-12-31', '2101-01-01', '20/11/2026', 5]) assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'material', descricao: 'X', data_uso: d } }).erros, ['Data de uso: data inválida.'], String(d));
  assert.deepEqual(norm('incluir_recurso', { recurso: { tipo: 'financeiro', descricao: 'X' } }).erros, ['Recurso financeiro: informe o valor estimado ou o utilizado.']);
  const r = norm('incluir_recurso', { recurso: { tipo: 'financeiro', descricao: 'Diárias', quantidade: '2,5', unidade: 'dias', valor_estimado: '1.234,56', valor_utilizado: '0', data_uso: '2026-11-20', observacao: 'Nota' } });
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.op, {
    acao: 'incluir_recurso', tarefa_id: 'C-x#1',
    recurso: { tipo: 'financeiro', descricao: 'Diárias', quantidade_centesimos: 250, unidade: 'dias', valor_estimado_centavos: 123456, valor_utilizado_centavos: 0, data_uso: '2026-11-20', observacao: 'Nota' },
  });
});

const estado = (e: Partial<EstadoItens> = {}): EstadoItens => ({ titulo: 'Obra Teste', tarefa: { id: 'C-x#1', nome: 'Primeira', responsavel: 'Pessoa Teste 1' }, envolvidos: [], recursos: [], ...e });
const ctx = { novoId: () => UUID };
const dEnv = (nome: string | null, area: string | null = null, papel: string | null = null, observacao: string | null = null) => ({ nome, area, papel, observacao });
const dRec = (p: Partial<DadosRecurso> = {}): DadosRecurso => ({ tipo: 'material', descricao: 'Cimento', quantidade_centesimos: null, unidade: null, valor_estimado_centavos: null, valor_utilizado_centavos: null, data_uso: null, observacao: null, ...p });

test('planejarItem (envolvido): inclusão, limites, duplicado, responsável, alteração e remoção', () => {
  const inc = planejarItem(estado(), { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv('Pessoa Teste 2', 'Unidade Teste', 'Fiscal') }, ctx);
  assert.ok(inc.ok);
  assert.equal(inc.item_id, 'E-' + UUID);
  assert.equal(inc.plano.evento.tipo, 'envolvido_incluido');
  assert.equal(inc.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: envolvido Pessoa Teste 2 (Unidade Teste) (Fiscal) incluído.');
  const cheio = estado({ envolvidos: Array.from({ length: 50 }, (_, i) => env(`n${i}`, 'C-x#1', `Pessoa ${i}`)) });
  assert.deepEqual(planejarItem(cheio, { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv('Outra Pessoa') }, ctx), { ok: false, codigo: 'invalido', erro: 'Limite de 50 envolvidos por tarefa.' });
  const um = estado({ envolvidos: [env('a', 'C-x#1', 'José Álvares', 'Obras')] });
  assert.deepEqual(planejarItem(um, { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv('  JOSÉ  álvares ', 'obras') }, ctx), { ok: false, codigo: 'invalido', erro: 'Este envolvido já está na tarefa.' });
  assert.ok(planejarItem(um, { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv('José Álvares', 'Outra área') }, ctx).ok);
  assert.deepEqual(planejarItem(estado(), { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv(' pessoa TESTE 1') }, ctx), { ok: false, codigo: 'invalido', erro: 'Esta pessoa já é a responsável pela tarefa.' });

  const ed = (envolvido: ReturnType<typeof dEnv>, e = um) => planejarItem(e, { acao: 'editar_envolvido', tarefa_id: 'C-x#1', item_id: 'E-a', envolvido }, ctx);
  assert.deepEqual(ed(dEnv('José Álvares', 'Obras')), { ok: false, codigo: 'sem_mudanca', erro: 'Nada mudou.' });
  const alt = ed(dEnv('José Álvares', 'Obras', 'Apoio', 'Observação nova'));
  assert.ok(alt.ok);
  assert.equal(alt.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: envolvido José Álvares (Obras) alterado · Papel: — → Apoio; Observação alterada');
  assert.deepEqual(planejarItem(um, { acao: 'editar_envolvido', tarefa_id: 'C-x#1', item_id: 'E-zzz', envolvido: dEnv('A') }, ctx), { ok: false, codigo: 'inexistente', erro: 'Envolvido não encontrado.' });
  const dois = estado({ envolvidos: [env('a', 'C-x#1', 'José Álvares', 'Obras'), env('b', 'C-x#1', 'Outro', 'Obras')] });
  assert.deepEqual(ed(dEnv('Outro', 'Obras'), dois), { ok: false, codigo: 'invalido', erro: 'Este envolvido já está na tarefa.' });
  assert.deepEqual(ed(dEnv('Pessoa Teste 1', 'Obras')), { ok: false, codigo: 'invalido', erro: 'Esta pessoa já é a responsável pela tarefa.' });

  const rm = planejarItem(um, { acao: 'remover_envolvido', tarefa_id: 'C-x#1', item_id: 'E-a', motivo: 'Engano' }, ctx);
  assert.ok(rm.ok);
  assert.equal(rm.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: envolvido José Álvares (Obras) removido.');
  assert.equal(rm.plano.evento.motivo, 'Engano');
  assert.deepEqual(planejarItem(um, { acao: 'remover_envolvido', tarefa_id: 'C-x#1', item_id: 'E-zzz', motivo: null }, ctx), { ok: false, codigo: 'inexistente', erro: 'Envolvido não encontrado.' });
});

test('planejarItem (recurso): inclusão, limite, alteração com antes → depois, remoção e corte em 1000', () => {
  const inc = planejarItem(estado(), {
    acao: 'incluir_recurso', tarefa_id: 'C-x#1',
    recurso: dRec({ tipo: 'financeiro', descricao: 'Diárias', quantidade_centesimos: 250, unidade: 'dias', valor_estimado_centavos: 123456, valor_utilizado_centavos: 100000, data_uso: '2026-11-20' }),
  }, ctx);
  assert.ok(inc.ok);
  assert.equal(inc.item_id, 'R-' + UUID);
  assert.equal(inc.plano.evento.tipo, 'recurso_incluido');
  assert.equal(inc.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: recurso financeiro «Diárias» incluído, 2,5 dias, estimado R$ 1.234,56, utilizado R$ 1.000,00, em 20/11/2026.');
  const cheio = estado({ recursos: Array.from({ length: 200 }, (_, i) => rec(`n${i}`, 'C-x#1')) });
  assert.deepEqual(planejarItem(cheio, { acao: 'incluir_recurso', tarefa_id: 'C-x#1', recurso: dRec() }, ctx), { ok: false, codigo: 'invalido', erro: 'Limite de 200 recursos por tarefa.' });

  const antes = rec('a', 'C-x#1', { descricao: 'Cimento', quantidade_centesimos: 1000, unidade: 'sacos', valor_estimado_centavos: 500000 });
  const um = estado({ recursos: [antes] });
  const ed = (r: DadosRecurso) => planejarItem(um, { acao: 'editar_recurso', tarefa_id: 'C-x#1', item_id: 'R-a', recurso: r }, ctx);
  const igual = dRec({ descricao: 'Cimento', quantidade_centesimos: 1000, unidade: 'sacos', valor_estimado_centavos: 500000 });
  assert.deepEqual(ed(igual), { ok: false, codigo: 'sem_mudanca', erro: 'Nada mudou.' });
  const alt = ed({ ...igual, tipo: 'humano', valor_utilizado_centavos: 450000, data_uso: '2026-11-21', observacao: 'Observação secreta de teste' });
  assert.ok(alt.ok);
  assert.equal(alt.plano.evento.descricao,
    'Cronograma «Obra Teste»: tarefa «Primeira»: recurso «Cimento» alterado · Tipo: Material ou equipamento → Humano; Valor utilizado: — → R$ 4.500,00; Data de uso: — → 21/11/2026; Observação alterada');
  assert.deepEqual(planejarItem(um, { acao: 'editar_recurso', tarefa_id: 'C-x#1', item_id: 'R-zzz', recurso: igual }, ctx), { ok: false, codigo: 'inexistente', erro: 'Recurso não encontrado.' });
  const rm = planejarItem(um, { acao: 'remover_recurso', tarefa_id: 'C-x#1', item_id: 'R-a', motivo: null }, ctx);
  assert.ok(rm.ok);
  assert.equal(rm.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: recurso «Cimento» removido.');
  assert.deepEqual(planejarItem(um, { acao: 'remover_recurso', tarefa_id: 'C-x#1', item_id: 'R-zzz', motivo: null }, ctx), { ok: false, codigo: 'inexistente', erro: 'Recurso não encontrado.' });

  const longo = planejarItem(estado(), { acao: 'incluir_recurso', tarefa_id: 'C-x#1', recurso: dRec({ descricao: 'x'.repeat(200) }) }, ctx);
  assert.ok(longo.ok);
  assert.ok(Array.from(longo.plano.evento.descricao).length <= 1000);
  const tarefaLonga = planejarItem(estado({ tarefa: { id: 'C-x#1', nome: 'y'.repeat(2000), responsavel: null } }), { acao: 'incluir_recurso', tarefa_id: 'C-x#1', recurso: dRec() }, ctx);
  assert.ok(tarefaLonga.ok);
  assert.equal(Array.from(tarefaLonga.plano.evento.descricao).length, 1000);
  assert.ok(tarefaLonga.plano.evento.descricao.endsWith('…'));
});

test('LGPD: a observação nunca entra na descrição do Histórico (A3)', () => {
  const OBS = 'Observação secreta de teste';
  const d = [
    planejarItem(estado(), { acao: 'incluir_envolvido', tarefa_id: 'C-x#1', envolvido: dEnv('Pessoa Teste 2', null, null, OBS) }, ctx),
    planejarItem(estado({ envolvidos: [env('a', 'C-x#1', 'Pessoa Teste 2', null, null, 'antiga')] }), { acao: 'editar_envolvido', tarefa_id: 'C-x#1', item_id: 'E-a', envolvido: dEnv('Pessoa Teste 2', null, null, OBS) }, ctx),
    planejarItem(estado({ envolvidos: [env('a', 'C-x#1', 'Pessoa Teste 2', null, null, OBS)] }), { acao: 'remover_envolvido', tarefa_id: 'C-x#1', item_id: 'E-a', motivo: null }, ctx),
    planejarItem(estado(), { acao: 'incluir_recurso', tarefa_id: 'C-x#1', recurso: dRec({ observacao: OBS }) }, ctx),
    planejarItem(estado({ recursos: [rec('a', 'C-x#1', { observacao: 'antiga' })] }), { acao: 'editar_recurso', tarefa_id: 'C-x#1', item_id: 'R-a', recurso: dRec({ descricao: 'Item', observacao: OBS }) }, ctx),
    planejarItem(estado({ recursos: [rec('a', 'C-x#1', { observacao: OBS })] }), { acao: 'remover_recurso', tarefa_id: 'C-x#1', item_id: 'R-a', motivo: null }, ctx),
  ];
  for (const r of d) {
    assert.ok(r.ok);
    assert.ok(!r.plano.evento.descricao.includes(OBS));
    assert.ok(!r.plano.evento.descricao.includes('antiga'));
  }
});

const cronograma: Cronograma = {
  id: 'C-x', aba: 'A', titulo: 'Obra Teste', endereco: null, sei: [], projeto_id: null, casamento: null, pendencias: [],
  fases: [{ nome: 'Fase 1', ordem: 1, etapas: [
    { id: 'C-x#1', ordem: 1, nome: 'Primeira', fase: 'Fase 1', unidade: 'Unidade Teste', responsavel: 'Pessoa Teste 1', situacao_planilha: null, duracao_prevista: null, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, status: 'a_fazer', ciclo: null, pendencias: [], origem: null },
    { ordem: 2, nome: 'Sem código', fase: 'Fase 1', unidade: null, responsavel: null, situacao_planilha: null, duracao_prevista: null, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, status: 'a_fazer', ciclo: null, pendencias: [], origem: null },
  ] }],
};

test('CSV de recursos: cabeçalho, fórmula neutralizada, total, CRLF, sem BOM e nome do arquivo', () => {
  const itens: ItensCronograma = {
    envolvidos: [env('1', 'C-x#1', 'Pessoa Teste 2', 'Unidade Teste', 'Fiscal', '=SOMA(1)')],
    recursos: [rec('1', 'C-x#1', { tipo: 'financeiro', descricao: 'Diárias', quantidade_centesimos: 250, unidade: 'dias', valor_estimado_centavos: 123456, valor_utilizado_centavos: 100, data_uso: '2026-11-20' })],
  };
  const csv = paraCsvRecursos(cronograma, itens);
  const linhas = csv.split('\r\n');
  assert.equal(linhas.at(-1), '');
  assert.equal(linhas[0], CABECALHO_CSV_RECURSOS.map((c) => `"${c}"`).join(';'));
  assert.equal(linhas.length, 5);
  assert.ok(!csv.startsWith('﻿'));
  assert.ok(linhas[1].includes(`"'=SOMA(1)"`));
  assert.ok(linhas[1].includes('"Envolvido"'));
  assert.ok(linhas[2].includes('"Financeiro";"Diárias"'));
  assert.ok(linhas[2].includes('"2,5";"dias";"1234,56";"1,00";"20/11/2026"'));
  assert.ok(linhas[2].includes('"23/11/2026 09:00"'));
  assert.equal(linhas[3], '"";"";"";"Total";"";"";"";"";"";"";"1234,56";"1,00";"";"";"";""');
  assert.equal(nomeArquivoCsvRecursos('C-a#b', '2026-11-23'), 'recursos-C-a_b-2026-11-23.csv');
  assert.equal(paraCsvRecursos(cronograma, { envolvidos: [], recursos: [] }).split('\r\n').length, 3);
});
