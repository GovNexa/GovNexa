// E12 (Parte A): gestão das contratações — migração 0010, regras, serviço, HTTP, painel, carga e navegação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { bancoTeste } from '../helpers/d1.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import { comInvalidacao } from '../../src/lib/repositorio/cache.ts';
import { ERRO_CONFLITO, executarAcao, podeGravarNaTela, type ContextoContratacao } from '../../src/lib/contratacoes/servico.ts';
import { atenderGravacao } from '../../src/lib/contratacoes/http.ts';
import {
  CAMPOS, COLUNAS_EDITAVEIS, SEI_CONTRATACAO, centavosDeTexto, formatarCampo, normalizarCampos, percentualPago, regraMudanca,
} from '../../src/lib/contratacoes/regras.ts';
import {
  casaFiltros, lerFiltros, montarPainel, paraCsvContratacoes, subtituloBloco, urlCsvPainel, urlPainel, type FiltrosPainel,
} from '../../src/lib/contratacoes/painel.ts';
import { hrefContratacao, voltaContratacao } from '../../src/lib/contratacoes/navegacao.ts';
import { SEI } from '../../src/lib/carteira/cadastro.ts';
import { criarLimitadorMemoria } from '../../src/lib/seguranca/limite.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const PREF = 5208707;
const OUTRA = 5300108;
const BASE = new Date('2026-11-22T15:00:00.000Z').getTime();
let passo = 0;
/** Relógio injetado: cada chamada avança 1 s (ordem estável do Histórico, sem esperar tempo real). */
const agora = (): Date => new Date(BASE + 1000 * ++passo);
const usuario = (perfil: Usuario['perfil'], pref = PREF): Usuario => ({ id: 'u-' + perfil, email: `${perfil}@exemplo.invalid`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '' });

type Banco = ReturnType<typeof bancoTeste>;
function montar(perfil: Usuario['perfil'] = 'editor', pref = PREF, banco: Banco = bancoTeste('prefeitura')) {
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  if (pref === PREF) banco.sqlite.exec(`INSERT OR IGNORE INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (${pref}, 'P-A', 1, 'Obra', 'SEINFRA')`);
  const repositorio = comInvalidacao(criarRepositorioD1(banco.db, pref), pref);
  const ctx: ContextoContratacao = { usuario: usuario(perfil, pref), repositorio };
  return { banco, ctx, repo: repositorio.contratacoes! };
}
const exec = (ctx: ContextoContratacao, corpo: unknown) => executarAcao(ctx, corpo, agora());
async function criar(ctx: ContextoContratacao, campos: Record<string, unknown> = {}): Promise<string> {
  const r = await exec(ctx, { acao: 'criar', campos: { nome: 'Obra X', etapa: 'finalizacao', ...campos } });
  assert.ok(r.ok, JSON.stringify(r));
  return r.id;
}
const recusa = (b: Banco, sql: string) => assert.throws(() => b.sqlite.exec(sql));
const BASE_SQL = (id = 'C-T1', extra = '') =>
  `INSERT INTO contratacao (prefeitura_id, id, nome, etapa, etapa_desde, criada_por${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (${PREF}, '${id}', 'x', 'finalizacao', '2026-01-01', 'a'${extra ? ', ' + extra.split('=').slice(1).join('=') : ''})`;

