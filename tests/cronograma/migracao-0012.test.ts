// Migração 0012 (E20): envolvidos e recursos da tarefa. Porte dos casos do script validado pela Opus (inclusive o bloco "Delta 1").
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const PASTA = 'db/d1/prefeitura/';
const T = "'2026-11-23T12:00:00.000Z'";
const R = 'INSERT INTO tarefa_recurso (prefeitura_id,id,cronograma_id,tarefa_id,tipo,descricao,quantidade_centesimos,unidade,valor_estimado_centavos,valor_utilizado_centavos,data_uso,criado_por,criado_em) VALUES ';
const ENV = 'INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,nome,criado_por,criado_em) VALUES ';

/** 0001-0011 com dados antigos; devolve também a contagem de tarefas antes da 0012 (a 0012 não pode alterá-las). */
function banco() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(PASTA).filter((n) => n.endsWith('.sql') && n < '0012').sort()) db.exec(readFileSync(PASTA + f, 'utf8'));
  db.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO'), (2, 'Outra', 'GO')");
  db.exec("INSERT INTO cronograma (prefeitura_id, id, aba, titulo) VALUES (1, 'C-x', 'A', 'Obra'), (1, 'C-y', 'B', 'Outra'), (2, 'C-x', 'A', 'Obra P2')");
  db.exec("INSERT INTO etapa_cronograma (prefeitura_id, id, cronograma_id, ordem, fase, nome) VALUES (1,'C-x#1','C-x',1,'F','T1'),(1,'C-x#2','C-x',2,'F','T2'),(1,'C-y#1','C-y',1,'F','Ty'),(2,'C-x#1','C-x',1,'F','P2')");
  const antes = Number(db.prepare('SELECT count(*) n FROM etapa_cronograma').get()!.n);
  db.exec(readFileSync(PASTA + '0012_envolvidos_recursos_tarefa.sql', 'utf8'));
  const ok = (sql: string) => db.exec(sql);
  const recusa = (sql: string, re: RegExp) => assert.throws(() => db.exec(sql), re, sql);
  return { db, antes, ok, recusa };
}

test('0012: aplica sobre 0001-0011 sem alterar as tarefas existentes', () => {
  const { db, antes } = banco();
  assert.equal(Number(db.prepare('SELECT count(*) n FROM etapa_cronograma').get()!.n), antes);
  db.close();
});

test('0012: envolvido — aceites e recusas, chave e autoria fixas, remoção lógica, sem DELETE', () => {
  const { db, ok, recusa } = banco();
  ok(`INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,nome,area,papel,criado_por,criado_em) VALUES (1,'E-00000001','C-x','C-x#1','Pessoa Teste','Unidade','Apoio','a@exemplo.invalid',${T})`);
  recusa(`INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,criado_por,criado_em) VALUES (1,'E-00000002','C-x','C-x#1','a',${T})`, /CHECK/);
  recusa(`${ENV}(1,'E-00000003','C-x','C-x#1','   ','a',${T})`, /CHECK/);
  recusa(`${ENV}(1,'E-00000004','C-x','C-y#1','P','a',${T})`, /não pertence/);
  recusa(`${ENV}(2,'E-00000005','C-x','C-x#2','P','a',${T})`, /não pertence|FOREIGN/);
  recusa(`${ENV}(9,'E-00000006','C-x','C-x#1','P','a',${T})`, /não pertence|FOREIGN/);
  recusa(`${ENV}(1,'X-00000007','C-x','C-x#1','P','a',${T})`, /CHECK/);
  recusa(`${ENV}(1,'E-00000008','C-x','C-x#1','P','a','2026-13-40T99:00:00Z')`, /CHECK/);
  recusa(`${ENV}(1,'E-00000009','C-x','C-x#1','P','a','ontem')`, /CHECK/);
  recusa(`INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,nome,criado_por,criado_em,removido_em,removido_por) VALUES (1,'E-00000010','C-x','C-x#1','P','a',${T},${T},'a')`, /Limite/);
  recusa("UPDATE tarefa_envolvido SET tarefa_id='C-x#2' WHERE id='E-00000001'", /não mudam/);
  recusa("UPDATE tarefa_envolvido SET prefeitura_id=2 WHERE id='E-00000001'", /não mudam/);
  recusa("UPDATE tarefa_envolvido SET criado_por='outro' WHERE id='E-00000001'", /não mudam/);
  ok(`UPDATE tarefa_envolvido SET papel='Fiscal', atualizado_por='a', atualizado_em=${T} WHERE prefeitura_id=1 AND id='E-00000001'`);
  recusa("UPDATE tarefa_envolvido SET atualizado_por=NULL WHERE id='E-00000001'", /CHECK/);
  recusa("DELETE FROM tarefa_envolvido WHERE id='E-00000001'", /não se apaga/);
  recusa(`UPDATE tarefa_envolvido SET removido_em=${T} WHERE id='E-00000001'`, /CHECK/);
  ok(`UPDATE tarefa_envolvido SET removido_em=${T}, removido_por='a', motivo_remocao='engano' WHERE id='E-00000001'`);
  recusa('UPDATE tarefa_envolvido SET removido_em=NULL, removido_por=NULL WHERE id=\'E-00000001\'', /removido não muda/);
  recusa("UPDATE tarefa_envolvido SET papel='x' WHERE id='E-00000001'", /removido não muda/);
  db.close();
});

