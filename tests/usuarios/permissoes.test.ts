import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repositorioDoUsuario } from '../../src/lib/repositorio/index.ts';
import { bancoTeste } from '../helpers/d1.ts';
import { pode, usuarioPode, obterUsuarioAtivoPorEmail, prefeituraDoUsuario, type Perfil, type Acao } from '../../src/lib/usuarios/index.ts';

test('matriz completa de permissões e ausência de usuário', () => {
 const acoes: Acao[] = ['ver','editar_projeto','aprovar_etapa','enviar_documento','gerenciar_usuarios','importar','dispensar_2fa'];
 const permitidas = { admin: acoes, gestor: acoes.slice(0,4), editor: ['ver','editar_projeto','enviar_documento'], leitura: ['ver'] };
 for (const perfil of Object.keys(permitidas) as Perfil[]) for (const acao of acoes) {
  assert.equal(pode(perfil, acao), permitidas[perfil].includes(acao));
 }
 assert.equal(usuarioPode(null, 'ver'), false);
 assert.equal(pode(undefined, 'ver'), false);
});
test('central: email normalizado, inativos e prefeitura ativa', async () => {
 const { db, sqlite } = bancoTeste('central');
 try {
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usuario').get()!.n, 0);
  await db.batch([db.prepare("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES(?,?,?,?,?)")
   .bind(crypto.randomUUID(), 'teste@example.test', '', 'editor', 5208707)]);
  const u = await obterUsuarioAtivoPorEmail(db, ' TESTE@EXAMPLE.TEST ');
  assert.ok(u);
  const municipal = bancoTeste();
  try {
   const repo = await repositorioDoUsuario({DB_CENTRAL:db,DB_PREFEITURA_5208707:municipal.db},u);
   assert.equal(repo.podeGravar,true);
   assert.deepEqual(await repo.listarProjetos(),[]);
   await assert.rejects(repositorioDoUsuario({DB_CENTRAL:db},u),/Binding/);
   await assert.rejects(repositorioDoUsuario({DB_CENTRAL:db},null),/Prefeitura/);
  } finally { municipal.sqlite.close(); }
  assert.equal((await prefeituraDoUsuario(db,u))?.binding_d1, 'DB_PREFEITURA_5208707');
  assert.equal(await obterUsuarioAtivoPorEmail(db, "x' OR 1=1 --"), null);
  sqlite.exec('UPDATE usuario SET ativo=0');
  assert.equal(await obterUsuarioAtivoPorEmail(db,'teste@example.test'),null);
  assert.equal(await prefeituraDoUsuario(db,u),null);
  assert.equal(usuarioPode({...u, ativo:false}, 'ver'),false);
  assert.throws(() => sqlite.exec("UPDATE usuario SET email='TESTE@EXAMPLE.TEST'"));
 } finally { sqlite.close(); }
});

test('central: recusa email fora de ASCII e binding incoerente', async () => {
 const { db, sqlite } = bancoTeste('central');
 try {
  for (const email of ['tésté@example.test','teste @example.test','teste\u0000@example.test']) {
   assert.equal(await obterUsuarioAtivoPorEmail(db,email),null);
   assert.throws(()=>sqlite.prepare("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('teste',?,'','editor',5208707)").run(email));
  }
  assert.throws(()=>sqlite.exec("UPDATE prefeitura SET binding_d1='DB_PREFEITURA_1'"));
  assert.throws(()=>sqlite.exec("UPDATE prefeitura SET id=1"));
 } finally { sqlite.close(); }
});
