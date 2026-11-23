// E14a (Parte A): PNCP — migração 0011, regras, validação, cliente, serviço, HTTP, permissões, isolamento, limites e remoção da contratação.
// Nenhum teste chama a internet: o PNCP é simulado (fetch injetado) e um teste troca globalThis.fetch por um que lança.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTeste } from '../helpers/d1.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import { comInvalidacao } from '../../src/lib/repositorio/cache.ts';
import { executarAcao } from '../../src/lib/contratacoes/servico.ts';
import { criarRepositorioPncp, type ColetaOk } from '../../src/lib/pncp/repositorio.ts';
import { criarEstadoPncp, buscarCompra, coletar, type DepsPncp } from '../../src/lib/pncp/cliente.ts';
import { fetchSimulado, depsPncpDoAmbiente } from '../../src/lib/pncp/simulado.ts';
import { atenderOrgao, atenderPncp } from '../../src/lib/pncp/http.ts';
import { executarAcaoOrgao, executarAcaoPncp, podeAdministrarPncp, type ContextoPncp } from '../../src/lib/pncp/servico.ts';
import {
  ID_ORGAO, ROTULO_EVENTO_ORGAO, classificarObra, cnpjValido, dataHoraPncp, dataPncp, formatarCnpj, lerEntradaPncp, mascararCpf, normalizarCnpj, validarTrio,
} from '../../src/lib/pncp/regras.ts';
import { lerCompra, lerItens, lerResultados } from '../../src/lib/pncp/validacao.ts';
import { lerLimitado } from '../../src/lib/seguranca/ler-limitado.ts';
import { pode, usuarioPode, type Usuario } from '../../src/lib/usuarios/index.ts';
import dados from '../../data/exemplo/pncp/compras.json' with { type: 'json' };
import { rodarCasosMigracao } from './casos-migracao.ts';

const PREF = 5208707;
const OUTRA = 5300108;
const A = '90000001000129';
const B = '90000002000173';
const ALFA = '12ABC34501DE35';
const COMPRAS = (dados as unknown as { compras: Record<string, { compra: Record<string, unknown>; itens: unknown[]; resultados: Record<string, unknown[]> }> }).compras;

let t = Date.parse('2026-11-23T15:00:00.000Z');
const agora = (): Date => new Date(t);
const avancar = (ms: number): void => { t += ms; };
const usuario = (perfil: Usuario['perfil'], pref = PREF, ativo = true): Usuario =>
  ({ id: 'u-' + perfil, email: `${perfil}@exemplo.invalid`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo, criado_em: '', atualizado_em: '' });

type Banco = ReturnType<typeof bancoTeste>;
function montar(perfil: Usuario['perfil'] = 'admin', pref = PREF, banco: Banco = bancoTeste('prefeitura')) {
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  const repositorio = comInvalidacao(criarRepositorioD1(banco.db, pref), pref);
  const ctx: ContextoPncp = { usuario: usuario(perfil, pref), repositorio };
  return { banco, ctx, repositorio, pncp: repositorio.pncp!, pref };
}
const como = (ctx: ContextoPncp, perfil: Usuario['perfil']): ContextoPncp => ({ ...ctx, usuario: usuario(perfil, ctx.repositorio.prefeituraId) });
const q = (b: Banco, sql: string, ...p: unknown[]) => b.sqlite.prepare(sql).all(...(p as never[])).map((x) => ({ ...x })) as Record<string, unknown>[];
const n = (b: Banco, sql: string, ...p: unknown[]): number => Number(Object.values(q(b, sql, ...p)[0]!)[0]);

interface Espiao { n: number; urls: string[]; inits: RequestInit[] }
function mk(fetchFn: (u: string, i: RequestInit) => Promise<Response> = (u) => fetchSimulado(u), estado = criarEstadoPncp(() => t)): { deps: DepsPncp; esp: Espiao } {
  const esp: Espiao = { n: 0, urls: [], inits: [] };
  return { esp, deps: { agora: () => t, estado, fetch: async (u, i) => { esp.n++; esp.urls.push(u); esp.inits.push(i); return fetchFn(u, i); } } };
}
const estadoLivre = () => ({ pausadoAte: 0, porPessoa: { permitir: async () => true }, porPrefeitura: { permitir: async () => true } });

const exec = (ctx: ContextoPncp, deps: DepsPncp, corpo: unknown) => { avancar(1000); return executarAcaoPncp(ctx, corpo, deps, agora()); };
const org = (ctx: ContextoPncp, corpo: unknown) => { avancar(1000); return executarAcaoOrgao(ctx, corpo, agora()); };
const corpoDe = (r: Awaited<ReturnType<typeof exec>>): Record<string, any> => { assert.ok(r.ok, JSON.stringify(r)); return r.corpo; };
async function secretaria(ctx: ContextoPncp, cnpj = A, nome = 'Secretaria Exemplo de Obras'): Promise<string> {
  const r = await org(ctx, { acao: 'orgao_criar', cnpj, nome, sigla: 'SEINFRA' });
  assert.ok(r.ok, JSON.stringify(r));
  return (await ctx.repositorio.pncp!.listarOrgaos()).find((o) => o.cnpj === cnpj)!.id;
}
async function contratacao(ctx: ContextoPncp, nome = 'Obra X'): Promise<string> {
  avancar(1000);
  const r = await executarAcao({ usuario: ctx.usuario, repositorio: ctx.repositorio }, { acao: 'criar', campos: { nome, etapa: 'finalizacao' } }, agora());
  assert.ok(r.ok, JSON.stringify(r));
  return r.id;
}
const ligar = (ctx: ContextoPncp, deps: DepsPncp, id: string, seq: number, extra: Record<string, unknown> = {}, cnpj = A) =>
  exec(ctx, deps, { acao: 'vincular', id, cnpj, ano: 2026, sequencial: seq, ...extra });
/** Acrescenta os dois dígitos verificadores a 12 posições (mesma conta da regra do CNPJ). */
function comDv(base: string): string {
  const v = Array.from(base, (c) => c.charCodeAt(0) - 48);
  const dv = (pesos: number[], x: number[]): number => { const r = pesos.reduce((s, p, i) => s + p * x[i]!, 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], v);
  return base + d1 + dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [...v, d1]);
}
const controle = (seq: number, cnpj = A): string => `${cnpj}-1-${String(seq).padStart(6, '0')}/2026`;

