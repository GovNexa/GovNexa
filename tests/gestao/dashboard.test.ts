import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import type { Cronogramas } from '../../src/lib/cronograma/tipos.ts';
import { IDS_CARTOES, filtrarCarteira, montarDashboard, opcoesFiltros, parametrosDaUrl, urlCom, type EntradaDashboard, type Filtros, type IdCartao } from '../../src/lib/gestao/dashboard.ts';
import { avaliarPrazo } from '../../src/lib/prazos/lei14133.ts';

const hoje = '2026-11-15';
const exemplo = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const crons = JSON.parse(readFileSync('data/exemplo/cronogramas/cronogramas.json', 'utf8')) as Cronogramas;
function projeto(id: string, mudar: Partial<Projeto> = {}): Projeto {
  const p = structuredClone(exemplo.projetos[0]);
  return { ...p, id, nome: `Projeto ${id}`, orgao: 'ORG-A', regiao: 'Norte', prioridade: 'Alta', compromisso: 'decidido', macroetapa: '05', pendencias: [],
    valores: { ...p.valores, total: 100, obra: null, captado: 0, contrapartida: 0, custeio_municipio: 0, executado: 50 },
    datas: { ...p.datas, encerramento: '2026-12-01', mobilizacao: '2027-01-01', preparatorio: '2027-01-01', contratacao: '2027-01-01' }, ...mudar };
}
function entrada(projetos: Projeto[] = [projeto('P-A')]): EntradaDashboard {
  return { carteira: { ...exemplo, projetos }, cronogramas: [],
    acompanhamento: { proveniencia: { fonte: 'Coleta sintética', data_coleta: '2026-11-14T12:00:00Z' },
      resumo: { em_execucao: 3, valor_repasse_pactuado_em_execucao: 600, valor_desembolsado_em_execucao: 60, saldo_a_liberar_em_execucao: 540 },
      convenios: [
        { nr_convenio: 'C-A', objeto: 'Convênio exemplo A', orgao_superior: 'Concedente A', situacao: 'Em execução', assinatura: '01/01/2026', vigencia_fim: '01/12/2026', valor_repasse: 100, valor_desembolsado: 0 },
        { nr_convenio: 'C-B', objeto: 'Convênio exemplo B', orgao_superior: 'Concedente B', situacao: 'Em execução', assinatura: '01/11/2026', vigencia_fim: '01/03/2027', valor_repasse: 200, valor_desembolsado: 20 },
        { nr_convenio: 'C-C', objeto: 'Convênio exemplo C', situacao: 'Em execução', assinatura: '01/11/2026', vigencia_fim: '01/12/2027', valor_repasse: 300, valor_desembolsado: 40 },
      ] },
    cauc: { proveniencia: { fonte: 'CAUC sintético', data_coleta: '2026-11-14T12:00:00Z', data_referencia: '13/11/2026' }, situacao_geral: 'irregular', itens_com_pendencia: ['1.1'], itens: [{ item: '1.1', descricao: 'Pendência de exemplo' }] },
    programasAbertos: { proveniencia: { fonte: 'Programas sintéticos', data_coleta: '2026-11-14T12:00:00Z' }, programas: [
      { codigo: 'O-B', nome: 'Programa exemplo B', orgao_superior: 'Concedente B', prazos: { proposta_ate: '2026-12-15' } },
      { codigo: 'O-A', nome: 'Programa exemplo A', orgao_superior: 'Concedente A', prazos: { emendas_ate: hoje } },
      { codigo: 'O-C', nome: 'Programa exemplo C', prazos: { proposta_ate: '2026-12-16' } },
      { codigo: 'O-D', nome: 'Programa exemplo D', prazos: { proposta_ate: '2026-11-14' } },
      { codigo: 'O-E', nome: 'Programa exemplo E' },
    ] } };
}
const montar = (e = entrada(), filtros: Filtros = {}) => montarDashboard(e, hoje, filtros);
const cartao = (e: EntradaDashboard, id: IdCartao, filtros: Filtros = {}) => montar(e, filtros).cartoes.find(c => c.id === id)!;