test('1. migração: CHECKs, travas e chaves compostas', () => {
  const { banco } = montar();
  const s = banco.sqlite;
  s.exec(BASE_SQL('C-T1'));
  recusa(banco, BASE_SQL('C-T2', 'valor_estimado=-1'));
  recusa(banco, BASE_SQL('C-T2', 'valor_estimado=1.5'));
  recusa(banco, BASE_SQL('C-T2', 'colocacao=0'));
  recusa(banco, BASE_SQL('C-T2').replace("'finalizacao'", "'outra'"));
  recusa(banco, BASE_SQL('C-T2', "data_abertura='2026-02-30'"));
  recusa(banco, BASE_SQL('C-T2', "data_abertura='26-01-01'"));
  recusa(banco, BASE_SQL('C-T2', "atualizada_por=''"));
  recusa(banco, "DELETE FROM contratacao WHERE id = 'C-T1'");
  recusa(banco, "UPDATE contratacao SET id = 'C-T9' WHERE id = 'C-T1'");
  recusa(banco, `INSERT INTO contratacao (prefeitura_id, id, projeto_id, nome, etapa, etapa_desde, criada_por) VALUES (${PREF}, 'C-T3', 'P-X', 'x', 'finalizacao', '2026-01-01', 'a')`);
  s.exec(`INSERT INTO prefeitura (id, nome, uf) VALUES (${OUTRA}, 'Outra', 'DF'); INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (${OUTRA}, 'P-X', 1, 'Obra', 'X')`);
  recusa(banco, `INSERT INTO contratacao (prefeitura_id, id, projeto_id, nome, etapa, etapa_desde, criada_por) VALUES (${PREF}, 'C-T3', 'P-X', 'x', 'finalizacao', '2026-01-01', 'a')`);
  s.exec(`INSERT INTO contratacao_marco (prefeitura_id, id, contratacao_id, data, descricao, criado_por) VALUES (${PREF}, 'M-1', 'C-T1', '2026-12-01', 'm', 'a')`);
  recusa(banco, `INSERT INTO contratacao_marco (prefeitura_id, id, contratacao_id, data, descricao, concluido, concluido_em, criado_por) VALUES (${PREF}, 'M-2', 'C-T1', '2026-12-01', 'm', 1, '2026-12-01T00:00:00.000Z', 'a')`); // concluido_em sem concluido_por
  recusa(banco, "UPDATE contratacao_marco SET contratacao_id = 'C-T9' WHERE id = 'M-1'");
  recusa(banco, "UPDATE contratacao_marco SET criado_por = 'z' WHERE id = 'M-1'");
  recusa(banco, "DELETE FROM contratacao_marco WHERE id = 'M-1'");
  s.exec(`INSERT INTO evento_contratacao (id, prefeitura_id, contratacao_id, tipo, autor, em) VALUES ('E1', ${PREF}, 'C-T1', 'criada', 'a', '2026-11-22T10:00:00.000Z')`);
  recusa(banco, "DELETE FROM evento_contratacao WHERE id = 'E1'");
  recusa(banco, "UPDATE evento_contratacao SET autor = 'b' WHERE id = 'E1'");
  recusa(banco, `INSERT INTO evento_contratacao (id, prefeitura_id, contratacao_id, tipo, autor, em) VALUES ('E2', ${PREF}, 'C-NAO', 'criada', 'a', '2026-11-22T10:00:00.000Z')`);
  s.exec("UPDATE contratacao SET removida_em = '2026-11-22T10:00:00.000Z', removida_por = 'a' WHERE id = 'C-T1'");
  recusa(banco, "UPDATE contratacao SET nome = 'y' WHERE id = 'C-T1'");
});

test('2. do zero: criar, avançar 5 etapas, editar, marcos e Histórico', async () => {
  const { ctx, repo } = montar();
  const id = await criar(ctx);
  let rev = 0;
  const seq = ['finalizacao', 'preparacao', 'ajustes', 'publicada', 'julgamento', 'concluida'] as const;
  let avisoFinal: string[] = [];
  for (let i = 1; i < seq.length; i++) {
    const r = await exec(ctx, { acao: 'etapa', id, revisao: rev, de: seq[i - 1], para: seq[i] });
    assert.ok(r.ok, JSON.stringify(r));
    rev = r.revisao!;
    avisoFinal = r.avisos;
  }
  assert.equal(rev, 5);
  assert.deepEqual(avisoFinal, ['Preencha na nova etapa: Valor contratado, Empresa, Marco, Data do marco.']);
  const e = await exec(ctx, { acao: 'editar', id, revisao: rev, campos: { valor_contratado: 100000, valor_pago: 50000, empresa: 'Empresa Exemplo', colocacao: 1 } });
  assert.ok(e.ok && e.revisao === 6 && e.mudou);
  assert.equal((await repo.obter(id))!.revisao, 6);
  assert.ok((await exec(ctx, { acao: 'marco_criar', id, data: '2026-12-10', descricao: 'Assinatura' })).ok);
  const marcoId = (await repo.listarMarcos(id))[0]!.id;
  assert.ok((await exec(ctx, { acao: 'marco_concluir', id, marco_id: marcoId })).ok);
  assert.equal((await repo.listarMarcos(id))[0]!.concluido, true);
  assert.ok((await exec(ctx, { acao: 'marco_reabrir', id, marco_id: marcoId })).ok);
  assert.ok((await exec(ctx, { acao: 'marco_remover', id, marco_id: marcoId })).ok);
  assert.equal((await repo.listarMarcos(id)).length, 0);
  assert.equal((await repo.obter(id))!.revisao, 6);
  const h = await repo.historico(id, 50);
  assert.deepEqual(h.map((x) => x.tipo), ['marco_removido', 'marco_reaberto', 'marco_concluido', 'marco_criado', 'editada', 'etapa', 'etapa', 'etapa', 'etapa', 'etapa', 'criada']);
  const etapas = h.filter((x) => x.tipo === 'etapa').reverse();
  etapas.forEach((x, i) => { assert.equal(x.de, seq[i]); assert.equal(x.para, seq[i + 1]); });
  assert.deepEqual(h.find((x) => x.tipo === 'editada')!.campos!.empresa, { de: null, para: 'Empresa Exemplo' });
  assert.deepEqual(h.at(-1)!.campos, { nome: { de: null, para: 'Obra X' } });
});