/** PNCP falso com compras geradas (itens e resultados em quantidade controlada), para os testes de teto e prazo. */
function gerado(opcoes: { itens: number; comResultado: boolean; apos?: () => void }) {
  return async (url: string): Promise<Response> => {
    opcoes.apos?.();
    const m = /compras\/(\d{4})\/(\d+)(\/itens(\?pagina=(\d+))?(\/\d+\/resultados)?)?/.exec(url)!;
    const seq = Number(m[2]);
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
    if (!m[3]) return json({ ...COMPRAS[`${A}/2026/1`]!.compra, sequencialCompra: seq, unidadeOrgao: undefined });
    if (url.includes('/resultados')) return new Response(null, { status: 204 });
    const pagina = Number(m[5] ?? 1);
    const lista = Array.from({ length: opcoes.itens }, (_, i) => ({ numeroItem: i + 1, descricao: 'Item ' + (i + 1), situacaoCompraItem: 1, temResultado: opcoes.comResultado }));
    return json(lista.slice((pagina - 1) * 50, pagina * 50));
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
test('1. migração 0011: todos os casos de abuso do validador (92) passam no banco de teste', () => {
  const banco = bancoTeste('prefeitura');
  const r = rodarCasosMigracao(banco.sqlite);
  assert.equal(r.falhas, 0, r.mensagens.join('\n'));
  assert.ok(r.ok >= 92, `casos: ${r.ok}`);
});

test('2. CNPJ, número de controle e link: só o que o PNCP publica', () => {
  assert.equal(cnpjValido(A), true);
  assert.equal(cnpjValido('90000001000128'), false);
  assert.equal(cnpjValido(ALFA), true);
  assert.equal(cnpjValido('00000000000000'), false);
  assert.equal(normalizarCnpj('90.000.001/0001-29'), A);
  assert.equal(normalizarCnpj('12.abc.345/01de-35'), ALFA);
  assert.equal(normalizarCnpj('x'.repeat(31)), null);
  assert.equal(formatarCnpj(A), '90.000.001/0001-29');
  assert.equal(formatarCnpj(ALFA), '12.ABC.345/01DE-35');
  const ok = (v: string) => lerEntradaPncp(v, 2026);
  for (const v of [`${A}-1-000001/2026`, '90.000.001/0001-29-1-000001/2026', `https://pncp.gov.br/app/editais/${A}/2026/1`, `https://www.pncp.gov.br/app/editais/${A}/2026/1/`, `https://pncp.gov.br/app/editais/90.000.001/0001-29/2026/1`]) {
    assert.deepEqual(ok(v), { ok: true, cnpj: A, ano: 2026, sequencial: 1 }, v);
  }
  const FORMATO = 'Cole o número de controle do PNCP (ex.: 90000001000129-1-000001/2026) ou o link da página da compra no PNCP.';
  for (const v of [`http://pncp.gov.br/app/editais/${A}/2026/1`, `https://pncp.gov.br.evil.example/app/editais/${A}/2026/1`, `https://evil.example/app/editais/${A}/2026/1`,
    'javascript:alert(1)', `https://pncp.gov.br@evil.example/app/editais/${A}/2026/1`, `https://pncp.gov.br:8443/app/editais/${A}/2026/1`, 'x'.repeat(301), `${A}-1-000001/2026\u0007`, '', `https://pncp.gov.br/outra/${A}/2026/1`]) {
    assert.deepEqual(ok(v), { ok: false, erro: FORMATO }, v.slice(0, 40));
  }
  assert.equal(ok(`${A}-1-000001/2020`).ok, false);
  assert.deepEqual(ok(`${A}-1-000001/2028`), { ok: false, erro: 'Ano da compra inválido.' });
  assert.deepEqual(ok(`${A}-1-000000/2026`), { ok: false, erro: 'Número sequencial da compra inválido.' });
  assert.deepEqual(ok(`90000001000128-1-000001/2026`), { ok: false, erro: 'CNPJ do número de controle inválido.' });
  assert.equal(ok(`${A}-1-000001/2027`).ok, true);
  assert.equal(ok(`https://pncp.gov.br/app/editais/${A}/2026/1000000`).ok, false);
});

test('2b. validarTrio: só números inteiros seguros (texto não vira número)', () => {
  assert.deepEqual(validarTrio(A, 2026, 1, 2026), { ok: true, cnpj: A, ano: 2026, sequencial: 1 });
  assert.deepEqual(validarTrio(A, 2020, 1, 2026), { ok: false, erro: 'Ano da compra inválido.' });
  assert.deepEqual(validarTrio(A, 1e9, 1, 2026), { ok: false, erro: 'Ano da compra inválido.' });
  assert.deepEqual(validarTrio(A, 2026.5, 1, 2026), { ok: false, erro: 'Ano da compra inválido.' });
  assert.deepEqual(validarTrio(A, '2026', 1, 2026), { ok: false, erro: 'Ano da compra inválido.' });
  assert.deepEqual(validarTrio(A, 2026, 1e9, 2026), { ok: false, erro: 'Número sequencial da compra inválido.' });
  assert.deepEqual(validarTrio(A, 2026, '1', 2026), { ok: false, erro: 'Número sequencial da compra inválido.' });
  assert.deepEqual(validarTrio(A, 2026, 0, 2026), { ok: false, erro: 'Número sequencial da compra inválido.' });
  assert.deepEqual(validarTrio('123', 2026, 1, 2026), { ok: false, erro: 'CNPJ do número de controle inválido.' });
});

test('3. classificarObra: amparo, concorrência e palavras do objeto', () => {
  const c = (seq: number) => lerCompra(COMPRAS[`${A}/2026/${seq}`]!.compra, { cnpj: A, ano: 2026, sequencial: seq })!;
  assert.equal(c(1).obra, 'sim');
  assert.equal(c(9).obra, 'nao_identificado');
  assert.equal(c(10).obra, 'sim');
  assert.equal(c(2).obra, 'provavel');
  assert.equal(classificarObra({ modalidadeId: 6, amparoCodigo: 1, objeto: 'Reforma do prédio' }), 'provavel');
  assert.equal(classificarObra({ modalidadeId: 4, amparoCodigo: null, objeto: 'CONSTRUÇÃO de PONTE' }), 'sim');
  assert.equal(classificarObra({ modalidadeId: 4, amparoCodigo: null, objeto: 'Compra de papel' }), 'nao_identificado');
  assert.equal(classificarObra({ modalidadeId: null, amparoCodigo: 84, objeto: null }), 'sim');
  assert.equal(classificarObra({ modalidadeId: null, amparoCodigo: null, objeto: 'manobra de veículos' }), 'nao_identificado');
});

test('4. validação: texto puro, valores, datas, identidade, CPF fora de tudo', () => {
  const c5 = lerCompra(COMPRAS[`${A}/2026/5`]!.compra, { cnpj: A, ano: 2026, sequencial: 5 })!;
  assert.equal(c5.objeto, '<img src=x onerror=alert(1)> Obra de drenagem exemplo');
  assert.equal(c5.valorEstimado, null);
  assert.equal(String(COMPRAS[`${A}/2026/5`]!.compra.processo).length, 300);
  assert.equal(c5.processo!.length, 120);
  assert.equal(lerCompra(COMPRAS[`${A}/2026/6`]!.compra, { cnpj: A, ano: 2026, sequencial: 6 }), null);
  assert.equal(lerItens([{ descricao: 'sem número', situacaoCompraItem: 1 }]), null);
  assert.equal(lerItens([{ numeroItem: 1, situacaoCompraItem: 1 }, { numeroItem: 1, situacaoCompraItem: 1 }]), null);
  assert.equal(lerItens(Array.from({ length: 51 }, (_, i) => ({ numeroItem: i + 1, situacaoCompraItem: 1 }))), null);
  assert.equal(lerResultados([{ sequencialResultado: 1, numeroItem: 2 }], 1, controle(1)), null);
  assert.equal(lerResultados([{ sequencialResultado: 1, numeroItem: 1, numeroControlePNCPCompra: controle(2) }], 1, controle(1)), null);
  assert.equal(lerResultados([{ sequencialResultado: 1, numeroItem: 1 }, { sequencialResultado: 1, numeroItem: 1 }], 1, controle(1)), null);
  const r2 = lerResultados(COMPRAS[`${A}/2026/2`]!.resultados['1'], 1, controle(2))!;
  assert.equal(r2.length, 4);
  assert.deepEqual(r2.map((x) => x.fornecedorNi), [B, null, null, '90000003000118']);
  assert.ok(!JSON.stringify(r2).includes('00000000191'));
  assert.equal(r2[3]!.fornecedorNome, 'Fornecedor Exemplo MEI ***');
  assert.ok(!JSON.stringify(r2).includes('000.000.001-91'));
  const grande = Array.from({ length: 60 }, (_, i) => ({ sequencialResultado: i + 1, numeroItem: 1 }));
  assert.equal(lerResultados(grande, 1, controle(1))!.length, 50);
});

test('4b. CPF dentro de textos é mascarado; CNPJ e valores não', () => {
  assert.equal(mascararCpf('Fornecedor Exemplo MEI 000.000.001-91'), 'Fornecedor Exemplo MEI ***');
  assert.equal(mascararCpf('00000000191'), '***');
  assert.equal(mascararCpf('CPF: 000.000.001-91.'), 'CPF: ***.');
  assert.equal(mascararCpf(null), null);
  for (const s of ['90000001000129', '90.000.001/0001-29', ALFA, 'R$ 1.380.000,00', `${A}-1-000001/2026`]) assert.equal(mascararCpf(s), s, s);
});

test('4c. datas do PNCP: 10 ou 19 caracteres, só o que existe', () => {
  assert.equal(dataPncp('2026-07-09'), '2026-07-09');
  assert.equal(dataPncp('2026-07-09T16:42'), '2026-07-09T16:42:00');
  assert.equal(dataPncp('2026-07-09T16:42:27'), '2026-07-09T16:42:27');
  assert.equal(dataPncp('2026-07-09T16:42:27.123-03:00'), null);
  assert.equal(dataPncp('09/07/2026'), null);
  assert.equal(dataPncp('2026-02-30'), null);
  assert.equal(dataPncp('2026-07-09T25:00:00'), null);
  assert.equal(dataPncp('1999-12-31', true), null);
  assert.equal(dataPncp('2026-09-15', true), '2026-09-15');
  assert.equal(dataHoraPncp('2026-07-09'), '09/07/2026');
  assert.equal(dataHoraPncp('2026-07-09T16:42:27'), '09/07/2026 16:42');
  assert.equal(dataHoraPncp(null), '—');
});

test('4d. lerLimitado: corta acima do teto; corpo vazio vira texto vazio', async () => {
  assert.equal(await lerLimitado(new Response('abcdef'), 3), null);
  assert.equal(await lerLimitado(new Response('abc'), 3), 'abc');
  assert.equal(await lerLimitado(new Response(null), 10), '');
});

// ---------------------------------------------------------------------------------------------------------------------------------
const TRIO1 = { cnpj: A, ano: 2026, sequencial: 1 };
test('5. cliente: hosts fixos, sem redirecionamento, tetos, 204, 404, pausa de 429, tetos de chamadas e prazo', async () => {
  const { deps, esp } = mk();
  const r = await coletar(TRIO1, deps);
  assert.equal(r.r, 'ok');
  assert.equal(esp.n, 3);
  for (const u of esp.urls) assert.match(u, /^https:\/\/pncp\.gov\.br\/api\/(consulta|pncp)\/v1\//);
  for (const i of esp.inits) assert.equal(i.redirect, 'manual');
  assert.ok(esp.urls[0]!.startsWith(`https://pncp.gov.br/api/consulta/v1/orgaos/${A}/compras/2026/1`));
  assert.equal(((await buscarCompra({ cnpj: A, ano: 2026, sequencial: 99 }, mk().deps)) as { r: string }).r, 'nao_encontrado');
  assert.equal((await coletar({ cnpj: 'invalido', ano: 2026, sequencial: 1 }, mk().deps)).r, 'erro');
  // 301 = erro (nunca segue)
  assert.deepEqual(await coletar(TRIO1, mk(async () => new Response(null, { status: 301, headers: { location: 'https://evil.example/' } })).deps), { r: 'erro', motivo: 'PNCP respondeu 301' });
  // resposta acima do teto
  const grande = await coletar(TRIO1, mk(async () => new Response('x'.repeat(300_000), { status: 200 })).deps);
  assert.equal(grande.r, 'erro');
  // 204 nos resultados
  const sem = await coletar(TRIO1, mk(async (u) => (u.endsWith('/resultados') ? new Response(null, { status: 204 }) : fetchSimulado(u))).deps);
  assert.equal(sem.r === 'ok' && sem.resultados.length, 0);
  // 429: pausa de 60 s da instância
  const m = mk();
  assert.equal((await coletar({ cnpj: A, ano: 2026, sequencial: 8 }, m.deps)).r, 'erro');
  assert.equal(m.esp.n, 1);
  const pausada = await coletar(TRIO1, m.deps);
  assert.deepEqual(pausada, { r: 'erro', motivo: 'PNCP em pausa por excesso de pedidos' });
  assert.equal(m.esp.n, 1);
  avancar(60_001);
  assert.equal((await coletar(TRIO1, m.deps)).r, 'ok');
  assert.ok(m.esp.n > 1);
  // teto de 60 chamadas por pedido
  const muitos = mk(gerado({ itens: 200, comResultado: true }));
  const c60 = await coletar({ cnpj: A, ano: 2026, sequencial: 21 }, muitos.deps);
  assert.equal(c60.r === 'ok' && c60.incompleto, true);
  assert.equal(muitos.esp.n, 60);
  // prazo: cada chamada gasta 10 s; o pedido tem 25 s
  const lento = mk(gerado({ itens: 10, comResultado: true, apos: () => avancar(10_000) }));
  const cp = await coletar({ cnpj: A, ano: 2026, sequencial: 21 }, lento.deps);
  assert.equal(cp.r === 'ok' && cp.incompleto, true);
  assert.equal(lento.esp.n, 3);
  // A-16: prazo esgotado antes da chamada (restante = 0 e restante < 0): nenhuma chamada e nenhuma exceção
  const zero = mk();
  assert.deepEqual(await coletar(TRIO1, zero.deps, t), { r: 'erro', motivo: 'tempo esgotado' });
  assert.deepEqual(await coletar(TRIO1, zero.deps, t - 1), { r: 'erro', motivo: 'tempo esgotado' });
  assert.equal(zero.esp.n, 0);
  // A-15: exceção do fetch nunca vaza
  for (const erro of [new TypeError('falha de rede com dados internos'), new DOMException('tempo', 'TimeoutError')]) {
    const e = await coletar(TRIO1, mk(async () => { throw erro; }).deps);
    assert.deepEqual(e, { r: 'erro', motivo: 'sem resposta do PNCP' });
  }
  // A-4: item repetido entre páginas e resultado repetido = formato
  const repetido = mk(async (u) => (u.includes('pagina=1') ? new Response(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ numeroItem: i + 1, situacaoCompraItem: 1 }))), { status: 200 })
    : u.includes('pagina=2') ? new Response(JSON.stringify([{ numeroItem: 5, situacaoCompraItem: 1 }]), { status: 200 }) : fetchSimulado(u)));
  assert.equal((await coletar(TRIO1, repetido.deps)).r, 'formato');
});