test('todos os cartões, metadados e dados de exemplo; entrada permanece intacta', () => {
  const e: EntradaDashboard = { carteira: exemplo, cronogramas: crons.cronogramas };
  const antes = structuredClone(e); const d = montar(e);
  assert.deepEqual(d.cartoes.map(c => c.id), IDS_CARTOES);
  assert.equal(d.atualizadoEm, hoje); assert.equal(d.fontes[0].data, exemplo.fonte.importado_em);
  assert.equal(d.cartoes[0].valorPrincipal, exemplo.projetos.length);
  for (const c of d.cartoes) {
    assert.ok(Object.keys(c.detalhe.resumo).length >= 2 && Object.keys(c.detalhe.resumo).length <= 3);
    assert.deepEqual(Object.keys(c.detalhe.quebras), ['porOrgao', 'porRegiao', 'porMacroetapa']);
  }
  assert.deepEqual(e, antes); assert.deepEqual(montar(e), d);
});

test('carteira e funil usam valorProjeto, inclusive fallback para obra e macroetapas 00..06', () => {
  const a = projeto('P-A'); a.valores.total = null; a.valores.obra = 700;
  const b = projeto('P-B', { macroetapa: '03' }); const d = montar(entrada([a, b]));
  assert.equal(d.cartoes[0].valorPrincipal, 2); assert.equal(d.cartoes[0].detalhe.resumo.valor, 800);
  assert.deepEqual(d.funil.map(g => g.codigo), ['00', '01', '02', '03', '04', '05', '06']);
  assert.equal(d.funil.reduce((s, g) => s + g.qtd, 0), 2);
  assert.equal(d.funil.reduce((s, g) => s + g.valor!, 0), 800);
  assert.equal(d.regioes[0].valor, 800);
});

test('execução pondera pelos valores válidos, ordena percentual crescente, null por último', () => {
  const a = projeto('P-A'); a.valores.total = 300; a.valores.executado = 30;
  const b = projeto('P-B'); b.valores.executado = 90;
  const c = projeto('P-C'); c.valores.executado = null;
  const x = projeto('P-X'); x.valores.executado = 200;
  const n = projeto('P-N'); n.valores.executado = -1;
  const r = cartao(entrada([c, b, a, x, n]), 'execucao');
  assert.equal(r.valorPrincipal, 5); assert.equal(r.detalhe.resumo.percentual, 30);
  assert.deepEqual(r.detalhe.itens.map(i => i.id), ['P-A', 'P-B', 'P-C', 'P-N', 'P-X']);
  assert.deepEqual(r.detalhe.itens.map(i => i.percentual), [10, 90, null, null, null]);
  assert.equal(cartao(entrada([c]), 'execucao').detalhe.resumo.percentual, null);
});