test('3. perfil: leitura recebe 403 em todas as ações; editor, gestor e admin gravam', async () => {
  const dono = montar('editor');
  const id = await criar(dono.ctx);
  const leitura = { ...dono.ctx, usuario: usuario('leitura') };
  const corpos = [
    { acao: 'criar', campos: { nome: 'a', etapa: 'finalizacao' } }, { acao: 'editar', id, revisao: 0, campos: { nome: 'b' } },
    { acao: 'etapa', id, revisao: 0, de: 'finalizacao', para: 'preparacao' }, { acao: 'remover', id, revisao: 0, motivo: 'x' },
    { acao: 'marco_criar', id, data: '2026-12-01', descricao: 'd' }, { acao: 'marco_concluir', id, marco_id: 'M-1' },
    { acao: 'marco_reabrir', id, marco_id: 'M-1' }, { acao: 'marco_remover', id, marco_id: 'M-1' },
  ];
  for (const c of corpos) { const r = await exec(leitura, c); assert.ok(!r.ok && r.status === 403, String(c.acao)); }
  for (const p of ['editor', 'gestor', 'admin'] as const) {
    const r = await exec({ ...dono.ctx, usuario: usuario(p) }, { acao: 'criar', campos: { nome: 'a', etapa: 'finalizacao' } });
    assert.ok(r.ok, p);
  }
  assert.equal(podeGravarNaTela(usuario('leitura'), dono.ctx.repositorio), 'perfil');
  assert.equal(podeGravarNaTela(usuario('editor'), dono.ctx.repositorio), 'ok');
});

test('4. outra prefeitura não lê nem grava', async () => {
  const a = montar('editor', PREF);
  const id = await criar(a.ctx, { projeto_id: 'P-A' });
  const b = montar('editor', OUTRA, a.banco);
  assert.equal(await b.repo.obter(id), null);
  for (const c of [
    { acao: 'editar', id, revisao: 0, campos: { nome: 'x' } }, { acao: 'etapa', id, revisao: 0, de: 'finalizacao', para: 'preparacao' },
    { acao: 'remover', id, revisao: 0, motivo: 'm' }, { acao: 'marco_criar', id, data: '2026-12-01', descricao: 'd' },
    { acao: 'marco_concluir', id, marco_id: 'M-1' }, { acao: 'marco_remover', id, marco_id: 'M-1' },
  ]) { const r = await exec(b.ctx, c); assert.ok(!r.ok && r.status === 404, String(c.acao)); }
  const r = await exec(b.ctx, { acao: 'criar', campos: { nome: 'x', etapa: 'finalizacao', projeto_id: 'P-A' } });
  assert.ok(!r.ok && r.status === 400);
  assert.equal((await b.repo.listar()).length, 0);
});