test('5b. sem rede: o simulado nunca usa globalThis.fetch', async () => {
  const original = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = (() => { chamou = true; throw new Error('rede proibida'); }) as typeof fetch;
  try {
    const d = depsPncpDoAmbiente({ AMBIENTE: 'local' }, new Request('http://127.0.0.1:4321/x'));
    assert.equal((await coletar(TRIO1, d)).r, 'ok');
    assert.equal((await d.fetch('https://evil.example/', {})).status, 404);
    assert.equal(chamou, false);
  } finally { globalThis.fetch = original; }
});

// ---------------------------------------------------------------------------------------------------------------------------------
test('6. do zero: secretaria, prévia, ligar, atualizar com trava, desligar e religar; a tela vence a carga', async () => {
  const m = montar('admin');
  carregarExemplo(m.banco.sqlite);
  const { deps, esp } = mk();
  const adm = m.ctx;
  const ed = como(adm, 'editor');
  assert.equal((await org(ed, { acao: 'orgao_criar', cnpj: A, nome: 'x' })).ok, false);
  const orgaoId = await secretaria(adm);
  const id = await contratacao(adm);
  const foto = (cid: string) => ({
    contratacao: q(m.banco, 'SELECT * FROM contratacao WHERE prefeitura_id = ? AND id = ?', PREF, cid),
    eventos: q(m.banco, 'SELECT * FROM evento_contratacao WHERE prefeitura_id = ? AND contratacao_id = ? ORDER BY em, id', PREF, cid),
  });
  const antes = foto(id);
  const antesEx = foto('C-EX01');
  assert.ok(antesEx.contratacao.length === 1);
  const pv = corpoDe(await exec(ed, deps, { acao: 'previa', id, entrada: controle(1) })).previa;
  assert.equal(pv.obra, 'sim');
  assert.equal(pv.orgao_nome, 'Secretaria Exemplo de Obras');
  assert.equal(pv.aviso_municipio, null);
  assert.equal(pv.link, `https://pncp.gov.br/app/editais/${A}/2026/1`);
  assert.equal(n(m.banco, 'SELECT count(*) FROM contratacao_pncp'), 0);
  const lig = corpoDe(await ligar(ed, deps, id, 1));
  assert.equal(lig.status, 'ok');
  const v = (await m.pncp.obterVinculoAtivo(id))!;
  assert.equal(v.numero_controle, controle(1));
  assert.equal(v.orgao_id, orgaoId);
  const retrato = await m.pncp.obterRetrato(v.id);
  assert.equal(retrato.compra!.situacao_id, 1);
  assert.equal(retrato.itens.length, 1);
  assert.equal(retrato.resultados.length, 1);
  assert.equal(retrato.resultados[0]!.fornecedor_nome, 'Construtora Exemplo Alfa Ltda');
  assert.equal(retrato.resultados[0]!.valor_homologado, 138_000_000);
  const antesChamadas = esp.n;
  const rec = corpoDe(await exec(ed, deps, { acao: 'atualizar', id }));
  assert.equal(rec.status, 'recente');
  assert.match(rec.aviso, /^Dados atualizados há pouco\. Nova consulta liberada às \d\d:\d\d\.$/);
  assert.equal(esp.n, antesChamadas);
  avancar(600_001);
  assert.equal(corpoDe(await exec(ed, deps, { acao: 'atualizar', id })).status, 'ok');
  assert.ok(esp.n > antesChamadas);
  assert.equal(corpoDe(await exec(adm, deps, { acao: 'atualizar_orgao', orgao_id: orgaoId })).recentes, 1);
  const des = await exec(ed, deps, { acao: 'desvincular', id, vinculo_id: v.id, motivo: 'Compra errada' });
  assert.ok(des.ok);
  assert.equal(await m.pncp.obterVinculoAtivo(id), null);
  assert.equal(corpoDe(await ligar(ed, deps, id, 1)).status, 'ok');
  const tipos = (await m.pncp.historico(id, 20)).map((e) => e.tipo).reverse();
  assert.deepEqual([...tipos].sort(), ['coleta_ok', 'coleta_ok', 'coleta_ok', 'desvinculo', 'vinculo', 'vinculo']); // ligar grava vínculo e 1ª coleta no mesmo instante
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp e JOIN contratacao_pncp v ON v.prefeitura_id = e.prefeitura_id AND v.id = e.vinculo_id WHERE e.contratacao_id <> v.contratacao_id'), 0);
  // A-18: a tela vence a carga: nada disso toca a contratação nem o Histórico dela
  assert.deepEqual(foto(id), antes);
  // C-EX01 da carga de exemplo
  const ex = corpoDe(await ligar(ed, deps, 'C-EX01', 3));
  assert.equal(ex.status, 'ok');
  avancar(600_001);
  await exec(ed, deps, { acao: 'atualizar', id: 'C-EX01' });
  await exec(adm, deps, { acao: 'atualizar_orgao', orgao_id: orgaoId });
  const vex = (await m.pncp.obterVinculoAtivo('C-EX01'))!;
  await exec(ed, deps, { acao: 'desvincular', id: 'C-EX01', vinculo_id: vex.id, motivo: 'teste' });
  assert.deepEqual(foto('C-EX01'), antesEx);
});

