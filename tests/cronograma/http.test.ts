import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { ContextoCronograma } from '../../src/lib/cronograma/edicao.ts';
import { atenderCriacao, atenderGravacao } from '../../src/lib/cronograma/http.ts';
import { comInvalidacao } from '../../src/lib/repositorio/cache.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import { criarLimitadorMemoria } from '../../src/lib/seguranca/limite.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';
import { bancoTeste } from '../helpers/d1.ts';

const PREF = 5208707;
const SITE = 'https://exemplo.invalid';
function montar(t: TestContext, perfil: Usuario['perfil'] = 'editor') {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(PREF);
  banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (?, 'P-1', 1, 'Obra Teste', 'SMS')").run(PREF);
  banco.sqlite.prepare("INSERT INTO cronograma (prefeitura_id, id, titulo, projeto_id) VALUES (?, 'C-x', 'Obra Teste', 'P-1')").run(PREF);
  const usuario: Usuario = { id: 'u1', email: 'editor@exemplo.invalid', nome: 'Editor', cargo: null, perfil, prefeitura_id: PREF, ativo: true, criado_em: '', atualizado_em: '' };
  const c: ContextoCronograma = { usuario, repositorio: comInvalidacao(repositorioD1ParaTestes(banco.db, PREF), PREF) };
  return { banco, c };
}
function pedido(corpo: unknown, op: { origem?: string | null; tipo?: string; tamanho?: string | null; bruto?: string } = {}, caminho = '/plataforma/cronograma/gravar/C-x/'): Request {
  const texto = op.bruto ?? JSON.stringify(corpo);
  const cabecalhos = new Headers();
  if (op.origem !== null) cabecalhos.set('origin', op.origem ?? SITE);
  cabecalhos.set('content-type', op.tipo ?? 'application/json');
  if (op.tamanho !== null) cabecalhos.set('content-length', op.tamanho ?? String(new TextEncoder().encode(texto).byteLength));
  return new Request(SITE + caminho, { method: 'POST', headers: cabecalhos, body: texto });
}
const nova = { revisao: 0, acao: 'incluir_tarefa', tarefa: { nome: 'Tarefa', fase: 'Fase 1' } };
const lerJson = async (r: Response) => (await r.json()) as Record<string, any>;

test('recusas antes do serviço: origem, perfil, formato, limite, tamanho e JSON', async (t) => {
  const { c } = montar(t);
  const lim = () => criarLimitadorMemoria({ limite: 100 });
  assert.equal((await atenderGravacao(pedido(nova, { origem: 'https://evil.example' }), c, lim(), 'C-x')).status, 403);
  assert.equal((await atenderGravacao(pedido(nova, { origem: null }), c, lim(), 'C-x')).status, 403);
  const leitor = montar(t, 'leitura').c;
  assert.equal((await atenderGravacao(pedido(nova), leitor, lim(), 'C-x')).status, 403);
  assert.equal((await atenderGravacao(pedido(nova, { tipo: 'text/plain' }), c, lim(), 'C-x')).status, 415);
  const um = criarLimitadorMemoria({ limite: 1 });
  assert.equal((await atenderGravacao(pedido(nova), c, um, 'C-x')).status, 200);
  const segunda = await atenderGravacao(pedido({ ...nova, revisao: 1 }), c, um, 'C-x');
  assert.equal(segunda.status, 429);
  assert.equal(segunda.headers.get('cache-control'), 'no-store');
  assert.equal((await atenderGravacao(pedido(nova, { tamanho: '20000' }), c, lim(), 'C-x')).status, 413);
  assert.equal((await atenderGravacao(pedido(nova, { tamanho: null }), c, lim(), 'C-x')).status, 413);
  assert.equal((await atenderGravacao(pedido(nova, { tamanho: 'abc' }), c, lim(), 'C-x')).status, 413);
  assert.equal((await atenderGravacao(pedido(null, { bruto: '{quebrado' }), c, lim(), 'C-x')).status, 400);
});

test('gravação: inexistente 404, corpo inválido 400 e sucesso 200 com a revisão nova', async (t) => {
  const { c } = montar(t);
  const lim = criarLimitadorMemoria({ limite: 100 });
  assert.equal((await atenderGravacao(pedido(nova), c, lim, 'C-nao-existe')).status, 404);
  const invalido = await atenderGravacao(pedido({ revisao: 0, acao: 'apagar' }), c, lim, 'C-x');
  assert.equal(invalido.status, 400);
  assert.deepEqual((await lerJson(invalido)).erros, ['Ação inválida.']);
  const r = await atenderGravacao(pedido(nova), c, lim, 'C-x');
  assert.equal(r.status, 200);
  const corpo = await lerJson(r);
  assert.equal(corpo.ok, true);
  assert.equal(corpo.revisao, 1);
  assert.match(corpo.tarefa_id, /^T-/);
  assert.equal((await atenderGravacao(pedido(nova), c, lim, 'C-x')).status, 409); // revisão velha
});