test('5. concorrência: revisão otimista', async () => {
  const { ctx, repo, banco } = montar();
  const id = await criar(ctx);
  assert.ok((await exec(ctx, { acao: 'editar', id, revisao: 0, campos: { nome: 'Novo' } })).ok);
  const velho = await exec(ctx, { acao: 'editar', id, revisao: 0, campos: { nome: 'Outro' } });
  assert.ok(!velho.ok && velho.status === 409 && velho.erro === ERRO_CONFLITO);
  const e1 = await exec(ctx, { acao: 'etapa', id, revisao: 0, de: 'finalizacao', para: 'preparacao' });
  assert.ok(!e1.ok && e1.status === 409);
  const e2 = await exec(ctx, { acao: 'etapa', id, revisao: 1, de: 'preparacao', para: 'ajustes' });
  assert.ok(!e2.ok && e2.status === 409);
  const [x, y] = await Promise.all([
    exec(ctx, { acao: 'editar', id, revisao: 1, campos: { objeto: 'A' } }), exec(ctx, { acao: 'editar', id, revisao: 1, campos: { objeto: 'B' } }),
  ]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
  assert.equal(((x.ok ? y : x) as { status: number }).status, 409);
  assert.equal((banco.sqlite.prepare("SELECT count(*) AS n FROM evento_contratacao WHERE tipo = 'editada'").get() as { n: number }).n, 2);
  assert.equal((await repo.obter(id))!.revisao, 2);
});

test('6. regras de etapa, remoção e avisos', async () => {
  const { ctx, repo } = montar();
  const id = await criar(ctx);
  let r = await exec(ctx, { acao: 'etapa', id, revisao: 0, de: 'finalizacao', para: 'ajustes' });
  assert.ok(!r.ok && r.status === 400);
  r = await exec(ctx, { acao: 'etapa', id, revisao: 0, de: 'finalizacao', para: 'ajustes', motivo: 'Edital pronto antes' });
  assert.ok(r.ok);
  assert.equal((await repo.historico(id, 5))[0]!.motivo, 'Edital pronto antes');
  r = await exec(ctx, { acao: 'etapa', id, revisao: 1, de: 'ajustes', para: 'preparacao' });
  assert.ok(!r.ok && r.status === 400 && /motivo/.test(r.erro));
  r = await exec(ctx, { acao: 'etapa', id, revisao: 1, de: 'ajustes', para: 'preparacao', motivo: 'Voltou' });
  assert.ok(r.ok);
  r = await exec(ctx, { acao: 'etapa', id, revisao: 2, de: 'preparacao', para: 'ajustes', motivo: 'x', data: '2026-12-31' });
  assert.ok(!r.ok && r.erro === 'Data da etapa: não pode ser futura.');
  r = await exec(ctx, { acao: 'etapa', id, revisao: 2, de: 'preparacao', para: 'ajustes', motivo: 'x', data: '2026-11-01' });
  assert.ok(!r.ok && r.erro === 'Data da etapa: anterior à etapa atual.');
  r = await exec(ctx, { acao: 'etapa', id, revisao: 2, de: 'preparacao', para: 'preparacao' });
  assert.ok(!r.ok && r.status === 400);
  r = await exec(ctx, { acao: 'remover', id, revisao: 2, motivo: '  ' });
  assert.ok(!r.ok && r.erro === 'Informe o motivo da remoção.');
  r = await exec(ctx, { acao: 'remover', id, revisao: 2, motivo: 'Duplicada' });
  assert.ok(r.ok);
  assert.equal((await repo.listar()).length, 0);
  r = await exec(ctx, { acao: 'editar', id, revisao: 3, campos: { nome: 'x' } });
  assert.ok(!r.ok && r.status === 404);
  // avisos
  const c = await criar(ctx, { aguardando: 'pgm', aguardando_quem: 'Fulano' });
  const e = await exec(ctx, { acao: 'editar', id: c, revisao: 0, campos: { valor_contratado: 100, valor_pago: 200, colocacao: 2 } });
  assert.ok(e.ok);
  assert.deepEqual(e.ok && e.avisos.sort(), ['Colocação sem empresa: confira.', 'Valor pago maior que o contratado: confira.']);
  // aguardando final 'nao' limpa o "quem"
  const n = await exec(ctx, { acao: 'editar', id: c, revisao: 1, campos: { aguardando: 'nao' } });
  assert.ok(n.ok);
  assert.equal((await repo.obter(c))!.aguardando_quem, null);
  const d = await criar(ctx, { aguardando_quem: 'Alguém' });
  assert.equal((await repo.obter(d))!.aguardando_quem, null);
  assert.deepEqual((await exec(ctx, { acao: 'editar', id: c, revisao: 2, campos: { nome: 'Obra X' } }))?.ok && 1, 1);
});

test('7. normalizador e valores em reais', () => {
  const erro = (b: unknown, modo: 'criar' | 'editar' = 'editar') => { const r = normalizarCampos(b, modo); assert.ok(!r.ok); return r.erros.join(' | '); };
  assert.match(erro({ foo: 1 }), /Campo desconhecido: foo\./);
  assert.match(erro({ etapa: 'ajustes' }), /A etapa muda pelo botão Mudar etapa\./);
  assert.match(erro({ nome: 'a'.repeat(201) }), /Contratação: até 200 caracteres\./);
  assert.match(erro({ valor_estimado: '100' }), /Valor estimado: valor inválido\./);
  assert.match(erro({ valor_estimado: -1 }), /valor inválido/);
  assert.match(erro({ valor_estimado: 1.5 }), /valor inválido/);
  assert.match(erro({ processo_sei: '123' }), /Processo SEI: use o formato/);
  assert.match(erro({ projeto_id: 'xx' }), /Projeto da carteira: código inválido\./);
  assert.match(erro({ data_abertura: '2026-02-30' }), /Abertura: data inválida\./);
  assert.match(erro({ aguardando: null }), /Aguardando: valor não permitido\./);
  assert.match(erro({ nome: null }), /Contratação: informe o nome\./);
  assert.match(erro({ nome: 'x' }, 'criar'), /Etapa: valor não permitido\./);
  assert.match(erro(null), /Dados inválidos\./);
  const ok = normalizarCampos({ aguardando: 'nao', aguardando_quem: 'X', objeto: 'a\nb\u0007c' }, 'editar');
  assert.ok(ok.ok && ok.campos.aguardando_quem === null && ok.campos.objeto === 'a\nb c');
  assert.equal(centavosDeTexto('1.234,5'), 123450);
  assert.equal(centavosDeTexto('1.234,56'), 123456);
  assert.equal(centavosDeTexto('0,1'), 10);
  assert.equal(centavosDeTexto('R$ 10'), 1000);
  assert.equal(centavosDeTexto(''), null);
  for (const ruim of ['-1', '1,234', 'abc', '1.23', '99999999999999999999']) assert.equal(centavosDeTexto(ruim), 'invalido', ruim);
  assert.equal(SEI_CONTRATACAO.source, SEI.source);
  assert.deepEqual(COLUNAS_EDITAVEIS, CAMPOS.map((c) => c.campo));
  assert.equal(percentualPago({ valor_pago: 55290433, valor_contratado: 1230000000 }), 4.5);
  assert.equal(formatarCampo('colocacao', 2), '2º colocado');
  assert.equal(formatarCampo('marco', 'os_emitida'), 'Ordem de serviço emitida');
  assert.deepEqual(regraMudanca('ajustes', 'publicada', null), { ok: true });
});

test('8. limites: marcos, contratações ativas e teto total', async () => {
  const { ctx, banco } = montar();
  const id = await criar(ctx);
  for (let i = 0; i < 50; i++) assert.ok((await exec(ctx, { acao: 'marco_criar', id, data: '2026-12-01', descricao: `m${i}` })).ok);
  const r = await exec(ctx, { acao: 'marco_criar', id, data: '2026-12-01', descricao: 'm51' });
  assert.ok(!r.ok && r.status === 400 && /50 marcos/.test(r.erro));
  const gerar = (prefixo: string, removida: string) =>
    banco.sqlite.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5000)
      INSERT INTO contratacao (prefeitura_id, id, nome, etapa, etapa_desde, criada_por${removida ? ', removida_em, removida_por' : ''})
      SELECT ${PREF}, '${prefixo}' || i, 'n', 'finalizacao', '2026-01-01', 't'${removida ? ", '2026-01-02T00:00:00.000Z', 't'" : ''} FROM n`);
  gerar('C-L', '');
  const cheio = await exec(ctx, { acao: 'criar', campos: { nome: 'x', etapa: 'finalizacao' } });
  assert.ok(!cheio.ok && cheio.status === 400 && /5\.000/.test(cheio.erro));
  banco.sqlite.exec("UPDATE contratacao SET removida_em = '2026-01-02T00:00:00.000Z', removida_por = 't' WHERE id LIKE 'C-L%'");
  gerar('C-M', ''); gerar('C-N', 'x'); gerar('C-O', 'x');
  banco.sqlite.exec("UPDATE contratacao SET removida_em = '2026-01-02T00:00:00.000Z', removida_por = 't' WHERE id LIKE 'C-M%'");
  const total = await exec(ctx, { acao: 'criar', campos: { nome: 'x', etapa: 'finalizacao' } });
  assert.ok(!total.ok && total.status === 409, JSON.stringify(total));
});

function pedido(corpo: string, extra: Record<string, string> = {}, semTamanho = false): Request {
  const h: Record<string, string> = { origin: 'https://x.test', 'content-type': 'application/json', ...extra };
  if (!semTamanho && !('content-length' in h)) h['content-length'] = String(new TextEncoder().encode(corpo).byteLength);
  return new Request('https://x.test/plataforma/gestao-licitacoes/gravar/', { method: 'POST', headers: h, body: corpo });
}
test('9. HTTP: origem, perfil, formato, limite e tamanho', async () => {
  const { ctx } = montar();
  const ok = JSON.stringify({ acao: 'criar', campos: { nome: 'a', etapa: 'finalizacao' } });
  const lim = () => criarLimitadorMemoria({ limite: 2 });
  const semOrigem = new Request('https://x.test/g/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ok });
  assert.equal((await atenderGravacao(semOrigem, ctx, lim())).status, 403);
  assert.equal((await atenderGravacao(pedido(ok, { origin: 'https://outro.test' }), ctx, lim())).status, 403);
  assert.equal((await atenderGravacao(pedido(ok), { ...ctx, usuario: usuario('leitura') }, lim())).status, 403);
  assert.equal((await atenderGravacao(pedido(ok, { 'content-type': 'text/plain' }), ctx, lim())).status, 415);
  const l = lim();
  assert.equal((await atenderGravacao(pedido(ok), ctx, l)).status, 200);
  assert.equal((await atenderGravacao(pedido(ok), ctx, l)).status, 200);
  assert.equal((await atenderGravacao(pedido(ok), ctx, l)).status, 429);
  assert.equal((await atenderGravacao(pedido(ok, {}, true), ctx, lim())).status, 413);
  assert.equal((await atenderGravacao(pedido(JSON.stringify({ acao: 'criar', campos: { nome: 'a'.repeat(20000) } })), ctx, lim())).status, 413);
  assert.equal((await atenderGravacao(pedido('{quebrado'), ctx, lim())).status, 400);
  const bom = await atenderGravacao(pedido(ok), ctx, lim());
  const corpo = await bom.json() as { ok: boolean; revisao: number; id: string };
  assert.ok(bom.status === 200 && corpo.ok && corpo.revisao === 0 && corpo.id.startsWith('C-'));
  assert.equal(bom.headers.get('cache-control'), 'no-store');
});

async function comExemplo() {
  const { banco, ctx, repo } = montar();
  carregarExemplo(banco.sqlite);
  return { banco, ctx, repo, lista: await repo.listar(), pendentes: await repo.listarMarcosPendentes(20) };
}
const SEM: FiltrosPainel = { orgao: null, etapa: null, aguardando: null, de: null, ate: null };
test('10. painel: números por etapa, filtros, marcos, URL e CSV', async () => {
  const { repo, lista, pendentes } = await comExemplo();
  const p = montarPainel(lista, pendentes, SEM, '2026-12-06', await repo.datasMarcosPendentes());
  assert.deepEqual(p.total, { qtd: 12, valor: 14_685_000_000 });
  const por = Object.fromEntries(p.etapas.map((b) => [b.etapa, b]));
  assert.deepEqual(p.etapas.map((b) => b.etapa), ['concluida', 'julgamento', 'publicada', 'ajustes', 'preparacao', 'finalizacao']);
  assert.equal(por.concluida!.qtd, 2); assert.equal(por.concluida!.valor, 1_648_000_000); assert.equal(por.concluida!.economia, 102_000_000);
  assert.equal(por.julgamento!.valor, 1_061_000_000); assert.equal(por.julgamento!.economia, 39_000_000);
  assert.equal(por.publicada!.economia, null);
  assert.match(subtituloBloco(por.concluida!), /^valor contratado · economia de R\$/);
  assert.match(subtituloBloco(por.julgamento!), /^valor das propostas · economia prevista de/);
  assert.equal(subtituloBloco(por.finalizacao!), 'valor estimado');
  assert.deepEqual(p.proximosMarcos.map((m) => [m.data, m.atrasado]), [['2026-11-30', true], ['2026-12-05', true], ['2026-12-07', false], ['2026-12-09', false]]);
  assert.equal(p.aguardandoPgm.length, 3); assert.equal(p.aguardandoOutras.length, 2);
  // filtro de etapa: os grandes números não mudam, as listas sim
  const e = montarPainel(lista, pendentes, { ...SEM, etapa: 'julgamento' }, '2026-12-06', await repo.datasMarcosPendentes());
  assert.deepEqual(e.total, p.total); assert.equal(e.etapas[0]!.qtd, 2);
  assert.equal(e.etapas[0]!.itens.length, 0); assert.equal(e.etapas[1]!.itens.length, 3); assert.equal(e.filtradas.length, 3);
  const o = montarPainel(lista, pendentes, { ...SEM, orgao: 'SME' }, '2026-12-06');
  assert.equal(o.total.qtd, 4);
  assert.equal(montarPainel(lista, pendentes, { ...SEM, aguardando: 'qualquer' }, '2026-12-06').filtradas.length, 5);
  assert.equal(montarPainel(lista, pendentes, { ...SEM, aguardando: 'pgm' }, '2026-12-06').filtradas.length, 3);
  const per = montarPainel(lista, pendentes, { ...SEM, de: '2026-12-06', ate: '2026-12-08' }, '2026-12-06');
  assert.deepEqual(per.filtradas.map((c) => c.id), ['C-EX06']);
  // lerFiltros / URL
  const l = lerFiltros(new URLSearchParams('orgao=XYZ&etapa=nada&aguardando=talvez&de=2026-13-01'), ['SME']);
  assert.deepEqual(l.filtros, SEM);
  assert.deepEqual(l.avisos, ['O órgão informado não existe nestas contratações.', 'A etapa informada não existe.', 'Filtro de aguardando inválido.', 'Período inválido.']);
  assert.deepEqual(lerFiltros(new URLSearchParams('de=2026-12-09&ate=2026-12-01'), []).filtros, SEM);
  const f: FiltrosPainel = { orgao: 'SME', etapa: 'ajustes', aguardando: 'pgm', de: '2026-12-01', ate: '2026-12-31' };
  assert.deepEqual(lerFiltros(new URL('https://x.test' + urlPainel(f)).searchParams, ['SME']).filtros, f);
  assert.equal(urlPainel(SEM), '/plataforma/gestao-licitacoes/');
  assert.match(urlCsvPainel(f), /^\/plataforma\/gestao-licitacoes\/csv\/\?orgao=SME/);
  // CSV
  const csv = paraCsvContratacoes([{ ...lista[0]!, nome: '=1+1' }]);
  assert.match(csv, /"'=1\+1"/);
  assert.ok(csv.startsWith('"Etapa";"Código"') && csv.endsWith('\r\n'));
  assert.equal(casaFiltros(lista[0]!, [], SEM, true), true);
});

test('10b. filtro de período acha o marco 250 (sem limite de 20)', async () => {
  const { banco, ctx, repo } = montar();
  const a = await criar(ctx, { nome: 'A' });
  const b = await criar(ctx, { nome: 'B' });
  banco.sqlite.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 249)
    INSERT INTO contratacao_marco (prefeitura_id, id, contratacao_id, data, descricao, criado_por)
    SELECT ${PREF}, 'M-' || i, '${a}', date('2026-01-01', '+' || i || ' days'), 'm', 't' FROM n`);
  banco.sqlite.exec(`INSERT INTO contratacao_marco (prefeitura_id, id, contratacao_id, data, descricao, criado_por) VALUES (${PREF}, 'M-250', '${b}', '2030-05-05', 'tardio', 't')`);
  const lista = await repo.listar();
  const pendentes = await repo.listarMarcosPendentes(20);
  assert.ok(!pendentes.some((m) => m.id === 'M-250'));
  const p = montarPainel(lista, pendentes, { ...SEM, de: '2030-05-05', ate: '2030-05-05' }, '2026-11-22', await repo.datasMarcosPendentes());
  assert.deepEqual(p.filtradas.map((c) => c.id), [b]);
});

