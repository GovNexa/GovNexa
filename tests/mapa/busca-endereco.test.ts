// Busca de endereço da localização (E8). O serviço externo é SEMPRE simulado: nenhum teste chama o Nominatim de verdade.
// Cobre: texto da busca, URL fixa (SSRF e injeção de parâmetro), filtro pela área, ordem das conferências, limites, fila de 1 por segundo,
// pausa depois de 429, cache, falhas sem detalhe interno, privacidade dos logs e o modo simulado da máquina local.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GOIANIA } from '../../src/lib/mapa/geo.ts';
import { AGENTE_BUSCA, MAX_RESULTADOS_BUSCA, limparRotulo, lerResultados, montarUrlBusca, normalizarConsulta } from '../../src/lib/mapa/busca-endereco-regras.ts';
import { criarCacheMemoria, criarEstadoBusca, criarFila, depsDoAmbiente, responderBuscaEndereco, type DepsBusca } from '../../src/lib/mapa/busca-endereco.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const ORIGEM = 'https://govnexa.com.br';
const ROTA = `${ORIGEM}/plataforma/localizacao/buscar/`;
const INDISPONIVEL = 'A busca de endereços não respondeu agora. Tente de novo em instantes ou marque o ponto no mapa.';
const usuario = (perfil: Usuario['perfil'], ativo = true): Usuario => ({ id: 'u1', email: `${perfil}@x.gov.br`, nome: 'N', cargo: null, perfil, prefeitura_id: 5208707, ativo, criado_em: '', atualizado_em: '' });
const CTX = { usuario: usuario('editor'), prefeituraId: 5208707 };

const NOMINATIM = [
  { place_id: 1, lat: '-16.6799', lon: '-49.2550', display_name: 'Avenida Goiás, Setor Central, Goiânia, Goiás, 74000-000, Brasil', category: 'highway', type: 'primary', addresstype: 'road', importance: 0.5 },
  { place_id: 2, lat: '-16.67990', lon: '-49.25500', display_name: 'Avenida Goiás (repetida), Goiânia, Brasil', category: 'highway', type: 'primary', addresstype: 'road' },
  { place_id: 3, lat: '-16.7050', lon: '-49.2700', display_name: 'Setor Oeste, Goiânia, Goiás, Brasil', category: 'place', type: 'suburb', addresstype: 'suburb' },
  { place_id: 4, lat: '-15.7939', lon: '-47.8828', display_name: 'Esplanada dos Ministérios, Brasília, Brasil', category: 'highway', type: 'primary', addresstype: 'road' },
  { place_id: 5, lat: 'abc', lon: '-49.2', display_name: 'Coordenada quebrada' },
  { place_id: 6, lat: '-16.7', lon: '-49.3', display_name: '' },
  { place_id: 7, lat: '-16.7200', lon: '-49.3000', display_name: '<img src=x onerror=alert(1)>, Goiânia, Brasil', category: 'building', type: 'house', addresstype: 'building' },
];
const ESPERADO = [
  { rotulo: 'Avenida Goiás, Setor Central, Goiânia, Goiás, 74000-000', lat: -16.6799, lng: -49.255, tipo: 'rua' },
  { rotulo: 'Setor Oeste, Goiânia, Goiás', lat: -16.705, lng: -49.27, tipo: 'bairro' },
  { rotulo: '<img src=x onerror=alert(1)>, Goiânia', lat: -16.72, lng: -49.3, tipo: 'endereco' },
];

