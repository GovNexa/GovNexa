import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { criarCronograma, gravarCronograma, normalizarPedido, type ContextoCronograma } from '../../src/lib/cronograma/edicao.ts';
import { comInvalidacao } from '../../src/lib/repositorio/cache.ts';
import { repositorio, repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';
import { SQL_EDITADOS } from '../../scripts/importar-planilhas.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { bancoTeste } from '../helpers/d1.ts';

const PREF = 5208707;
const RELOGIO = { agora: '2026-11-20T12:00:00.000Z', hoje: '2026-11-20' };
const usuario = (perfil: Usuario['perfil'] = 'editor', pref = PREF): Usuario => ({
  id: 'u1', email: 'editor@exemplo.invalid', nome: 'Editor', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '',
});
function montar(t: TestContext, perfil: Usuario['perfil'] = 'editor') {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(PREF);
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(perfil), repositorio: comInvalidacao(repo, PREF) };
  return { banco, repo, c };
}
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const tarefa = (p: object) => ({ nome: 'Tarefa', fase: 'Fase 1', ...p });

test('do zero: cria, inclui, reordena, edita, troca, remove e deixa o histórico completo', async (t) => {
  const { banco, repo, c } = montar(t);
  const criado = await repo.criarProjeto({ nome: 'Obra Teste', orgao: 'SMS' }, 'editor@exemplo.invalid');
  assert.ok(criado.ok);
  const projeto = criado.projeto.id;
  const cr = ok(await criarCronograma(c, { projeto_id: projeto }, { agora: RELOGIO.agora }));
  const dup = await criarCronograma(c, { projeto_id: projeto }, { agora: RELOGIO.agora });
  assert.deepEqual({ ...dup }, { ok: false, status: 409, erro: 'Este projeto já tem cronograma.', existente: cr.id });
  assert.equal((await criarCronograma(c, { projeto_id: 'P-inexistente' }, RELOGIO) as { status: number }).status, 404);

  let rev = 0;
  let relogio = RELOGIO;
  const g = async (corpo: Record<string, unknown>) => {
    const r = ok(await gravarCronograma(c, cr.id, { revisao: rev, ...corpo }, relogio));
    if (r.mudou) rev = r.revisao;
    return r;
  };
  const t1 = (await g({ acao: 'incluir_tarefa', tarefa: tarefa({ nome: 'Primeira', responsavel: 'Pessoa Teste 1', unidade: 'Unidade Teste' }) })).tarefa_id!;
  const t2 = (await g({ acao: 'incluir_tarefa', tarefa: tarefa({ nome: 'Segunda', fase: 'Fase 2' }) })).tarefa_id!;
  const t3 = (await g({ acao: 'incluir_tarefa', tarefa: tarefa({ nome: 'Terceira' }) })).tarefa_id!;
  assert.equal(rev, 3);
  await g({ acao: 'reordenar', ids: [t3, t1, t2] });
  await g({ acao: 'editar_tarefa', tarefa_id: t3, campos: { inicio_real: '2026-11-01' } });
  await g({ acao: 'editar_tarefa', tarefa_id: t3, campos: { fim_real: '2026-11-10' } });
  relogio = { ...RELOGIO, agora: '2026-11-20T13:00:00.000Z' }; // a troca é gravada depois da inicial
  await g({ acao: 'trocar_responsavel', tarefa_id: t1, para_responsavel: 'Pessoa Teste 2', para_unidade: 'Unidade Teste', desde: '2026-11-20', motivo: 'Motivo teste' });
  await g({ acao: 'remover_tarefa', tarefa_id: t2, motivo: 'Duplicada' });
  const semMudanca = ok(await gravarCronograma(c, cr.id, { revisao: rev, acao: 'reordenar', ids: [t3, t1] }, RELOGIO));
  assert.equal(semMudanca.mudou, false);

  const lido = (await repo.listarCronogramas()).find((x) => x.id === cr.id)!;
  const etapas = lido.fases.flatMap((f) => f.etapas);
  assert.deepEqual(etapas.map((e) => e.id), [t3, t1]);
  assert.equal(lido.editado_na_tela, true);
  assert.equal(lido.origem_registro, 'tela');
  assert.equal(lido.revisao, rev);
  assert.equal(etapas[0].status, 'concluida');
  const primeira = etapas.find((e) => e.id === t1)!;
  assert.equal(primeira.responsavel, 'Pessoa Teste 2');
  assert.deepEqual(primeira.trocas!.map((x) => x.tipo), ['inicial', 'troca']);
  assert.equal(primeira.trocas![1].de_responsavel, 'Pessoa Teste 1');
  assert.equal(banco.sqlite.prepare('SELECT count(*) AS n FROM troca_responsavel').get()!.n, 2);
  assert.equal(banco.sqlite.prepare("SELECT count(*) AS n FROM etapa_cronograma WHERE removida_em IS NOT NULL").get()!.n, 1);

  const historico = await repo.historico(projeto);
  const doCronograma = historico.filter((h) => h.origem === 'cronograma');
  assert.deepEqual([...new Set(doCronograma.map((h) => h.tipo))].sort(), ['cronograma_criado', 'responsavel_trocado', 'tarefa_alterada', 'tarefa_incluida', 'tarefa_removida', 'tarefas_reordenadas']);
  assert.equal(doCronograma.find((h) => (h.tipo as string) === 'tarefa_removida')!.motivo, 'Duplicada');
});

