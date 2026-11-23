import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizarOrdem, planejar, type EstadoCronograma, type OperacaoCronograma, type TarefaAtual } from '../../src/lib/cronograma/planejar.ts';

const HOJE = '2026-11-20';
let seq = 0;
const ctx = () => ({ autor: 'a@exemplo.invalid', agora: '2026-11-20T12:00:00.000Z', hoje: HOJE, novoId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` });
const tarefa = (id: string, ordem: number, fase: string, p: Partial<TarefaAtual> = {}): TarefaAtual => ({
  id, ordem, fase, nome: `Tarefa ${id}`, duracao_prevista: null, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null,
  unidade: null, responsavel: null, ultima_troca: null, tem_trocas: false, ...p,
});
const estado = (tarefas: TarefaAtual[]): EstadoCronograma => ({ id: 'C-x', titulo: 'Obra Teste', projeto_id: 'P-1', revisao: 0, tarefas });
const base = () => estado([tarefa('a', 1, 'F1'), tarefa('b', 2, 'F1'), tarefa('c', 3, 'F2')]);
const erro = (r: ReturnType<typeof planejar>) => (r.ok ? 'ok' : `${r.codigo}:${r.erro}`);
const novaTarefa = (p: object = {}) => ({ nome: 'Nova', fase: 'F1', duracao_prevista: null, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, responsavel: null, unidade: null, ...p });

test('normalizarOrdem: fases contíguas na ordem da primeira aparição, estável', () => {
  const r = normalizarOrdem([{ id: '1', fase: 'A' }, { id: '2', fase: 'B' }, { id: '3', fase: 'A' }, { id: '4', fase: 'b ' }]);
  assert.deepEqual(r, [{ id: '1', ordem: 1 }, { id: '3', ordem: 2 }, { id: '2', ordem: 3 }, { id: '4', ordem: 4 }]);
});

test('incluir: cai depois da última da fase; fase nova vai ao fim; troca inicial só com responsável', () => {
  const r = planejar(base(), { acao: 'incluir_tarefa', tarefa: novaTarefa({ responsavel: 'Pessoa Teste 1', unidade: 'Unidade Teste' }) }, ctx());
  assert.ok(r.ok);
  const id = r.tarefa_id!;
  assert.match(id, /^T-/);
  assert.deepEqual(r.plano.ordens.map((o) => o.id), ['a', 'b', id, 'c']);
  assert.equal(r.plano.inserir!.ordem, 3);
  assert.equal(r.plano.troca!.tipo, 'inicial');
  assert.equal(r.plano.troca!.desde, HOJE);
  assert.equal(r.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Nova» incluída na fase «F1», com Pessoa Teste 1 (Unidade Teste).');
  const nova = planejar(base(), { acao: 'incluir_tarefa', tarefa: novaTarefa({ fase: 'F3', inicio_real: '2026-11-01' }) }, ctx());
  assert.ok(nova.ok);
  assert.equal(nova.plano.inserir!.ordem, 4);
  assert.equal(nova.plano.troca, undefined);
  const comInicio = planejar(base(), { acao: 'incluir_tarefa', tarefa: novaTarefa({ inicio_real: '2026-11-01', responsavel: 'Pessoa Teste 1' }) }, ctx());
  assert.ok(comInicio.ok);
  assert.equal(comInicio.plano.troca!.desde, '2026-11-01');
});

test('mensagens de validação da tarefa', () => {
  const inc = (p: object) => erro(planejar(base(), { acao: 'incluir_tarefa', tarefa: novaTarefa(p) }, ctx()));
  assert.equal(inc({ nome: '  ' }), 'invalido:Nome: obrigatório.');
  assert.equal(inc({ fase: '' }), 'invalido:Fase: obrigatória.');
  assert.equal(inc({ inicio_previsto: '2026-05-10', fim_previsto: '2026-05-01' }), 'invalido:Fim previsto antes do início previsto.');
  assert.equal(inc({ inicio_real: '2026-05-10', fim_real: '2026-05-01' }), 'invalido:Fim real antes do início real.');
  assert.equal(inc({ fim_real: '2026-05-01' }), 'invalido:Informe o início real antes de concluir.');
  assert.equal(inc({ inicio_real: '2026-12-01' }), 'invalido:Início real no futuro.');
  assert.equal(inc({ inicio_real: '2026-11-01', fim_real: '2026-12-01' }), 'invalido:Fim real no futuro.');
  const cheio = estado(Array.from({ length: 500 }, (_, i) => tarefa(`t${i}`, i + 1, 'F')));
  assert.equal(erro(planejar(cheio, { acao: 'incluir_tarefa', tarefa: novaTarefa() }, ctx())), 'invalido:Limite de 500 tarefas por cronograma.');
});

test('editar: sem mudança, inexistente, descrição com antes e depois, concluída e reaberta', () => {
  const e = estado([tarefa('a', 1, 'F1', { nome: 'Projeto Teste', inicio_real: '2026-11-01' }), tarefa('b', 2, 'F1')]);
  assert.equal(erro(planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { nome: ' Projeto Teste ' } }, ctx())), 'sem_mudanca:Nada mudou.');
  assert.equal(erro(planejar(e, { acao: 'editar_tarefa', tarefa_id: 'zz', campos: { nome: 'X' } }, ctx())), 'inexistente:Tarefa não encontrada.');
  const concl = planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { fim_real: '2026-11-10', duracao_prevista: 9 } }, ctx());
  assert.ok(concl.ok);
  assert.deepEqual(concl.plano.atualizar, { id: 'a', campos: { duracao_prevista: 9, fim_real: '2026-11-10' } });
  assert.deepEqual(concl.plano.ordens, []);
  assert.equal(concl.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Projeto Teste» alterada · Duração prevista (dias): — → 9; Fim real: — → 10/11/2026 (tarefa concluída)');
  const fechada = estado([tarefa('a', 1, 'F1', { inicio_real: '2026-11-01', fim_real: '2026-11-10' })]);
  const reab = planejar(fechada, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { fim_real: null } }, ctx());
  assert.ok(reab.ok);
  assert.match(reab.plano.evento.descricao, /\(tarefa reaberta\)$/);
});

test('editar: mudar a fase leva ao fim da nova fase', () => {
  const r = planejar(base(), { acao: 'editar_tarefa', tarefa_id: 'a', campos: { fase: 'F2' } }, ctx());
  assert.ok(r.ok);
  assert.deepEqual(r.plano.ordens.map((o) => o.id), ['b', 'c', 'a']);
});

test('editar: fim real não pode ser antes da última troca', () => {
  const e = estado([tarefa('a', 1, 'F1', { inicio_real: '2026-11-01', ultima_troca: '2026-11-10', tem_trocas: true })]);
  assert.equal(erro(planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { fim_real: '2026-11-05' } }, ctx())), 'invalido:O fim real não pode ser antes da última troca de responsável (10/11/2026).');
});

test('editar valida só o que foi alterado: dado antigo inválido não impede mudar o nome (Delta 1, item 7)', () => {
  const velha = tarefa('a', 1, 'F1', { inicio_real: '2026-11-10', fim_real: '2026-11-01' });
  const e = estado([velha]);
  const r = planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { nome: 'Novo nome' } }, ctx());
  assert.ok(r.ok);
  // Mexer no fim real com o início antigo já inválido: diz qual campo antigo corrigir.
  assert.equal(erro(planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { fim_real: '2026-11-02' } }, ctx())), 'invalido:Início real (dado antigo) está depois do fim informado: corrija o início real.');
  // Corrigindo o início, passa.
  assert.ok(planejar(e, { acao: 'editar_tarefa', tarefa_id: 'a', campos: { inicio_real: '2026-10-30' } }, ctx()).ok);
});

test('trocar responsável: regras de data, concluída, igual e tipo inicial', () => {
  const troca = (t: TarefaAtual, p: Partial<Extract<OperacaoCronograma, { acao: 'trocar_responsavel' }>> = {}) =>
    planejar(estado([t]), { acao: 'trocar_responsavel', tarefa_id: t.id, para_responsavel: 'Pessoa Teste 2', para_unidade: null, desde: HOJE, motivo: null, ...p }, ctx());
  const aberta = tarefa('a', 1, 'F1', { responsavel: 'Pessoa Teste 1', unidade: 'Unidade Teste', inicio_real: '2026-11-01' });
  assert.equal(erro(troca({ ...aberta, fim_real: '2026-11-05' })), 'invalido:Tarefa concluída: apague o fim real para reabrir antes de trocar o responsável.');
  assert.equal(erro(troca(aberta, { desde: '2026-11-21' })), 'invalido:A data da troca não pode ser no futuro.');
  assert.equal(erro(troca({ ...aberta, ultima_troca: '2026-11-10', tem_trocas: true }, { desde: '2026-11-09' })), 'invalido:A data da troca não pode ser antes da última troca (10/11/2026).');
  assert.equal(erro(troca(aberta, { desde: '2026-10-31' })), 'invalido:A data da troca não pode ser antes do início real da tarefa (01/11/2026).');
  assert.equal(erro(troca({ ...aberta, inicio_real: null }, { desde: '1999-12-31' })), 'invalido:Data da troca inválida.');
  assert.equal(erro(troca(aberta, { para_responsavel: ' pessoa  TESTE 1', para_unidade: 'unidade teste' })), 'invalido:O responsável e a área informados já são os atuais.');
  const ok = troca(aberta, { para_unidade: 'Outra Unidade', motivo: 'Motivo teste' });
  assert.ok(ok.ok);
  assert.equal(ok.plano.troca!.tipo, 'troca');
  assert.equal(ok.plano.troca!.de_responsavel, 'Pessoa Teste 1');
  assert.equal(ok.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Tarefa a» passou de Pessoa Teste 1 (Unidade Teste) para Pessoa Teste 2 (Outra Unidade) a partir de 20/11/2026.');
  assert.equal(ok.plano.evento.motivo, 'Motivo teste');
  const sem = troca(tarefa('b', 1, 'F1'));
  assert.ok(sem.ok);
  assert.equal(sem.plano.troca!.tipo, 'inicial');
  assert.equal(sem.plano.troca!.de_responsavel, null);
  assert.match(sem.plano.evento.descricao, /passou de sem responsável para Pessoa Teste 2/);
});

test('reordenar: exige permutação exata e recusa sem mudança', () => {
  assert.equal(erro(planejar(base(), { acao: 'reordenar', ids: ['a', 'b'] }, ctx())), 'invalido:A lista de tarefas mudou. Recarregue a página e tente de novo.');
  assert.equal(erro(planejar(base(), { acao: 'reordenar', ids: ['a', 'a', 'c'] }, ctx())), 'invalido:A lista de tarefas mudou. Recarregue a página e tente de novo.');
  assert.equal(erro(planejar(base(), { acao: 'reordenar', ids: ['a', 'b', 'x'] }, ctx())), 'invalido:A lista de tarefas mudou. Recarregue a página e tente de novo.');
  assert.equal(erro(planejar(base(), { acao: 'reordenar', ids: ['a', 'b', 'c'] }, ctx())), 'sem_mudanca:Nada mudou.');
  const r = planejar(base(), { acao: 'reordenar', ids: ['b', 'a', 'c'] }, ctx());
  assert.ok(r.ok);
  assert.deepEqual(r.plano.ordens, [{ id: 'b', ordem: 1 }, { id: 'a', ordem: 2 }, { id: 'c', ordem: 3 }]);
  assert.equal(r.plano.evento.descricao, 'Cronograma «Obra Teste»: ordem das tarefas alterada.');
});

test('remover: renumera as restantes; a única tarefa deixa ordens vazias', () => {
  const r = planejar(base(), { acao: 'remover_tarefa', tarefa_id: 'a', motivo: 'Duplicada' }, ctx());
  assert.ok(r.ok);
  assert.deepEqual(r.plano.ordens, [{ id: 'b', ordem: 1 }, { id: 'c', ordem: 2 }]);
  assert.deepEqual(r.plano.remover, { id: 'a', motivo: 'Duplicada' });
  assert.equal(r.plano.evento.descricao, 'Cronograma «Obra Teste»: tarefa «Tarefa a» removida.');
  const unica = planejar(estado([tarefa('a', 1, 'F1')]), { acao: 'remover_tarefa', tarefa_id: 'a', motivo: null }, ctx());
  assert.ok(unica.ok);
  assert.deepEqual(unica.plano.ordens, []);
});

test('descrição do evento é cortada em 1000 caracteres', () => {
  const longo = 'x'.repeat(2000);
  const r = planejar(base(), { acao: 'editar_tarefa', tarefa_id: 'a', campos: { nome: longo } }, ctx());
  assert.ok(r.ok);
  assert.equal(Array.from(r.plano.evento.descricao).length, 1000);
  assert.ok(r.plano.evento.descricao.endsWith('…'));
});
