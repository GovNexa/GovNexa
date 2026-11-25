// Limite de requisições por pessoa (entrega 1.0; vetores 6 e 9). Todos falham sem src/lib/seguranca/limite.ts ou sem o limite nas rotas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JANELA_MS, LIMITE_POR_MINUTO, LIMITE_TESTE_LOCAL_MAX, chaveLimite, criarLimitadorCloudflare, criarLimitadorMemoria, dentroDoLimite, limiteTesteLocal, limitadorDoAmbiente, type Limitador } from '../../src/lib/seguranca/limite.ts';

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
test('medida 8: limite maior só com AMBIENTE=local E LIMITE_TESTE_LOCAL válido; senão a ligação da Cloudflare (fail-closed)', async () => {
  const ligacao30 = () => { let n = 0; return { async limit() { n += 1; return { success: n <= LIMITE_POR_MINUTO }; } }; };
  // Sem as duas variáveis, ou com valor inválido: ligação da Cloudflare (aqui, ausente = recusa).
  for (const env of [{}, { AMBIENTE: 'local' }, { LIMITE_TESTE_LOCAL: '1000' }, { AMBIENTE: 'producao', LIMITE_TESTE_LOCAL: '1000' },
    { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: 'abc' }, { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: '30' }, { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: '0' },
    { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: '-5' }, { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: '1e9' }, { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: String(LIMITE_TESTE_LOCAL_MAX + 1) },
    { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: 1000 }, { AMBIENTE: ' local', LIMITE_TESTE_LOCAL: '1000' }, null, undefined]) {
    assert.equal(limiteTesteLocal(env), null, JSON.stringify(env));
    assert.equal(await dentroDoLimite(limitadorDoAmbiente(env), P, 'a@x.gov.br'), false, `sem ligação recusa: ${JSON.stringify(env)}`);
  }
  // Com a ligação e sem as variáveis de teste: continua 30 por minuto.
  const prod = limitadorDoAmbiente({ LIMITE_API: ligacao30() });
  for (let i = 0; i < LIMITE_POR_MINUTO; i++) assert.equal(await dentroDoLimite(prod, P, 'a@x.gov.br'), true);
  assert.equal(await dentroDoLimite(prod, P, 'a@x.gov.br'), false, 'produção: 31ª recusada');
  // Teste local: passa de 30 e para no limite configurado, mesmo com a ligação presente.
  const env = { AMBIENTE: 'local', LIMITE_TESTE_LOCAL: '40', LIMITE_API: ligacao30() };
  assert.equal(limiteTesteLocal(env), 40);
  for (let i = 0; i < 40; i++) assert.equal(await dentroDoLimite(limitadorDoAmbiente(env), P, 'b@x.gov.br'), true, `local ${i + 1}`);
  assert.equal(await dentroDoLimite(limitadorDoAmbiente(env), P, 'b@x.gov.br'), false, 'local: 41ª recusada');
  assert.equal(limiteTesteLocal({ AMBIENTE: 'local', LIMITE_TESTE_LOCAL: String(LIMITE_TESTE_LOCAL_MAX) }), LIMITE_TESTE_LOCAL_MAX);
});
test('medida 8: o wrangler.jsonc (produção) nunca declara AMBIENTE nem LIMITE_TESTE_LOCAL, nem guarda variáveis do painel', () => {
  const texto = readFileSync('wrangler.jsonc', 'utf8');
  assert.doesNotMatch(texto, /LIMITE_TESTE_LOCAL/);
  const cfg = JSON.parse(texto.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  const blocos = [cfg, ...Object.values((cfg.env ?? {}) as Record<string, { vars?: object; keep_vars?: unknown }>)];
  for (const b of blocos) {
    assert.ok(!Object.hasOwn(b.vars ?? {}, 'AMBIENTE'), 'vars não pode ter AMBIENTE');
    assert.ok(!Object.hasOwn(b.vars ?? {}, 'LIMITE_TESTE_LOCAL'), 'vars não pode ter LIMITE_TESTE_LOCAL');
    assert.notEqual(b.keep_vars, true, 'keep_vars faria variáveis do painel sobreviverem à publicação');
  }
  for (const f of readdirSync('.github/workflows')) assert.doesNotMatch(readFileSync(`.github/workflows/${f}`, 'utf8'), /LIMITE_TESTE_LOCAL/, f);
});
test('medida 8: só o playwright.config.ts liga o limite de teste, sempre junto com AMBIENTE:local', () => {
  const cfg = readFileSync('playwright.config.ts', 'utf8');
  const servidores = cfg.match(/npx wrangler dev[^`]*/g) ?? [];
  assert.ok(servidores.length >= 3);
  for (const s of servidores) assert.match(s, /--var AMBIENTE:local[\s\S]*--var LIMITE_TESTE_LOCAL:[0-9]+/);
  const pacote = readFileSync('package.json', 'utf8');
  assert.doesNotMatch(pacote, /LIMITE_TESTE_LOCAL/);
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
test('rota do cadastro de projeto: origem, perfil e limite antes do tamanho e de qualquer leitura do corpo', () => {
  const t = readFileSync('src/pages/plataforma/projeto/criar.ts', 'utf8');
  const origem = t.indexOf('mesmaOrigem(request)'), perfil = t.indexOf('podeCadastrar(contexto)'), tamanho = t.indexOf("get('content-length')");
  const limite = t.indexOf('dentroDoLimite('), descarte = t.indexOf('await descartar(request)'), corpo = t.indexOf('request.text()');
  assert.ok(origem > 0 && perfil > origem && limite > perfil && tamanho > limite && descarte > limite && corpo > tamanho);
});
test('rota da edição do projeto: origem, perfil e limite antes do tamanho e de qualquer leitura do corpo', () => {
  const t = readFileSync('src/pages/plataforma/projeto/editar/[id].ts', 'utf8');
  const origem = t.indexOf('mesmaOrigem(request)'), perfil = t.indexOf('podeEditarProjeto(contexto)'), tamanho = t.indexOf("get('content-length')");
  const limite = t.indexOf('dentroDoLimite('), descarte = t.indexOf('await descartar(request)'), corpo = t.indexOf('request.text()');
  const formato = t.indexOf("get('content-type')");
  assert.ok(perfil < formato && formato < limite);
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