const respJson = (corpo: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

function pedido(corpo: unknown, opcoes: { origem?: string | null; tipo?: string; tamanho?: string | null } = {}): Request {
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  const headers = new Headers();
  if (opcoes.origem !== null) headers.set('origin', opcoes.origem ?? ORIGEM);
  headers.set('content-type', opcoes.tipo ?? 'application/json');
  if (opcoes.tamanho !== null) headers.set('content-length', opcoes.tamanho ?? String(new TextEncoder().encode(texto).byteLength));
  return new Request(ROTA, { method: 'POST', headers, body: texto });
}

function montar(opcoes: { respostas?: (() => Response | Promise<Response>)[]; permitir?: boolean } = {}) {
  let t = 1_000_000;
  const relogio = () => t;
  const respostas = opcoes.respostas ?? [respJson(NOMINATIM)];
  const chamadas: { url: string; init: RequestInit }[] = [];
  const chaves: string[] = [];
  const esperas: number[] = [];
  const deps: DepsBusca = {
    modo: 'real',
    fetch: async (url, init) => { chamadas.push({ url, init }); return respostas[Math.min(chamadas.length - 1, respostas.length - 1)](); },
    limitador: { async permitir(k) { chaves.push(k); return opcoes.permitir ?? true; } },
    estado: criarEstadoBusca({ agora: relogio }),
    dormir: async (ms) => { esperas.push(ms); t += ms; },
  };
  return { deps, chamadas, chaves, esperas, avancar: (ms: number) => { t += ms; } };
}
const buscar = (m: ReturnType<typeof montar>, q: unknown, ctx = CTX) => responderBuscaEndereco(pedido({ q }), ctx, m.deps);

test('normalizar: vazio, só símbolos, curto, longo demais e não texto são recusados; fronteiras de 3 letras e 120 caracteres', () => {
  for (const v of [undefined, null, 12, '', '   ', '!!! --- ...', 'ab', ' a b ', 'x'.repeat(121)]) assert.equal(normalizarConsulta(v).ok, false, String(v));
  assert.deepEqual(normalizarConsulta('ab'), { ok: false, erro: 'Digite ao menos 3 letras ou números.' });
  assert.deepEqual(normalizarConsulta('x'.repeat(121)), { ok: false, erro: 'A busca pode ter no máximo 120 caracteres.' });
  assert.equal(normalizarConsulta('abc').ok, true);
  assert.equal(normalizarConsulta('x'.repeat(120)).ok, true);
  const n = normalizarConsulta('  Rua\u000010\n\t  Setor   Oeste ');
  assert.deepEqual(n, { ok: true, texto: 'Rua 10 Setor Oeste', chave: 'rua 10 setor oeste' });
  // Acento composto e decomposto viram o mesmo texto (mesma chave de cache).
  const a = normalizarConsulta('Goiânia');
  const b = normalizarConsulta('Goiânia');
  assert.ok(a.ok && b.ok && a.chave === b.chave);
});

test('url: endereço fixo do Nominatim e parâmetros codificados (sem SSRF nem injeção de parâmetro)', () => {
  const malicioso = 'x&countrycodes=us&bounded=0#@evil.example/ http://127.0.0.1/';
  const u = montarUrlBusca(malicioso);
  assert.equal(u.origin, 'https://nominatim.openstreetmap.org');
  assert.equal(u.pathname, '/search');
  assert.equal(u.hash, '');
  assert.equal(u.searchParams.get('q'), malicioso);
  assert.deepEqual(u.searchParams.getAll('countrycodes'), ['br']);
  assert.deepEqual(u.searchParams.getAll('bounded'), ['1']);
  const e = GOIANIA.entorno;
  assert.deepEqual(Object.fromEntries(u.searchParams), {
    q: malicioso, format: 'jsonv2', countrycodes: 'br', viewbox: `${e.lngMin.toFixed(4)},${e.latMax.toFixed(4)},${e.lngMax.toFixed(4)},${e.latMin.toFixed(4)}`,
    bounded: '1', limit: String(MAX_RESULTADOS_BUSCA), 'accept-language': 'pt-BR', addressdetails: '0',
  });
  assert.equal(MAX_RESULTADOS_BUSCA, 5);
  assert.ok(!/[@]|prefeitura|5208707/i.test(AGENTE_BUSCA), 'User-Agent genérico, sem e-mail nem prefeitura');
});

test('resultados: só dentro da cidade e do entorno, sem repetir, no máximo 5, rótulo limpo e tipo', () => {
  assert.deepEqual(lerResultados(NOMINATIM), ESPERADO);
  assert.equal(lerResultados({ erro: 'x' }), null);
  assert.equal(lerResultados('[]'), null);
  assert.deepEqual(lerResultados([]), []);
  const e = GOIANIA.entorno;
  // Fronteira da área aceita: na borda entra; um passo para fora não entra.
  assert.equal(lerResultados([{ lat: String(e.latMin), lon: '-49.2', display_name: 'Borda' }])!.length, 1);
  assert.equal(lerResultados([{ lat: (e.latMin - 0.001).toFixed(4), lon: '-49.2', display_name: 'Fora' }])!.length, 0);
  const oito = Array.from({ length: 8 }, (_, i) => ({ lat: (-16.6 - i / 100).toFixed(4), lon: '-49.2', display_name: `Rua ${i}` }));
  assert.equal(lerResultados(oito)!.length, 5);
  for (const lat of ['1e1', 'NaN', '-16.7.1', ' -16.7', '']) assert.equal(lerResultados([{ lat, lon: '-49.2', display_name: 'X' }])!.length, 0, lat);
  assert.equal(limparRotulo(`A\u0007B\u0085C, Brasil`), 'A B C');
  const longo = limparRotulo('R'.repeat(300))!;
  assert.equal(longo.length, 160);
  assert.ok(longo.endsWith('…'));
  assert.equal(limparRotulo(42), null);
});

test('rota: origem, perfil e formato são conferidos antes do limite, da leitura do pedido e do serviço', async () => {
  const casos: [Request, typeof CTX | { usuario: Usuario | null; prefeituraId: number }, number][] = [
    [pedido({ q: 'Avenida Goiás' }, { origem: 'https://site-malicioso.example' }), CTX, 403],
    [pedido({ q: 'Avenida Goiás' }, { origem: null }), CTX, 403],
    [pedido({ q: 'Avenida Goiás' }), { usuario: usuario('leitura'), prefeituraId: 5208707 }, 403],
    [pedido({ q: 'Avenida Goiás' }), { usuario: usuario('editor', false), prefeituraId: 5208707 }, 403],
    [pedido({ q: 'Avenida Goiás' }), { usuario: null, prefeituraId: 5208707 }, 403],
    [pedido({ q: 'Avenida Goiás' }, { tipo: 'text/plain' }), CTX, 415],
    [pedido({ q: 'Avenida Goiás' }, { tipo: 'application/json-x' }), CTX, 415],
  ];
  for (const [req, ctx, status] of casos) {
    const m = montar();
    const r = await responderBuscaEndereco(req, ctx, m.deps);
    assert.equal(r.status, status);
    assert.equal(m.chamadas.length, 0, 'não chama o serviço');
    assert.equal(m.chaves.length, 0, 'não gasta o limite');
    assert.equal(req.bodyUsed, false, 'não lê o pedido');
  }
  const leitura = await responderBuscaEndereco(pedido({ q: 'Avenida Goiás' }), { usuario: usuario('leitura'), prefeituraId: 5208707 }, montar().deps);
  assert.deepEqual(await leitura.json(), { ok: false, erro: 'Seu perfil não permite alterar a localização.' });
  // Limite estourado: 429 sem ler o pedido.
  const m = montar({ permitir: false });
  const req = pedido({ q: 'Avenida Goiás' });
  const r = await responderBuscaEndereco(req, CTX, m.deps);
  assert.equal(r.status, 429);
  assert.equal(req.bodyUsed, false);
  assert.equal(m.chamadas.length, 0);
  assert.deepEqual(m.chaves, ['busca:5208707:editor@x.gov.br']);
  // Sem prefeitura válida não há chave de limite: recusa como falta de permissão (403), não como excesso de buscas.
  assert.equal((await responderBuscaEndereco(pedido({ q: 'Avenida Goiás' }), { usuario: usuario('editor'), prefeituraId: 0 }, montar().deps)).status, 403);
});

test('rota: tamanho, JSON e texto inválidos são recusados sem chamar o serviço', async () => {
  const m = montar();
  assert.equal((await responderBuscaEndereco(pedido({ q: 'Rua' }, { tamanho: '2000' }), CTX, m.deps)).status, 413);
  assert.equal((await responderBuscaEndereco(pedido({ q: 'Rua 10' }, { tamanho: null }), CTX, m.deps)).status, 413);
  assert.equal((await responderBuscaEndereco(pedido(JSON.stringify({ q: 'x'.repeat(1100) })), CTX, m.deps)).status, 413);
  assert.equal((await responderBuscaEndereco(pedido('{nao e json'), CTX, m.deps)).status, 400);
  const curto = await buscar(m, 'ab');
  assert.equal(curto.status, 400);
  assert.deepEqual(await curto.json(), { ok: false, erro: 'Digite ao menos 3 letras ou números.' });
  assert.equal((await buscar(m, 123)).status, 400);
  assert.equal((await buscar(m, '%%% ###')).status, 400);
  assert.equal(m.chamadas.length, 0);
});

test('rota: busca válida chama o serviço uma vez, como pede a política de uso, e devolve só rótulo, ponto e tipo', async () => {
  const m = montar();
  const r = await buscar(m, '  Avenida   Goiás ');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { ok: true, resultados: ESPERADO });
  assert.equal(m.chamadas.length, 1);
  const { url, init } = m.chamadas[0];
  assert.equal(url, montarUrlBusca('Avenida Goiás').toString());
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'manual');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(init.headers, { 'User-Agent': AGENTE_BUSCA, Accept: 'application/json' });
  assert.equal(init.body, undefined);
  assert.deepEqual(m.chaves, ['busca:5208707:editor@x.gov.br']);
});