test('6b. secretaria: cada ação grava 1 evento com o autor; recusas não gravam; edição sem mudança não grava', async () => {
  const m = montar('admin');
  const adm = m.ctx;
  const quant = () => n(m.banco, 'SELECT count(*) FROM evento_pncp');
  assert.equal((await org(adm, { acao: 'orgao_criar', cnpj: '90000001000128', nome: 'x' })).ok, false);
  assert.equal(quant(), 0);
  const id = await secretaria(adm);
  assert.equal(quant(), 1);
  let [o] = await m.pncp.listarOrgaos();
  assert.equal(o!.criado_por, 'admin@exemplo.invalid');
  assert.equal(o!.vinculos_ativos, 0);
  let h = await m.pncp.historicoOrgao(id, 20);
  assert.deepEqual(h.map((e) => [e.tipo, e.autor]), [['orgao_cadastrado', 'admin@exemplo.invalid']]);
  assert.equal(h[0]!.descricao, 'Secretaria cadastrada: Secretaria Exemplo de Obras (90.000.001/0001-29)');
  assert.deepEqual(h[0]!.detalhe, { cnpj: A, nome: 'Secretaria Exemplo de Obras', sigla: 'SEINFRA' });
  assert.match(h[0]!.em, /Z$/);
  assert.equal((await org(adm, { acao: 'orgao_criar', cnpj: '90.000.001/0001-29', nome: 'Outra' })).ok, false);
  assert.equal(quant(), 1);
  // edição sem mudança: sem UPDATE, sem evento, mesma revisão
  const sem = await org(adm, { acao: 'orgao_editar', orgao_id: id, revisao: 0, nome: '  Secretaria Exemplo de Obras ', sigla: 'SEINFRA' });
  assert.deepEqual(sem.ok && sem.corpo.mudou, false);
  assert.equal(quant(), 1);
  assert.equal((await m.pncp.obterOrgao(id))!.revisao, 0);
  const ed = await org(adm, { acao: 'orgao_editar', orgao_id: id, revisao: 0, nome: 'Secretaria de Infraestrutura', sigla: 'SEINFRA' });
  assert.ok(ed.ok);
  assert.equal(quant(), 2);
  h = await m.pncp.historicoOrgao(id, 20);
  assert.equal(h[0]!.tipo, 'orgao_editado');
  assert.deepEqual(h[0]!.detalhe, { nome: { de: 'Secretaria Exemplo de Obras', para: 'Secretaria de Infraestrutura' } });
  assert.equal(h[0]!.descricao, 'Secretaria editada: Secretaria de Infraestrutura');
  const velha = await org(adm, { acao: 'orgao_editar', orgao_id: id, revisao: 0, nome: 'Outro nome', sigla: null });
  assert.deepEqual(!velha.ok && [velha.status, velha.erro], [409, 'A secretaria foi alterada por outra pessoa. Recarregue a página.']);
  assert.equal(quant(), 2);
  assert.equal((await m.pncp.obterOrgao(id))!.nome, 'Secretaria de Infraestrutura');
  // desativar com vínculo ativo: 409 e nada muda
  const { deps } = mk();
  const cid = await contratacao(adm);
  assert.equal(corpoDe(await ligar(adm, deps, cid, 1)).status, 'ok');
  const eventosAntes = quant();
  const com = await org(adm, { acao: 'orgao_desativar', orgao_id: id, revisao: 1 });
  assert.deepEqual(!com.ok && [com.status, com.erro], [409, 'Desligue antes as contratações ligadas a esta secretaria.']);
  assert.equal(quant(), eventosAntes);
  assert.equal((await m.pncp.obterOrgao(id))!.ativo, true);
  const v = (await m.pncp.obterVinculoAtivo(cid))!;
  await exec(adm, deps, { acao: 'desvincular', id: cid, vinculo_id: v.id, motivo: 'x' });
  assert.ok((await org(adm, { acao: 'orgao_desativar', orgao_id: id, revisao: 1 })).ok);
  assert.equal((await m.pncp.obterOrgao(id))!.ativo, false);
  assert.ok((await org(adm, { acao: 'orgao_reativar', orgao_id: id, revisao: 2 })).ok);
  h = await m.pncp.historicoOrgao(id, 20);
  assert.deepEqual(h.map((e) => e.tipo), ['orgao_reativado', 'orgao_desativado', 'orgao_editado', 'orgao_cadastrado']);
  assert.equal(h[1]!.descricao, 'Secretaria desativada: Secretaria de Infraestrutura (90.000.001/0001-29)');
  assert.ok(h.every((e) => e.autor === 'admin@exemplo.invalid' && e.contratacao_id === null && e.vinculo_id === null));
  assert.deepEqual(Object.values(ROTULO_EVENTO_ORGAO), ['Secretaria cadastrada', 'Secretaria editada', 'Secretaria desativada', 'Secretaria reativada']);
  // limite de 50 secretarias
  const outro = montar('admin', PREF, bancoTeste('prefeitura'));
  let criadas = 0;
  for (let i = 0; i < 50; i++) {
    const r = await org(outro.ctx, { acao: 'orgao_criar', cnpj: comDv('9000' + String(i).padStart(8, '0')), nome: 'S' + i });
    if (r.ok) criadas++;
  }
  assert.equal(criadas, 50);
  const ultimo = await org(outro.ctx, { acao: 'orgao_criar', cnpj: A, nome: 'S51' });
  assert.deepEqual(!ultimo.ok && [ultimo.status, ultimo.erro], [400, 'Limite de 50 secretarias.']);
  assert.equal(n(outro.banco, 'SELECT count(*) FROM evento_pncp'), 50);
});

test('7. perfis: leitura 403 em tudo; editor sem secretarias; editor, gestor e admin usam o PNCP; permissão própria', async () => {
  assert.equal(pode('admin', 'gerenciar_secretarias_compradoras'), true);
  for (const p of ['gestor', 'editor', 'leitura'] as const) assert.equal(pode(p, 'gerenciar_secretarias_compradoras'), false, p);
  assert.equal(pode('admin', 'gerenciar_usuarios'), true);
  assert.equal(podeAdministrarPncp(usuario('admin', PREF, false)), false);
  assert.equal(usuarioPode(usuario('admin'), 'gerenciar_secretarias_compradoras'), true);
  const m = montar('admin');
  const orgaoId = await secretaria(m.ctx);
  const { deps } = mk();
  const cids = [await contratacao(m.ctx, 'A1'), await contratacao(m.ctx, 'A2'), await contratacao(m.ctx, 'A3')];
  const leitura = como(m.ctx, 'leitura');
  for (const corpo of [{ acao: 'previa', id: cids[0], entrada: controle(1) }, { acao: 'vincular', id: cids[0], cnpj: A, ano: 2026, sequencial: 1 }, { acao: 'atualizar', id: cids[0] },
    { acao: 'desvincular', id: cids[0], vinculo_id: 'V-x', motivo: 'm' }, { acao: 'atualizar_orgao', orgao_id: orgaoId }]) {
    const r = await exec(leitura, deps, corpo);
    assert.equal(!r.ok && r.status, 403, String(corpo.acao));
  }
  for (const corpo of [{ acao: 'orgao_criar', cnpj: B, nome: 'x' }, { acao: 'orgao_editar', orgao_id: orgaoId, revisao: 0, nome: 'y' }, { acao: 'orgao_desativar', orgao_id: orgaoId, revisao: 0 }, { acao: 'orgao_reativar', orgao_id: orgaoId, revisao: 0 }]) {
    for (const p of ['leitura', 'editor', 'gestor'] as const) {
      const r = await org(como(m.ctx, p), corpo);
      assert.deepEqual(!r.ok && [r.status, r.erro], [403, 'Seu perfil não permite cadastrar secretarias compradoras.'], `${p} ${corpo.acao}`);
    }
  }
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp'), 1);
  let seq = 1;
  for (const [i, p] of (['editor', 'gestor', 'admin'] as const).entries()) {
    const ctx = como(m.ctx, p);
    const id = cids[i]!;
    assert.ok((await exec(ctx, deps, { acao: 'previa', id, entrada: controle(seq) })).ok, p);
    assert.equal(corpoDe(await ligar(ctx, deps, id, seq)).status, 'ok');
    avancar(600_001);
    assert.equal(corpoDe(await exec(ctx, deps, { acao: 'atualizar', id })).status, 'ok');
    assert.ok((await exec(ctx, deps, { acao: 'atualizar_orgao', orgao_id: orgaoId })).ok);
    const v = (await m.pncp.obterVinculoAtivo(id))!;
    assert.ok((await exec(ctx, deps, { acao: 'desvincular', id, vinculo_id: v.id, motivo: 'ok' })).ok);
    seq++;
  }
});

