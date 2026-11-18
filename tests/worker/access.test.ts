import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoTeste } from '../helpers/d1.ts';
import { atender, type Env } from '../../worker/index.ts';
import { contextoDados } from '../../src/lib/repositorio/contexto.ts';
import { carregarCarteira } from '../../src/lib/carteira/carga.ts';
import { carregarCronogramas } from '../../src/lib/cronograma/carga.ts';
import { carregarHistorico } from '../../src/lib/log/carga.ts';

test('Worker: Access RS256, falha fechada, cache e rotas', async () => {
  const algoritmo = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const par = await crypto.subtle.generateKey(algoritmo, true, ['sign', 'verify']);
  const outro = await crypto.subtle.generateKey(algoritmo, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', par.publicKey), kid: 'teste', alg: 'RS256' };
  const original = globalThis.fetch;
  const relogio = Date.now;
  let agora = relogio();
  Date.now = () => agora;
  let chaves = [jwk];
  let consultas = 0, assets = 0;
  let statusChaves = 200;
  const avisos: unknown[][] = [];
  const warnOriginal = console.warn;
  console.warn = (...args) => { avisos.push(args); };
  globalThis.fetch = async (url, options) => {
    assert.equal(options?.redirect, 'manual');
    assert.equal(String(url), 'https://access.example/cdn-cgi/access/certs');
    consultas++;
    return Response.json({ keys: chaves }, { status: statusChaves });
  };
  const central = bancoTeste('central'), municipal = bancoTeste();
  central.sqlite.exec("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('teste','dev@exemplo.invalid','','admin',5208707)");
  const env: Env = { DB_CENTRAL:central.db, DB_PREFEITURA_5208707:municipal.db, DEV_EMAIL:'dev@exemplo.invalid', ACCESS_TEAM_DOMAIN: 'access.example', ACCESS_AUD: 'plataforma', ASSETS: { async fetch() { assets++; return new Response('plataforma'); } } };
  const base = { email:'dev@exemplo.invalid', iss: 'https://access.example', aud: ['plataforma'], exp: Math.floor(Date.now() / 1000) + 300, nbf: 0 };
  const b64 = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  async function token(claims = {}, chave = par.privateKey, header = {}) {
    const dados = `${b64({ alg: 'RS256', kid: 'teste', ...header })}.${b64({ ...base, ...claims })}`;
    const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(dados));
    return `${dados}.${Buffer.from(assinatura).toString('base64url')}`;
  }
  const executar = (request: Request, config: Env) => atender(request, config, () => config.ASSETS.fetch(request));
  const chamar = (jwt?: string, config = env, path = '/plataforma/') => executar(new Request(`https://govnexa.example${path}`, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), config);
  try {
    const valido = await token();
    const indisponivel = await atender(new Request('https://govnexa.example/plataforma/', {headers:{'Cf-Access-Jwt-Assertion':valido}}), {...env, DB_CENTRAL:{prepare(){throw new Error('detalhe interno');}} as unknown as Env['DB_CENTRAL']}, async () => new Response('não deve chegar'));
    assert.equal(indisponivel.status,503);
    assert.equal(indisponivel.headers.get('Cache-Control'),'private, no-store');
    assert.equal(indisponivel.headers.get('X-Frame-Options'),'DENY');
    assert.doesNotMatch(await indisponivel.text(), /detalhe interno/);
    const falhaLeitura = await atender(new Request('https://govnexa.example/plataforma/', {headers:{'Cf-Access-Jwt-Assertion':valido}}), env, async () => {throw new Error('leitura D1');});
    assert.equal(falhaLeitura.status,503);
    const isolado = await atender(new Request('https://govnexa.example/plataforma/?prefeitura=999', {headers:{'Cf-Access-Jwt-Assertion':valido}}),env,async (usuario, repo) => {
      assert.equal(usuario?.prefeitura_id,5208707);
      assert.ok(repo);
      assert.deepEqual(await repo.listarProjetos(),[]);
      assert.equal(await repo.obterProjeto('ausente'),null);
      assert.deepEqual(await repo.historico('ausente'),[]);
      return new Response('Banco vazio');
    });
    assert.equal(isolado.status,200);
    for (const path of ['/plataforma', '/plataforma/', '/plataforma/agenda.ics']) {
      const resposta = await chamar(valido, env, path);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(resposta.headers.get('X-Frame-Options'), 'DENY');
      assert.match(resposta.headers.get('Content-Security-Policy')!, /tile.openstreetmap.org/);
      // Camadas Satélite/Híbrido do mapa (Esri World Imagery, decisão do dono 18/11/2026): só imagens, nenhum script de fora.
      assert.match(resposta.headers.get('Content-Security-Policy')!, /img-src [^;]*https:\/\/server\.arcgisonline\.com/);
      assert.doesNotMatch(resposta.headers.get('Content-Security-Policy')!, /script-src [^;]*arcgisonline/);
    }
    assert.equal(consultas, 1);
    assert.equal((await chamar(await token({ aud: 'plataforma' }))).status, 200);
    assert.equal((await chamar(`${b64({ alg: 'none', kid: 'teste' })}.${b64(base)}.`)).status, 403);
    assert.equal((await chamar(await token({email:'ausente@exemplo.invalid'}))).status,403);
    central.sqlite.exec('UPDATE usuario SET ativo=0');
    const negada = await chamar(valido);
    assert.equal(negada.status,403);
    assert.match(await negada.text(),/Sem permissão/);
    central.sqlite.exec('UPDATE usuario SET ativo=1');
    assert.equal((await chamar(await token({email:undefined}))).status,403);
    const antes = assets;
    for (const jwt of [undefined, 'inválido', await token({}, outro.privateKey), await token({ aud: ['outro'] }), await token({ iss: 'https://outro.example' }), await token({ exp: 0 }), await token({ nbf: base.exp + 600 }), await token({}, par.privateKey, { alg: 'HS256' }), await token({}, par.privateKey, { kid: 'ausente' })]) {
      const resposta = await chamar(jwt);
      assert.equal(resposta.status, 403);
      assert.equal(resposta.headers.get('X-Frame-Options'), 'DENY');
    }
    assert.equal(assets, antes);
    for (const config of [{ ...env, ACCESS_TEAM_DOMAIN: '' }, { ...env, ACCESS_AUD: '' }]) assert.equal((await chamar(valido, config)).status, 503);
    const local = { ...env, ACCESS_AUD: '', ACESSO_LOCAL_LIVRE: '1' };
    assert.equal((await chamar(undefined, local)).status, 503);
    assert.equal((await chamar(undefined, { ...env, ACESSO_LOCAL_LIVRE: '1' })).status, 403);
    for (const host of ['localhost', '127.0.0.1']) {
      assert.equal((await executar(new Request(`http://${host}/plataforma/`), local)).status, 200);
      assert.equal((await executar(new Request(`http://${host}/plataforma/`, {headers:{'cf-ray':'teste'}}), local)).status, 503);
      assert.equal((await executar(new Request(`http://${host}/plataforma/`), env)).status, 403);
    }
    const antesEntrar = assets;
    for (const path of ['/entrar', '/entrar/', '/entrar/qualquer']) {
      const r = await chamar(undefined, env, path);
      assert.equal(r.status, 200); assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal(assets, antesEntrar + 3);
    for (const path of ['/api/logout', '/api/logout/', '/sair', '/sair/']) assert.equal((await chamar(undefined, env, path)).headers.get('Location'), '/cdn-cgi/access/logout');
    assert.equal((await chamar(undefined, env, '/api/login/')).status, 404);
    assert.equal((await chamar(undefined, env, '/')).status, 200);
    assert.equal((await chamar(undefined, env, '/plataforma-publica/')).status, 200);
    assert.equal((await chamar(valido, { ...env, ACCESS_TEAM_DOMAIN: 'falha.example' })).status, 403);
    const novo = await token({}, outro.privateKey, { kid: 'novo' });
    chaves = [{ ...await crypto.subtle.exportKey('jwk', outro.publicKey), kid: 'novo', alg: 'RS256' }, { ...jwk, kid: 'enc', use: 'enc' }];
    const antesTroca = consultas;
    assert.equal((await chamar(novo)).status, 403);
    assert.equal(consultas, antesTroca);
    agora += 59_999;
    assert.equal((await chamar(novo)).status, 403);
    assert.equal(consultas, antesTroca);
    agora += 1;
    const respostas = await Promise.all(Array.from({ length: 10 }, () => chamar(novo)));
    assert.ok(respostas.every(r => r.status === 200));
    assert.equal(consultas, antesTroca + 1);
    assert.equal((await chamar(await token({}, par.privateKey, { kid: 'enc' }))).status, 403);
    assert.equal((await chamar(await token({}, par.privateKey, { kid: 'outro-kid' }))).status, 403);
    assert.equal(consultas, antesTroca + 1);
    for (const status of [201, 301, 302, 307, 308, 503]) {
      agora += 300_000;
      statusChaves = status;
      const resposta = await chamar(await token({ exp: Math.floor(agora / 1000) + 300 }));
      assert.equal(resposta.status, 403);
      assert.deepEqual(avisos.at(-1), ['[access] recusado: jwks_indisponivel']);
    }
    for (const motivo of ['sem_token', 'formato', 'alg', 'iss', 'aud', 'exp', 'nbf', 'kid_desconhecido', 'assinatura']) {
      assert.ok(avisos.some(args => args[0] === `[access] recusado: ${motivo}`), motivo);
    }
    assert.ok(avisos.some(args => args[0] === '[access] sem cadastro ativo'));
    assert.ok(avisos.every(args => args.length === 1 && /^\[access\] (recusado: (sem_token|formato|alg|iss|aud|exp|nbf|jwks_indisponivel|kid_desconhecido|assinatura|erro)|sem cadastro ativo)$/.test(String(args[0]))));
  } finally { central.sqlite.close(); municipal.sqlite.close(); globalThis.fetch = original; Date.now = relogio; console.warn = warnOriginal; }
});

test('Snapshots de dados são isolados por requisição concorrente, inclusive banco vazio', async () => {
 const exemplo = carregarCarteira();
 await Promise.all([5208707,999].map(prefeitura_id => contextoDados.run({
  carteira:{...exemplo,prefeitura_id,projetos:[]},
  cronogramas:{...carregarCronogramas(),prefeitura_id,cronogramas:[]},
  historico:{registros:[]}
 },async () => {
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(carregarCarteira().prefeitura_id,prefeitura_id);
  assert.deepEqual(carregarCarteira().projetos,[]);
  assert.deepEqual(carregarCronogramas().cronogramas,[]);
  assert.deepEqual(carregarHistorico().registros,[]);
 })));
 assert.equal(carregarCarteira(),exemplo);
});
