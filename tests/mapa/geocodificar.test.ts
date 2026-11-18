import { readFileSync } from 'node:fs';
import { GOIANIA } from '../../src/lib/mapa/geo.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultar, selecionarResultado as selecionar, invalidarPontosAmbiguos, gerarSql, reaproveitarEntradas } from '../../scripts/geocodificar-bairros.ts';
import { bancoTeste } from '../helpers/d1.ts';

const selecionarResultado = (lista: Parameters<typeof selecionar>[0]) => selecionar(lista.map(r => ({ name: 'Bairro Exemplo Lunar', ...r })), 'Bairro Exemplo Lunar', ['Bairro Exemplo Lunar']);

const resultado = (name: string, lat = '-16.68') => ({ name, lat, lon: '-49.26', address: { city: 'Goiânia' }, type: 'suburb' });
test('nome exato normalizado e tipo compatível entre candidatos', () => {
  for (const [alvo, errado] of [
    ['S Nebulosa Oeste', 'Setor Nebulosa Leste'],
    ['Vl Bruma Azul', 'Conjunto Bruma Azul'],
    ['Cj Bruma Azul', 'Vila Bruma Azul'],
    ['Jd Prisma', 'Residencial Prisma Conquista'],
    ['Jd Prisma', 'Residencial Prisma'],
    ['Res Prisma', 'Jardim Prisma'],
    ['S Aurora Fictícia', 'Vila Aurora Fictícia'],
    ['Vl Aurora Fictícia', 'Setor Aurora Fictícia'],
    ['Jd Prisma II', 'Jardim Prisma'],
    ['Jd Prisma 2', 'Jardim Prisma'],
  ]) assert.equal(selecionar([resultado(errado)], alvo, [alvo], true), null);
  assert.deepEqual(selecionar([resultado('Setor Nebulosa Leste'), resultado(' SETOR NÉBULOSA---OESTE ', '-16.7')], 'S Nebulosa Oeste', ['S Nebulosa Oeste']), { lat: -16.7, lng: -49.26 });
  assert.ok(selecionar([resultado('Conjunto Residencial Prisma')], 'Cjr Prisma', ['Cjr Prisma']));
  assert.ok(selecionar([resultado('Condominio Prisma')], 'Cond Prisma', ['Cond Prisma']));
  assert.equal(selecionar([{ lat: '-16.68', lon: '-49.26', address: { city: 'Goiânia' } }], 'Jd Prisma', ['Jd Prisma']), null);
});

test('sem tipo exige segunda tentativa, tipo original e ausência de ambiguidade', () => {
  for (const [alvo, outro, nome] of [
    ['Vl Bruma Azul', 'Cj Bruma Azul', 'Bruma Azul'],
    ['Jd Prisma', 'Res Prisma', 'Prisma'],
    ['S Aurora Fictícia', 'Vl Aurora Fictícia', 'Aurora Fictícia'],
  ]) {
    assert.equal(selecionar([resultado(nome)], alvo, [alvo]), null);
    assert.ok(selecionar([resultado(nome)], alvo, [alvo], true));
    assert.equal(selecionar([resultado(nome)], alvo, [alvo, outro], true), null);
    assert.ok(selecionar([resultado(nome)], nome, [nome], true));
    assert.ok(selecionar([resultado(nome)], nome, [nome]));
  }
});

test('pontos repetidos com cinco casas invalidam todos os envolvidos', () => {
  const bairros = {
    'Vila Bruma Azul': { busca: 'Bruma Azul', encontrado: true, lat: -16.680001, lng: -49.260001 },
    'Conjunto Bruma Azul': { busca: 'Conjunto Bruma Azul', encontrado: true, lat: -16.680002, lng: -49.260002 },
    'Jardim Prisma': { busca: 'Jardim Prisma', encontrado: true, lat: -16.7, lng: -49.26 },
    'Setor Nebulosa': { busca: 'Nebulosa', encontrado: false },
  };
  assert.deepEqual(invalidarPontosAmbiguos(bairros), ['Vila Bruma Azul', 'Conjunto Bruma Azul']);
  for (const nome of ['Vila Bruma Azul', 'Conjunto Bruma Azul'] as const) assert.deepEqual(bairros[nome], { busca: bairros[nome].busca, encontrado: false });
  assert.equal(bairros['Jardim Prisma'].encontrado, true);
  assert.deepEqual(invalidarPontosAmbiguos(bairros), []);
});

test('Nominatim aceita somente município Goiânia dentro da caixa e prefere bairro', () => {
  const r = (city: string, lat = '-16.68', type = 'city') => ({ lat, lon: '-49.26', address: { city }, type });
  for (const city of ['Aparecida de Goiânia', 'Trindade', '']) assert.equal(selecionarResultado([r(city)]), null);
  assert.equal(selecionarResultado([r('Goiânia', '-17')]), null);
  assert.equal(selecionarResultado([{lat: '-16.68', lon: '-50', address: { city: 'Goiânia' }}]), null);
  assert.deepEqual(selecionarResultado([r(' GOIANIA ')]), { lat: -16.68, lng: -49.26 });
  for (const campo of ['municipality', 'town']) assert.ok(selecionarResultado([{ lat: '-16.68', lon: '-49.26', address: { [campo]: 'Goiânia' } }]));
  assert.deepEqual(selecionarResultado([r('Goiânia'), r('Goiânia', '-16.7', 'suburb')]), { lat: -16.7, lng: -49.26 });
});

