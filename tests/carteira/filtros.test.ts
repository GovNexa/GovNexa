process.env.GOVNEXA_EXEMPLO = '1'; // usa os dados fictícios de data/exemplo, não a carga real
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import { AVISOS, FILTROS_VAZIOS, aplicarFiltros, areaDe, dataEntrega, filtrarProjetos, isoValido, lerFiltros, opcoesFiltros, ordenarPorEntrega, paraQuery } from '../../src/lib/carteira/filtros.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
function sintetico(mudar: (p: Projeto) => void): Projeto {
  const p = JSON.parse(JSON.stringify(carteira.projetos[0])) as Projeto;
  p.pendencias = [];
  mudar(p);
  return p;
}
const op = { orgaos: ['SEINFRA', 'SMS', 'Sem órgão'], anos: [2026, 2027, 2028] };
const ler = (q: string) => lerFiltros(new URLSearchParams(q), op);
const comData = (data: string | null, nome = 'Projeto') => sintetico(p => { p.datas.encerramento = null; p.datas.mobilizacao = null; p.datas.execucao_dias = null; p.datas.encerramento = data; p.nome = nome; });

test('filtros: endereço vazio dá filtros vazios e nenhum aviso', () => assert.deepEqual(ler(''), { filtros: { ...FILTROS_VAZIOS }, avisos: [] }));
test('filtros: busca tira controle, junta espaços e corta em 80', () => {
  assert.equal(ler('q=' + encodeURIComponent('  Escola\u0000\t  Nova  ')).filtros.busca, 'Escola Nova');
  assert.equal(ler('q=' + 'a'.repeat(200)).filtros.busca.length, 80);
});
test('filtros: órgão inexistente é ignorado com aviso fixo', () => {
  assert.equal(ler('orgao=XYZ').filtros.orgao, ''); assert.deepEqual(ler('orgao=XYZ').avisos, [AVISOS.orgao]);
  assert.equal(ler('orgao=SMS').filtros.orgao, 'SMS'); assert.deepEqual(ler('orgao=SMS').avisos, []);
  assert.ok(!ler('orgao=' + encodeURIComponent('<b>x</b>')).avisos.join().includes('<b>'));
});
test('filtros: macroetapa inválida ignorada; "sem" e "05" aceitas', () => {
  for (const m of ['99', '5']) { assert.equal(ler('macro=' + m).filtros.macro, ''); assert.deepEqual(ler('macro=' + m).avisos, [AVISOS.macro]); }
  assert.equal(ler('macro=sem').filtros.macro, 'sem'); assert.equal(ler('macro=05').filtros.macro, '05');
});
test('filtros: mês 13, mês 0 e ano fora da faixa ignorados com aviso', () => {
  for (const q of ['de_mes=13&de_ano=2027', 'de_mes=0&de_ano=2027', 'de_mes=3&de_ano=1999', 'de_mes=3&de_ano=27']) { assert.equal(ler(q).filtros.de, ''); assert.deepEqual(ler(q).avisos, [AVISOS.mes]); }
  assert.equal(ler('de_mes=3&de_ano=2027').filtros.de, '2027-03');
});
test('filtros: só o ano completa janeiro no início e dezembro no fim; só o mês avisa', () => {
  const r = ler('de_ano=2027&ate_ano=2028'); assert.equal(r.filtros.de, '2027-01'); assert.equal(r.filtros.ate, '2028-12');
  assert.equal(ler('de_mes=5').filtros.de, ''); assert.deepEqual(ler('de_mes=5').avisos, [AVISOS.semAno]);
});
test('filtros: fim antes do início troca as pontas e avisa', () => {
  const r = ler('de_mes=6&de_ano=2028&ate_mes=2&ate_ano=2027'); assert.equal(r.filtros.de, '2027-02'); assert.equal(r.filtros.ate, '2028-06'); assert.deepEqual(r.avisos, [AVISOS.invertido]);
  assert.deepEqual(ler('de_mes=2&de_ano=2027&ate_mes=2&ate_ano=2027').avisos, []);
});
test('filtros: área ignorada sem lista; aceita e recusa com lista', () => {
  assert.equal(ler('area=Saúde').filtros.area, ''); assert.deepEqual(ler('area=Saúde').avisos, []);
  const consultar = (area: string) => lerFiltros(new URLSearchParams({ area }), { ...op, areas: ['Saúde'] });
  assert.equal(consultar('Saúde').filtros.area, 'Saúde'); assert.equal(consultar('Educação').filtros.area, ''); assert.deepEqual(consultar('Educação').avisos, [AVISOS.area]);
});
test('filtragem: busca sem acento e sem maiúscula; órgão; macroetapa; "sem macroetapa"', () => {
  const a = sintetico(p => { p.nome = 'Reforma da Escola São José'; p.orgao = 'SME'; p.macroetapa = '03'; });
  const b = sintetico(p => { p.nome = 'Praça Central'; p.orgao = 'SMS'; p.macroetapa = '05'; });
  const c = sintetico(p => { p.nome = 'Ponte'; p.orgao = null; p.macroetapa = null; });
  const ps = [a, b, c];
  for (const [f, esperado] of [[{ busca: 'sao jose' }, a], [{ orgao: 'Sem órgão' }, c], [{ macro: '05' }, b], [{ macro: 'sem' }, c]] as const) assert.deepEqual(filtrarProjetos(ps, { ...FILTROS_VAZIOS, ...f }), [esperado]);
});
test('filtragem: período com fronteiras do mês inclusivas', () => {
  const ps = ['2027-02-28', '2027-03-01', '2027-03-31', '2027-04-01', null].map(d => comData(d));
  assert.deepEqual(filtrarProjetos(ps, { ...FILTROS_VAZIOS, de: '2027-03', ate: '2027-03' }), ps.slice(1, 3));
  assert.deepEqual(filtrarProjetos(ps, { ...FILTROS_VAZIOS, de: '2027-03' }), ps.slice(1, 4));
  assert.deepEqual(filtrarProjetos(ps, { ...FILTROS_VAZIOS, ate: '2027-03' }), ps.slice(0, 3));
});
test('filtragem: área quando o projeto tem o campo', () => {
  const a = sintetico(p => { (p as any).area = 'Saúde'; }); const b = sintetico(() => {});
  assert.deepEqual(filtrarProjetos([a, b], { ...FILTROS_VAZIOS, area: 'Saúde' }), [a]);
  for (const area of ['', '   ']) assert.equal(areaDe(sintetico(p => { (p as any).area = area; })), null);
});
test('ordem: entrega mais próxima primeiro, sem data por último, empate pelo nome', () => {
  const ps = [comData('2028-01-10'), comData(null), comData('2026-05-01', 'B'), comData('2026-05-01', 'A')];
  const original = [...ps]; assert.deepEqual(ordenarPorEntrega(ps), [ps[3], ps[2], ps[0], ps[1]]); assert.deepEqual(ps, original);
});
test('dataEntrega: encerramento; senão mobilização + dias; senão null', () => {
  assert.equal(dataEntrega(comData('2027-06-30')), '2027-06-30');
  const p = comData(null); p.datas.mobilizacao = '2027-01-01'; p.datas.execucao_dias = 30; assert.equal(dataEntrega(p), '2027-01-31');
  p.datas.execucao_dias = null; assert.equal(dataEntrega(p), null);
  p.datas.mobilizacao = null; for (const d of ['2027-13-01', '30/06/2027']) { p.datas.encerramento = d; assert.equal(dataEntrega(p), null); }
});
test('isoValido: rejeita dia inexistente', () => assert.equal(isoValido('2027-02-31'), false));
test('dataEntrega: duração excessiva retorna null sem lançar erro', () => {
  const p = comData(null); p.datas.mobilizacao = '2027-01-01'; p.datas.execucao_dias = 2e8;
  assert.equal(dataEntrega(p), null);
});
test('paraQuery: ida e volta e vazio', () => {
  assert.equal(paraQuery(FILTROS_VAZIOS), '');
  const f = { busca: 'Escola & Cia', orgao: 'SMS', area: '', macro: '05' as const, de: '2027-03', ate: '2028-12' };
  assert.deepEqual(lerFiltros(new URLSearchParams(paraQuery(f).slice(1)), op).filtros, f);
});
test('opcoesFiltros: órgãos ordenados, sem área sem campo, anos contínuos', () => {
  const o = opcoesFiltros(carteira.projetos, '2026-11-22');
  assert.deepEqual(o.orgaos, ['SEINFRA', 'SMS', 'SME', 'SEMASDH', 'SECULT'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.equal('areas' in o, false); assert.ok(o.anos.includes(2026)); assert.deepEqual(o.anos, Array.from({ length: o.anos.at(-1)! - o.anos[0] + 1 }, (_, i) => o.anos[0] + i));
  assert.deepEqual(opcoesFiltros([], '2026-11-22'), { orgaos: [], anos: [2026] });
});
test('filtragem e ordem com carteira vazia', () => assert.deepEqual(aplicarFiltros([], FILTROS_VAZIOS), []));