test('cronograma sem projeto na carteira grava o evento no histórico de sistema', async (t) => {
  const { banco, repo, c } = montar(t);
  banco.sqlite.prepare("INSERT INTO cronograma (prefeitura_id, id, titulo, projeto_id) VALUES (?, 'C-solto', 'Solto', NULL)").run(PREF);
  ok(await gravarCronograma(c, 'C-solto', { revisao: 0, acao: 'incluir_tarefa', tarefa: tarefa({}) }, RELOGIO));
  const ev = banco.sqlite.prepare("SELECT tipo, origem, detalhes FROM evento_sistema WHERE origem = 'cronograma'").all();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, 'tarefa_incluida');
  assert.equal(JSON.parse(String(ev[0].detalhes)).cronograma_id, 'C-solto');
  assert.equal((await repo.listarHistorico()).filter((h) => h.origem === 'cronograma').length, 1);
});

test('base carregada: a tela vence a planilha na nova carga e nada é apagado', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  const antes002 = (await repo.listarCronogramas()).find((x) => x.id === 'C-exemplo-002')!;
  const total = () => Number(banco.sqlite.prepare("SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = 'C-exemplo-001'").get()!.n);
  const n001 = total();
  const { revisao } = (await repo.obterCronograma!('C-exemplo-001'))!;
  assert.equal(revisao, 0);
  const tarefaId = 'C-exemplo-001#10';
  const r = ok(await gravarCronograma(c, 'C-exemplo-001', { revisao, acao: 'trocar_responsavel', tarefa_id: tarefaId, para_responsavel: 'Pessoa Teste 9', para_unidade: null, desde: '2026-11-20' }, RELOGIO));
  assert.equal(r.revisao, 1);
  assert.equal(banco.sqlite.prepare("SELECT editado_na_tela AS e FROM cronograma WHERE id = 'C-exemplo-001'").get()!.e, 1);
  assert.equal(banco.sqlite.prepare("SELECT editado_na_tela AS e FROM cronograma WHERE id = 'C-exemplo-002'").get()!.e, 0);

  carregarExemplo(banco.sqlite); // a planilha roda de novo no mesmo banco
  const depois = (await repo.obterCronograma!('C-exemplo-001'))!.cronograma;
  const tarefa = depois.fases.flatMap((f) => f.etapas).find((e) => e.id === tarefaId)!;
  assert.equal(tarefa.responsavel, 'Pessoa Teste 9');
  assert.equal(tarefa.trocas!.length, 1);
  assert.equal(total(), n001);
  // E20: a carga sobe a revisão do cronograma não editado na tela (uma gravação baseada em leitura anterior à carga recebe 409); o resto não muda.
  const depois002 = (await repo.listarCronogramas()).find((x) => x.id === 'C-exemplo-002')!;
  assert.equal(depois002.revisao, (antes002.revisao ?? 0) + 1);
  assert.deepEqual({ ...depois002, revisao: antes002.revisao }, antes002);
});

