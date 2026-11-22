import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { AREAS_PADRAO, areaDoProjeto, codigoDeArea, sugerirArea } from '../../src/lib/carteira/area.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import { bancoTeste } from '../helpers/d1.ts';

const pasta = 'db/d1/prefeitura';
const arquivo = '0007_area_prioritario_catalogo.sql';
const migracao = () => readFileSync(pasta + '/' + arquivo, 'utf8');

test('área: migração 0007 semeia as áreas padrão iguais a AREAS_PADRAO', (t) => {
  const { sqlite } = bancoTeste();
  t.after(() => sqlite.close());
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO')");
  const areas = sqlite.prepare("SELECT codigo, nome, ordem FROM catalogo WHERE prefeitura_id = ? AND tipo = 'area' AND ativo = 1 ORDER BY ordem, nome").all(1);
  assert.deepEqual(areas.map((a) => ({ ...a })), AREAS_PADRAO);
});

test('migração 0007: só acrescenta (ADD/CREATE) e não altera linha existente', (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const nome of readdirSync(pasta).filter((n) => /^\d{4}_.*\.sql$/.test(n) && n < arquivo).sort()) {
    sqlite.exec(readFileSync(pasta + '/' + nome, 'utf8'));
  }
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO')");
  sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (1, 'P-1', 1, 'Obra')");
  sqlite.exec("INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em) VALUES ('e1', 1, 'P-1', 'criado', 'cadastro', 'teste', '2026-11-22T00:00:00Z')");
  sqlite.prepare("INSERT INTO documento (prefeitura_id, projeto_id, id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por) VALUES (1, 'P-1', 'd1', 'teste.pdf', 'teste', 'application/pdf', 1, ?, 'teste')").run('a'.repeat(64));
  const antes = sqlite.prepare('SELECT * FROM projeto').get();
  const eventos = sqlite.prepare('SELECT * FROM evento_projeto').all();
  const documentos = sqlite.prepare('SELECT * FROM documento').all();
  const sql = migracao();
  const semComentarios = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(semComentarios, /\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/i);
  const alteracoes = [...semComentarios.matchAll(/^\s*ALTER TABLE[^\n]*/gim)].map((m) => m[0].trim());
  assert.equal(alteracoes.length, 2);
  for (const alteracao of alteracoes) assert.match(alteracao, /^ALTER TABLE projeto ADD COLUMN /i);
  assert.doesNotMatch(semComentarios, /^\s*INSERT\b(?! OR IGNORE INTO catalogo\b)/im);
  sqlite.exec(sql);
  const { area, prioritario, ...projeto } = sqlite.prepare('SELECT * FROM projeto').get()!;
  assert.deepEqual(projeto, { ...antes });
  assert.equal(area, null);
  assert.equal(prioritario, 0);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM catalogo WHERE prefeitura_id = 1 AND tipo = 'area'").get()?.n, 11);
  assert.deepEqual(sqlite.prepare('SELECT * FROM evento_projeto').all(), eventos);
  assert.deepEqual(sqlite.prepare('SELECT * FROM documento').all(), documentos);
  assert.equal(sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('área: catálogo não apaga, não troca chave e prioritario só 0/1', (t) => {
  const { sqlite } = bancoTeste();
  t.after(() => sqlite.close());
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO'), (2, 'Outra', 'GO')");
  assert.throws(() => sqlite.exec("DELETE FROM catalogo WHERE prefeitura_id = 1 AND codigo = 'saude'"), /não se apaga/);
  for (const campo of ["codigo = 'nova'", "tipo = 'regiao'", 'prefeitura_id = 2']) {
    assert.throws(() => sqlite.exec("UPDATE catalogo SET " + campo + " WHERE prefeitura_id = 1 AND codigo = 'saude'"), /não mudam/);
  }
  const inserir = sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, area, prioritario) VALUES (1, 'P-1', 1, 'Obra', ?, ?)");
  assert.throws(() => inserir.run('nada', 0), /Área inválida/);
  assert.throws(() => inserir.run('saude', 2), /CHECK constraint failed/);
  sqlite.exec("UPDATE catalogo SET ativo = 0 WHERE prefeitura_id = 1 AND codigo = 'saude'");
  assert.throws(() => inserir.run('saude', 0), /Área inválida/);
  assert.equal(inserir.run(null, 1).changes, 1);
});

test('sugestão: vem do órgão, só na exibição e nunca troca área gravada', async (t) => {
  assert.equal(sugerirArea(' sms '), 'saude');
  assert.equal(sugerirArea('SEINFRA'), null);
  assert.equal(sugerirArea(null), null);
  assert.equal(codigoDeArea(' Parques e Lazer '), 'parques_e_lazer');
  assert.equal(codigoDeArea(' SAÚDE '), 'saude');
  assert.equal(codigoDeArea('  '), null);
  assert.equal(codigoDeArea('A'), null);
  const projeto = { orgao: 'SMS', area: null };
  assert.deepEqual(areaDoProjeto(projeto), { codigo: 'saude', nome: 'Saúde', sugerida: true });
  assert.equal(projeto.area, null);
  assert.equal(areaDoProjeto(projeto, []), null);
  const { sqlite, db } = bancoTeste();
  t.after(() => sqlite.close());
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO')");
  sqlite.exec("UPDATE catalogo SET ativo = 0, nome = 'Saúde municipal' WHERE prefeitura_id = 1 AND codigo = 'saude'");
  const repo = criarRepositorioD1(db, 1);
  const ativas = await repo.listarAreas!();
  const todas = await repo.listarAreas!(true);
  assert.equal(areaDoProjeto(projeto, todas, ativas), null);
  assert.deepEqual(areaDoProjeto({ orgao: 'SME', area: 'saude' }, todas, ativas), { codigo: 'saude', nome: 'Saúde municipal', sugerida: false });
  assert.deepEqual(areaDoProjeto({ ...projeto, area: 'codigo_antigo' }, todas, ativas), { codigo: 'codigo_antigo', nome: 'codigo_antigo', sugerida: false });
});
