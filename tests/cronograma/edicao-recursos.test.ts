// Envolvidos e recursos da tarefa (E20): serviço + D1 em SQLite.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { criarCronograma, gravarCronograma, type ContextoCronograma } from '../../src/lib/cronograma/edicao.ts';
import { montarPainel } from '../../src/lib/cronograma/painel-responsaveis.ts';
import { comInvalidacao } from '../../src/lib/repositorio/cache.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { bancoTeste } from '../helpers/d1.ts';

const PREF = 5208707;
const RELOGIO = { agora: '2026-11-20T12:00:00.000Z', hoje: '2026-11-20' };
const usuario = (perfil: Usuario['perfil'] = 'editor', pref = PREF): Usuario => ({
  id: 'u1', email: 'editor@exemplo.invalid', nome: 'Editor', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '',
});
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const status = (r: { ok: boolean }): number => (r as unknown as { status: number }).status;
const erros = (r: { ok: boolean }): string[] => (r as unknown as { erros: string[] }).erros;
const UUID_FALSO = '123e4567-e89b-12d3-a456-426614174000';
const SEM_MUDAR = 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.';

async function montarDoZero(t: TestContext) {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(PREF);
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  const criado = await repo.criarProjeto({ nome: 'Obra Teste', orgao: 'SMS' }, 'editor@exemplo.invalid');
  assert.ok(criado.ok);
  const cr = ok(await criarCronograma(c, { projeto_id: criado.projeto.id }, { agora: RELOGIO.agora }));
  let rev = 0;
  const g = async (corpo: Record<string, unknown>) => {
    const r = ok(await gravarCronograma(c, cr.id, { revisao: rev, ...corpo }, RELOGIO));
    if (r.mudou) rev = r.revisao;
    return r;
  };
  const t1 = (await g({ acao: 'incluir_tarefa', tarefa: { nome: 'Primeira', fase: 'Fase 1', responsavel: 'Pessoa Teste 1', unidade: 'Unidade Teste' } })).tarefa_id!;
  const t2 = (await g({ acao: 'incluir_tarefa', tarefa: { nome: 'Segunda', fase: 'Fase 1' } })).tarefa_id!;
  return { banco, repo, c, projeto: criado.projeto.id, cr: cr.id, t1, t2, g, rev: () => rev };
}

