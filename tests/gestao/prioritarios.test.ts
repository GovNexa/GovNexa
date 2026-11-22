process.env.GOVNEXA_EXEMPLO = '1'; // usa os dados fictícios de data/exemplo, não a carga real
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import {
  AVISOS_PRIORITARIOS, FILTROS_PRIORITARIOS_VAZIOS, NOME_OUTRAS, OUTRAS, SEM_AREA, alternar, alternarMes, areaEfetiva, centavos, coresDasAreas,
  filtrarPrioritarios, linhaDoTempo, lerFiltrosPrioritarios, mesesEntre, montarPrioritarios, obrasPorArea, opcoesPrioritarios, principaisObras,
  proximasEntregas, reaisCurtos, resumoPorEtapa, rotulosDoEixo, urlPrioritarios,
} from '../../src/lib/gestao/prioritarios.ts';
import { dataEntrega } from '../../src/lib/carteira/filtros.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const HOJE = '2026-11-22';
let seq = 0;
function sintetico(mudar: (p: Projeto) => void): Projeto {
  const p = JSON.parse(JSON.stringify(carteira.projetos[0])) as Projeto;
  p.id = `P-T${++seq}`; p.nome = `Teste ${seq}`; p.pendencias = []; p.area = null; p.prioritario = null; p.orgao = 'SEINFRA';
  mudar(p);
  return p;
}
const vazio = { ...FILTROS_PRIORITARIOS_VAZIOS };
const somaQtd = (r: ReturnType<typeof resumoPorEtapa>) => r.porEtapa.reduce((t, x) => t + x.qtd, 0);
const somaCentavos = (r: ReturnType<typeof resumoPorEtapa>) => r.porEtapa.reduce((t, x) => t + x.centavos, 0);

test('prioritarios: as partes somam o total em quantidade', () => {
  const extras = [sintetico(p => { p.macroetapa = null; }), sintetico(p => { p.macroetapa = '06'; })];
  for (const lista of [carteira.projetos, [...carteira.projetos, ...extras], []]) {
    const r = resumoPorEtapa(lista);
    assert.equal(r.qtd, lista.length);
    assert.equal(somaQtd(r), r.qtd);
  }
});

test('prioritarios: as partes somam o total em valor (centavos inteiros)', () => {
  const lista = [
    ...carteira.projetos,
    sintetico(p => { p.valores.total = 0.1; p.macroetapa = '01'; }),
    sintetico(p => { p.valores.total = 0.2; p.macroetapa = '02'; }),
    sintetico(p => { p.valores.total = null; p.valores.obra = null; p.macroetapa = '03'; }),
    sintetico(p => { p.valores.total = -5; p.valores.obra = null; p.macroetapa = '05'; }),
  ];
  const r = resumoPorEtapa(lista);
  assert.equal(somaCentavos(r), r.centavos);
  assert.equal(r.semValor, 2);
  assert.equal(r.porEtapa.reduce((t, x) => t + x.semValor, 0), 2);
  const esperado = carteira.projetos.reduce((t, p) => t + Math.round((p.valores.total ?? p.valores.obra ?? 0) * 100), 0) + 10 + 20;
  assert.equal(r.centavos, esperado);
});

test('prioritarios: mobilização conta em Execução; Concluídas e Sem macroetapa só aparecem quando existem', () => {
  const r = resumoPorEtapa(carteira.projetos);
  assert.deepEqual(r.porEtapa.map(x => x.id), ['execucao', 'contratacao', 'preparatorio', 'planejamento', 'estruturacao', 'concluida']);
  assert.equal(r.porEtapa[0].qtd, 4);
  const sem = resumoPorEtapa([sintetico(p => { p.macroetapa = null; })]);
  assert.deepEqual(sem.porEtapa.map(x => [x.id, x.qtd]), [['execucao', 0], ['contratacao', 0], ['preparatorio', 0], ['planejamento', 0], ['estruturacao', 0], ['sem', 1]]);
});

test('prioritarios: carteira vazia dá zeros, listas vazias e linha do tempo sem barras', () => {
  const t = montarPrioritarios([], new URLSearchParams(''), HOJE);
  assert.equal(t.vazia, true);
  assert.equal(t.resumo.qtd, 0); assert.equal(t.resumo.centavos, 0); assert.equal(t.resumo.porEtapa.length, 5);
  assert.deepEqual(t.porArea, []); assert.deepEqual(t.proximas, { itens: [], total: 0 }); assert.deepEqual(t.principais, []);
  assert.equal(t.linha.total, 0); assert.equal(t.linha.maximo, 0); assert.deepEqual(t.linha.series, []);
  assert.equal(t.linha.meses.length, 26);
});

