import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { editarProjeto, normalizarEdicao, type ContextoEdicao } from '../../src/lib/carteira/edicao.ts';
import { salvarLocalizacao } from '../../src/lib/mapa/servico.ts';
import { comInvalidacao, invalidarCache, lerComCache } from '../../src/lib/repositorio/cache.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';
import { bancoTeste } from '../helpers/d1.ts';

const PREFEITURA = 5208707;
const id = 'P-1';
type Banco = ReturnType<typeof bancoTeste>;

function montar(t: TestContext, perfil: Usuario['perfil'] = 'editor', pref = PREFEITURA, existente?: Banco) {
  const banco = existente ?? bancoTeste();
  if (!existente) t.after(() => banco.sqlite.close());
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(pref);
  banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (?, ?, 1, 'Obra', 'SMS')").run(pref, id);
  const usuario: Usuario = {
    id: 'u1', email: 'editor@exemplo.invalid', nome: 'Editor', cargo: null, perfil,
    prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '',
  };
  const c: ContextoEdicao = { usuario, repositorio: criarRepositorioD1(banco.db, pref) };
  const ler = () => c.repositorio.obterProjetoComRevisao!(id);
  const eventos = () => c.repositorio.historico(id);
  const editar = (campos: Record<string, unknown>, revisao = 0, motivo?: string) => editarProjeto(c, id, { revisao, motivo, campos });
  return { banco, c, ler, eventos, editar };
}

test('edição: grava só o que mudou, sobe a revisão e registra antes/depois no mesmo lote', async (t) => {
  const { banco, c, ler, eventos } = montar(t);
  const lotes: number[] = [];
  c.repositorio = criarRepositorioD1({
    ...banco.db,
    async batch(statements) {
      lotes.push(statements.length);
      return banco.db.batch(statements);
    },
  }, PREFEITURA);
  const r = await editarProjeto(c, id, { revisao: 0, campos: { nome: 'Obra', observacao: ' Nova observação ' } });
  assert.deepEqual(r, { ok: true, mudou: true, avisos: [] });
  assert.deepEqual(lotes, [2]);
  const atual = (await ler())!;
  assert.equal(atual.revisao, 1);
  assert.equal(atual.projeto.observacao, 'Nova observação');
  const [h] = await eventos();
  assert.equal(h.tipo, 'atualizar_campos');
  assert.equal(h.origem, 'ficha');
  assert.equal(h.autor, c.usuario.email);
  assert.deepEqual(h.campos, [{ campo: 'observacao', antes: null, depois: 'Nova observação' }]);
});

test('edição: duas edições no mesmo milissegundo gravam dois eventos', async (t) => {
  const agora = new Date('2026-11-22T15:00:00.123Z');
  t.mock.timers.enable({ apis: ['Date'], now: agora });
  const ids = ['ffffffff-ffff-4fff-bfff-ffffffffffff', '00000000-0000-4000-8000-000000000000'] as const;
  t.mock.method(crypto, 'randomUUID', () => ids[0], { times: 1 });
  const { banco, editar, ler, eventos } = montar(t);

  assert.deepEqual(await editar({ observacao: 'Primeira' }, 0), { ok: true, mudou: true, avisos: [] });
  t.mock.method(crypto, 'randomUUID', () => ids[1], { times: 1 });
  assert.deepEqual(await editar({ observacao: 'Segunda' }, 1), { ok: true, mudou: true, avisos: [] });
  assert.equal((await ler())!.revisao, 2);

  const gravados = banco.sqlite.prepare('SELECT id FROM evento_projeto WHERE prefeitura_id = ? AND projeto_id = ? ORDER BY rowid')
    .all(PREFEITURA, id);
  assert.deepEqual(gravados.map((h) => h.id), [...ids]);
  const historico = await eventos();
  assert.deepEqual(historico.map((h) => h.id), [...ids]);
  assert.deepEqual(historico.map((h) => h.em), [agora.toISOString(), agora.toISOString()]);
  assert.deepEqual(historico.map((h) => h.campos), [
    [{ campo: 'observacao', antes: null, depois: 'Primeira' }],
    [{ campo: 'observacao', antes: 'Primeira', depois: 'Segunda' }],
  ]);
});