test('do zero: inclui, edita e remove envolvidos e recursos; a revisão sobe 1 por gravação e o Histórico registra os 6 tipos', async (t) => {
  const { banco, repo, c, projeto, cr, t1, t2, g, rev } = await montarDoZero(t);
  const antes = rev();
  const e1 = (await g({ acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { nome: 'Pessoa Teste 2', area: 'Unidade Teste', papel: 'Fiscal', observacao: 'Observação secreta de teste' } })).item_id!;
  const e2 = (await g({ acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { area: 'Concessionária Teste' } })).item_id!;
  assert.equal(rev(), antes + 2);
  assert.match(e1, /^E-[0-9a-f-]{36}$/);
  const r1 = (await g({ acao: 'incluir_recurso', tarefa_id: t1, recurso: { tipo: 'humano', descricao: 'Engenheiro', quantidade: '40', unidade: 'horas' } })).item_id!;
  const r2 = (await g({ acao: 'incluir_recurso', tarefa_id: t1, recurso: { tipo: 'material', descricao: 'Cimento', quantidade: '2,5', unidade: 'sacos', valor_estimado: '500,00', data_uso: '2026-11-18' } })).item_id!;
  const r3 = (await g({ acao: 'incluir_recurso', tarefa_id: t2, recurso: { tipo: 'financeiro', descricao: 'Diárias', valor_estimado: '1.234,56', valor_utilizado: '1.000,00' } })).item_id!;
  assert.match(r3, /^R-[0-9a-f-]{36}$/);
  assert.equal(rev(), antes + 5);

  await g({ acao: 'editar_envolvido', tarefa_id: t1, item_id: e1, envolvido: { nome: 'Pessoa Teste 2', area: 'Unidade Teste', papel: 'Apoio', observacao: 'Outra observação' } });
  const novoCimento = { tipo: 'material', descricao: 'Cimento', quantidade: '2,5', unidade: 'sacos', valor_estimado: '500,00', valor_utilizado: '450,00', data_uso: '2026-11-18' };
  await g({ acao: 'editar_recurso', tarefa_id: t1, item_id: r2, recurso: novoCimento });
  const semMudar = ok(await gravarCronograma(c, cr, { revisao: rev(), acao: 'editar_recurso', tarefa_id: t1, item_id: r2, recurso: novoCimento }, RELOGIO));
  assert.equal(semMudar.mudou, false);
  assert.equal(semMudar.revisao, rev());
  await g({ acao: 'remover_envolvido', tarefa_id: t1, item_id: e2, motivo: 'Engano' });
  await g({ acao: 'remover_recurso', tarefa_id: t1, item_id: r1, motivo: null });
  assert.equal(rev(), antes + 9);

  const itens = await repo.listarItensCronograma!(cr);
  assert.deepEqual(itens.envolvidos.map((x) => x.id), [e1]);
  assert.equal(itens.envolvidos[0].papel, 'Apoio');
  assert.equal(itens.envolvidos[0].atualizado_por, 'editor@exemplo.invalid');
  assert.deepEqual(itens.recursos.map((x) => x.descricao).sort(), ['Cimento', 'Diárias']);
  const cimento = itens.recursos.find((x) => x.descricao === 'Cimento')!;
  assert.deepEqual({ q: cimento.quantidade_centesimos, e: cimento.valor_estimado_centavos, u: cimento.valor_utilizado_centavos, d: cimento.data_uso }, { q: 250, e: 50000, u: 45000, d: '2026-11-18' });
  assert.equal(itens.recursos.find((x) => x.descricao === 'Diárias')!.valor_estimado_centavos, 123456);
  assert.equal(Number(banco.sqlite.prepare('SELECT count(*) n FROM tarefa_envolvido').get()!.n), 2); // remoção é lógica
  assert.equal(Number(banco.sqlite.prepare('SELECT count(*) n FROM tarefa_recurso WHERE removido_em IS NOT NULL').get()!.n), 1);
  assert.equal(Number(banco.sqlite.prepare('SELECT revisao r FROM cronograma WHERE id = ?').get(cr)!.r), rev());

  const historico = (await repo.historico(projeto)).filter((h) => h.origem === 'cronograma');
  const tipos = new Set(historico.map((h) => h.tipo as string));
  for (const tipo of ['envolvido_incluido', 'envolvido_alterado', 'envolvido_removido', 'recurso_incluido', 'recurso_alterado', 'recurso_removido']) assert.ok(tipos.has(tipo), tipo);
  const porTipo = (tipo: string) => historico.filter((h) => (h.tipo as string) === tipo);
  // Os eventos do teste têm o mesmo instante; a ordem entre eles não vale, por isso se procura pela frase.
  assert.ok(porTipo('envolvido_incluido').some((h) => h.descricao === 'Cronograma «Obra Teste»: tarefa «Primeira»: envolvido Pessoa Teste 2 (Unidade Teste) (Fiscal) incluído.'));
  assert.ok(porTipo('envolvido_incluido').some((h) => h.descricao === 'Cronograma «Obra Teste»: tarefa «Primeira»: envolvido Concessionária Teste incluído.'));
  assert.equal(porTipo('envolvido_removido')[0].motivo, 'Engano');
  assert.equal(porTipo('recurso_alterado')[0].descricao, 'Cronograma «Obra Teste»: tarefa «Primeira»: recurso «Cimento» alterado · Valor utilizado: — → R$ 450,00');
  assert.ok(porTipo('recurso_incluido').some((h) => JSON.stringify(h.campos) === JSON.stringify({ tarefa_id: t1, item_id: r1 })));
  for (const h of historico) assert.ok(!(h.descricao ?? '').includes('Observação secreta de teste'));
  assert.equal((await repo.listarHistorico()).filter((h) => (h.tipo as string).startsWith('recurso_')).length, 5); // o log aceita o campo objeto
});