test('cache: a mesma busca (maiúsculas e espaços diferentes) não chama o serviço de novo; vazio fica guardado; falha não fica', async () => {
  const m = montar({ respostas: [respJson(NOMINATIM), respJson([]), () => new Response('x', { status: 500 }), respJson(NOMINATIM)] });
  assert.equal((await buscar(m, 'Avenida Goiás')).status, 200);
  const doCache = await buscar(m, 'AVENIDA  goiás');
  assert.deepEqual(await doCache.json(), { ok: true, resultados: ESPERADO });
  assert.equal(m.chamadas.length, 1);
  assert.deepEqual(await (await buscar(m, 'Rua Inexistente')).json(), { ok: true, resultados: [] });
  assert.deepEqual(await (await buscar(m, 'rua inexistente')).json(), { ok: true, resultados: [] });
  assert.equal(m.chamadas.length, 2);
  assert.equal((await buscar(m, 'Setor Novo')).status, 503);
  assert.equal((await buscar(m, 'Setor Novo')).status, 200, 'depois da falha, tenta de novo');
  assert.equal(m.chamadas.length, 4);
});

test('cache em memória: cópia a cada leitura, validade de 24 h (vazio: 1 h) e no máximo 500 buscas', () => {
  let t = 0;
  const c = criarCacheMemoria({ agora: () => t });
  c.gravar('a', ESPERADO as never);
  const lido = c.ler('a')!;
  lido[0].rotulo = 'alterado';
  assert.deepEqual(c.ler('a'), ESPERADO);
  c.gravar('vazio', []);
  t = 3_600_000 - 1;
  assert.deepEqual(c.ler('vazio'), []);
  t = 3_600_000;
  assert.equal(c.ler('vazio'), null);
  t = 86_400_000 - 1;
  assert.deepEqual(c.ler('a'), ESPERADO);
  t = 86_400_000;
  assert.equal(c.ler('a'), null);
  const d = criarCacheMemoria({ agora: () => 0 });
  for (let i = 0; i < 501; i++) d.gravar(`k${i}`, []);
  assert.equal(d.ler('k0'), null, 'o mais antigo sai');
  assert.deepEqual(d.ler('k1'), []);
  assert.deepEqual(d.ler('k500'), []);
});