test('contratação só 02/03: neutro sem prazo, ok no prazo, atenção na meta e crítico no teto', () => {
  const e = entrada([projeto('P-A', { macroetapa: '02' }), projeto('P-B', { macroetapa: '03' }), projeto('P-C')]);
  assert.equal(cartao(e, 'contratacao').valorPrincipal, 2);
  assert.equal(cartao(e, 'contratacao').situacao, 'neutro');
  assert.match(cartao(e, 'contratacao').secundario, /sem prazos da Lei cadastrados/);
  e.eventosLei = [{ prazoId: 'decisao_recurso', inicio: '2026-11-13', projetoId: 'P-A', descricao: 'Evento sintético' }];
  assert.equal(cartao(e, 'contratacao').situacao, 'ok');
  const av = avaliarPrazo('decisao_recurso', '2026-11-02', hoje, exemplo.prefeitura_id);
  const amanhaMeta = new Date(Date.parse(`${av.limiteMeta}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  e.eventosLei[0].inicio = '2026-11-02';
  assert.equal(montarDashboard(e, amanhaMeta).cartoes.find(c => c.id === 'contratacao')!.situacao, 'atencao');
  e.eventosLei.push({ ...e.eventosLei[0], projetoId: 'P-B', inicio: '2026-01-01' });
  assert.equal(cartao(e, 'contratacao').situacao, 'critico');
  assert.equal(cartao(e, 'contratacao', { orgao: 'inexistente' }).situacao, 'neutro');
  e.eventosLei.forEach(v => { v.concluidoEm = hoje; });
  assert.equal(cartao(e, 'contratacao').situacao, 'neutro');
  e.eventosLei = [{ prazoId: 'recurso_razoes', inicio: '2026-01-01', projetoId: 'P-A', descricao: 'Piso, não teto' }];
  assert.equal(cartao(e, 'contratacao').situacao, 'neutro');
});

test('entregas: hoje e 90 dias inclusivos, exclui vencida/concluída/91 dias; ordenação por data', () => {
  const datas = [hoje, '2027-02-13', '2027-02-14', '2026-11-14'];
  const ps = datas.map((data, i) => { const p = projeto(`P-${i}`); p.datas.encerramento = data; return p; });
  ps.push(projeto('P-FIM', { macroetapa: '06' }));
  const c = cartao(entrada(ps.reverse()), 'entregas');
  assert.equal(c.valorPrincipal, 2); assert.deepEqual(c.detalhe.itens.map(i => i.prazo), [hoje, '2027-02-13']);
});

test('atenção e decisões: fora da 06, motivo, prioridade e limite de cinco', () => {
  const ps = ['Baixa', 'Média', 'Alta', 'Muito Alta', 'Muito Alta', 'Alta', 'Baixa'].map((prioridade, i) => {
    const p = projeto(`P-${i}`, { prioridade }); p.datas.encerramento = '2026-01-01'; return p;
  });
  ps.push(projeto('P-FIM', { macroetapa: '06' })); const d = montar(entrada(ps));
  const a = d.cartoes.find(c => c.id === 'atencao')!;
  assert.equal(a.valorPrincipal, 7); assert.equal(a.situacao, 'critico');
  assert.deepEqual(a.detalhe.itens.slice(0, 5).map(i => i.linha2), ['Muito Alta', 'Muito Alta', 'Alta', 'Alta', 'Média']);
  assert.ok(a.detalhe.itens.every(i => /vencid/.test(i.linha1)));
  assert.equal(d.decisoes.length, 5); assert.deepEqual(d.decisoes.map(i => i.id), a.detalhe.itens.slice(0, 5).map(i => i.id));
});

test('saldo sem fonte desconta fontes, ignora 06, ordena e deixa sugestões vazias', () => {
  const a = projeto('P-A'); a.valores.captado = 25;
  const b = projeto('P-B'); b.valores.total = 500; b.valores.contrapartida = 100; b.valores.custeio_municipio = 50;
  const c = projeto('P-C'); c.valores.captado = 200;
  const r = cartao(entrada([a, b, c, projeto('P-FIM', { macroetapa: '06' })]), 'falta_financiar');
  assert.equal(r.valorPrincipal, 425); assert.equal(r.detalhe.resumo.qtd, 2); assert.equal(r.unidade, 'reais');
  assert.deepEqual(r.detalhe.itens.map(i => i.valor), [350, 75]);
  assert.ok(r.detalhe.itens.every(i => i.programas?.length === 0));
  assert.equal(r.detalhe.quebras.porOrgao.reduce((s, g) => s + g.qtd, 0), 2);
  assert.equal(r.detalhe.quebras.porOrgao.reduce((s, g) => s + g.valor!, 0), 425);
});

test('convênios municipais: resumo da coleta, só em execução, risco sem duplicação e saldo em risco', () => {
  const e = entrada(); e.acompanhamento!.convenios!.push({ nr_convenio: 'C-FIM', situacao: 'Concluído', vigencia_fim: '01/12/2026', valor_repasse: 900, valor_desembolsado: 0 });
  const c = cartao(e, 'convenios');
  assert.equal(c.valorPrincipal, 3); assert.deepEqual(c.detalhe.resumo, { pactuado: 600, liberado: 60, saldoALiberar: 540 });
  assert.equal(c.detalhe.itens.length, 3);
  const r = cartao(e, 'convenios_risco');
  assert.equal(r.valorPrincipal, 2); assert.equal(r.detalhe.resumo.valor, 280);
  assert.deepEqual(r.detalhe.itens.map(i => i.id), ['C-A', 'C-B']);
  assert.equal(r.situacao, 'critico'); assert.equal(r.abrangencia, 'municipio');
});

test('risco inclui sem desembolso antigo, vigência até 180 dias e vencido; desconhecido não inventa valor', () => {
  const e = entrada(); e.acompanhamento!.convenios = [
    { nr_convenio: 'A', situacao: 'Em execução', assinatura: '01/01/2026', valor_repasse: 40, valor_desembolsado: 0 },
    { nr_convenio: 'B', situacao: 'Em execução', vigencia_fim: '14/05/2027', valor_repasse: 20, valor_desembolsado: 5 },
    { nr_convenio: 'C', situacao: 'Em execução', vigencia_fim: '15/05/2027', valor_repasse: 30, valor_desembolsado: 5 },
    { nr_convenio: 'D', situacao: 'Em execução', vigencia_fim: '01/11/2026' },
  ];
  const r = cartao(e, 'convenios_risco'); assert.equal(r.valorPrincipal, 3); assert.equal(r.detalhe.resumo.valor, 55);
  assert.deepEqual(r.cobertura, { comValor: 2, total: 3 });
  assert.equal(r.detalhe.itens[0].valor, null);
  assert.deepEqual(r.detalhe.itens.map(i => i.id), ['D', 'B', 'A']);
});

test('CAUC: pendências com descrição/data de consulta, regular e sem dado', () => {
  const e = entrada(); const c = cartao(e, 'cauc');
  assert.equal(c.valorPrincipal, 1); assert.equal(c.situacao, 'critico'); assert.match(c.secundario, /com pendência; consulta: 2026-11-13/);
  assert.equal(c.detalhe.itens[0].nome, 'Pendência de exemplo');
  e.cauc!.situacao_geral = 'regular'; e.cauc!.itens_com_pendencia = [];
  assert.equal(cartao(e, 'cauc').valorPrincipal, 0); assert.equal(cartao(e, 'cauc').situacao, 'ok');
  e.cauc = {}; assert.equal(cartao(e, 'cauc').valorPrincipal, null); assert.match(cartao(e, 'cauc').secundario, /sem dado/);
});

test('oportunidades: prazo de hoje até 30 dias, órgão e ordenação; ausência não vira zero', () => {
  const e = entrada(); const c = cartao(e, 'oportunidades');
  assert.equal(c.valorPrincipal, 2); assert.deepEqual(c.detalhe.itens.map(i => i.id), ['O-A', 'O-B']);
  assert.equal(c.detalhe.itens[0].linha1, 'Concedente A'); assert.equal(c.detalhe.itens[0].valor, null);
  e.programasAbertos = null; assert.equal(cartao(e, 'oportunidades').valorPrincipal, null);
  e.programasAbertos = { programas: [] }; assert.equal(cartao(e, 'oportunidades').valorPrincipal, 0);
});

test('ausência preserva null nos totais, detalhes, quebras e fontes; vazio conhecido conta zero', () => {
  const p = projeto('P-A'); p.valores.total = null; p.valores.obra = null; p.valores.executado = null;
  const e: EntradaDashboard = { carteira: { ...exemplo, projetos: [p] }, cronogramas: [] }; const d = montar(e);
  assert.equal(d.cartoes[0].detalhe.resumo.valor, null); assert.equal(d.cartoes[0].detalhe.quebras.porOrgao[0].valor, null);
  assert.equal(d.funil.find(g => g.codigo === '05')!.valor, null); assert.equal(d.regioes[0].valor, null);
  for (const id of ['convenios', 'convenios_risco', 'cauc', 'oportunidades'] as const) assert.equal(cartao(e, id).valorPrincipal, null);
  assert.equal(cartao(e, 'falta_financiar').valorPrincipal, null);
  assert.equal(cartao(e, 'execucao').detalhe.resumo.percentual, null);
  assert.ok(d.fontes.slice(1).every(f => f.data === null));
  e.acompanhamento = { resumo: { em_execucao: 0 }, convenios: [] };
  assert.equal(cartao(e, 'convenios').valorPrincipal, 0); assert.equal(cartao(e, 'convenios').detalhe.resumo.pactuado, null);
  assert.equal(cartao(e, 'convenios_risco').valorPrincipal, 0);
});

test('cada filtro e a combinação respeitam todos os cartões da carteira e preservam municipais', () => {
  const a = projeto('P-A'); a.datas.encerramento = '2026-01-01';
  const b = projeto('P-B', { regiao: 'Sul', orgao: 'ORG-B', prioridade: 'Baixa', compromisso: 'ideia', macroetapa: '03' }); b.datas.encerramento = '2026-01-01';
  const e = entrada([a, b]); const base = montar(e);
  const filtros: Filtros[] = [{ regiao: 'Norte' }, { orgao: 'ORG-A' }, { prioridade: 'Alta' }, { compromisso: 'decidido' }, { regiao: 'Norte', orgao: 'ORG-A', prioridade: 'Alta', compromisso: 'decidido' }, { orgao: 'ORG-B', regiao: 'Norte' }];
  for (const filtro of filtros) {
    const d = montar(e, filtro); const ids = filtrarCarteira(e.carteira, filtro).projetos.map(p => p.id);
    for (const c of d.cartoes) {
      if (c.abrangencia === 'municipio') assert.deepEqual(c, base.cartoes.find(b => b.id === c.id));
      else {
        assert.ok(c.detalhe.itens.every(i => ids.includes(i.id)));
        for (const grupos of Object.values(c.detalhe.quebras)) assert.ok(grupos.reduce((s, g) => s + g.qtd, 0) <= ids.length);
      }
    }
    assert.equal(d.cartoes[0].valorPrincipal, ids.length);
    assert.equal(d.funil.reduce((s, g) => s + g.qtd, 0), ids.length);
    assert.equal(d.regioes.reduce((s, g) => s + g.qtd, 0), ids.length);
    assert.ok(d.decisoes.every(p => ids.includes(p.id)));
    const referencia = montar({ ...e, carteira: filtrarCarteira(e.carteira, filtro) });
    for (const c of d.cartoes.filter(c => c.abrangencia === 'carteira')) assert.deepEqual(c.detalhe.resumo, referencia.cartoes.find(r => r.id === c.id)!.detalhe.resumo);
  }
});

test('parado só considera cronogramas vinculados aos projetos filtrados, top 5', () => {
  const e = entrada([projeto('P-A'), projeto('P-B', { regiao: 'Sul' })]);
  const modelo = crons.cronogramas.find(c => c.fases.some(f => f.etapas.length))!;
  const etapa = structuredClone(modelo.fases.flatMap(f => f.etapas)[0]);
  e.cronogramas = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(modelo), id: `C-${i}`, projeto_id: i === 7 ? null : i < 6 ? 'P-A' : 'P-B', fases: [{ nome: 'Fase exemplo', ordem: 1, etapas: [{ ...etapa, unidade: `Unidade ${i}`, inicio_real: '2026-01-01', fim_real: null, inicio_previsto: '2026-01-01', fim_previsto: '2026-02-01' }] }] }));
  assert.equal(montar(e).parado.length, 5);
  assert.deepEqual(montar(e, { regiao: 'Sul' }).parado.map(u => u.unidade), ['Unidade 6']);
  assert.deepEqual(montar(e, { regiao: 'inexistente' }).parado, []);
});

test('opções ordenadas sem duplicatas e URL validada com ida e volta de filtros, cartão e projeto', () => {
  const e = entrada([projeto('P-A'), projeto('P-B', { regiao: 'Sul', orgao: 'ORG-B', prioridade: 'Baixa' }), projeto('P-C')]);
  const validos = { ...opcoesFiltros(e.carteira), projetos: ['P-A', 'P-B'] };
  assert.deepEqual(validos.regioes, ['Norte', 'Sul']); assert.deepEqual(validos.orgaos, ['ORG-A', 'ORG-B']); assert.deepEqual(validos.prioridades, ['Alta', 'Baixa']);
  const filtros: Filtros = { regiao: 'Norte', orgao: 'ORG-A', prioridade: 'Alta', compromisso: 'decidido' };
  for (const cartao of IDS_CARTOES) assert.deepEqual(parametrosDaUrl(new URL(urlCom(filtros, cartao, 'P-A'), 'https://example.test'), validos), { filtros, cartao, projeto: 'P-A' });
  assert.deepEqual(parametrosDaUrl(new URL('https://example.test/?regiao=X&orgao=X&prioridade=X&compromisso=X&cartao=X&projeto=X'), validos), { filtros: {} });
  assert.deepEqual(parametrosDaUrl(new URL('https://example.test/?projeto=P-A'), opcoesFiltros(e.carteira)), { filtros: {} });
  assert.equal(urlCom({}), '/plataforma/');
});

test('somas parciais preservam conhecidos e cobertura nos cartões, quebras e funil', () => {
  const a = projeto('P-A'); const b = projeto('P-B');
  b.valores.total = null; b.valores.obra = null;
  for (const macroetapa of ['05', '02'] as const) {
    a.macroetapa = macroetapa; b.macroetapa = macroetapa;
    const e = entrada([a, b]); const d = montar(e);
    for (const id of ['carteira', 'entregas', macroetapa === '05' ? 'execucao' : 'contratacao'] as const) {
      const c = d.cartoes.find(c => c.id === id)!;
      assert.equal(c.detalhe.resumo.valor, 100);
      assert.deepEqual(c.cobertura, { comValor: 1, total: 2 });
      assert.deepEqual(c.detalhe.coberturas!.valor, c.cobertura);
      assert.match(c.secundario, /R\$ 100 · 1 de 2 projetos com valor/);
      assert.equal(c.detalhe.itens.find(i => i.id === b.id)!.valor, null);
      for (const grupos of Object.values(c.detalhe.quebras)) {
        assert.equal(grupos[0].valor, 100);
        assert.deepEqual(grupos[0].cobertura, c.cobertura);
      }
    }
    assert.equal(d.regioes[0].valor, 100);
    assert.deepEqual(d.regioes[0].cobertura, { comValor: 1, total: 2 });
    assert.equal(d.funil.find(g => g.codigo === macroetapa)!.valor, 100);
    assert.deepEqual(d.funil.find(g => g.codigo === macroetapa)!.cobertura, { comValor: 1, total: 2 });
    const falta = cartao(e, 'falta_financiar');
    assert.equal(falta.valorPrincipal, 100);
    assert.deepEqual(falta.cobertura, { comValor: 1, total: 2 });
    assert.equal(falta.secundario, '1 projetos com saldo identificado');
  }
});

test('todos os valores ausentes dão null; cobertura completa dispensa texto adicional', () => {
  const p = projeto('P-A'); p.valores.total = null; p.valores.obra = null;
  const c = cartao(entrada([p]), 'carteira');
  assert.equal(c.detalhe.resumo.valor, null);
  assert.equal(c.detalhe.itens[0].valor, null);
  assert.deepEqual(c.cobertura, { comValor: 0, total: 1 });
  assert.equal(c.secundario, '— · 0 de 1 projetos com valor');
  assert.equal(cartao(entrada(), 'carteira').secundario, 'R$ 100');
  const vazio = cartao(entrada([]), 'carteira');
  assert.equal(vazio.valorPrincipal, 0); assert.equal(vazio.detalhe.resumo.valor, null);
  assert.deepEqual(vazio.cobertura, { comValor: 0, total: 0 });
});

test('média ponderada informa cobertura dos pares válidos, independente da soma', () => {
  const a = projeto('P-A'); const b = projeto('P-B'); const c = projeto('P-C');
  b.valores.executado = null; c.valores.total = null; c.valores.obra = null;
  const r = cartao(entrada([a, b, c]), 'execucao');
  assert.equal(r.detalhe.resumo.valor, 200);
  assert.equal(r.detalhe.resumo.percentual, 50);
  assert.deepEqual(r.detalhe.coberturas, { valor: { comValor: 2, total: 3 }, percentual: { comValor: 1, total: 3 } });
  assert.match(r.secundario, /50.0% executado · 1 de 3 projetos com valor/);
});