test('abuso: revisão velha, simultâneas, outra prefeitura, tarefa de outro cronograma, perfil, JSON e corpo inválido', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Outra', 'GO')").run();
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  const nova = (revisao: number, nome: string) => ({ revisao, acao: 'incluir_tarefa', tarefa: tarefa({ nome }) });

  ok(await gravarCronograma(c, 'C-exemplo-001', nova(0, 'Primeira'), RELOGIO));
  const velha = await gravarCronograma(c, 'C-exemplo-001', nova(0, 'Segunda'), RELOGIO);
  assert.deepEqual({ ...velha }, { ok: false, status: 409, erro: 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.' });

  const [a, b] = await Promise.all([gravarCronograma(c, 'C-exemplo-001', nova(1, 'Corrida A'), RELOGIO), gravarCronograma(c, 'C-exemplo-001', nova(1, 'Corrida B'), RELOGIO)]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal([a, b].find((x) => !x.ok && x.status === 409) !== undefined, true);
  assert.equal(banco.sqlite.prepare("SELECT count(*) AS n FROM etapa_cronograma WHERE nome LIKE 'Corrida%'").get()!.n, 1);
  assert.equal(banco.sqlite.prepare("SELECT revisao AS r FROM cronograma WHERE id = 'C-exemplo-001'").get()!.r, 2);

  const outra: ContextoCronograma = { usuario: usuario('editor', 1), repositorio: comInvalidacao(repositorioD1ParaTestes(banco.db, 1), 1) };
  const antes = banco.sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma').get()!.n;
  assert.equal((await gravarCronograma(outra, 'C-exemplo-001', nova(2, 'Invasora'), RELOGIO) as { status: number }).status, 404);
  assert.equal(banco.sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma').get()!.n, antes);

  const alheia = await gravarCronograma(c, 'C-exemplo-002', { revisao: 0, acao: 'editar_tarefa', tarefa_id: 'C-exemplo-001#10', campos: { nome: 'Outra' } }, RELOGIO);
  assert.equal((alheia as { status: number }).status, 404);
  assert.equal(banco.sqlite.prepare("SELECT nome FROM etapa_cronograma WHERE id = 'C-exemplo-001#10'").get()!.nome !== 'Outra', true);

  const leitor: ContextoCronograma = { ...c, usuario: usuario('leitura') };
  assert.equal((await gravarCronograma(leitor, 'C-exemplo-001', nova(2, 'X'), RELOGIO) as { status: number }).status, 403);
  const json: ContextoCronograma = { usuario: usuario(), repositorio: repositorio() };
  assert.equal((await gravarCronograma(json, 'C-exemplo-001', nova(2, 'X'), RELOGIO) as { status: number }).status, 503);
  assert.equal((await criarCronograma(json, { projeto_id: 'P-900' }) as { status: number }).status, 503);

  const invalido = await gravarCronograma(c, 'C-exemplo-001', { revisao: 2, acao: 'incluir_tarefa', tarefa: { nome: '', fase: 'F', inicio_real: '2026-02-30' } }, RELOGIO) as { status: number; erros: string[] };
  assert.equal(invalido.status, 400);
  assert.deepEqual(invalido.erros, ['Nome: obrigatório.', 'Início real: data inválida.']);
  assert.equal((await gravarCronograma(c, 'C-exemplo-001', { revisao: 2, acao: 'apagar_tudo' }, RELOGIO) as { erros: string[] }).erros[0], 'Ação inválida.');
  assert.equal((await gravarCronograma(c, 'C-exemplo-001', { acao: 'reordenar', ids: [] }, RELOGIO) as { erros: string[] }).erros[0], 'Versão do cronograma ausente: recarregue a página e tente de novo.');
  assert.equal((await gravarCronograma(c, 'Cronograma ruim', nova(2, 'X'), RELOGIO) as { status: number }).status, 404);
});

test('normalizarPedido: responsável não se edita pela edição; campos fora da lista são ignorados', () => {
  const r = normalizarPedido({ revisao: 1, acao: 'editar_tarefa', tarefa_id: 'C-x#1', campos: { nome: ' Novo ', responsavel: 'Pessoa Teste 1' } });
  assert.deepEqual(r, { ok: false, erros: ['Para mudar o responsável ou a área, use Trocar responsável.'] });
  const s = normalizarPedido({ revisao: 1, acao: 'editar_tarefa', tarefa_id: 'C-x#1', campos: { nome: ' Novo ', duracao_prevista: '', status: 'concluida', prefeitura_id: 7 } });
  assert.deepEqual(s, { ok: true, revisao: 1, op: { acao: 'editar_tarefa', tarefa_id: 'C-x#1', campos: { nome: 'Novo', duracao_prevista: null } } });
  assert.equal((normalizarPedido({ revisao: 1, acao: 'editar_tarefa', tarefa_id: "C-x#1'; DROP", campos: {} }) as { erros: string[] }).erros[0], 'Tarefa inválida.');
  assert.equal((normalizarPedido({ revisao: 1, acao: 'reordenar', ids: new Array(501).fill('C-x#1') }) as { erros: string[] }).erros[0], 'Lista de tarefas inválida.');
});

test('importação: a gravação no cronograma não congela o projeto da carteira', () => {
  assert.match(SQL_EDITADOS(PREF), /AND origem NOT IN \('importacao','cronograma'\)/);
});

const SEM_MUDAR = 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.';
const fotografia = (banco: ReturnType<typeof bancoTeste>) => JSON.stringify({
  tarefas: banco.sqlite.prepare('SELECT * FROM etapa_cronograma ORDER BY prefeitura_id, id').all(),
  trocas: banco.sqlite.prepare('SELECT * FROM troca_responsavel ORDER BY prefeitura_id, id').all(),
  eventos: banco.sqlite.prepare('SELECT count(*) AS n FROM evento_projeto').get(),
  sistema: banco.sqlite.prepare('SELECT count(*) AS n FROM evento_sistema').get(),
});

test('concorrência no batch: outra gravação entre a leitura e o batch dá 409 e não grava nada (Delta 2, item 2)', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  // Intercepta o batch: a "outra pessoa" grava (revisao + 1) depois da leitura e antes do lote.
  const interceptado = { prepare: banco.db.prepare.bind(banco.db), batch: async (st: Parameters<typeof banco.db.batch>[0]) => {
    banco.sqlite.exec("UPDATE cronograma SET revisao = revisao + 1 WHERE id = 'C-exemplo-001'");
    return banco.db.batch(st);
  } };
  const repo = repositorioD1ParaTestes(interceptado as typeof banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  const antes = fotografia(banco);
  const r = await gravarCronograma(c, 'C-exemplo-001', { revisao: 0, acao: 'incluir_tarefa', tarefa: tarefa({ nome: 'Corrida no batch' }) }, RELOGIO);
  assert.deepEqual({ ...r }, { ok: false, status: 409, erro: SEM_MUDAR });
  assert.equal(fotografia(banco), antes);
  assert.equal(banco.sqlite.prepare("SELECT revisao AS r FROM cronograma WHERE id = 'C-exemplo-001'").get()!.r, 1); // só a gravação da "outra pessoa"
});

test('isolamento das trocas: a mesma chave em outra prefeitura não aparece na leitura (Delta 2, item 3)', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Outra', 'GO')").run();
  banco.sqlite.exec("INSERT INTO cronograma (prefeitura_id, id, titulo) VALUES (1, 'C-exemplo-001', 'Cronograma da outra')");
  banco.sqlite.exec("INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, fase, nome) VALUES (1, 'C-exemplo-001#10', 'C-exemplo-001', 1, 'F', 'Tarefa da outra')");
  banco.sqlite.exec(`INSERT INTO troca_responsavel (prefeitura_id, id, cronograma_id, tarefa_id, tipo, para_responsavel, desde, registrado_por, registrado_em)
    VALUES (1, 'troca-da-outra', 'C-exemplo-001', 'C-exemplo-001#10', 'inicial', 'Pessoa Alheia', '2026-01-02', 'b@exemplo.invalid', '2026-01-03T10:00:00.000Z')`);
  const deA = (await repositorioD1ParaTestes(banco.db, PREF).obterCronograma!('C-exemplo-001'))!.cronograma;
  const tarefaA = deA.fases.flatMap((f) => f.etapas).find((e) => e.id === 'C-exemplo-001#10')!;
  assert.deepEqual(tarefaA.trocas, []);
  assert.ok(!JSON.stringify(deA).includes('Pessoa Alheia'));
  const deB = (await repositorioD1ParaTestes(banco.db, 1).obterCronograma!('C-exemplo-001'))!.cronograma;
  assert.equal(deB.fases.flatMap((f) => f.etapas)[0].trocas!.length, 1);
});

test('posição negativa ativa (passada interrompida) trava a gravação estrutural com 409 (Delta 2, item 4)', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  banco.sqlite.exec("UPDATE etapa_cronograma SET ordem = -ordem WHERE id = 'C-exemplo-001#10'");
  const antes = fotografia(banco);
  // Edição simples não reescreve as posições: a negativa continua ativa e o lote inteiro cai (revisao = NULL).
  const r = await gravarCronograma(c, 'C-exemplo-001', { revisao: 0, acao: 'editar_tarefa', tarefa_id: 'C-exemplo-001#11', campos: { nome: 'Depois da passada interrompida' } }, RELOGIO);
  assert.deepEqual({ ...r }, { ok: false, status: 409, erro: SEM_MUDAR });
  assert.equal(fotografia(banco), antes);
  assert.equal(banco.sqlite.prepare("SELECT revisao AS r FROM cronograma WHERE id = 'C-exemplo-001'").get()!.r, 0);
});
