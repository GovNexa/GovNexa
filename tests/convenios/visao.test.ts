// Visão Convênios (E11): em execução, em risco e CAUC a partir das coletas da Captação. Dados sintéticos, sem dado real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira } from '../../src/lib/carteira/tipos.ts';
import { DIAS_RISCO_VIGENCIA, linkConvenio, montarVisaoConvenios, porVigencia, somaReais, type ConvenioColeta, type EntradaVisaoConvenios } from '../../src/lib/convenios/visao.ts';
import { montarDashboard } from '../../src/lib/gestao/dashboard.ts';

const hoje = '2026-11-15';
const conv = (nr: string, mudar: Partial<ConvenioColeta> = {}): ConvenioColeta => ({
  nr_convenio: nr, objeto: `Convênio ${nr}`, orgao_superior: 'Concedente A', situacao: 'Em execução', assinatura: '01/11/2026',
  vigencia_fim: '01/12/2027', valor_repasse: 100, valor_desembolsado: 10, saldo_a_liberar: 90, ...mudar,
});
const entrada = (convenios: ConvenioColeta[] = [], cauc: EntradaVisaoConvenios['cauc'] = null): EntradaVisaoConvenios => ({
  acompanhamento: { proveniencia: { data_coleta: '2026-11-14T12:00:00Z' }, convenios }, cauc,
});

test('em execução: só a situação "Em execução", da vigência mais próxima para a mais distante, sem data por último', () => {
  const v = montarVisaoConvenios(entrada([
    conv('C-3', { vigencia_fim: '01/06/2028' }), conv('C-1', { vigencia_fim: null }), conv('C-2', { vigencia_fim: '01/02/2028' }),
    conv('C-9', { situacao: 'Prestação de Contas Concluída' }), conv('C-8', { situacao: 'Convênio Anulado' }),
  ]), hoje);
  assert.deepEqual(v.execucao.lista.map((c) => c.nr), ['C-2', 'C-3', 'C-1']);
  assert.equal(v.execucao.disponivel, true);
  assert.equal(v.execucao.lista[0].vigencia, '2028-02-01');
  assert.equal(v.execucao.lista[0].link, '/plataforma/captacao-acompanhamento/?q=C-2');
});

test('em execução: totais em centavos e só com valores conhecidos', () => {
  const v = montarVisaoConvenios(entrada([
    conv('C-1', { valor_repasse: 0.1, valor_desembolsado: 0.2, saldo_a_liberar: null }),
    conv('C-2', { valor_repasse: 0.2, valor_desembolsado: null, saldo_a_liberar: null }),
  ]), hoje);
  assert.equal(v.execucao.repasse, 0.3);
  assert.equal(v.execucao.liberado, 0.2);
  // A liberar = repasse − liberado, nunca negativo; sem liberado e sem saldo na coleta, desconhecido.
  assert.deepEqual(v.execucao.lista.map((c) => c.aLiberar), [0, null]);
  assert.equal(v.execucao.aLiberar, 0);
  assert.equal(somaReais([null, null]), null);
});

test('em risco: sem desembolso há mais de 180 dias, vigência em até 90 dias (vermelho em 30) e janela de 180 dias', () => {
  const v = montarVisaoConvenios(entrada([
    conv('SEM-DES', { assinatura: '01/01/2026', valor_desembolsado: 0 }), // 318 dias sem desembolso
    conv('SEM-DES-179', { assinatura: '20/05/2026', valor_desembolsado: 0 }), // 179 dias: ainda não
    conv('VIG-20', { vigencia_fim: '05/12/2026' }), // 20 dias: vermelho
    conv('VIG-180', { vigencia_fim: '14/05/2027' }), // 180 dias: entra pela janela
    conv('VIG-181', { vigencia_fim: '15/05/2027' }), // 181 dias: fora
    conv('VENCIDA', { vigencia_fim: '01/11/2026' }), // já terminou: alerta de vigência
  ]), hoje);
  assert.deepEqual(v.risco.lista.map((c) => c.nr).sort(), ['SEM-DES', 'VENCIDA', 'VIG-180', 'VIG-20']);
  const por = Object.fromEntries(v.risco.lista.map((c) => [c.nr, c]));
  assert.equal(por['VIG-20'].gravidade, 'vermelho');
  assert.equal(por['SEM-DES'].gravidade, 'amarelo');
  assert.match(por['SEM-DES'].motivos[0], /sem nenhum desembolso/);
  assert.deepEqual(por['VIG-180'].motivos, [`Vigência termina em até ${DIAS_RISCO_VIGENCIA} dias`]);
  assert.equal(por['VENCIDA'].dias, -14);
  assert.equal(v.risco.vermelhos, 2); // VIG-20 e VENCIDA (vigência terminada conta como vermelho)
});

