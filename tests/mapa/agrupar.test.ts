import assert from 'node:assert/strict';
import test from 'node:test';
import { agruparPorBairro, agruparPorRegiao, type ObraAgrupavel } from '../../src/lib/mapa/agrupar.ts';

const obras: ObraAgrupavel[] = [
  { id: 'a', regiao: 'Norte', bairro: 'A', serie: 'mp-cor-1', pontos: [{ lat: 1, lng: 2 }] },
  { id: 'b', regiao: 'Norte', bairro: 'A', serie: 'mp-cor-2', pontos: [{ lat: 3, lng: 4 }] },
  { id: 'c', regiao: 'Sul', bairro: 'B', serie: 'mp-cor-sem', pontos: [{ lat: 5, lng: 6 }] },
];

test('agrupa por região com centro médio e contagens por cor de área (sem farol)', () => {
  const grupos = agruparPorRegiao(obras);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0], {
    id: 'regiao:norte',
    nivel: 'regiao',
    nome: 'Norte',
    ids: ['a', 'b'],
    total: 2,
    centro: { lat: 2, lng: 3 },
    series: { 'mp-cor-1': 1, 'mp-cor-2': 1 },
  });
  assert.equal('farois' in grupos[0], false);
});

test('agrupa por bairro sem exigir região ou bairro informado', () => {
  const grupos = agruparPorBairro([
    ...obras,
    { id: 'sem-local', regiao: null, bairro: null, serie: 'mp-cor-1', pontos: [{ lat: -1, lng: -2 }] },
  ]);
  const bairroA = grupos.find((grupo) => grupo.nome === 'A');
  const semBairro = grupos.find((grupo) => grupo.nome === 'Bairro não informado');
  assert.deepEqual(bairroA?.centro, { lat: 2, lng: 3 });
  assert.equal(semBairro?.total, 1);
  assert.deepEqual(semBairro?.centro, { lat: -1, lng: -2 });
});

test('não quebra quando os dados do grupo não contêm coordenadas', () => {
  const [grupo] = agruparPorRegiao([
    { id: 'sem-ponto', regiao: null, bairro: null, serie: 'mp-cor-outros', pontos: [] },
  ]);
  assert.equal(grupo.total, 1);
  assert.equal(grupo.centro, null);
  assert.deepEqual(grupo.series, { 'mp-cor-outros': 1 });
});