test('11. carga: idempotente e a tela vence; validações antes de gerar SQL', async () => {
  const { banco, ctx, repo } = montar();
  carregarExemplo(banco.sqlite);
  const conta = (sql: string) => Number((banco.sqlite.prepare(sql).get() as { n: number }).n);
  assert.equal(conta('SELECT count(*) AS n FROM contratacao'), 12);
  assert.equal(conta('SELECT count(*) AS n FROM contratacao_marco'), 5);
  assert.equal(conta("SELECT count(*) AS n FROM evento_contratacao WHERE tipo = 'carga'"), 12);
  const ex3 = (await repo.obter('C-EX03'))!;
  assert.ok((await exec(ctx, { acao: 'editar', id: 'C-EX03', revisao: ex3.revisao, campos: { nome: 'Editada pela tela' } })).ok);
  carregarExemplo(banco.sqlite);
  assert.equal((await repo.obter('C-EX03'))!.nome, 'Editada pela tela');
  assert.equal(conta('SELECT count(*) AS n FROM contratacao'), 12);
  assert.equal(conta('SELECT count(*) AS n FROM contratacao_marco'), 5);
  assert.equal(conta("SELECT count(*) AS n FROM evento_contratacao WHERE tipo = 'carga'"), 12);
  assert.equal(conta("SELECT count(*) AS n FROM contratacao WHERE origem <> 'carga'"), 0);

  mkdirSync('.tmp', { recursive: true });
  const pasta = mkdtempSync('.tmp/carga-ruim-');
  try {
    const rodar = (ajuste: (j: any) => void): { falhou: boolean; saida: boolean; msg: string } => {
      const dados = pasta + '/dados';
      rmSync(dados, { recursive: true, force: true });
      cpSync('data/exemplo', dados, { recursive: true });
      const arq = dados + '/contratacoes/contratacoes.json';
      const j = JSON.parse(readFileSync(arq, 'utf8'));
      ajuste(j);
      writeFileSync(arq, JSON.stringify(j));
      const saida = pasta + '/saida.sql';
      rmSync(saida, { force: true });
      try {
        execFileSync(process.execPath, ['scripts/gerar-sql-carga.ts', '--dados', dados, '--saida', saida, '--dialeto', 'sqlite'], { stdio: 'pipe' });
        return { falhou: false, saida: existsSync(saida), msg: '' };
      } catch (e) { return { falhou: true, saida: existsSync(saida), msg: String((e as { stderr?: Buffer }).stderr) }; }
    };
    const ruimMarco = rodar((j) => { j.contratacoes[1].marcos[0].id = 'X-1'; });
    assert.ok(ruimMarco.falhou && !ruimMarco.saida && /C-EX02, marco X-1/.test(ruimMarco.msg), ruimMarco.msg);
    assert.ok(rodar((j) => { j.contratacoes[1].marcos[0].data = '2026-02-30'; }).falhou);
    assert.ok(rodar((j) => { j.contratacoes[1].marcos[0].concluido = 'sim'; }).falhou);
    assert.ok(rodar((j) => { j.contratacoes[1].marcos[0].descricao = '  '; }).falhou);
    const futura = rodar((j) => { j.contratacoes[0].etapa_desde = '2099-01-01'; });
    assert.ok(futura.falhou && !futura.saida);
    const outra = rodar((j) => { j.prefeitura_id = 1; });
    assert.ok(outra.falhou && /prefeitura diferente da carteira/.test(outra.msg));
    assert.ok(rodar((j) => { j.contratacoes[0].projeto_id = 'P-NAO'; }).falhou);
    assert.equal(rodar(() => {}).falhou, false);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('11b. evento de carga usa o código da prefeitura no id', () => {
  const { banco } = montar();
  carregarExemplo(banco.sqlite);
  const r = banco.sqlite.prepare("SELECT id FROM evento_contratacao WHERE contratacao_id = 'C-EX01' AND tipo = 'carga'").get() as { id: string };
  assert.equal(r.id, `carga-${PREF}-C-EX01`);
});

test('12. navegação de volta', () => {
  const o = 'https://x.test/';
  assert.deepEqual(voltaContratacao('/plataforma/gestao-licitacoes/?etapa=julgamento', o), { href: '/plataforma/gestao-licitacoes/?etapa=julgamento', rotulo: 'Voltar para Gestão das licitações' });
  assert.deepEqual(voltaContratacao('/plataforma/projeto/P-900/?aba=contratacoes', o), { href: '/plataforma/projeto/P-900/?aba=contratacoes', rotulo: 'Voltar para o projeto' });
  for (const ruim of ['https://x.invalid/', '//x', '/\\x', 'javascript:alert(1)']) {
    assert.deepEqual(voltaContratacao(ruim, o), { href: '/plataforma/gestao-licitacoes/', rotulo: 'Voltar para Gestão das licitações' }, ruim);
  }
  assert.equal(hrefContratacao('C-1', '/plataforma/gestao-licitacoes/?a=1'), '/plataforma/gestao-licitacoes/C-1/?volta=%2Fplataforma%2Fgestao-licitacoes%2F%3Fa%3D1');
});