test('0012: limite de 50 envolvidos ativos e teto total de 200 (ativos + removidos) por tarefa', () => {
  const { db } = banco();
  const ins = db.prepare("INSERT INTO tarefa_envolvido (prefeitura_id,id,cronograma_id,tarefa_id,nome,criado_por,criado_em) VALUES (1,?,'C-x','C-x#2',?,'a','2026-11-23T12:00:00.000Z')");
  for (let i = 0; i < 50; i++) ins.run(`E-lim-${String(i).padStart(4, '0')}`, `P${i}`);
  assert.throws(() => ins.run('E-lim-9999', 'P50'), /Limite/);
  for (let i = 0; i < 50; i++) db.exec(`UPDATE tarefa_envolvido SET removido_em=${T}, removido_por='a' WHERE id='E-lim-${String(i).padStart(4, '0')}'`);
  for (let i = 0; i < 150; i++) {
    ins.run(`E-tot-${String(i).padStart(4, '0')}`, `Q${i}`);
    if (i % 50 === 49) db.exec(`UPDATE tarefa_envolvido SET removido_em=${T}, removido_por='a' WHERE tarefa_id='C-x#2' AND removido_em IS NULL`);
  }
  assert.throws(() => ins.run('E-tot-9999', 'Z'), /Limite/);
  db.close();
});

test('0012: limite de 200 recursos ativos por tarefa', () => {
  const { db } = banco();
  const ins = db.prepare("INSERT INTO tarefa_recurso (prefeitura_id,id,cronograma_id,tarefa_id,tipo,descricao,criado_por,criado_em) VALUES (1,?,'C-x','C-x#2','material',?,'a','2026-11-23T12:00:00.000Z')");
  for (let i = 0; i < 200; i++) ins.run(`R-lim-${String(i).padStart(4, '0')}`, `Item ${i}`);
  assert.throws(() => ins.run('R-lim-9999', 'Item 200'), /Limite/);
  db.close();
});

test('0012: recurso — tipos, valores inteiros e faixas, quantidade, unidade, data, outro cronograma, sem DELETE', () => {
  const { db, ok, recusa } = banco();
  ok(R + `(1,'R-00000001','C-x','C-x#1','material','Cimento',1000,'sacos',500000,NULL,'2026-11-20','a',${T})`);
  ok(R + `(1,'R-00000002','C-x','C-x#1','financeiro','Diárias',NULL,NULL,NULL,0,NULL,'a',${T})`);
  ok(R + `(1,'R-00000003','C-x','C-x#1','humano','Engenheiro',4000,'horas',NULL,NULL,NULL,'a',${T})`);
  recusa(R + `(1,'R-00000004','C-x','C-x#1','outro','X',NULL,NULL,NULL,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000005','C-x','C-x#1','financeiro','Sem valor',NULL,NULL,NULL,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000006','C-x','C-x#1','material','Float',NULL,NULL,10.5,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000007','C-x','C-x#1','material','Texto',NULL,NULL,'abc',NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000008','C-x','C-x#1','material','Teto',NULL,NULL,1000000000001,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000009','C-x','C-x#1','material','Negativo',NULL,NULL,-1,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000010','C-x','C-x#1','material','Qtd zero',0,NULL,NULL,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000011','C-x','C-x#1','material','Unidade sem qtd',NULL,'kg',NULL,NULL,NULL,'a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000012','C-x','C-x#1','material','Data',NULL,NULL,NULL,NULL,'2026-02-30','a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000013','C-x','C-x#1','material','Data',NULL,NULL,NULL,NULL,'1999-12-31','a',${T})`, /CHECK/);
  recusa(R + `(1,'R-00000014','C-x','C-x#1','material','${'x'.repeat(201)}',NULL,NULL,NULL,NULL,NULL,'a',${T})`, /CHECK/);
  ok(R + `(1,'R-00000015','C-x','C-x#1','material','Teto exato',NULL,NULL,1000000000000,1000000000000,NULL,'a',${T})`);
  recusa(R + `(1,'R-00000016','C-x','C-y#1','material','Outro crono',NULL,NULL,NULL,NULL,NULL,'a',${T})`, /não pertence/);
  recusa(`UPDATE tarefa_recurso SET valor_utilizado_centavos = 1.5, atualizado_por='a', atualizado_em=${T} WHERE id='R-00000001'`, /CHECK/);
  ok(`UPDATE tarefa_recurso SET valor_utilizado_centavos = 450000, atualizado_por='a', atualizado_em=${T} WHERE id='R-00000001'`);
  recusa("UPDATE tarefa_recurso SET tipo='financeiro', valor_estimado_centavos=NULL, valor_utilizado_centavos=NULL WHERE id='R-00000003'", /CHECK/);
  recusa('DELETE FROM tarefa_recurso', /não se apaga/);
  db.close();
});

