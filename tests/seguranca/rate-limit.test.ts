// Limite de requisições por pessoa (entrega 1.0; vetores 6 e 9). Todos falham sem src/lib/seguranca/limite.ts ou sem o limite nas rotas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JANELA_MS, LIMITE_POR_MINUTO, chaveLimite, criarLimitadorCloudflare, criarLimitadorMemoria, dentroDoLimite, type Limitador } from '../../src/lib/seguranca/limite.ts';

const P = 5208707;
const relogio = (inicio = 0) => { let t = inicio; return { agora: () => t, ir: (ms: number) => { t = ms; } }; };

test('memória: aceita até o limite e recusa o seguinte na mesma janela (fronteira 30/31)', async () => {
  const l = criarLimitadorMemoria({ agora: relogio(1_000).agora });
  for (let i = 0; i < LIMITE_POR_MINUTO; i++) assert.equal(await l.permitir('5208707:a@x.gov.br'), true, `tentativa ${i + 1}`);
  assert.equal(await l.permitir('5208707:a@x.gov.br'), false);
});
test('memória: virada da janela (59.999 ms ainda conta; 60.000 ms é janela nova)', async () => {
  const r = relogio(0);
  const l = criarLimitadorMemoria({ agora: r.agora });
  for (let i = 0; i < LIMITE_POR_MINUTO; i++) await l.permitir('k');
  r.ir(JANELA_MS - 1);
  assert.equal(await l.permitir('k'), false);
  r.ir(JANELA_MS);
  assert.equal(await l.permitir('k'), true);
});
test('contagens separadas por pessoa e por prefeitura', async () => {
  const l = criarLimitadorMemoria({ limite: 2, agora: () => 0 });
  const a = chaveLimite(P, 'a@x.gov.br')!, b = chaveLimite(P, 'b@x.gov.br')!, outra = chaveLimite(3550308, 'a@x.gov.br')!;
  assert.equal(await l.permitir(a), true);
  assert.equal(await l.permitir(a), true);
  assert.equal(await l.permitir(a), false);
  assert.equal(await l.permitir(b), true);
  assert.equal(await l.permitir(outra), true);
});
test('chave: prefeitura + e-mail normalizado; sem e-mail ou prefeitura inválida não há chave', () => {
  assert.equal(chaveLimite(P, '  A@X.gov.br '), '5208707:a@x.gov.br');
  for (const e of ['', '   ', null, undefined, 42, 'x'.repeat(255)]) assert.equal(chaveLimite(P, e), null);
  for (const p of [0, -1, 1.5, '5208707', undefined, null]) assert.equal(chaveLimite(p, 'a@x.gov.br'), null);
});
test('sem e-mail é recusado antes de contar (o limitador nem é chamado)', async () => {
  let chamadas = 0;
  const espiao: Limitador = { async permitir() { chamadas++; return true; } };
  assert.equal(await dentroDoLimite(espiao, P, ''), false);
  assert.equal(await dentroDoLimite(espiao, undefined, 'a@x.gov.br'), false);
  assert.equal(chamadas, 0);
  assert.equal(await dentroDoLimite(espiao, P, 'a@x.gov.br'), true);
  assert.equal(chamadas, 1);
});
test('ligação da Cloudflare: repassa a chave normalizada e respeita a resposta', async () => {
  const chaves: string[] = [];
  let sucesso = true;
  const l = criarLimitadorCloudflare({ async limit({ key }) { chaves.push(key); return { success: sucesso }; } });
  assert.equal(await dentroDoLimite(l, P, 'A@x.gov.br'), true);
  sucesso = false;
  assert.equal(await dentroDoLimite(l, P, 'a@x.gov.br'), false);
  assert.deepEqual(chaves, ['5208707:a@x.gov.br', '5208707:a@x.gov.br']);
});
test('ligação com erro, ausente ou com resposta estranha recusa (fail-closed)', async () => {
  const quebrada = criarLimitadorCloudflare({ async limit() { throw new Error('fora do ar'); } });
  assert.equal(await dentroDoLimite(quebrada, P, 'a@x.gov.br'), false);
  assert.equal(await dentroDoLimite(criarLimitadorCloudflare(undefined), P, 'a@x.gov.br'), false);
  const estranha = criarLimitadorCloudflare({ async limit() { return {} as { success: boolean }; } });
  assert.equal(await dentroDoLimite(estranha, P, 'a@x.gov.br'), false);
  const lancaNoLimitador: Limitador = { async permitir() { throw new Error('x'); } };
  assert.equal(await dentroDoLimite(lancaNoLimitador, P, 'a@x.gov.br'), false);
});
test('wrangler.jsonc: ligação LIMITE_API com o mesmo limite e período do código', () => {
  const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  const l = (cfg.ratelimits ?? []).find((x: { name: string }) => x.name === 'LIMITE_API');
  assert.ok(l, 'falta a ligação LIMITE_API');
  assert.match(String(l.namespace_id), /^[1-9][0-9]*$/);
  assert.deepEqual(l.simple, { limit: LIMITE_POR_MINUTO, period: JANELA_MS / 1000 });
});
test('rota da localização: origem, perfil e limite antes do tamanho e de qualquer leitura do corpo', () => {
  const t = readFileSync('src/pages/plataforma/projeto/localizacao/[id].ts', 'utf8');
  const origem = t.indexOf('mesmaOrigem(request)'), perfil = t.indexOf('podeEditarLocalizacao(contexto)'), tamanho = t.indexOf("get('content-length')");
  const limite = t.indexOf('dentroDoLimite('), descarte = t.indexOf('await descartar(request)'), corpo = t.indexOf('request.text()');
  assert.ok(origem > 0 && perfil > origem && limite > perfil && tamanho > limite && descarte > limite && corpo > tamanho);
});
test('rotas de documentos: limite conferido depois do perfil e antes de ler o corpo', () => {
  const rotas = ['src/pages/plataforma/documentos-projeto/enviar.ts', 'src/pages/plataforma/documentos-projeto/remover/[id].ts', 'src/pages/plataforma/documentos-projeto/classificar/[id].ts'];
  for (const arq of rotas) {
    const t = readFileSync(arq, 'utf8');
    const perfil = t.indexOf('podeEnviar(contexto)'), limite = t.indexOf('dentroDoLimite('), corpo = t.indexOf('formData(');
    assert.ok(perfil > 0 && limite > perfil && corpo > limite, arq);
    assert.match(t, /r=limite/, arq);
  }
});