test('serviço recusou (429): pausa pelo Retry-After, sem chamar o serviço, e volta depois; 403 pausa 10 minutos', async () => {
  const m = montar({ respostas: [respJson([], 429, { 'retry-after': '120' }), respJson(NOMINATIM)] });
  const r = await buscar(m, 'Rua Um');
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, erro: INDISPONIVEL });
  m.avancar(119_000);
  const pausado = await buscar(m, 'Rua Dois');
  assert.equal(pausado.status, 503);
  assert.equal(pausado.headers.get('retry-after'), '60');
  assert.equal(m.chamadas.length, 1);
  m.avancar(2_000);
  assert.equal((await buscar(m, 'Rua Dois')).status, 200);
  assert.equal(m.chamadas.length, 2);
  // Sem Retry-After: 60 s.
  const s = montar({ respostas: [respJson([], 429), respJson(NOMINATIM)] });
  await buscar(s, 'Rua Um');
  s.avancar(59_000);
  assert.equal((await buscar(s, 'Rua Dois')).status, 503);
  s.avancar(2_000);
  assert.equal((await buscar(s, 'Rua Dois')).status, 200);
  // 403 (bloqueio do serviço): 10 minutos.
  const b = montar({ respostas: [respJson([], 403), respJson(NOMINATIM)] });
  await buscar(b, 'Rua Um');
  b.avancar(599_000);
  assert.equal((await buscar(b, 'Rua Dois')).status, 503);
  b.avancar(2_000);
  assert.equal((await buscar(b, 'Rua Dois')).status, 200);
});