test('0012: tarefa removida não aceita nem altera itens; a carga não apaga tarefa com itens (FK) e apaga a sem itens', () => {
  const { db, ok, recusa } = banco();
  ok(R + `(1,'R-00000001','C-x','C-x#1','material','Cimento',1000,'sacos',500000,NULL,'2026-11-20','a',${T})`);
  ok(`${ENV}(1,'E-00000001','C-x','C-x#2','Pessoa Teste','a',${T})`);
  ok(`UPDATE etapa_cronograma SET removida_em=${T}, removida_por='a' WHERE prefeitura_id=1 AND id='C-x#1'`);
  recusa(`UPDATE tarefa_recurso SET descricao='x', atualizado_por='a', atualizado_em=${T} WHERE id='R-00000001'`, /não pertence/);
  recusa(R + `(1,'R-00000017','C-x','C-x#1','material','Depois',NULL,NULL,NULL,NULL,NULL,'a',${T})`, /não pertence/);
  recusa("DELETE FROM etapa_cronograma WHERE prefeitura_id=1 AND id='C-x#2'", /FOREIGN/);
  db.exec("DELETE FROM etapa_cronograma WHERE prefeitura_id=1 AND id='C-y#1'");
  db.close();
});

test('0012 (Delta 1): atualizado_em/removido_em terminam em Z com tamanho e data reais; autores não vazios', () => {
  const { db, ok, recusa } = banco();
  ok(`${ENV}(2,'E-delta001','C-x','C-x#1','Pessoa Teste','a',${T})`);
  ok(R + `(1,'R-delta001','C-x','C-x#2','material','Areia',NULL,NULL,NULL,NULL,NULL,'a',${T})`);
  for (const [tab, id, pref] of [['tarefa_envolvido', 'E-delta001', 2], ['tarefa_recurso', 'R-delta001', 1]] as const) {
    const onde = `WHERE prefeitura_id=${pref} AND id='${id}'`;
    recusa(`UPDATE ${tab} SET atualizado_por='a', atualizado_em='2026-11-23 12:00:00' ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET atualizado_por='a', atualizado_em='2026-11-23T12:00:00' ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET atualizado_por='a', atualizado_em='2026-11-23T25:00:00.000Z' ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET atualizado_por='   ', atualizado_em=${T} ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET atualizado_por='', atualizado_em=${T} ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET removido_por='a', removido_em='ontem' ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET removido_por='a', removido_em='2026-11-23T12:00:00.000+03:00' ${onde}`, /CHECK/);
    recusa(`UPDATE ${tab} SET removido_por=' ', removido_em=${T} ${onde}`, /CHECK/);
    ok(`UPDATE ${tab} SET atualizado_por='b', atualizado_em='2026-11-23T13:00:00Z' ${onde}`);
    ok(`UPDATE ${tab} SET removido_por='b', removido_em='2026-11-23T14:00:00.123Z' ${onde}`);
  }
  db.close();
});

test('0012: a soma de 200 recursos de 1e12 passa de 2^53 no SQLite sem erro e as consultas usam os índices novos', () => {
  const { db } = banco();
  const ins = db.prepare("INSERT INTO tarefa_recurso (prefeitura_id,id,cronograma_id,tarefa_id,tipo,descricao,valor_estimado_centavos,criado_por,criado_em) VALUES (1,?,'C-x','C-x#1','material','Item',1000000000000,'a','2026-11-23T12:00:00.000Z')");
  for (let i = 0; i < 200; i++) ins.run(`R-soma-${String(i).padStart(4, '0')}`);
  const soma = db.prepare('SELECT sum(valor_estimado_centavos) s FROM tarefa_recurso');
  soma.setReadBigInts(true);
  assert.equal(soma.get()!.s, 200_000_000_000_000n);
  const plano = (sql: string) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => String(r.detail)).join(' | ');
  assert.match(plano("SELECT count(*) FROM tarefa_recurso WHERE prefeitura_id=1 AND tarefa_id='C-x#1' AND removido_em IS NULL"), /USING (COVERING )?INDEX/);
  assert.match(plano("SELECT * FROM tarefa_recurso r WHERE r.prefeitura_id=1 AND r.cronograma_id='C-x' AND r.removido_em IS NULL"), /USING (COVERING )?INDEX/);
  assert.match(plano("SELECT * FROM tarefa_envolvido r WHERE r.prefeitura_id=1 AND r.cronograma_id='C-x' AND r.removido_em IS NULL"), /USING (COVERING )?INDEX/);
  db.close();
});