test('7b. sem banco de gravação ou sem PNCP: 503 nas duas rotas', async () => {
  const m = montar('admin');
  const { deps } = mk();
  const semGravar = { ...m.ctx, repositorio: { ...m.ctx.repositorio, podeGravar: false } };
  const semPncp = { ...m.ctx, repositorio: { ...m.ctx.repositorio, pncp: undefined } };
  for (const ctx of [semGravar, semPncp]) {
    const a = await exec(ctx, deps, { acao: 'atualizar', id: 'C-x' });
    assert.deepEqual(!a.ok && [a.status, a.erro], [503, 'Gravação indisponível no momento.']);
    const o = await org(ctx, { acao: 'orgao_criar', cnpj: A, nome: 'x' });
    assert.deepEqual(!o.ok && [o.status, o.erro], [503, 'Gravação indisponível no momento.']);
  }
});

test('8. isolamento: outra prefeitura não vê nem mexe', async () => {
  const banco = bancoTeste('prefeitura');
  const p1 = montar('admin', PREF, banco);
  const p2 = montar('admin', OUTRA, banco);
  const { deps } = mk();
  const o1 = await secretaria(p1.ctx);
  await secretaria(p2.ctx, B, 'Secretaria da Outra');
  const c1 = await contratacao(p1.ctx);
  const c2 = await contratacao(p2.ctx);
  assert.equal(corpoDe(await ligar(p1.ctx, deps, c1, 1)).status, 'ok');
  const v1 = (await p1.pncp.obterVinculoAtivo(c1))!;
  assert.deepEqual((await p2.pncp.listarOrgaos()).map((o) => o.cnpj), [B]);
  assert.equal(await p2.pncp.obterVinculoAtivo(c1), null);
  assert.deepEqual((await p2.pncp.obterRetrato(v1.id)).itens, []);
  assert.deepEqual(await p2.pncp.historico(c1, 20), []);
  assert.deepEqual(await p2.pncp.historicoOrgao(o1, 20), []);
  assert.equal(await p2.pncp.obterOrgao(o1), null);
  // CNPJ cadastrado só na OUTRA: a prévia da PREF recusa
  const r = await exec(p1.ctx, deps, { acao: 'previa', id: c1 + 'x', entrada: controle(1, B) });
  assert.equal(!r.ok && r.status, 404);
  const c1b = await contratacao(p1.ctx, 'Outra obra');
  const r2 = await exec(p1.ctx, deps, { acao: 'previa', id: c1b, entrada: controle(1, B) });
  assert.equal(!r2.ok && r2.status, 400);
  // ids de outra prefeitura
  assert.equal((await exec(p2.ctx, deps, { acao: 'desvincular', id: c2, vinculo_id: v1.id, motivo: 'x' })).ok, false);
  assert.equal(n(banco, 'SELECT count(*) FROM contratacao_pncp WHERE desvinculado_em IS NOT NULL'), 0);
  const a2 = await exec(p2.ctx, deps, { acao: 'atualizar_orgao', orgao_id: o1 });
  assert.equal(!a2.ok && a2.status, 404);
  const e2 = await org(p2.ctx, { acao: 'orgao_editar', orgao_id: o1, revisao: 0, nome: 'hack' });
  assert.equal(!e2.ok && e2.status, 404);
  const at2 = await exec(p2.ctx, deps, { acao: 'atualizar', id: c1 });
  assert.equal(!at2.ok && at2.status, 404);
  const d2 = await org(p2.ctx, { acao: 'orgao_desativar', orgao_id: o1, revisao: 0 });
  assert.equal(!d2.ok && d2.status, 404);
  assert.equal((await p1.pncp.obterOrgao(o1))!.ativo, true);
});

test('9. concorrência: dois cliques, desligar durante a coleta, conflito, mesma compra em duas contratações', async () => {
  const m = montar('admin');
  const orgaoId = await secretaria(m.ctx);
  const c1 = await contratacao(m.ctx, 'Obra X');
  const c2 = await contratacao(m.ctx, 'Obra Y');
  const { deps, esp } = mk();
  assert.equal(corpoDe(await ligar(m.ctx, deps, c1, 1)).status, 'ok');
  const dup = await ligar(m.ctx, deps, c2, 1);
  assert.deepEqual(!dup.ok && [dup.status, dup.erro], [409, 'Esta compra do PNCP já está ligada a outra contratação: Obra X.']);
  assert.equal(n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'vinculo'"), 1);
  avancar(600_001);
  const antes = n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'coleta_ok'");
  const [x, y] = await Promise.all([exec(m.ctx, deps, { acao: 'atualizar', id: c1 }), exec(m.ctx, deps, { acao: 'atualizar', id: c1 })]);
  assert.deepEqual([corpoDe(x).status, corpoDe(y).status].sort(), ['ok', 'recente']);
  assert.equal(n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'coleta_ok'"), antes + 1);
  // desligar entre a coleta e a gravação
  const v = (await m.pncp.obterVinculoAtivo(c1))!;
  const coletadoAntes = (await m.pncp.obterRetrato(v.id)).compra!.coletado_em;
  avancar(600_001);
  let desligou = false;
  const m2 = mk(async (u) => {
    if (!desligou) { desligou = true; await exec(m.ctx, deps, { acao: 'desvincular', id: c1, vinculo_id: v.id, motivo: 'no meio' }); }
    return fetchSimulado(u);
  });
  const eventosOk = n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'coleta_ok'");
  const r = corpoDe(await exec(m.ctx, m2.deps, { acao: 'atualizar', id: c1 }));
  assert.equal(r.status, 'desligado');
  assert.equal((await m.pncp.obterRetrato(v.id)).compra!.coletado_em, coletadoAntes);
  assert.equal(n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'coleta_ok'"), eventosOk);
  assert.equal(esp.n > 0, true);
  // gravarFalha em vínculo desfeito não grava evento
  const totalEventos = n(m.banco, 'SELECT count(*) FROM evento_pncp');
  assert.equal(await m.pncp.gravarFalha(v, 'erro', 'x', 'a@b.c', agora().toISOString()), 'desligado');
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp'), totalEventos);
  assert.ok(orgaoId.startsWith('O-') && ID_ORGAO.test(orgaoId));
});

test('10. limites: por pessoa, por hora na prefeitura, lote de 5 e o ciclo ligar-desligar não dribla o teto', async () => {
  // por pessoa (HTTP): o 11º pedido no minuto
  const m = montar('admin');
  const { deps } = mk();
  const origem = 'https://x.test';
  const pedido = (corpo: unknown, extra: Record<string, string> = {}): Request => {
    const txt = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    return new Request(origem + '/plataforma/gestao-licitacoes/pncp/', { method: 'POST', body: txt, headers: { origin: origem, 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(txt).byteLength), ...extra } });
  };
  const livre = { permitir: async () => true };
  for (let i = 1; i <= 10; i++) assert.equal((await atenderPncp(pedido({ acao: 'atualizar', id: 'C-nao' }), m.ctx, livre, deps)).status, 404, String(i));
  assert.equal((await atenderPncp(pedido({ acao: 'atualizar', id: 'C-nao' }), m.ctx, livre, deps)).status, 429);
  const sem = await atenderPncp(pedido({ acao: 'atualizar', id: 'C-nao' }), m.ctx, { permitir: async () => { throw new Error('x'); } }, mk().deps);
  assert.equal(sem.status, 429);
  // teto de coletas por hora na prefeitura: 120 eventos na última hora
  await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  const d2 = mk(undefined, estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, d2.deps, cid, 1)).status, 'ok');
  const v = (await m.pncp.obterVinculoAtivo(cid))!;
  avancar(600_001);
  const iso = new Date(t - 300_000).toISOString();
  for (let i = 0; i < 120; i++) m.banco.sqlite.prepare("INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em) VALUES (?, ?, 'coleta_ok', ?, ?, 'x@y.z', ?)").run(`E-${i}`, PREF, cid, v.id, iso);
  const chamadasAntes = d2.esp.n;
  const bloq = await exec(m.ctx, d2.deps, { acao: 'atualizar', id: cid });
  assert.deepEqual(!bloq.ok && [bloq.status, bloq.erro], [429, 'Muitas consultas ao PNCP nesta prefeitura agora. Tente de novo mais tarde.']);
  assert.equal(d2.esp.n, chamadasAntes);
  // A-14: ligar com o teto estourado = 429, sem vínculo nem evento
  const c2 = await contratacao(m.ctx, 'Obra Y');
  const ev = n(m.banco, 'SELECT count(*) FROM evento_pncp');
  const vi = n(m.banco, 'SELECT count(*) FROM contratacao_pncp');
  const lig = await ligar(m.ctx, d2.deps, c2, 2);
  assert.equal(!lig.ok && lig.status, 429);
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp'), ev);
  assert.equal(n(m.banco, 'SELECT count(*) FROM contratacao_pncp'), vi);
  assert.equal(d2.esp.n, chamadasAntes);
  // limite em memória da prefeitura (60 por minuto, por instância)
  const m3 = montar('admin');
  await secretaria(m3.ctx);
  const c3 = await contratacao(m3.ctx);
  const d3 = mk();
  let barrou = 0;
  for (let i = 0; i < 62; i++) { const r = await executarAcaoPncp(m3.ctx, { acao: 'previa', id: c3, entrada: controle(1) }, d3.deps, agora()); if (!r.ok && r.status === 429) barrou++; }
  assert.equal(barrou, 2);
});

