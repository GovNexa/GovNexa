import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const PASTA = 'db/d1/prefeitura/';
const PRE_CHECAGEM = `SELECT count(*) AS invalidas FROM etapa_cronograma WHERE ordem <= 0
 OR (duracao_prevista IS NOT NULL AND duracao_prevista < 0)
 OR (inicio_previsto IS NOT NULL AND date(inicio_previsto) IS NOT inicio_previsto)
 OR (fim_previsto IS NOT NULL AND date(fim_previsto) IS NOT fim_previsto)
 OR (inicio_real IS NOT NULL AND date(inicio_real) IS NOT inicio_real)
 OR (fim_real IS NOT NULL AND date(fim_real) IS NOT fim_real)`;

/** Banco com as migrações 0001 a 0008 (formato antigo), uma prefeitura, o cronograma C-x e 3 etapas. */
function bancoAntigo() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(PASTA).filter((n) => n.endsWith('.sql') && n < '0009').sort()) sqlite.exec(readFileSync(PASTA + f, 'utf8'));
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO')");
  sqlite.exec("INSERT INTO cronograma (prefeitura_id, id, aba, titulo) VALUES (1, 'C-x', 'Aba', 'Obra Teste'), (1, 'C-y', 'Aba2', 'Outra Obra')");
  const e = sqlite.prepare(`INSERT INTO etapa_cronograma (prefeitura_id, cronograma_id, ordem, fase, nome, unidade, responsavel, duracao_prevista, inicio_previsto, fim_previsto, inicio_real, fim_real, status, pendencias)
    VALUES (1, 'C-x', ?, 'Fase A', ?, 'Unidade Teste', 'Pessoa Teste 1', ?, ?, ?, ?, ?, 'a_fazer', '["Sem responsável"]')`);
  e.run(1, 'Etapa 1', 10, '2026-01-01', '2026-01-10', '2026-01-02', null);
  e.run(2, 'Etapa 2', 5, '2026-01-11', '2026-01-15', null, null);
  e.run(3, 'Etapa 3', null, null, null, null, null);
  sqlite.exec("INSERT INTO etapa_cronograma (prefeitura_id, cronograma_id, ordem, fase, nome) VALUES (1, 'C-y', 1, 'Fase', 'Tarefa de outro cronograma')");
  return sqlite;
}
const migrar = (sqlite: DatabaseSync) => sqlite.exec(readFileSync(PASTA + '0009_cronograma_na_tela.sql', 'utf8'));
const recusa = (sqlite: DatabaseSync, sql: string, padrao: RegExp) => assert.throws(() => sqlite.exec(sql), padrao);

test('0009: aplica sobre 0001-0008 mantendo as tarefas, com código cronograma#ordem', () => {
  const sqlite = bancoAntigo();
  assert.equal(sqlite.prepare(PRE_CHECAGEM).get()!.invalidas, 0);
  const antes = sqlite.prepare("SELECT * FROM etapa_cronograma WHERE cronograma_id = 'C-x' ORDER BY ordem").all();
  migrar(sqlite);
  const depois = sqlite.prepare("SELECT * FROM etapa_cronograma WHERE cronograma_id = 'C-x' ORDER BY ordem").all();
  assert.equal(depois.length, 3);
  assert.deepEqual(depois.map((r) => r.id), ['C-x#1', 'C-x#2', 'C-x#3']);
  for (const [i, a] of antes.entries()) {
    for (const [k, v] of Object.entries(a)) assert.deepEqual(depois[i][k], v, `${k} da tarefa ${i + 1}`);
    assert.equal(depois[i].origem_registro, 'planilha');
    assert.equal(depois[i].removida_em, null);
  }
  const c = sqlite.prepare("SELECT revisao, editado_na_tela, origem_registro FROM cronograma WHERE id = 'C-x'").get()!;
  assert.deepEqual({ ...c }, { revisao: 0, editado_na_tela: 0, origem_registro: 'planilha' });
  sqlite.close();
});

test('0009: dado antigo inválido não derruba a migração; vira NULL e o motivo fica na pendência', () => {
  const sqlite = bancoAntigo();
  sqlite.exec(`INSERT INTO etapa_cronograma (prefeitura_id, cronograma_id, ordem, fase, nome, duracao_prevista, inicio_previsto, fim_previsto, inicio_real, fim_real, pendencias)
    VALUES (1, 'C-x', 4, 'Fase B', 'Tarefa suja', -3, '2026-02-30', '2026-03-10', '2026-03-05', '2026-03-01', '["Antiga"]')`);
  assert.equal(sqlite.prepare(PRE_CHECAGEM).get()!.invalidas, 1);
  migrar(sqlite);
  const t = sqlite.prepare("SELECT * FROM etapa_cronograma WHERE id = 'C-x#4'").get()!;
  assert.equal(t.duracao_prevista, null);
  assert.equal(t.inicio_previsto, null);
  assert.equal(t.fim_previsto, '2026-03-10');
  assert.equal(t.inicio_real, '2026-03-05');
  assert.equal(t.fim_real, null); // fim antes do início: mantém o início, zera o fim
  const pend = JSON.parse(String(t.pendencias)) as string[];
  assert.equal(pend[0], 'Antiga');
  assert.ok(pend.includes('Data não reconhecida na carga: inicio_previsto = 2026-02-30'));
  assert.ok(pend.includes('Duração negativa na carga: duracao_prevista = -3'));
  assert.ok(pend.includes('Fim antes do início na carga: fim_real = 2026-03-01'));
  sqlite.close();
});