test('criação: devolve a URL com aba=tarefas e só aceita "volta" segura', async (t) => {
  const { banco, c } = montar(t);
  const lim = criarLimitadorMemoria({ limite: 100 });
  const rota = '/plataforma/cronograma/criar/';
  banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (?, 'P-2', 2, 'Outra Obra', 'SMS')").run(PREF);
  const boa = await lerJson(await atenderCriacao(pedido({ projeto_id: 'P-2', volta: '/plataforma/projeto/P-2/?aba=cadastro' }, {}, rota), c, lim));
  assert.equal(boa.ok, true);
  assert.match(boa.url, /^\/plataforma\/cronograma\/C-[^/]+\/\?aba=tarefas&volta=%2Fplataforma%2Fprojeto%2FP-2%2F%3Faba%3Dcadastro$/);
  banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (?, 'P-3', 3, 'Mais uma', 'SMS')").run(PREF);
  for (const volta of ['//evil.example', 'https://evil.example/', '/fora/da/lista/']) {
    const projeto = `P-${volta.length}`;
    banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (?, ?, ?, 'Obra', 'SMS')").run(PREF, projeto, 100 + volta.length);
    const r = await lerJson(await atenderCriacao(pedido({ projeto_id: projeto, volta }, {}, rota), c, lim));
    assert.equal(r.ok, true);
    assert.match(r.url, /^\/plataforma\/cronograma\/C-[^/]+\/\?aba=tarefas$/, volta);
  }
  const dup = await atenderCriacao(pedido({ projeto_id: 'P-1' }, {}, rota), c, lim);
  assert.equal(dup.status, 409);
  assert.equal((await lerJson(dup)).existente, 'C-x');
  assert.equal((await atenderCriacao(pedido({ projeto_id: 'P-inexistente' }, {}, rota), c, lim)).status, 404);
});

// E20: as mesmas checagens, na mesma ordem, valem para as ações de envolvidos e recursos.
const recurso = { revisao: 0, acao: 'incluir_recurso', tarefa_id: 'C-x#1', recurso: { tipo: 'material', descricao: 'Cimento', quantidade: '10', unidade: 'sacos', valor_estimado: '1.234,56' } };
const comTarefa = (t: TestContext, perfil: Usuario['perfil'] = 'editor') => {
  const m = montar(t, perfil);
  m.banco.sqlite.prepare("INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, fase, nome) VALUES (?, 'C-x#1', 'C-x', 1, 'Fase 1', 'Tarefa')").run(PREF);
  return m;
};

test('E20, recusas antes do serviço: origem, perfil, formato, limite, tamanho e JSON', async (t) => {
  const { c } = comTarefa(t);
  const lim = () => criarLimitadorMemoria({ limite: 100 });
  assert.equal((await atenderGravacao(pedido(recurso, { origem: 'https://evil.example' }), c, lim(), 'C-x')).status, 403);
  assert.equal((await atenderGravacao(pedido(recurso), comTarefa(t, 'leitura').c, lim(), 'C-x')).status, 403);
  assert.equal((await atenderGravacao(pedido(recurso, { tipo: 'text/plain' }), c, lim(), 'C-x')).status, 415);
  const um = criarLimitadorMemoria({ limite: 1 });
  assert.equal((await atenderGravacao(pedido(recurso), c, um, 'C-x')).status, 200);
  assert.equal((await atenderGravacao(pedido({ ...recurso, revisao: 1 }), c, um, 'C-x')).status, 429);
  assert.equal((await atenderGravacao(pedido(recurso, { tamanho: '20000' }), c, lim(), 'C-x')).status, 413);
  assert.equal((await atenderGravacao(pedido(null, { bruto: '{quebrado' }), c, lim(), 'C-x')).status, 400);
});

test('E20, sucesso: devolve item_id e a revisão nova; item inexistente 404; repetir a revisão velha 409', async (t) => {
  const { c } = comTarefa(t);
  const lim = criarLimitadorMemoria({ limite: 100 });
  const r = await atenderGravacao(pedido(recurso), c, lim, 'C-x');
  assert.equal(r.status, 200);
  const corpo = await lerJson(r);
  assert.deepEqual({ ok: corpo.ok, mudou: corpo.mudou, revisao: corpo.revisao }, { ok: true, mudou: true, revisao: 1 });
  assert.match(corpo.item_id, /^R-[0-9a-f-]{36}$/);
  assert.equal((await atenderGravacao(pedido(recurso), c, lim, 'C-x')).status, 409);
  const sem = await atenderGravacao(pedido({ revisao: 1, acao: 'remover_envolvido', tarefa_id: 'C-x#1', item_id: 'E-123e4567-e89b-12d3-a456-426614174000' }), c, lim, 'C-x');
  assert.equal(sem.status, 404);
  assert.equal((await lerJson(sem)).erro, 'Envolvido não encontrado.');
});