test('abuso: perfil leitura, revisão velha, item de outra tarefa, limite, outra prefeitura, responsável, valor inválido e tarefa removida', async (t) => {
  const { banco, repo, c, cr, t1, t2, g, rev } = await montarDoZero(t);
  const e1 = (await g({ acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { nome: 'Pessoa Teste 2' } })).item_id!;
  const inc = (revisao: number, envolvido: Record<string, unknown> = { nome: 'Pessoa Teste 3' }) => ({ revisao, acao: 'incluir_envolvido', tarefa_id: t1, envolvido });

  const leitor: ContextoCronograma = { ...c, usuario: usuario('leitura') };
  assert.equal(status(await gravarCronograma(leitor, cr, inc(rev()), RELOGIO)), 403);
  assert.deepEqual({ ...(await gravarCronograma(c, cr, inc(rev() - 1), RELOGIO)) }, { ok: false, status: 409, erro: SEM_MUDAR });

  const alheio = await gravarCronograma(c, cr, { revisao: rev(), acao: 'editar_envolvido', tarefa_id: t2, item_id: e1, envolvido: { nome: 'Outro Nome' } }, RELOGIO);
  assert.equal(status(alheio), 404);
  assert.equal((alheio as { erro: string }).erro, 'Envolvido não encontrado.');
  assert.equal(banco.sqlite.prepare('SELECT nome FROM tarefa_envolvido WHERE id = ?').get(e1)!.nome, 'Pessoa Teste 2');
  assert.equal((await gravarCronograma(c, cr, { revisao: rev(), acao: 'remover_recurso', tarefa_id: t1, item_id: 'R-' + UUID_FALSO }, RELOGIO) as { erro: string }).erro, 'Recurso não encontrado.');

  const responsavel = await gravarCronograma(c, cr, inc(rev(), { nome: 'pessoa teste 1' }), RELOGIO);
  assert.equal(status(responsavel), 400);
  assert.deepEqual(erros(responsavel), ['Esta pessoa já é a responsável pela tarefa.']);
  const valor = await gravarCronograma(c, cr, { revisao: rev(), acao: 'incluir_recurso', tarefa_id: t1, recurso: { tipo: 'material', descricao: 'X', valor_estimado: '1,5e3' } }, RELOGIO);
  assert.equal(status(valor), 400);
  assert.deepEqual(erros(valor), ['Valor estimado: use um valor como 1.234,56 (até R$ 10 bilhões).']);

  for (let i = 0; i < 49; i++) await g({ acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { nome: `Pessoa Lote ${i}` } });
  const cheio = await gravarCronograma(c, cr, inc(rev()), RELOGIO);
  assert.equal(status(cheio), 400);
  assert.deepEqual(erros(cheio), ['Limite de 50 envolvidos por tarefa.']);

  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Outra', 'GO')").run();
  const outraRepo = repositorioD1ParaTestes(banco.db, 1);
  const outra: ContextoCronograma = { usuario: usuario('editor', 1), repositorio: comInvalidacao(outraRepo, 1) };
  const total = () => Number(banco.sqlite.prepare('SELECT count(*) n FROM tarefa_envolvido').get()!.n);
  const n = total();
  assert.equal(status(await gravarCronograma(outra, cr, inc(rev()), RELOGIO)), 404);
  assert.equal(total(), n);
  assert.deepEqual(await outraRepo.listarItensCronograma!(cr), { envolvidos: [], recursos: [] });

  await g({ acao: 'remover_tarefa', tarefa_id: t1, motivo: 'Duplicada' });
  const removida = await gravarCronograma(c, cr, inc(rev()), RELOGIO);
  assert.equal(status(removida), 404);
  assert.equal((removida as { erro: string }).erro, 'Tarefa não encontrada.');
  assert.deepEqual(await repo.listarItensCronograma!(cr), { envolvidos: [], recursos: [] });
  assert.equal(total(), n); // o banco guarda
});

test('erro do banco que escapa das regras vira 400 "Dados inválidos." sem dados no aviso (nunca 500)', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  const avisos: unknown[][] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => { avisos.push(a); };
  t.after(() => { console.warn = original; });
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(PREF);
  banco.sqlite.prepare("INSERT INTO cronograma (prefeitura_id, id, titulo) VALUES (?, 'C-q', 'Q')").run(PREF);
  banco.sqlite.prepare("INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, fase, nome) VALUES (?, 'C-q#1', 'C-q', 1, 'F', 'T')").run(PREF);
  const quebrado = { prepare: banco.db.prepare.bind(banco.db), batch: async () => { throw new Error('CHECK constraint failed: tarefa_recurso'); } };
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repositorioD1ParaTestes(quebrado as typeof banco.db, PREF), PREF) };
  const r = await gravarCronograma(c, 'C-q', { revisao: 0, acao: 'incluir_recurso', tarefa_id: 'C-q#1', recurso: { tipo: 'material', descricao: 'Dado sensível de teste' } }, RELOGIO);
  assert.deepEqual({ ...r }, { ok: false, status: 400, erro: 'Dados inválidos.', erros: ['Dados inválidos.'] });
  assert.deepEqual(avisos, [['[cronograma] item de tarefa recusado pelo banco']]);
});