test('prioritarios: endereço inválido é ignorado com aviso de texto fixo', () => {
  const op = opcoesPrioritarios(carteira.projetos);
  const ler = (q: string) => lerFiltrosPrioritarios(new URLSearchParams(q), op);
  const r = ler('regiao=' + encodeURIComponent('<script>x</script>') + '&etapa=' + encodeURIComponent('<img src=x>') + '&area=' + encodeURIComponent('"onmouseover') + '&orgao=XYZ&prioritarios=sim');
  assert.deepEqual(r.filtros, vazio);
  assert.ok(r.avisos.includes(AVISOS_PRIORITARIOS.regiao));
  assert.ok(r.avisos.includes(AVISOS_PRIORITARIOS.etapa));
  assert.equal(r.avisos.length, 4);
  assert.ok(!r.avisos.join(' ').includes('<'));
  assert.ok(!r.avisos.join(' ').includes('onmouseover'));
  assert.deepEqual(ler('').avisos, []);
  assert.equal(ler('macro=99&q=abc').avisos.length, 0);
});

test('prioritarios: endereço válido é lido inteiro', () => {
  const op = opcoesPrioritarios(carteira.projetos);
  const r = lerFiltrosPrioritarios(new URLSearchParams('prioritarios=1&orgao=SMS&area=saude&regiao=Norte&etapa=execucao&de_mes=03&de_ano=2027&ate_mes=03&ate_ano=2027'), op);
  assert.deepEqual(r.filtros, { prioritarios: true, orgao: 'SMS', area: 'saude', regiao: 'Norte', etapa: 'execucao', de: '2027-03', ate: '2027-03' });
  assert.deepEqual(r.avisos, []);
  assert.equal(lerFiltrosPrioritarios(new URLSearchParams('area=' + encodeURIComponent(SEM_AREA)), op).filtros.area, SEM_AREA);
});

test('prioritarios: só prioritários usa a marca da E1', () => {
  const l = filtrarPrioritarios(carteira.projetos, { ...vazio, prioritarios: true });
  assert.deepEqual(l.map(p => p.id), ['P-901', 'P-904']);
});

test('prioritarios: área usa a sugestão por órgão e "Sem área" quando não há', () => {
  const porId = (id: string) => carteira.projetos.find(p => p.id === id)!;
  assert.deepEqual(areaEfetiva(porId('P-910')), { codigo: 'drenagem', nome: 'Drenagem' });
  assert.deepEqual(areaEfetiva(porId('P-903')), { codigo: 'assistencia_social', nome: 'Assistência social' });
  assert.deepEqual(areaEfetiva(porId('P-900')), { codigo: SEM_AREA, nome: 'Sem área' });
  const areas = obrasPorArea(carteira.projetos, coresDasAreas(carteira.projetos));
  assert.equal(areas.reduce((t, a) => t + a.qtd, 0), carteira.projetos.length);
  assert.equal(areas[areas.length - 1].codigo, SEM_AREA);
  assert.equal(areas[areas.length - 1].cor, null);
  assert.equal(filtrarPrioritarios(carteira.projetos, { ...vazio, area: 'saude' }).length, 3);
});

test('prioritarios: mais de 6 áreas viram Outros na linha do tempo e a cor segue a área, não o filtro', () => {
  const codigos = ['saude', 'educacao', 'assistencia_social', 'drenagem', 'parques_e_lazer', 'cultura', 'mobilidade_urbana', 'habitacao'];
  const lista = codigos.flatMap((c, i) => Array.from({ length: 8 - i }, () => sintetico(p => { p.area = c; p.macroetapa = '05'; p.datas.encerramento = '2027-05-10'; })));
  const cores = coresDasAreas(lista);
  assert.equal(cores.size, 6);
  assert.equal(cores.get('saude'), 1); assert.equal(cores.get('cultura'), 6); assert.equal(cores.has('habitacao'), false);
  const linha = linhaDoTempo(lista, HOJE, cores);
  assert.equal(linha.series.length, 7);
  assert.deepEqual(linha.series[6], { id: OUTRAS, nome: NOME_OUTRAS, cor: null });
  const maio = linha.meses.find(m => m.mes === '2027-05')!;
  assert.equal(maio.total, lista.length);
  assert.equal(maio.porSerie[6], 2 + 1);
  const soCultura = filtrarPrioritarios(lista, { ...vazio, area: 'cultura' });
  assert.equal(obrasPorArea(soCultura, cores)[0].cor, 6);
});

test('prioritarios: linha do tempo agrupa por mês até dez/2028 e conta o que fica fora', () => {
  const lista = [
    sintetico(p => { p.macroetapa = '01'; p.datas.encerramento = '2026-11-30'; }),
    sintetico(p => { p.macroetapa = '01'; p.datas.encerramento = '2028-12-31'; }),
    sintetico(p => { p.macroetapa = '01'; p.datas.encerramento = '2029-01-01'; }),
    sintetico(p => { p.macroetapa = '01'; p.datas.encerramento = '2026-10-31'; }),
    sintetico(p => { p.macroetapa = '01'; p.datas.encerramento = null; p.datas.mobilizacao = null; }),
    sintetico(p => { p.macroetapa = '06'; p.datas.encerramento = '2027-01-15'; }),
  ];
  const linha = linhaDoTempo(lista, HOJE, new Map());
  assert.equal(linha.meses[0].mes, '2026-11'); assert.equal(linha.meses[linha.meses.length - 1].mes, '2028-12');
  assert.equal(linha.meses[0].total, 1); assert.equal(linha.meses[linha.meses.length - 1].total, 1);
  assert.deepEqual(linha.fora, { semData: 1, antes: 1, depois: 1 });
  assert.equal(linha.total, 2);
  assert.deepEqual(linha.series, [{ id: SEM_AREA, nome: 'Sem área', cor: null }]);
  assert.equal(linhaDoTempo(lista, '2029-02-01', new Map()).meses.length, 0);
});