test('0009: a checagem só de leitura lista as linhas que serão saneadas', () => {
  const sqlite = bancoAntigo();
  sqlite.exec("INSERT INTO etapa_cronograma (prefeitura_id, cronograma_id, ordem, fase, nome, inicio_real) VALUES (1, 'C-x', 4, 'F', 'Suja', '2026-02-30')");
  const linhas = sqlite.prepare(readFileSync(PASTA + 'checagens/0009-pre.sql', 'utf8')).all();
  assert.deepEqual(linhas.map((l) => ({ ...l })), [{ prefeitura_id: 1, cronograma_id: 'C-x', ordem: 4, campo: 'inicio_real', valor: '2026-02-30' }]);
  sqlite.close();
});

test('0009: atomicidade — dado que a migração não sanea (ordem = 0) faz falhar tudo e nada muda', () => {
  const sqlite = bancoAntigo();
  sqlite.exec("INSERT INTO etapa_cronograma (prefeitura_id, cronograma_id, ordem, fase, nome) VALUES (1, 'C-x', 0, 'F', 'Ordem zero')");
  assert.equal(sqlite.prepare(PRE_CHECAGEM).get()!.invalidas, 1);
  // Mesmo modo do D1: o arquivo da migração roda numa transação só.
  sqlite.exec('BEGIN');
  assert.throws(() => migrar(sqlite), /CHECK constraint failed/);
  sqlite.exec('ROLLBACK');
  const colunas = sqlite.prepare("SELECT name FROM pragma_table_info('etapa_cronograma')").all().map((c) => c.name);
  assert.ok(!colunas.includes('id'), 'formato antigo mantido');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma').get()!.n, 5);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'etapa_cronograma_nova'").get()!.n, 0);
  assert.ok(!sqlite.prepare("SELECT name FROM pragma_table_info('cronograma')").all().some((c) => c.name === 'revisao'));
  sqlite.close();
});

test('0009: o banco recusa data impossível, troca de outro cronograma, alteração do histórico e apagar o que foi editado na tela', () => {
  const sqlite = bancoAntigo();
  migrar(sqlite);
  recusa(sqlite, "UPDATE etapa_cronograma SET inicio_real = '2026-02-30' WHERE id = 'C-x#1'", /CHECK constraint failed/);
  const troca = (id: string, cron: string, tarefa: string) => `INSERT INTO troca_responsavel (prefeitura_id, id, cronograma_id, tarefa_id, tipo, para_responsavel, desde, registrado_por, registrado_em)
    VALUES (1, '${id}', '${cron}', '${tarefa}', 'inicial', 'Pessoa Teste 2', '2026-01-02', 'a@exemplo.invalid', '2026-01-03T10:00:00.000Z')`;
  recusa(sqlite, troca('troca-0001', 'C-x', 'C-y#1'), /Tarefa não pertence ao cronograma/);
  sqlite.exec(troca('troca-0002', 'C-x', 'C-x#1'));
  recusa(sqlite, "UPDATE troca_responsavel SET motivo = 'x'", /Histórico imutável/);
  recusa(sqlite, 'DELETE FROM troca_responsavel', /Histórico imutável/);
  // Tarefa removida não volta; a chave da tarefa não muda.
  sqlite.exec("UPDATE etapa_cronograma SET removida_em = '2026-01-05T10:00:00.000Z', removida_por = 'a@exemplo.invalid' WHERE id = 'C-x#3'");
  recusa(sqlite, "UPDATE etapa_cronograma SET removida_em = NULL WHERE id = 'C-x#3'", /não volta/);
  recusa(sqlite, "UPDATE etapa_cronograma SET id = 'C-x#9' WHERE id = 'C-x#2'", /não mudam/);
  // Cronograma editado na tela: marca fixa e sem apagar.
  sqlite.exec("UPDATE cronograma SET editado_na_tela = 1 WHERE id = 'C-x'");
  recusa(sqlite, "UPDATE cronograma SET editado_na_tela = 0 WHERE id = 'C-x'", /não volta/);
  recusa(sqlite, "DELETE FROM etapa_cronograma WHERE id = 'C-x#2'", /não se apaga/);
  recusa(sqlite, "DELETE FROM cronograma WHERE id = 'C-x'", /não se apaga/);
  sqlite.exec("DELETE FROM etapa_cronograma WHERE id = 'C-y#1'"); // cronograma não editado segue apagável (carga da planilha)
  sqlite.close();
});

test('0009: posição única só entre as tarefas ativas', () => {
  const sqlite = bancoAntigo();
  migrar(sqlite);
  recusa(sqlite, "INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, nome) VALUES (1, 'T-aaaaaaaa', 'C-x', 1, 'Repetida')", /UNIQUE constraint failed/);
  sqlite.exec("UPDATE etapa_cronograma SET removida_em = '2026-01-05T10:00:00.000Z', removida_por = 'a@exemplo.invalid' WHERE id = 'C-x#1'");
  sqlite.exec("INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, nome) VALUES (1, 'T-aaaaaaaa', 'C-x', 1, 'Ocupa a posição da removida')");
  sqlite.close();
});