test('10b. lote da secretaria: 5 por clique, 40 chamadas por vínculo, prazo do lote', async () => {
  const m = montar('admin');
  const orgaoId = await secretaria(m.ctx);
  const rapido = mk(gerado({ itens: 38, comResultado: true }), estadoLivre());
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) {
    const id = await contratacao(m.ctx, 'Obra ' + i);
    ids.push(id);
    const r = corpoDe(await ligar(m.ctx, rapido.deps, id, 21 + i));
    assert.equal(r.status, 'ok');
  }
  const calls = rapido.esp.n;
  assert.equal(calls, 7 * 41); // ligar = 1 chamada da conferência + 40 da primeira coleta
  avancar(600_001);
  const lote = corpoDe(await exec(m.ctx, rapido.deps, { acao: 'atualizar_orgao', orgao_id: orgaoId }));
  assert.deepEqual([lote.atualizadas, lote.recentes, lote.falhas, lote.restantes], [5, 0, 0, 2]);
  assert.equal(rapido.esp.n, calls + 5 * 40);
  assert.equal(n(m.banco, "SELECT count(*) FROM pncp_compra WHERE incompleto = 1"), 0);
  // segundo clique: os 2 mais antigos primeiro (sem tentativa recente)
  const lote2 = corpoDe(await exec(m.ctx, rapido.deps, { acao: 'atualizar_orgao', orgao_id: orgaoId }));
  assert.equal(lote2.atualizadas, 2);
  assert.equal(lote2.recentes, 3);
  // prazo do lote: cada chamada gasta 30 s
  avancar(600_001);
  const lento = mk(gerado({ itens: 10, comResultado: true, apos: () => avancar(30_000) }), estadoLivre());
  const l3 = corpoDe(await exec(m.ctx, lento.deps, { acao: 'atualizar_orgao', orgao_id: orgaoId }));
  assert.ok(l3.atualizadas + l3.falhas < 5 && l3.restantes >= 1, JSON.stringify(l3));
  assert.equal(l3.atualizadas + l3.recentes + l3.falhas + l3.restantes, 7);
});

test('10c. o ciclo ligar, desligar e ligar de novo conta uma coleta por ligação: a 121ª é recusada', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  const { deps } = mk(undefined, estadoLivre());
  for (let i = 1; i <= 120; i++) {
    assert.equal(corpoDe(await ligar(m.ctx, deps, cid, 1)).status, 'ok', 'ligação ' + i);
    const v = (await m.pncp.obterVinculoAtivo(cid))!;
    assert.ok((await exec(m.ctx, deps, { acao: 'desvincular', id: cid, vinculo_id: v.id, motivo: 'ciclo' })).ok);
  }
  const ultima = await ligar(m.ctx, deps, cid, 1);
  assert.equal(!ultima.ok && ultima.status, 429);
});

test('10d. limite estourado em "atualizar" = 429 ANTES da trava: a próxima tentativa válida não fica bloqueada', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  const d = mk(undefined, estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, d.deps, cid, 1)).status, 'ok');
  const v = (await m.pncp.obterVinculoAtivo(cid))!;
  avancar(600_001);
  const iso = new Date(t - 300_000).toISOString();
  for (let i = 0; i < 120; i++) m.banco.sqlite.prepare("INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em) VALUES (?, ?, 'coleta_ok', ?, ?, 'x@y.z', ?)").run(`L-${i}`, PREF, cid, v.id, iso);
  const antes = q(m.banco, 'SELECT ultima_tentativa_em, ultimo_status FROM contratacao_pncp WHERE id = ?', v.id);
  const chamadas = d.esp.n;
  const bloq = await exec(m.ctx, d.deps, { acao: 'atualizar', id: cid });
  assert.equal(!bloq.ok && bloq.status, 429);
  assert.equal(d.esp.n, chamadas);
  assert.deepEqual(q(m.banco, 'SELECT ultima_tentativa_em, ultimo_status FROM contratacao_pncp WHERE id = ?', v.id), antes, 'a trava não foi gasta');
  const orgaoId = (await m.pncp.listarOrgaos())[0]!.id;
  const lote = await exec(m.ctx, d.deps, { acao: 'atualizar_orgao', orgao_id: orgaoId });
  assert.equal(!lote.ok && lote.status, 429); // o lote também confere os limites antes da trava
  assert.equal(d.esp.n, chamadas);
  assert.deepEqual(q(m.banco, 'SELECT ultima_tentativa_em, ultimo_status FROM contratacao_pncp WHERE id = ?', v.id), antes, 'a trava do lote não foi gasta');
  avancar(3_600_001); // a hora passa: os 120 eventos saem da janela
  assert.equal(corpoDe(await exec(m.ctx, d.deps, { acao: 'atualizar', id: cid })).status, 'ok');
  assert.ok(d.esp.n > chamadas);
});

test('10e. Histórico: no mesmo instante, "vinculo" vem antes de "coleta_*"', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  const { deps } = mk(undefined, estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, deps, cid, 1)).status, 'ok'); // ligar grava vínculo e 1ª coleta no mesmo instante
  const tipos = (await m.pncp.historico(cid, 20)).map((e) => e.tipo);
  assert.deepEqual(tipos, ['vinculo', 'coleta_ok']);
});