test('busca livre restrita a Goiânia e retentativas sequenciais de 429/5xx após 5 s', async () => {
  const esperas: number[] = [];
  let chamadas = 0;
  const requisitar: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.match(url.searchParams.get('q') ?? '', /, Goiânia, Goiás$/);
    assert.equal(url.searchParams.get('bounded'), '1');
    assert.equal(url.searchParams.get('addressdetails'), '1');
    assert.equal(url.searchParams.get('limit'), '5');
    assert.equal(url.searchParams.get('street'), null);
    assert.equal((init?.headers as Record<string, string>)['User-Agent'], 'GovNexa-geocodificacao/1.0 (+https://govnexa.com.br)');
    chamadas++;
    return new Response(chamadas < 4 ? '' : '[]', { status: chamadas === 1 ? 429 : chamadas < 4 ? 503 : 200 });
  };
  assert.equal(await consultar('Bairro Exemplo', requisitar, async ms => { esperas.push(ms); }), null);
  assert.equal(chamadas, 4);
  assert.deepEqual(esperas, [5000, 5000, 5000]);
  chamadas = 0;
  await assert.rejects(consultar('Exemplo', async () => { chamadas++; return new Response('', {status: 503}); }, async () => {}), /503/);
  assert.equal(chamadas, 4);
});

test('SQL escapa todos os textos e atualiza idempotentemente na migração 0005', () => {
  const { sqlite } = bancoTeste();
  try {
    const bairro = "Bairro Exemplo d'água";
    const geo = { bairros: { [bairro]: { busca: "Busca ' exemplo", encontrado: true, lat: -16.68, lng: -49.26 } }, fonte: "Fonte ' exemplo", gerado_em: "Data ' exemplo" };
    const sql = gerarSql(geo, 5208707);
    sqlite.exec(sql); sqlite.exec(sql);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM bairro_geo').get()!.n, 1);
    assert.equal(sqlite.prepare('SELECT bairro FROM bairro_geo').get()!.bairro, bairro);
    geo.bairros[bairro].lat = -16.7;
    sqlite.exec(gerarSql(geo, 5208707));
    assert.equal(sqlite.prepare('SELECT lat FROM bairro_geo').get()!.lat, -16.7);
    assert.throws(() => gerarSql(geo, 123));
    for (const [encontrado, lat, lng] of [[1, null, null], [1, -17, -49.26], [1, -16.68, -50], [0, -16.68, -49.26], [2, null, null]]) {
      assert.throws(() => sqlite.prepare("INSERT INTO bairro_geo VALUES(1,'Inválido','Busca',?,?,?,'exemplo','')").run(encontrado, lat, lng));
    }
    sqlite.exec(gerarSql({ bairros: { Exemplo: { busca: 'Exemplo', encontrado: false } } }, 5208707));
    assert.equal(sqlite.prepare("SELECT lat FROM bairro_geo WHERE bairro='Exemplo'").get()!.lat, null);
  } finally { sqlite.close(); }
});

test('alvo sem tipo só aceita candidato tipado sem outro tipo na resposta ou lista', () => {
  assert.ok(selecionar([resultado('Setor Lunar')], 'Lunar', ['Lunar']));
  assert.ok(selecionar([resultado('Setor Lunar'), resultado('S Lunar')], 'Lunar', ['Lunar', 'S Lunar']));
  for (const segunda of [false, true]) {
    assert.equal(selecionar([resultado('Setor Lunar'), resultado('Vila Lunar')], 'Lunar', ['Lunar'], segunda), null);
    assert.equal(selecionar([resultado('Setor Lunar')], 'Lunar', ['Lunar', 'Vila Lunar'], segunda), null);
  }
});

test('grafias equivalentes no mesmo ponto não são conflito', () => {
  const ponto = { busca: 'Lunar', encontrado: true, lat: -16.68, lng: -49.26 };
  const bairros = { 'S Lunar': { ...ponto }, 'Setor Lunar': { ...ponto } };
  assert.deepEqual(invalidarPontosAmbiguos(bairros), []);
  const conflito = { ...bairros, 'Vila Lunar': { ...ponto } };
  assert.deepEqual(invalidarPontosAmbiguos(conflito), ['S Lunar', 'Setor Lunar', 'Vila Lunar']);
});

test('somente a versão 2 permite reaproveitar entradas', () => {
  const bairros = { Lunar: { busca: 'Lunar', encontrado: false } };
  for (const versao_regras of [undefined, 1, 3]) assert.deepEqual(reaproveitarEntradas({ versao_regras, bairros }), {});
  assert.equal(reaproveitarEntradas({ versao_regras: 2, bairros }), bairros);
});

test('caixa da migração 0005 acompanha GOIANIA.caixa', () => {
  const sql = readFileSync(new URL('../../db/d1/prefeitura/0005_bairro_geo.sql', import.meta.url), 'utf8');
  const numeros = sql.match(/lat BETWEEN (-?[\d.]+) AND (-?[\d.]+) AND lng BETWEEN (-?[\d.]+) AND (-?[\d.]+)/);
  assert.ok(numeros);
  assert.deepEqual(numeros.slice(1).map(Number), [GOIANIA.caixa.latMin, GOIANIA.caixa.latMax, GOIANIA.caixa.lngMin, GOIANIA.caixa.lngMax]);
});

test('Retry-After em segundos ou data respeita mínimo de 5 s e fetch recebe timeout', async () => {
  for (const [valor, minimo, maximo] of [['12', 12000, 12000], ['1', 5000, 5000], ['inválido', 5000, 5000], [new Date(Date.now() + 60000).toUTCString(), 55000, 60000]] as const) {
    let chamadas = 0;
    const esperas: number[] = [];
    await consultar('Lunar', async (_url, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      return ++chamadas === 1 ? new Response('', { status: 429, headers: { 'Retry-After': valor } }) : new Response('[]');
    }, async ms => { esperas.push(ms); });
    assert.equal(esperas.length, 1);
    assert.ok(esperas[0] >= minimo && esperas[0] <= maximo);
  }
});
