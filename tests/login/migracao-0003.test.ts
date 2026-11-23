import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
// Validação da 0003 sobre 0001-0002 do banco CENTRAL (anexo da ordem E16, 45 casos).
test('migração central 0003: dispensa da 2ª etapa e abusos', () => {
const pasta = 'db/d1/central', nova = 'db/d1/central/0003_excecao_2fa.sql';
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON');
for (const f of readdirSync(pasta).filter(f => /^000[12]_.*\.sql$/.test(f)).sort()) db.exec(readFileSync(pasta + '/' + f, 'utf8'));
// Dados anteriores à migração: sessão antiga precisa receber via_excecao = 0.
db.exec(`INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('dono','dono@exemplo.invalid','Admin A','admin',5208707),('dani','dani@exemplo.invalid','Admin B','admin',5208707),('consulta','consulta@exemplo.invalid','Consulta','leitura',5208707);
INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em) VALUES('h-antiga','dono','completa','2026-11-23T10:00:00.000Z','2026-11-23T22:00:00.000Z','2026-11-23T10:00:00.000Z');`);
const sql = readFileSync(nova, 'utf8');
if (/\b(DROP|DELETE|UPDATE)\b/i.test(sql.replace(/--.*$/gm, ''))) throw new Error('migração com DROP/DELETE/UPDATE');
for (const m of sql.matchAll(/\b(?:GLOB|LIKE)\s+'([^']*)'/gi)) if (Buffer.byteLength(m[1]) > 50) throw new Error('padrão > 50 bytes');
db.exec(sql);
let ok = 0, falhas = 0;
const caso = (nome:string, fn:()=>unknown, deveFalhar:boolean) => { let erro:any = null; try { fn(); } catch (e) { erro = e; }
  if (!!erro === deveFalhar) ok++; else { falhas++; console.log('FALHOU:', nome, erro?.message ?? 'aceitou'); } };
const ins = (u:unknown, ate:unknown, motivo:unknown, por:unknown, em:unknown) => db.prepare('INSERT INTO excecao_2fa(usuario_id,ate,motivo,concedido_por,concedido_em) VALUES(?,?,?,?,?)').run(u as any, ate as any, motivo as any, por as any, em as any);
const limpar = () => db.exec('DELETE FROM excecao_2fa');
const EM = '2026-11-23T12:00:00.000Z', ATE60 = '2027-01-22T12:00:00.000Z', ATE1 = '2026-11-24T12:00:00.000Z';
// Válidos
caso('60 dias exatos', () => { ins('dani', ATE60, 'Avaliação do sistema', 'dono', EM); limpar(); }, false);
caso('1 dia', () => { ins('consulta', ATE1, 'Teste', 'dono', EM); limpar(); }, false);
caso('admin dispensa outro admin', () => { ins('dono', ATE1, 'Teste', 'dani', EM); limpar(); }, false);
caso('milissegundos diferentes de zero', () => { ins('dani', '2026-11-24T12:00:00.123Z', 'Teste', 'dono', '2026-11-23T12:00:00.123Z'); limpar(); }, false);
// Abusos
caso('a si mesmo', () => ins('dani', ATE1, 'Teste', 'dani', EM), true);
caso('61 dias', () => ins('dani', '2027-01-23T12:00:00.000Z', 'Teste', 'dono', EM), true);
caso('60 dias + 1 s', () => ins('dani', '2027-01-22T12:00:01.000Z', 'Teste', 'dono', EM), true);
caso('menos de 1 dia', () => ins('dani', '2026-11-24T11:59:59.000Z', 'Teste', 'dono', EM), true);
caso('ate no passado', () => ins('dani', '2026-11-22T12:00:00.000Z', 'Teste', 'dono', EM), true);
caso('ate sem milissegundos', () => ins('dani', '2026-11-24T12:00:00Z', 'Teste', 'dono', EM), true);
caso('ate com fuso -03:00', () => ins('dani', '2026-11-24T09:00:00.000-03:00', 'Teste', 'dono', EM), true);
caso('ate só data', () => ins('dani', '2026-11-24', 'Teste', 'dono', EM), true);
caso('ate lixo', () => ins('dani', 'lixo', 'Teste', 'dono', EM), true);
caso('ate dia 31/02', () => ins('dani', '2027-02-31T12:00:00.000Z', 'Teste', 'dono', EM), true);
caso('ate NULL', () => ins('dani', null, 'Teste', 'dono', EM), true);
caso('ate numérico', () => ins('dani', 1795000000, 'Teste', 'dono', EM), true);
caso('concedido_em inválido', () => ins('dani', ATE1, 'Teste', 'dono', '23/11/2026'), true);
caso('concedido_em NULL', () => ins('dani', ATE1, 'Teste', 'dono', null), true);
caso('motivo curto', () => ins('dani', ATE1, 'ab', 'dono', EM), true);
caso('motivo com espaços nas pontas', () => ins('dani', ATE1, ' Teste ', 'dono', EM), true);
caso('motivo 201', () => ins('dani', ATE1, 'x'.repeat(201), 'dono', EM), true);
caso('motivo com NUL', () => ins('dani', ATE1, 'Tes\u0000te', 'dono', EM), true);
caso('motivo NULL', () => ins('dani', ATE1, null, 'dono', EM), true);
caso('beneficiário inexistente (FK)', () => ins('fantasma', ATE1, 'Teste', 'dono', EM), true);
caso('concedente inexistente (FK)', () => ins('dani', ATE1, 'Teste', 'fantasma', EM), true);
caso('concedente NULL', () => ins('dani', ATE1, 'Teste', null, EM), true);
caso('duas linhas para a mesma pessoa', () => { ins('dani', ATE1, 'Teste', 'dono', EM); ins('dani', ATE60, 'Teste', 'dono', EM); }, true); limpar();
// Upsert exatamente como o código vai fazer (INSERT ... SELECT ... WHERE ... ON CONFLICT)
// DELTA1: concedente dispensado não concede (NOT EXISTS com o próprio concedente e o instante da concessão).
const upsertSql = db.prepare(`INSERT INTO excecao_2fa(usuario_id,ate,motivo,concedido_por,concedido_em) SELECT ?,?,?,?,?
 WHERE EXISTS (SELECT 1 FROM usuario WHERE id = ? AND prefeitura_id = ? AND ativo = 1)
 AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND prefeitura_id = ? AND perfil = 'admin' AND ativo = 1)
 AND NOT EXISTS (SELECT 1 FROM excecao_2fa WHERE usuario_id = ? AND ate > ?)
 ON CONFLICT(usuario_id) DO UPDATE SET ate = excluded.ate, motivo = excluded.motivo, concedido_por = excluded.concedido_por, concedido_em = excluded.concedido_em`);
const upsert = { run: (...v:any[]) => upsertSql.run(...v, v[3], v[4]) };
caso('upsert insere', () => { const r = upsert.run('dani', ATE1, 'Teste', 'dono', EM, 'dani', 5208707, 'dono', 5208707); if (r.changes !== 1) throw new Error('não gravou'); }, false);
caso('upsert renova', () => { const r = upsert.run('dani', ATE60, 'Renovação', 'dono', EM, 'dani', 5208707, 'dono', 5208707); if (r.changes !== 1) throw new Error('não gravou'); if (db.prepare("SELECT ate FROM excecao_2fa WHERE usuario_id='dani'").get()!.ate !== ATE60) throw new Error('não renovou'); }, false);
caso('upsert renovado acima de 60 dias recusa', () => upsert.run('dani', '2027-03-01T12:00:00.000Z', 'Teste', 'dono', EM, 'dani', 5208707, 'dono', 5208707), true);
caso('recusa manteve a anterior', () => { if (db.prepare("SELECT ate FROM excecao_2fa WHERE usuario_id='dani'").get()!.ate !== ATE60) throw new Error('perdeu'); }, false);
caso('concedente dispensado não concede', () => { const r = upsert.run('dono', ATE1, 'Teste', 'dani', EM, 'dono', 5208707, 'dani', 5208707); if (r.changes !== 0) throw new Error('gravou'); }, false);
caso('concedente com dispensa vencida concede', () => { const r = upsert.run('dono', '2027-01-23T12:00:00.000Z', 'Teste', 'dani', '2027-01-22T12:00:00.000Z', 'dono', 5208707, 'dani', 5208707); if (r.changes !== 1) throw new Error('não gravou'); db.exec("DELETE FROM excecao_2fa WHERE usuario_id = 'dono'"); }, false);
caso('upsert com concedente leitura não grava', () => { const r = upsert.run('dono', ATE1, 'Teste', 'consulta', EM, 'dono', 5208707, 'consulta', 5208707); if (r.changes !== 0) throw new Error('gravou'); }, false);
db.exec("INSERT INTO prefeitura VALUES(1100015,1100015,'Outra','RO','DB_PREFEITURA_1100015',1); INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('fora','fora@exemplo.invalid','Outra','admin',1100015)");
caso('upsert de outra prefeitura não grava', () => { const r = upsert.run('consulta', ATE1, 'Teste', 'fora', EM, 'consulta', 1100015, 'fora', 1100015); if (r.changes !== 0) throw new Error('gravou'); }, false);
caso('upsert misturando prefeituras não grava', () => { const r = upsert.run('consulta', ATE1, 'Teste', 'fora', EM, 'consulta', 5208707, 'fora', 5208707); if (r.changes !== 0) throw new Error('gravou'); }, false);
db.exec("UPDATE usuario SET ativo = 0 WHERE id = 'consulta'");
caso('upsert para desativado não grava', () => { const r = upsert.run('consulta', ATE1, 'Teste', 'dono', EM, 'consulta', 5208707, 'dono', 5208707); if (r.changes !== 0) throw new Error('gravou'); }, false);
// Consulta do login: vale só se ate > agora (comparação de texto no formato fixo)
const vale = (agora:string) => !!db.prepare('SELECT 1 FROM excecao_2fa WHERE usuario_id = ? AND ate > ?').get('dani', agora);
caso('dentro do prazo vale', () => { if (!vale('2027-01-22T11:59:59.999Z')) throw new Error('não valeu'); }, false);
caso('no instante final não vale', () => { if (vale(ATE60)) throw new Error('valeu'); }, false);
caso('depois não vale', () => { if (vale('2027-02-01T00:00:00.000Z')) throw new Error('valeu'); }, false);
// sessao.via_excecao
caso('sessão antiga ficou com via_excecao 0', () => { if (db.prepare("SELECT via_excecao v FROM sessao WHERE id_hash='h-antiga'").get()!.v !== 0) throw new Error('padrão errado'); }, false);
caso('via_excecao 2 recusado', () => db.exec("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em,via_excecao) VALUES('h2','dani','completa','a','b','c',2)"), true);
caso('via_excecao NULL recusado', () => db.exec("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em,via_excecao) VALUES('h3','dani','completa','a','b','c',NULL)"), true);
caso('via_excecao 1 aceito', () => db.exec("INSERT INTO sessao(id_hash,usuario_id,etapa,criada_em,expira_em,ultimo_uso_em,via_excecao) VALUES('h4','dani','completa','a','b','c',1)"), false);
// Retirar: DELETE + evento só quando apagou (changes() = 1)
const retirar = () => { db.exec('BEGIN');
  db.prepare('DELETE FROM excecao_2fa WHERE usuario_id = ? AND EXISTS (SELECT 1 FROM usuario WHERE id = ? AND prefeitura_id = ?)').run('dani', 'dani', 5208707);
  db.prepare("INSERT INTO evento_acesso(usuario_id,tipo,ip,detalhe) SELECT ?,'2fa_dispensa_retirada',?,? WHERE changes() = 1").run('dani', 'ip', '{}');
  db.exec('COMMIT'); };
caso('retirar grava evento só quando apagou', () => { retirar(); retirar(); if (db.prepare("SELECT count(*) n FROM evento_acesso WHERE tipo='2fa_dispensa_retirada'").get()!.n !== 1) throw new Error('eventos errados'); }, false);
console.log(`casos: ${ok + falhas}, ok: ${ok}, falhas: ${falhas}`);
assert.equal(ok + falhas, 45);
assert.equal(falhas, 0);
});