test('edição: nada mudou não grava nem cria evento', async (t) => {
  const { c, ler, eventos, editar } = montar(t);
  const antes = await ler();
  for (const campos of [{ nome: 'Obra', orgao: 'SMS' }, {}, { intruso: true }]) {
    assert.deepEqual(await editar(campos), { ok: true, mudou: false, avisos: [] });
  }
  for (const corpo of [{ revisao: 0 }, { revisao: 0, campos: [] }, ...['0', -1, 1.5].map((revisao) => ({ revisao, campos: {} }))]) {
    assert.equal(normalizarEdicao(corpo).ok, false);
    const r = await editarProjeto(c, id, corpo);
    assert.ok(!r.ok && r.status === 400);
  }
  for (const campos of [{ nome: '' }, { orgao: '' }, { prioritario: 'sim' }]) {
    const r = await editar(campos);
    assert.ok(!r.ok && r.status === 400);
  }
  assert.deepEqual(await ler(), antes);
  assert.deepEqual(await eventos(), []);
});

test('edição: campo desconhecido ou proibido é ignorado', async (t) => {
  const { editar, ler, eventos } = montar(t);
  const antes = (await ler())!.projeto;
  const campos = JSON.parse('{"nome":"Outro nome","macroetapa":"05","localizacao":{},"id":"P-8","codigo_legado":8,"prefeitura_id":1,"origem":{},"intruso":2,"__proto__":{},"constructor":{}}');
  assert.equal((await editar(campos)).ok, true);
  assert.deepEqual((await ler())!.projeto, { ...antes, nome: 'Outro nome' });
  assert.deepEqual((await eventos())[0].campos, [{ campo: 'nome', antes: 'Obra', depois: 'Outro nome' }]);
});

test('edição: perfil leitura recebe 403 e usuário inativo também; nada gravado', async (t) => {
  const { c, ler, eventos, editar } = montar(t, 'leitura');
  const antes = await ler();
  const esperado = { ok: false, status: 403, erro: 'Seu perfil não permite alterar projetos.' };
  assert.deepEqual(await editar({ observacao: 'Não gravar' }), esperado);
  c.usuario.perfil = 'editor';
  c.usuario.ativo = false;
  assert.deepEqual(await editar({ observacao: 'Não gravar' }), esperado);
  assert.deepEqual(await ler(), antes);
  assert.deepEqual(await eventos(), []);
});

test('edição: revisão antiga recebe 409 e nada fica gravado', async (t) => {
  const { editar, ler, eventos } = montar(t);
  assert.equal((await editar({ observacao: 'Primeira' })).ok, true);
  const r = await editar({ observacao: 'Segunda' });
  assert.ok(!r.ok && r.status === 409);
  assert.equal((await ler())!.projeto.observacao, 'Primeira');
  assert.equal((await eventos()).length, 1);
});

test('edição: gravação intercalada entre a leitura e o lote recebe conflito', async (t) => {
  const { banco, ler, eventos } = montar(t);
  let chamou = false;
  const repo = criarRepositorioD1({
    ...banco.db,
    async batch(statements) {
      if (!chamou) {
        chamou = true;
        banco.sqlite.prepare('UPDATE projeto SET revisao = revisao + 1 WHERE prefeitura_id = ? AND id = ?').run(PREFEITURA, id);
      }
      return banco.db.batch(statements);
    },
  }, PREFEITURA);
  const r = await repo.editarProjeto!(id, 0, { observacao: 'Perdida' }, null, 'editor@exemplo.invalid');
  assert.ok(chamou && !r.ok && r.codigo === 'conflito');
  assert.equal((await ler())!.projeto.observacao, null);
  assert.equal((await ler())!.revisao, 1);
  assert.deepEqual(await eventos(), []);
});

test('edição: localização salva depois da leitura invalida a revisão da tela', async (t) => {
  const { c, editar, ler, eventos } = montar(t);
  const { revisao } = (await ler())!;
  assert.equal((await salvarLocalizacao(c, id, { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: null })).ok, true);
  const r = await editar({ observacao: 'Perdida' }, revisao);
  assert.ok(!r.ok && r.status === 409);
  assert.equal((await ler())!.projeto.localizacao?.tipo, 'ponto');
  assert.deepEqual((await eventos()).map((h) => h.tipo), ['localizacao_alterada']);
});

test('edição: texto com XSS e SQL fica como texto puro', async (t) => {
  const { editar, ler, banco } = montar(t);
  const nome = '<img src=x onerror=alert(1)>';
  const observacao = "x'); DROP TABLE projeto; --";
  assert.equal((await editar({ nome, observacao })).ok, true);
  assert.equal((await ler())!.projeto.nome, nome);
  assert.equal((await ler())!.projeto.observacao, observacao);
  assert.equal(banco.sqlite.prepare('SELECT count(*) AS n FROM projeto').get()?.n, 1);
});