test('falhas do serviço viram 503 com mensagem simples: tempo esgotado, erro, redirecionamento, resposta grande ou ilegível', async () => {
  // JSON válido ([] com espaços) acima de 256 KB e sem content-length: só o teto da leitura recusa.
  const grande = () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('[')); for (let i = 0; i < 300; i++) c.enqueue(new Uint8Array(1024).fill(32)); c.enqueue(new TextEncoder().encode(']')); c.close(); } }), { status: 200 });
  const falhas: (() => Response | Promise<Response>)[] = [
    () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); },
    () => new Response('erro interno do servidor X', { status: 500 }),
    () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    () => new Response('[]', { status: 200, headers: { 'content-length': '10000000' } }),
    grande,
    () => new Response('<html>nao e json</html>', { status: 200 }),
    respJson({ error: 'Unable to geocode' }),
  ];
  for (const f of falhas) {
    const m = montar({ respostas: [f] });
    const r = await buscar(m, 'Avenida Goiás');
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, erro: INDISPONIVEL });
    assert.equal(m.chamadas.length, 1, 'não segue redirecionamento nem tenta de novo sozinho');
  }
});

test('fila: no máximo 1 pedido a cada 1,1 s por instância; espera acima de 2,5 s é recusada', async () => {
  let t = 0;
  const f = criarFila({ agora: () => t });
  assert.deepEqual(f.reservar(), { ok: true, esperaMs: 0 });
  assert.deepEqual(f.reservar(), { ok: true, esperaMs: 1100 });
  assert.deepEqual(f.reservar(), { ok: true, esperaMs: 2200 });
  assert.deepEqual(f.reservar(), { ok: false, motivo: 'ocupado' });
  t = 3300;
  assert.deepEqual(f.reservar(), { ok: true, esperaMs: 0 });
  // Fronteira da espera máxima: exatamente 2,5 s passa; acima, não.
  const g = criarFila({ agora: () => 0, intervaloMs: 1250 });
  g.reservar(); g.reservar();
  assert.deepEqual(g.reservar(), { ok: true, esperaMs: 2500 });
  assert.deepEqual(g.reservar(), { ok: false, motivo: 'ocupado' });
  // Pela rota: duas buscas diferentes seguidas = a segunda espera a vez.
  const m = montar({ respostas: [respJson(NOMINATIM)] });
  await buscar(m, 'Rua Um');
  await buscar(m, 'Rua Dois');
  assert.deepEqual(m.esperas, [1100]);
});

test('limite por pessoa na instância: 10 buscas por minuto; a 11ª é recusada; outra pessoa continua; no minuto seguinte volta', async () => {
  const m = montar({ respostas: [respJson([])] });
  for (let i = 1; i <= 10; i++) assert.equal((await buscar(m, `Rua ${i}00`)).status, 200, `busca ${i}`);
  assert.equal((await buscar(m, 'Rua 1100')).status, 429);
  assert.equal((await buscar(m, 'Rua 1200', { usuario: usuario('gestor'), prefeituraId: 5208707 })).status, 200);
  m.avancar(60_000);
  assert.equal((await buscar(m, 'Rua 1300')).status, 200);
});

test('privacidade: o texto da busca não aparece em nenhum log, nem nas falhas', async () => {
  const linhas: string[] = [];
  const antes = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(antes) as (keyof typeof antes)[]) console[k] = (...a: unknown[]) => { linhas.push(a.map(String).join(' ')); };
  try {
    const falhas = [() => { throw new Error('rede'); }, () => new Response('x', { status: 500 }), respJson([], 429), respJson({ x: 1 })];
    for (const f of falhas) await buscar(montar({ respostas: [f] }), 'Rua Sigilosa 123');
    await buscar(montar(), 'Rua Sigilosa 456');
  } finally {
    Object.assign(console, antes);
  }
  assert.ok(linhas.length >= 4, 'as falhas são registradas');
  assert.ok(linhas.every((l) => !/sigilosa|123|456/i.test(l)), linhas.join('\n'));
});

