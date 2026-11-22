process.env.GOVNEXA_EXEMPLO = '1'; // usa os dados fictícios de data/exemplo, não a carga real
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira, CodigoMacroetapa, Projeto } from '../../src/lib/carteira/tipos.ts';
import { FILTROS_VAZIOS, type FiltrosProjetos } from '../../src/lib/carteira/filtros.ts';
import { MACROETAPAS } from '../../src/lib/carteira/macroetapas.ts';
import { URL_CARTEIRA, agruparPorMacroetapa, descreverFiltros, filtrarCarteira, formatarReais, idDaBusca, lerSoPrioritarios, numeroDoId, totaisCarteira, urlCarteiraPorOrgao } from '../../src/lib/carteira/lista.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const base = carteira.projetos;
function sintetico(id: string, mudar: (p: Projeto) => void = () => {}): Projeto {
  const p = JSON.parse(JSON.stringify(base[0])) as Projeto;
  p.id = id;
  p.pendencias = [];
  mudar(p);
  return p;
}
const ids = (l: Projeto[]): string[] => l.map((p) => p.id);
const comFiltro = (mudar: Partial<FiltrosProjetos>): FiltrosProjetos => ({ ...FILTROS_VAZIOS, ...mudar });

test('lista: totais da carteira de exemplo', () => {
  assert.deepEqual(totaisCarteira(base), { qtd: 14, centavos: 11520000000, valor: 115200000, semValor: 0 });
});
test('lista: a soma dos grupos é igual ao total e cada projeto aparece uma vez', () => {
  const grupos = agruparPorMacroetapa(base);
  const total = totaisCarteira(base);
  assert.equal(grupos.reduce((s, g) => s + g.qtd, 0), total.qtd);
  assert.equal(grupos.reduce((s, g) => s + g.centavos, 0), total.centavos);
  assert.equal(new Set(grupos.flatMap((g) => ids(g.projetos))).size, 14);
});
test('lista: grupos na ordem do ciclo, sem grupo vazio', () => {
  assert.deepEqual(agruparPorMacroetapa(base).map((g) => g.codigo), ['00', '01', '02', '03', '04', '05', '06']);
  assert.deepEqual(ids(agruparPorMacroetapa(base)[0].projetos), ['P-900', 'P-907']);
  assert.deepEqual(agruparPorMacroetapa([sintetico('P-1', (p) => { p.macroetapa = '05'; })]).map((g) => g.codigo), ['05']);
});
test('lista: no grupo, da entrega mais próxima para a mais distante e sem data por último', () => {
  const a = sintetico('P-1', (p) => { p.macroetapa = '05'; p.datas.encerramento = '2028-01-10'; });
  const b = sintetico('P-2', (p) => { p.macroetapa = '05'; p.datas.encerramento = '2027-02-01'; });
  const c = sintetico('P-3', (p) => { p.macroetapa = '05'; p.datas.encerramento = null; p.datas.mobilizacao = null; });
  assert.deepEqual(ids(agruparPorMacroetapa([a, c, b])[0].projetos), ['P-2', 'P-1', 'P-3']);
});
test('lista: sem macroetapa ou com código desconhecido vai para "Sem macroetapa", no fim', () => {
  const p1 = sintetico('P-1', (p) => { p.macroetapa = null; });
  const p2 = sintetico('P-2', (p) => { p.macroetapa = '09' as CodigoMacroetapa; });
  const p3 = sintetico('P-3', (p) => { p.macroetapa = '00'; });
  const grupos = agruparPorMacroetapa([p1, p2, p3]);
  assert.deepEqual(grupos.map((g) => g.codigo), ['00', 'sem']);
  assert.equal(grupos[1].qtd, 2);
  assert.equal(grupos[1].rotulo, 'Sem macroetapa');
});
test('lista: projeto sem valor conta na quantidade, fica fora da soma e é contado à parte', () => {
  const p1 = sintetico('P-1', (p) => { p.valores.total = null; p.valores.obra = null; });
  const p2 = sintetico('P-2', (p) => { p.valores.total = Number.NaN; });
  const p3 = sintetico('P-3', (p) => { p.valores.total = 1000; });
  assert.deepEqual(totaisCarteira([p1, p2, p3]), { qtd: 3, centavos: 100000, valor: 1000, semValor: 2 });
  assert.equal(agruparPorMacroetapa([p1, p2, p3])[0].semValor, 2);
});
test('lista: soma em centavos sem erro de arredondamento', () => {
  const t = totaisCarteira([sintetico('P-1', (p) => { p.valores.total = 0.1; }), sintetico('P-2', (p) => { p.valores.total = 0.2; })]);
  assert.equal(t.centavos, 30);
  assert.equal(t.valor, 0.3);
});
test('lista: carteira vazia e filtro que zera', () => {
  assert.deepEqual(totaisCarteira([]), { qtd: 0, centavos: 0, valor: 0, semValor: 0 });
  assert.deepEqual(agruparPorMacroetapa([]), []);
  assert.deepEqual(filtrarCarteira(base, comFiltro({ busca: 'nenhum-projeto-com-este-nome' }), false), []);
});
test('lista: ID só o número, com código legado nulo e códigos 9000+', () => {
  assert.equal(numeroDoId({ id: 'P-900', codigo_legado: 900 }), '900');
  assert.equal(numeroDoId({ id: 'P-9001', codigo_legado: 9001 }), '9001');
  assert.equal(numeroDoId({ id: 'P-0042', codigo_legado: 42 }), '42');
  assert.equal(numeroDoId({ id: 'P-x', codigo_legado: 77 }), '77');
  assert.equal(numeroDoId({ id: 'ABC', codigo_legado: null as unknown as number }), 'ABC');
  assert.equal(numeroDoId({ id: '', codigo_legado: null as unknown as number }), '\u2014');
});
test('lista: valor em reais sem centavos e traço quando não há valor', () => {
  assert.equal(formatarReais(1200000).replace(/\s/g, ' '), 'R$ 1.200.000');
  assert.equal(formatarReais(0).replace(/\s/g, ' '), 'R$ 0');
  assert.equal(formatarReais(1234.56).replace(/\s/g, ' '), 'R$ 1.235');
  assert.equal(formatarReais(null), '\u2014');
  assert.equal(formatarReais(Number.NaN), '\u2014');
});
test('lista: busca pelo código acha o projeto (links antigos com ?q=P-...)', () => {
  assert.equal(idDaBusca('P-901'), 'P-901');
  assert.equal(idDaBusca(' p901 '), 'P-901');
  assert.equal(idDaBusca('901'), 'P-901');
  assert.equal(idDaBusca('P-0901'), 'P-901');
  assert.equal(idDaBusca('Ponte'), null);
  assert.equal(idDaBusca('9999999999'), null);
  assert.deepEqual(ids(filtrarCarteira(base, comFiltro({ busca: 'P-901' }), false)), ['P-901']);
  assert.deepEqual(ids(filtrarCarteira(base, comFiltro({ busca: '901' }), false)), ['P-901']);
  assert.deepEqual(ids(filtrarCarteira(base, comFiltro({ busca: 'Ponte' }), false)), ['P-901', 'P-909']);
  // Código exato: P-901 não traz P-9010 (faixa da tela começa em 9000).
  const comFaixa = [...base, { ...base[0], id: 'P-9010', nome: 'Cadastro pela tela' }];
  assert.deepEqual(ids(filtrarCarteira(comFaixa, comFiltro({ busca: 'P-901' }), false)), ['P-901']);
});
test('lista: só prioritários e os filtros da E2 juntos', () => {
  assert.equal(lerSoPrioritarios(new URLSearchParams('prioritarios=1')), true);
  for (const q of ['', 'prioritarios=0', 'prioritarios=sim', 'prioritarios=']) assert.equal(lerSoPrioritarios(new URLSearchParams(q)), false, q);
  assert.deepEqual(ids(filtrarCarteira(base, FILTROS_VAZIOS, true)), ['P-901', 'P-904']);
  assert.deepEqual(ids(filtrarCarteira(base, comFiltro({ orgao: 'SMS' }), false)), ['P-901', 'P-906', 'P-911']);
  assert.deepEqual(ids(filtrarCarteira(base, comFiltro({ orgao: 'SMS' }), true)), ['P-901']);
});
test('lista: endereço da antiga Visão por órgão', () => {
  const ir = (q: string) => urlCarteiraPorOrgao(new URLSearchParams(q));
  assert.equal(ir(''), URL_CARTEIRA);
  assert.equal(ir('orgao=SMS'), '/plataforma/projetos-carteira/?orgao=SMS');
  assert.equal(ir('orgao=SMS&q=x&url=' + encodeURIComponent('https://exemplo.com')), '/plataforma/projetos-carteira/?orgao=SMS');
  assert.equal(ir('orgao=%20%20'), URL_CARTEIRA);
  const ataque = '<script>alert(1)</script>';
  const r = ir('orgao=' + encodeURIComponent(ataque));
  assert.equal(r, URL_CARTEIRA + '?' + new URLSearchParams({ orgao: ataque }).toString());
  assert.ok(!r.includes('<'));
  assert.equal(new URL('http://local.invalid' + ir('orgao=' + 'a'.repeat(300))).searchParams.get('orgao')?.length, 200);
  assert.equal(ir('orgao=' + encodeURIComponent('S\u0000MS')), '/plataforma/projetos-carteira/?orgao=S+MS');
  assert.equal(ir('orgao=Obras%09e%0D%0AVias'), '/plataforma/projetos-carteira/?orgao=Obras+e++Vias');
  for (const q of ['orgao=SMS', 'orgao=' + encodeURIComponent('//exemplo.com')]) assert.ok(ir(q).startsWith('/plataforma/projetos-carteira/?'), q);
});
test('lista: filtros em texto para a impressão', () => {
  assert.deepEqual(descreverFiltros(FILTROS_VAZIOS, false), ['Sem filtros: carteira inteira']);
  assert.deepEqual(descreverFiltros(comFiltro({ busca: 'ponte', orgao: 'SMS', area: 'saude', macro: '05', de: '2027-01', ate: '2027-12' }), true), [
    'Busca: ponte', '\u00d3rg\u00e3o: SMS', '\u00c1rea: Sa\u00fade', 'Macroetapa: ' + MACROETAPAS[5].rotulo, 'Entrega de 01/2027 a 12/2027', 'S\u00f3 priorit\u00e1rios',
  ]);
  assert.deepEqual(descreverFiltros(comFiltro({ de: '2027-03' }), false), ['Entrega a partir de 03/2027']);
  assert.deepEqual(descreverFiltros(comFiltro({ ate: '2027-12' }), false), ['Entrega at\u00e9 12/2027']);
  assert.deepEqual(descreverFiltros(comFiltro({ macro: 'sem', area: 'xyz' }), false), ['\u00c1rea: xyz', 'Macroetapa: Sem macroetapa']);
});