test('prioritarios: data de entrega igual à E2 (mobilização + dias)', () => {
  const p = sintetico(x => { x.macroetapa = '04'; x.datas.encerramento = null; x.datas.mobilizacao = '2027-01-01'; x.datas.execucao_dias = 31; });
  assert.equal(dataEntrega(p), '2027-02-01');
  const linha = linhaDoTempo([p], HOJE, new Map());
  assert.equal(linha.meses.find(m => m.mes === '2027-02')!.total, 1);
  assert.equal(proximasEntregas([p], HOJE).itens[0].entrega, '2027-02-01');
});

test('prioritarios: próximas entregas da mais próxima para a mais distante, sem concluídas e sem datas passadas', () => {
  const r = proximasEntregas(carteira.projetos, HOJE);
  assert.equal(r.total, 12);
  assert.equal(r.itens.length, 8);
  const datas = r.itens.map(i => i.entrega!);
  assert.deepEqual(datas, [...datas].sort());
  assert.equal(r.itens[0].id, 'P-900');
  assert.ok(!r.itens.some(i => i.id === 'P-906' || i.id === 'P-913'));
  assert.equal(proximasEntregas(carteira.projetos, '2027-12-26').total, 3);
});

test('prioritarios: principais obras: prioritários primeiro, depois maior valor', () => {
  const r = principaisObras(carteira.projetos);
  assert.deepEqual(r.map(i => i.id), ['P-901', 'P-904', 'P-905', 'P-912', 'P-910']);
  assert.equal(r[0].prioritario, true);
});

test('prioritarios: endereço gerado é estável e alternar desliga o filtro', () => {
  assert.equal(urlPrioritarios(vazio), '/plataforma/');
  const f = { ...vazio, etapa: 'execucao' as const, area: 'saude', prioritarios: true };
  assert.equal(urlPrioritarios(f), '/plataforma/?prioritarios=1&area=saude&etapa=execucao');
  assert.equal(urlPrioritarios(alternar(f, 'etapa', 'execucao')), '/plataforma/?prioritarios=1&area=saude');
  assert.equal(urlPrioritarios(alternar(f, 'etapa', 'contratacao')), '/plataforma/?prioritarios=1&area=saude&etapa=contratacao');
  assert.equal(urlPrioritarios(alternarMes(vazio, '2027-03')), '/plataforma/?de_mes=03&de_ano=2027&ate_mes=03&ate_ano=2027');
  assert.equal(urlPrioritarios(alternarMes(alternarMes(vazio, '2027-03'), '2027-03')), '/plataforma/');
  assert.equal(urlPrioritarios({ ...vazio, orgao: 'A&B' }), '/plataforma/?orgao=A%26B');
});

test('prioritarios: filtro que zera tudo e filtro de uma área só', () => {
  const t = montarPrioritarios(carteira.projetos, new URLSearchParams('prioritarios=1&etapa=concluida'), HOJE);
  assert.equal(t.vazia, false); assert.equal(t.resumo.qtd, 0); assert.equal(somaQtd(t.resumo), 0);
  assert.deepEqual(t.porArea, []); assert.equal(t.proximas.total, 0); assert.equal(t.linha.total, 0);
  const s = montarPrioritarios(carteira.projetos, new URLSearchParams('area=drenagem'), HOJE);
  assert.equal(s.resumo.qtd, 1); assert.deepEqual(s.porArea.map(a => a.codigo), ['drenagem']);
  assert.equal(s.linha.series.length, 1); assert.equal(s.cores.get('drenagem'), montarPrioritarios(carteira.projetos, new URLSearchParams(''), HOJE).cores.get('drenagem'));
});

test('prioritarios: meses, rótulos do eixo, centavos e valor curto', () => {
  assert.deepEqual(mesesEntre('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(mesesEntre('2027-02', '2026-11'), []);
  assert.deepEqual(mesesEntre('2027-13', '2028-01'), []);
  assert.deepEqual(rotulosDoEixo(mesesEntre('2026-11', '2027-08')), ['', '', 'jan/2027', '', '', '', '', '', 'jul/2027', '']);
  assert.deepEqual(rotulosDoEixo(mesesEntre('2027-02', '2027-08')), ['fev/2027', '', '', '', '', 'jul/2027', '']);
  assert.equal(centavos(0.1), 10); assert.equal(centavos(null), null); assert.equal(centavos(-1), null); assert.equal(centavos(Number.NaN), null);
  assert.equal(reaisCurtos(120000000), 'R$ 1,2 mi');
  assert.equal(reaisCurtos(0), 'R$ 0');
});