test('11. HTTP: origem, perfil, formato, tamanho, JSON, chave extra e sem cache', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const origem = 'https://x.test';
  const corpoOk = JSON.stringify({ acao: 'atualizar_orgao', orgao_id: 'O-nao' });
  const pedido = (txt: string, extra: Record<string, string> = {}, semTamanho = false, rota = 'pncp'): Request => {
    const h: Record<string, string> = { origin: origem, 'content-type': 'application/json', ...extra };
    if (!semTamanho && !('content-length' in h)) h['content-length'] = String(new TextEncoder().encode(txt).byteLength);
    return new Request(`${origem}/plataforma/gestao-licitacoes/${rota}/`, { method: 'POST', headers: h, body: txt });
  };
  const livre = { permitir: async () => true };
  const chamar = (r: Request, ctx = m.ctx) => atenderPncp(r, ctx, livre, mk().deps);
  assert.equal((await chamar(new Request(origem + '/x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpoOk }))).status, 403);
  assert.equal((await chamar(pedido(corpoOk, { origin: 'https://outro.test' }))).status, 403);
  assert.equal((await chamar(pedido(corpoOk), como(m.ctx, 'leitura'))).status, 403);
  assert.equal((await chamar(pedido(corpoOk, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await chamar(pedido(corpoOk, {}, true))).status, 413);
  assert.equal((await chamar(pedido(JSON.stringify({ acao: 'previa', entrada: 'a'.repeat(5000) })))).status, 413);
  assert.equal((await chamar(pedido('{quebrado'))).status, 400);
  assert.equal((await chamar(pedido(JSON.stringify({ acao: 'atualizar', id: 'C-1', extra: 1 })))).status, 400);
  const bom = await chamar(pedido(corpoOk));
  assert.equal(bom.status, 404);
  assert.equal(bom.headers.get('cache-control'), 'no-store');
  assert.match(bom.headers.get('content-type') ?? '', /application\/json; charset=utf-8/);
  // secretarias
  const ped = (corpo: unknown, ctx = m.ctx) => atenderOrgao(pedido(JSON.stringify(corpo), {}, false, 'secretarias/gravar'), ctx, livre);
  assert.equal((await ped({ acao: 'orgao_criar', cnpj: B, nome: 'x' }, como(m.ctx, 'editor'))).status, 403);
  assert.equal((await ped({ acao: 'orgao_criar', cnpj: B, nome: 'Secretaria B' })).status, 200);
  assert.equal((await ped({ acao: 'orgao_criar', cnpj: B, nome: 'Secretaria B', outra: 1 })).status, 400);
  assert.equal((await atenderOrgao(pedido(corpoOk, { 'content-type': 'text/plain' }), m.ctx, livre)).status, 415);
  assert.equal((await atenderOrgao(pedido(corpoOk, {}, true), m.ctx, livre)).status, 413);
  assert.equal((await atenderOrgao(pedido(corpoOk), m.ctx, { permitir: async () => false })).status, 429);
  // exceção do fetch pela rota: 200 com status 'erro', nunca 500; CPF nunca na resposta
  const cid = await contratacao(m.ctx);
  const ok = mk(undefined, estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, ok.deps, cid, 1)).status, 'ok');
  avancar(600_001);
  const quebra = mk(async () => { throw new TypeError('rede'); }, estadoLivre());
  const resp = await atenderPncp(pedido(JSON.stringify({ acao: 'atualizar', id: cid })), m.ctx, livre, quebra.deps, agora);
  assert.equal(resp.status, 200);
  assert.equal((await resp.json() as { status: string }).status, 'erro');
});

test('12. falha não apaga: o retrato bom continua, status erro e evento coleta_erro; vínculo forçado em contratação removida', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  let falhar = false;
  const { deps } = mk(async (u) => (falhar ? new Response(null, { status: 500 }) : fetchSimulado(u)), estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, deps, cid, 1)).status, 'ok');
  const v = (await m.pncp.obterVinculoAtivo(cid))!;
  const retratoBom = await m.pncp.obterRetrato(v.id);
  avancar(600_001);
  falhar = true;
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'atualizar', id: cid })).status, 'erro');
  const depois = (await m.pncp.obterVinculoAtivo(cid))!;
  assert.equal(depois.ultimo_status, 'erro');
  assert.equal(depois.ultimo_erro, 'PNCP respondeu 500');
  assert.deepEqual(await m.pncp.obterRetrato(v.id), retratoBom);
  const evs = await m.pncp.historico(cid, 5);
  assert.equal(evs[0]!.tipo, 'coleta_erro');
  assert.equal(evs[0]!.descricao, 'PNCP respondeu 500');
  // trava curta (60 s) depois de erro
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'atualizar', id: cid })).status, 'recente');
  avancar(61_000);
  falhar = false;
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'atualizar', id: cid })).status, 'ok');
  // A-4: lote recusado pelo banco vira 'formato' (200), nunca 500
  avancar(600_001);
  const recusa = { ...m.ctx, repositorio: { ...m.ctx.repositorio, pncp: { ...m.pncp, gravarRetrato: async () => 'recusado' as const } } };
  const r = corpoDe(await exec(recusa, deps, { acao: 'atualizar', id: cid }));
  assert.equal(r.status, 'formato');
  assert.equal((await m.pncp.obterVinculoAtivo(cid))!.ultimo_erro, 'Dados do PNCP recusados pelo banco');
  // A-20: contratação do evento vem sempre do vínculo
  assert.equal(await m.pncp.desvincular('C-outra', v.id, 'x', 'a@b.c', agora().toISOString()), 'inexistente');
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp e JOIN contratacao_pncp v ON v.prefeitura_id = e.prefeitura_id AND v.id = e.vinculo_id WHERE e.contratacao_id <> v.contratacao_id'), 0);
  assert.equal(n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'desvinculo'"), 0);
});

test('13. contratação removida na E12: desliga o vínculo e registra; sem vínculo não grava; conflito não desliga', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const { deps } = mk(undefined, estadoLivre());
  const cid = await contratacao(m.ctx, 'Obra ligada');
  const livre = await contratacao(m.ctx, 'Obra solta');
  assert.equal(corpoDe(await ligar(m.ctx, deps, cid, 1)).status, 'ok');
  const ctxC = { usuario: m.ctx.usuario, repositorio: m.ctx.repositorio };
  const rev = (await m.ctx.repositorio.contratacoes!.obter(cid))!.revisao;
  avancar(1000);
  const velha = await executarAcao(ctxC, { acao: 'remover', id: cid, revisao: rev + 5, motivo: 'x' }, agora());
  assert.equal(velha.ok, false);
  assert.ok(await m.pncp.obterVinculoAtivo(cid));
  // direto no repositório (o serviço recusa antes): o EXISTS do UPDATE do vínculo é que impede o desligamento
  avancar(1000);
  const direto = await m.ctx.repositorio.contratacoes!.remover(cid, rev + 5, 'x', 'admin@exemplo.invalid', agora().toISOString());
  assert.equal(direto.r, 'conflito');
  assert.ok(await m.pncp.obterVinculoAtivo(cid));
  assert.equal(n(m.banco, "SELECT count(*) FROM evento_pncp WHERE tipo = 'desvinculo'"), 0);
  const eventosAntes = n(m.banco, 'SELECT count(*) FROM evento_pncp');
  avancar(1000);
  assert.ok((await executarAcao(ctxC, { acao: 'remover', id: livre, revisao: 0, motivo: 'x' }, agora())).ok);
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp'), eventosAntes);
  avancar(1000);
  assert.ok((await executarAcao(ctxC, { acao: 'remover', id: cid, revisao: rev, motivo: 'Duplicada' }, agora())).ok);
  assert.equal(await m.pncp.obterVinculoAtivo(cid), null);
  const ev = q(m.banco, "SELECT tipo, descricao, autor, contratacao_id FROM evento_pncp WHERE tipo = 'desvinculo'");
  assert.deepEqual(ev, [{ tipo: 'desvinculo', descricao: 'Contratação removida', autor: 'admin@exemplo.invalid', contratacao_id: cid }]);
  assert.equal(n(m.banco, 'SELECT count(*) FROM contratacao_pncp WHERE desvinculado_em IS NOT NULL'), 1);
  // vínculo forçado em contratação removida: atualizar → 404 e o lote da secretaria o ignora
  const orgaoId = (await m.pncp.listarOrgaos())[0]!.id;
  const forcada = await contratacao(m.ctx, 'Forçada');
  assert.equal(corpoDe(await ligar(m.ctx, deps, forcada, 2)).status, 'ok');
  m.banco.sqlite.exec(`UPDATE contratacao SET removida_em = '${agora().toISOString()}', removida_por = 'x' WHERE prefeitura_id = ${PREF} AND id = '${forcada}'`);
  avancar(600_001);
  const at = await exec(m.ctx, deps, { acao: 'atualizar', id: forcada });
  assert.equal(!at.ok && at.status, 404);
  const chamadas = n(m.banco, 'SELECT count(*) FROM evento_pncp');
  const lote = corpoDe(await exec(m.ctx, deps, { acao: 'atualizar_orgao', orgao_id: orgaoId }));
  assert.deepEqual([lote.atualizadas, lote.recentes, lote.falhas], [0, 0, 0]);
  assert.equal(n(m.banco, 'SELECT count(*) FROM evento_pncp'), chamadas);
});