test('ambiente: a máquina local usa as respostas fictícias e nunca o Nominatim; produção, cf-ray ou BUSCA_ENDERECO_REAL=1 usam o real', async () => {
  const LIMITE_API = { limit: async () => ({ success: true }) };
  const local = (h: Record<string, string> = {}) => new Request('http://127.0.0.1:4321/plataforma/localizacao/buscar/', { method: 'POST', headers: h });
  assert.equal(depsDoAmbiente({ AMBIENTE: 'local', LIMITE_API }, local()).modo, 'simulado');
  assert.equal(depsDoAmbiente({ AMBIENTE: 'local', LIMITE_API, BUSCA_ENDERECO_REAL: '1' }, local()).modo, 'real');
  assert.equal(depsDoAmbiente({ AMBIENTE: 'local', LIMITE_API }, local({ 'cf-ray': 'x' })).modo, 'real');
  assert.equal(depsDoAmbiente({ LIMITE_API }, new Request(ROTA)).modo, 'real');
  assert.equal(depsDoAmbiente({ AMBIENTE: 'local', LIMITE_API }, new Request(ROTA)).modo, 'real');
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('rede real proibida no teste'); }) as typeof fetch;
  try {
    const pedir = async (q: string) => {
      const corpo = JSON.stringify({ q });
      const req = new Request('http://127.0.0.1:4321/plataforma/localizacao/buscar/', { method: 'POST', headers: { origin: 'http://127.0.0.1:4321', 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(corpo).byteLength) }, body: corpo });
      return responderBuscaEndereco(req, CTX, depsDoAmbiente({ AMBIENTE: 'local', LIMITE_API }, req));
    };
    const ok = await (await pedir('Avenida Simulada')).json();
    assert.equal(ok.resultados.length, 3);
    assert.deepEqual(ok.resultados.map((r: { tipo: string }) => r.tipo), ['rua', 'bairro', 'endereco']);
    assert.equal(ok.resultados[0].rotulo, 'Avenida Simulada, Setor Central, Goiânia, Goiás');
    assert.deepEqual((await (await pedir('Rua sem resultado')).json()).resultados, []);
    assert.deepEqual((await (await pedir('Rua de outra cidade')).json()).resultados, []);
    assert.equal((await pedir('Serviço fora do ar')).status, 503);
    assert.equal((await pedir('<img src=x onerror=alert(1)>')).status, 200, 'palavra parecida não dispara a falha simulada');
  } finally {
    globalThis.fetch = original;
  }
});

test('código: rota fina só com POST; conferências na ordem; tela só mostra a busca a quem pode gravar e escreve o rótulo como texto', () => {
  const rota = readFileSync('src/pages/plataforma/localizacao/buscar.ts', 'utf8');
  assert.ok(rota.includes('export const POST') && !/export const (GET|ALL|PUT|DELETE)/.test(rota));
  assert.ok(rota.includes('depsDoAmbiente(env, request)') && !rota.includes('fetch('));
  const s = readFileSync('src/lib/mapa/busca-endereco.ts', 'utf8');
  const corpo = s.slice(s.indexOf('export async function responderBuscaEndereco'));
  const ordem = ['mesmaOrigem(request)', 'podeBuscarEndereco(', "get('content-type')", 'porPessoa.permitir(', "get('content-length')", 'await descartar(request)', 'request.text()', 'cache.ler(', 'fila.reservar()', 'consultar('].map((x) => corpo.indexOf(x));
  assert.ok(ordem.every((p, i) => p > 0 && (i === 0 || p > ordem[i - 1])), JSON.stringify(ordem));
  assert.ok(!/console\.[a-z]+\([^)]*(texto|consulta|q\b)/.test(s), 'nenhum log com o texto');
  const editor = readFileSync('src/components/mapa/EditorLocalizacao.astro', 'utf8');
  assert.ok(editor.includes('{buscaEndereco && ('));
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(editor));
  // LocalizacaoProjeto.astro saiu na E11 (os atalhos levam à aba Localização da ficha).
  for (const f of ['src/components/carteira/ficha/LocalizacaoFicha.astro', 'src/components/carteira/NovoProjeto.astro']) {
    assert.ok(readFileSync(f, 'utf8').includes('buscaEndereco={podeSalvar}'), f);
  }
});