test('edição: valor ou prioridade sem motivo é recusado; com motivo grava o motivo', async (t) => {
  const { editar, ler, eventos } = montar(t);
  for (const campos of [{ valor_obra: 1500 }, { prioridade: 'Alta' }]) {
    const r = await editar(campos);
    assert.ok(!r.ok && r.status === 400);
    assert.deepEqual(r.erros, ['Mudança de valor ou prioridade exige motivo.']);
  }
  assert.deepEqual(await eventos(), []);
  assert.equal((await editar({ valor_obra: 1500, prioridade: 'Alta' }, 0, ' Motivo informado ')).ok, true);
  assert.equal((await ler())!.projeto.valores.obra, 1500);
  assert.equal((await eventos())[0].motivo, 'Motivo informado');
});

test('edição: área conferida no catálogo; gatilho barra o que o serviço deixar passar', async (t) => {
  const { c, banco, editar, ler, eventos } = montar(t);
  assert.equal((await editar({ area: 'saude' })).ok, true);
  assert.equal((await ler())!.projeto.area, 'saude');
  const r = await editar({ area: 'nada' }, 1);
  assert.ok(!r.ok && r.status === 400);
  const direto = await c.repositorio.editarProjeto!(id, 1, { area: 'nada' }, null, c.usuario.email);
  assert.ok(!direto.ok && direto.codigo === 'invalido');
  banco.sqlite.prepare("UPDATE catalogo SET ativo = 0 WHERE prefeitura_id = ? AND tipo = 'area' AND codigo IN ('saude', 'cultura')").run(PREFEITURA);
  const inativa = await editar({ area: 'cultura' }, 1);
  assert.ok(!inativa.ok && inativa.status === 400);
  assert.equal((await ler())!.revisao, 1);
  assert.equal((await ler())!.projeto.area, 'saude');
  assert.equal((await eventos()).length, 1);
  assert.equal((await editar({ observacao: 'Área desativada é preservada' }, 1)).ok, true);
  assert.equal((await ler())!.projeto.area, 'saude');
  assert.equal((await editar({ area: null }, 2)).ok, true);
  assert.equal((await ler())!.projeto.area, null);
});

test('edição: outra prefeitura não enxerga nem altera o projeto de mesmo id', async (t) => {
  const local = montar(t);
  const outra = montar(t, 'editor', 1, local.banco);
  local.banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (1, 'P-2', 2, 'Outro município')");
  const antes = await outra.ler();
  assert.equal((await local.editar({ nome: 'Mudança local' })).ok, true);
  assert.equal((await local.ler())!.projeto.nome, 'Mudança local');
  assert.deepEqual(await outra.ler(), antes);
  assert.equal(await local.c.repositorio.obterProjetoComRevisao!('P-2'), null);
  const r = await editarProjeto(local.c, 'P-2', { revisao: 0, campos: { nome: 'Intruso' } });
  assert.ok(!r.ok && r.status === 404);
  assert.equal((await outra.c.repositorio.obterProjeto('P-2'))!.nome, 'Outro município');
  assert.deepEqual(await outra.eventos(), []);
});

test('edição: repositório sem gravação devolve 503 e id malformado devolve 404', async (t) => {
  const { c, eventos } = montar(t);
  const corpo = { revisao: 0, campos: { nome: 'Intruso' } };
  const r = await editarProjeto({ ...c, repositorio: { ...c.repositorio, editarProjeto: undefined } }, id, corpo);
  assert.ok(!r.ok && r.status === 503);
  for (const idRuim of ["P-1'", '<script>']) {
    const r = await editarProjeto(c, idRuim, corpo);
    assert.ok(!r.ok && r.status === 404);
  }
  assert.deepEqual(await eventos(), []);
});

test('cache: editar limpa o cache da prefeitura', async (t) => {
  const { c, editar } = montar(t);
  invalidarCache(PREFEITURA);
  t.after(() => invalidarCache(PREFEITURA));
  c.repositorio = comInvalidacao(c.repositorio, PREFEITURA);
  const ler = () => lerComCache(PREFEITURA, () => c.repositorio.obterProjeto(id));
  assert.equal((await ler())!.nome, 'Obra');
  assert.equal((await editar({ nome: 'Outro nome' })).ok, true);
  assert.equal((await ler())!.nome, 'Outro nome');
});