test('em risco: mesma contagem e mesmo valor do cartão "Convênios em risco" do Painel da equipe', () => {
  const convenios = [
    conv('A', { assinatura: '01/01/2025', valor_desembolsado: 0, saldo_a_liberar: 100 }), conv('B', { vigencia_fim: '01/01/2027' }),
    conv('C', { vigencia_fim: '01/12/2030' }), conv('D', { vigencia_fim: '20/11/2026', valor_desembolsado: 30, saldo_a_liberar: 70 }),
    conv('E', { situacao: 'Cancelado', vigencia_fim: '20/11/2026' }),
  ];
  const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
  const painel = montarDashboard({ carteira, cronogramas: [], acompanhamento: { convenios } }, hoje).cartoes.find((c) => c.id === 'convenios_risco')!;
  const v = montarVisaoConvenios(entrada(convenios), hoje);
  assert.equal(v.risco.lista.length, painel.valorPrincipal);
  assert.deepEqual(v.risco.lista.map((c) => c.nr).sort(), painel.detalhe.itens.map((i) => i.id).sort());
  assert.equal(v.risco.aLiberar, painel.detalhe.resumo.valor);
});

test('CAUC: regular, com pendência e sem dado; itens sem informação à parte', () => {
  const itens = [
    { item: '1.1', descricao: 'Tributos', situacao: 'indisponivel', validade: null },
    { item: '1.2', descricao: 'Precatórios', situacao: 'regular', validade: '2026-11-09' },
    { item: '5.6', descricao: 'Fundeb', situacao: 'sem_informacao', validade: null },
  ];
  const regular = montarVisaoConvenios(entrada([], { proveniencia: { data_referencia: '09/11/2026', data_coleta: '2026-11-10T00:17:32Z' }, situacao_geral: 'regular', itens, itens_com_pendencia: [] }), hoje).cauc;
  assert.equal(regular.estado, 'regular');
  assert.equal(regular.referencia, '2026-11-09');
  assert.deepEqual([regular.total, regular.regulares, regular.pendencias.length], [3, 1, 0]);
  assert.deepEqual(regular.semInformacao.map((i) => [i.item, i.situacao]), [['1.1', 'indisponível'], ['5.6', 'sem informação']]);

  const pendente = montarVisaoConvenios(entrada([], { situacao_geral: 'irregular', itens: [...itens, { item: '2.1', descricao: 'Siconfi', situacao: 'pendente', validade: null }], itens_com_pendencia: ['2.1'] }), hoje).cauc;
  assert.equal(pendente.estado, 'com_pendencia');
  assert.deepEqual(pendente.pendencias, [{ item: '2.1', descricao: 'Siconfi', situacao: 'pendente' }]);
  assert.equal(pendente.referencia, null);

  // Sem a lista de pendências, "regular" não é afirmado.
  assert.equal(montarVisaoConvenios(entrada([], { situacao_geral: 'regular', itens }), hoje).cauc.estado, 'sem_dado');
  assert.equal(montarVisaoConvenios(entrada([], null), hoje).cauc.estado, 'sem_dado');
  assert.equal(montarVisaoConvenios(entrada([], null), hoje).cauc.disponivel, false);
});

test('sem coleta do Transferegov: blocos indisponíveis, nada inventado', () => {
  const v = montarVisaoConvenios({ acompanhamento: null, cauc: null }, hoje);
  assert.equal(v.execucao.disponivel, false);
  assert.equal(v.risco.disponivel, false);
  assert.deepEqual([v.execucao.lista.length, v.risco.lista.length, v.execucao.repasse, v.risco.aLiberar, v.coletaConvenios], [0, 0, null, null, null]);
});

test('texto da coleta é só dado: número com marcação vira texto escapado no link e nada é interpretado', () => {
  const nr = '<img src=x onerror=alert(1)>';
  const v = montarVisaoConvenios(entrada([conv(nr, { objeto: '  Obra   com\nquebra  ' })]), hoje);
  assert.equal(v.execucao.lista[0].nr, nr);
  assert.equal(v.execucao.lista[0].objeto, 'Obra com quebra');
  assert.equal(linkConvenio(nr), '/plataforma/captacao-acompanhamento/?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  assert.ok(!v.execucao.lista[0].link.includes('<'));
});

test('ordem por vigência é estável e põe sem data por último', () => {
  const base = { objeto: '', concedente: '', modalidade: null, dias: null, repasse: null, liberado: null, aLiberar: null, link: '' };
  const lista = [{ ...base, nr: 'B', vigencia: null }, { ...base, nr: 'A', vigencia: null }, { ...base, nr: 'C', vigencia: '2027-01-01' }];
  assert.deepEqual([...lista].sort(porVigencia).map((c) => c.nr), ['C', 'A', 'B']);
});