test('14. vincular: confirmação de não-obra, campos inválidos, outro município e CPF fora de tudo', async () => {
  const m = montar('admin');
  await secretaria(m.ctx);
  const { deps } = mk(undefined, estadoLivre());
  const c = await contratacao(m.ctx);
  const nada = () => n(m.banco, 'SELECT count(*) FROM contratacao_pncp') + n(m.banco, 'SELECT count(*) FROM evento_pncp WHERE tipo = \'vinculo\'');
  const base = { acao: 'vincular', id: c, cnpj: A, ano: 2026, sequencial: 1 };
  const casos: [Record<string, unknown>, string][] = [
    [{ ...base, ano: 2020 }, 'Ano da compra inválido.'], [{ ...base, ano: 1e9 }, 'Ano da compra inválido.'], [{ ...base, ano: 2026.5 }, 'Ano da compra inválido.'],
    [{ ...base, sequencial: 1e9 }, 'Número sequencial da compra inválido.'], [{ ...base, sequencial: '1' }, 'Número sequencial da compra inválido.'], [{ ...base, sequencial: 0 }, 'Número sequencial da compra inválido.'],
    [{ ...base, cnpj: '123' }, 'CNPJ do número de controle inválido.'],
  ];
  for (const [corpo, msg] of casos) { const r = await exec(m.ctx, deps, corpo); assert.deepEqual(!r.ok && [r.status, r.erro], [400, msg]); }
  assert.equal(nada(), 0);
  // não identificada como obra exige confirmação (seq 9)
  const sem = await exec(m.ctx, deps, { ...base, sequencial: 9 });
  assert.deepEqual(!sem.ok && [sem.status, sem.erro], [400, 'Confirme que esta é a compra certa: ela não parece ser de obra ou serviço de engenharia.']);
  assert.equal(nada(), 0);
  assert.equal(corpoDe(await exec(m.ctx, deps, { ...base, sequencial: 9, confirmo_nao_obra: true })).status, 'ok');
  // avisos de município (seq 1 sem aviso, seq 3 com aviso) e códigos inválidos
  const c2 = await contratacao(m.ctx, 'Outra');
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c2, entrada: controle(1) })).previa.aviso_municipio, null);
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c2, entrada: controle(3) })).previa.aviso_municipio, 'Atenção: esta compra é de outro município (código IBGE 5300108). Confira se é a compra certa.');
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c2, entrada: controle(2) })).previa.aviso_municipio, null);
  const curto = lerCompra({ ...COMPRAS[`${A}/2026/1`]!.compra, unidadeOrgao: { codigoIbge: '52087' } }, TRIO1)!;
  assert.equal(curto.codigoIbge, null);
  assert.equal(lerCompra(COMPRAS[`${A}/2026/3`]!.compra, { cnpj: A, ano: 2026, sequencial: 3 })!.codigoIbge, '5300108');
  // seq 2: nenhum CPF no banco, nos eventos, nem na resposta HTTP
  const c3 = await contratacao(m.ctx, 'SRP');
  const previaSrp = corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c3, entrada: controle(2) })).previa;
  assert.equal(previaSrp.objeto, 'REGISTRO DE PREÇOS PARA SERVIÇOS DE MANUTENÇÃO PREDIAL (CONTATO ***)');
  const resposta = corpoDe(await ligar(m.ctx, deps, c3, 2));
  const todo = JSON.stringify(previaSrp) + JSON.stringify(resposta) + JSON.stringify(q(m.banco, 'SELECT * FROM pncp_resultado')) + JSON.stringify(q(m.banco, 'SELECT * FROM pncp_item'))
    + JSON.stringify(q(m.banco, 'SELECT * FROM pncp_compra')) + JSON.stringify(q(m.banco, 'SELECT * FROM evento_pncp')) + JSON.stringify(q(m.banco, 'SELECT * FROM contratacao_pncp'));
  assert.ok(!todo.includes('00000000191') && !todo.includes('000.000.001-91'));
  const v = (await m.pncp.obterVinculoAtivo(c3))!;
  const res = (await m.pncp.obterRetrato(v.id)).resultados;
  assert.deepEqual(res.map((x) => x.ordem_classificacao), [1, 2, 3, 4]);
  assert.equal(res[3]!.fornecedor_nome, 'Fornecedor Exemplo MEI ***');
  assert.equal(res[3]!.motivo_cancelamento, 'Desistência informada por ***');
  const retratoSrp = await m.pncp.obterRetrato(v.id);
  assert.equal(retratoSrp.compra!.objeto, 'REGISTRO DE PREÇOS PARA SERVIÇOS DE MANUTENÇÃO PREDIAL (CONTATO ***)');
  assert.equal(retratoSrp.itens[0]!.descricao, 'Serviço de manutenção predial, responsável ***');
  assert.equal(res[1]!.fornecedor_ni, null);
  // seq 5: objeto como texto puro; seq 6 (identidade errada) = formato; seq 7 = erro; seq 99 = não encontrada
  const c4 = await contratacao(m.ctx, 'XSS');
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c4, entrada: controle(5) })).previa.objeto, '<img src=x onerror=alert(1)> Obra de drenagem exemplo');
  const f = await exec(m.ctx, deps, { acao: 'previa', id: c4, entrada: controle(6) });
  assert.deepEqual(!f.ok && [f.status, f.erro], [502, 'O PNCP respondeu em formato inesperado. Tente mais tarde.']);
  const e7 = await exec(m.ctx, deps, { acao: 'previa', id: c4, entrada: controle(7) });
  assert.deepEqual(!e7.ok && [e7.status, e7.erro], [502, 'O PNCP não respondeu agora. Tente de novo em alguns minutos.']);
  const nf = await exec(m.ctx, deps, { acao: 'previa', id: c4, entrada: controle(99) });
  assert.deepEqual(!nf.ok && [nf.status, nf.erro], [404, 'Compra não encontrada no PNCP. Confira o número.']);
  // CNPJ alfanumérico
  await secretaria(m.ctx, ALFA, 'Fundo Exemplo');
  assert.equal(corpoDe(await exec(m.ctx, deps, { acao: 'previa', id: c4, entrada: controle(1, ALFA) })).previa.obra, 'sim');
});

test('15. repositório: vincular recusa órgão inativo e contratação removida; json_each grava 200 itens x 50 resultados em poucas instruções', async () => {
  const m = montar('admin');
  const orgaoId = await secretaria(m.ctx);
  const cid = await contratacao(m.ctx);
  const { deps } = mk(undefined, estadoLivre());
  assert.equal(corpoDe(await ligar(m.ctx, deps, cid, 3)).status, 'ok');
  const v = (await m.pncp.obterVinculoAtivo(cid))!;
  const lotes: number[] = [];
  const contador = criarRepositorioPncp({ prepare: (s) => m.banco.db.prepare(s), batch: (l) => { lotes.push(l.length); return m.banco.db.batch(l); } }, PREF);
  const base = await buscarCompra({ cnpj: A, ano: 2026, sequencial: 3 }, deps);
  assert.equal(base.r, 'ok');
  const compra = (base as { compra: ColetaOk['compra'] }).compra;
  const itens = Array.from({ length: 200 }, (_, i) => ({ numeroItem: i + 1, descricao: 'Item ' + (i + 1), materialServico: 'S' as const, categoriaId: null, categoriaNome: null, criterioNome: 'Menor preço', situacaoId: 2, situacaoNome: 'Homologado', temResultado: true, valorTotal: 100_000 + i }));
  const resultados = itens.flatMap((it) => Array.from({ length: 50 }, (_, k) => ({ numeroItem: it.numeroItem, sequencialResultado: k + 1, tipoPessoa: 'PJ' as const, fornecedorNi: B, fornecedorNome: 'Empresa ' + k, ordemClassificacao: k + 1, situacaoId: k ? 3 : 1, situacaoNome: null, valorHomologado: 90_000 + k, dataResultado: '2026-09-15', motivoCancelamento: null })));
  const coleta: ColetaOk = { r: 'ok', compra, itens, resultados, itensTotal: 200, incompleto: false };
  assert.equal(await contador.gravarRetrato(v, coleta, 'a@b.c', agora().toISOString()), 'ok');
  assert.ok(lotes[0]! <= 50, `instruções no lote: ${lotes[0]}`);
  assert.equal(n(m.banco, 'SELECT count(*) FROM pncp_item WHERE vinculo_id = ?', v.id), 200);
  assert.equal(n(m.banco, 'SELECT count(*) FROM pncp_resultado WHERE vinculo_id = ?', v.id), 10_000);
  // CPF num resultado desfaz o lote inteiro
  const ruim: ColetaOk = { ...coleta, itens: itens.slice(0, 2), resultados: [{ ...resultados[0]!, tipoPessoa: 'PF', fornecedorNi: '00000000191' }] };
  assert.equal(await contador.gravarRetrato(v, ruim, 'a@b.c', agora().toISOString()), 'recusado');
  assert.equal(n(m.banco, 'SELECT count(*) FROM pncp_item WHERE vinculo_id = ?', v.id), 200);
  assert.equal(n(m.banco, 'SELECT count(*) FROM pncp_resultado WHERE vinculo_id = ?', v.id), 10_000);
  assert.equal(await contador.gravarRetrato({ ...v, id: 'V-nao-existe' }, coleta, 'a@b.c', agora().toISOString()), 'desligado');
  // órgão inativo recusa novo vínculo
  assert.equal(await m.pncp.desvincular(cid, v.id, 'x', 'a@b.c', agora().toISOString()), 'ok');
  assert.ok((await org(m.ctx, { acao: 'orgao_desativar', orgao_id: orgaoId, revisao: 0 })).ok);
  assert.equal(await m.pncp.vincular({ id: 'V-novo', contratacaoId: cid, orgaoId, cnpj: A, ano: 2026, sequencial: 3, numeroControle: controle(3), obra: 'sim' }, 'a@b.c', agora().toISOString()), 'invalido');
});