test('teto total da tarefa (ativos + removidos) no banco vira 400 com a mensagem de nova tarefa', async (t) => {
  const { banco, c, cr, t1, rev } = await montarDoZero(t);
  const ins = banco.sqlite.prepare("INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,nome,criado_por,criado_em) VALUES (?,?,?,?,?,'a','2026-11-23T12:00:00.000Z')");
  const remove = banco.sqlite.prepare("UPDATE tarefa_envolvido SET removido_em = '2026-11-23T12:00:00.000Z', removido_por = 'a' WHERE tarefa_id = ? AND removido_em IS NULL");
  for (let lote = 0; lote < 4; lote++) {
    for (let i = 0; i < 50; i++) ins.run(PREF, `E-teto-${lote}-${i}`, cr, t1, `P${lote}-${i}`);
    remove.run(t1);
  }
  const r = await gravarCronograma(c, cr, { revisao: rev(), acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { nome: 'Pessoa Nova' } }, RELOGIO);
  assert.equal(status(r), 400);
  assert.equal((r as { erro: string }).erro, 'Esta tarefa chegou ao limite de registros de envolvidos ou recursos; crie uma nova tarefa para continuar.');
});

test('base carregada: gravar item congela o cronograma para a planilha; a carga não apaga tarefa nem item e sobe a revisão só do não editado', async (t) => {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  carregarExemplo(banco.sqlite);
  const repo = repositorioD1ParaTestes(banco.db, PREF);
  const c: ContextoCronograma = { usuario: usuario(), repositorio: comInvalidacao(repo, PREF) };
  const tarefaId = 'C-exemplo-001#10';
  const revisao = (id: string) => Number(banco.sqlite.prepare('SELECT revisao r FROM cronograma WHERE id = ?').get(id)!.r);
  assert.equal(banco.sqlite.prepare("SELECT editado_na_tela e FROM cronograma WHERE id = 'C-exemplo-001'").get()!.e, 0);
  const r = ok(await gravarCronograma(c, 'C-exemplo-001', { revisao: 0, acao: 'incluir_recurso', tarefa_id: tarefaId, recurso: { tipo: 'material', descricao: 'Cimento', quantidade: '10', unidade: 'sacos' } }, RELOGIO));
  assert.equal(r.revisao, 1);
  assert.equal(banco.sqlite.prepare("SELECT editado_na_tela e FROM cronograma WHERE id = 'C-exemplo-001'").get()!.e, 1);
  const n001 = Number(banco.sqlite.prepare("SELECT count(*) n FROM etapa_cronograma WHERE cronograma_id = 'C-exemplo-001'").get()!.n);
  const rev002 = revisao('C-exemplo-002');
  carregarExemplo(banco.sqlite); // a planilha roda de novo
  assert.equal(Number(banco.sqlite.prepare("SELECT count(*) n FROM etapa_cronograma WHERE cronograma_id = 'C-exemplo-001'").get()!.n), n001);
  assert.equal(Number(banco.sqlite.prepare('SELECT count(*) n FROM tarefa_recurso WHERE tarefa_id = ?').get(tarefaId)!.n), 1);
  assert.equal(revisao('C-exemplo-001'), 1); // editado na tela: a carga não mexe
  assert.equal(revisao('C-exemplo-002'), rev002 + 1); // não editado: a carga sobe a revisão em 1
  // Uma gravação baseada em leitura anterior à carga recebe 409.
  const primeira = (await repo.obterCronograma!('C-exemplo-002'))!.cronograma.fases.flatMap((f) => f.etapas)[0].id!;
  const velha = await gravarCronograma(c, 'C-exemplo-002', { revisao: rev002, acao: 'incluir_recurso', tarefa_id: primeira, recurso: { tipo: 'material', descricao: 'X' } }, RELOGIO);
  assert.equal(status(velha), 409);
});

test('o envolvido não entra no tempo na mão nem no painel Responsáveis', async (t) => {
  const { repo, t1, t2, g } = await montarDoZero(t);
  await g({ acao: 'editar_tarefa', tarefa_id: t1, campos: { inicio_real: '2026-11-10' } });
  const painel = async () => montarPainel(await repo.listarCronogramas(), '2026-11-20', new Map(), new URLSearchParams());
  const antes = await painel();
  await g({ acao: 'incluir_envolvido', tarefa_id: t1, envolvido: { nome: 'Pessoa Envolvida Teste', area: 'Área Envolvida Teste' } });
  await g({ acao: 'incluir_envolvido', tarefa_id: t2, envolvido: { nome: 'Outra Pessoa Envolvida' } });
  const depois = await painel();
  assert.deepEqual(depois, antes);
  const texto = JSON.stringify(depois);
  for (const nome of ['Pessoa Envolvida Teste', 'Área Envolvida Teste', 'Outra Pessoa Envolvida']) assert.ok(!texto.includes(nome));
});
