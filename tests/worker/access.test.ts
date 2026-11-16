import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type Env } from '../../worker/index.ts';

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
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://access.example/cdn-cgi/access/certs');
    consultas++;
    return Response.json({ keys: chaves });
  };
  const env: Env = { ACCESS_TEAM_DOMAIN: 'access.example', ACCESS_AUD: 'plataforma', ASSETS: { async fetch() { assets++; return new Response('plataforma'); } } };
  const base = { iss: 'https://access.example', aud: ['plataforma'], exp: Math.floor(Date.now() / 1000) + 300, nbf: 0 };
  const b64 = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  async function token(claims = {}, chave = par.privateKey, header = {}) {
    const dados = `${b64({ alg: 'RS256', kid: 'teste', ...header })}.${b64({ ...base, ...claims })}`;
    const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(dados));
    return `${dados}.${Buffer.from(assinatura).toString('base64url')}`;
  }
  const chamar = (jwt?: string, config = env, path = '/plataforma/') => worker.fetch(new Request(`https://govnexa.example${path}`, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), config);
  try {
    const valido = await token();
    for (const path of ['/plataforma', '/plataforma/', '/plataforma/agenda.ics']) {
      const resposta = await chamar(valido, env, path);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(resposta.headers.get('X-Frame-Options'), 'DENY');
      assert.match(resposta.headers.get('Content-Security-Policy')!, /tile.openstreetmap.org/);
    }
    assert.equal(consultas, 1);
    assert.equal((await chamar(await token({ aud: 'plataforma' }))).status, 200);
    assert.equal((await chamar(`${b64({ alg: 'none', kid: 'teste' })}.${b64(base)}.`)).status, 403);
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
      assert.equal((await worker.fetch(new Request(`http://${host}/plataforma/`), local)).status, 200);
      assert.equal((await worker.fetch(new Request(`http://${host}/plataforma/`), env)).status, 403);
    }
    const antesEntrar = assets;
    for (const path of ['/entrar', '/entrar/', '/entrar/qualquer']) {
      const r = await chamar(undefined, env, path);
      assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), '/plataforma/');
    }
    assert.equal(assets, antesEntrar);
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
  } finally { globalThis.fetch = original; Date.now = relogio; }
});
