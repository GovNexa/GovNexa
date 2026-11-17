import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoTeste } from '../helpers/d1.ts';
import { obterUsuarioAtivoPorEmail } from '../../src/lib/usuarios/index.ts';
import { listarUsuarios } from '../../src/lib/usuarios/lista.ts';

async function cadastrar(db: ReturnType<typeof bancoTeste>['db'], email: string, nome: string, perfil: string, prefeitura = 5208707, ativo = 1) {
  await db.batch([db.prepare('INSERT INTO usuario(id,email,nome,perfil,prefeitura_id,ativo) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), email, nome, perfil, prefeitura, ativo)]);
}

test('lista de usuários: só admin lê, filtrada pela prefeitura e sem expor outras prefeituras', async () => {
  const { db, sqlite } = bancoTeste('central');
  try {
    sqlite.exec("INSERT INTO prefeitura(id,codigo_ibge,nome,uf,binding_d1) VALUES(1100015,1100015,'Outra','RO','DB_PREFEITURA_1100015')");
    await cadastrar(db, 'admin@example.test', 'Ana Admin', 'admin');
    await cadastrar(db, 'gestor@example.test', 'Bia Gestora', 'gestor');
    await cadastrar(db, 'leitura@example.test', 'Caio Leitor', 'leitura');
    await cadastrar(db, 'editor@example.test', 'Fábio Editor', 'editor');
    await cadastrar(db, 'inativo@example.test', 'Davi Inativo', 'editor', 5208707, 0);
    await cadastrar(db, 'fora@example.test', 'Eva Outra', 'admin', 1100015);
    const admin = (await obterUsuarioAtivoPorEmail(db, 'admin@example.test'))!;
    const lista = (await listarUsuarios(db, admin))!;
    assert.ok(lista);
    assert.deepEqual(lista.map((u) => u.email), ['admin@example.test', 'gestor@example.test', 'leitura@example.test', 'editor@example.test', 'inativo@example.test']);
    assert.equal(lista.at(-1)!.ativo, false);
    assert.ok(!lista.some((u) => u.email === 'fora@example.test'));
    assert.deepEqual(Object.keys(lista[0]).sort(), ['ativo', 'cargo', 'criado_em', 'email', 'nome', 'perfil']);
    // Outros perfis, usuário inativo e ausência de usuário não leem a lista.
    for (const email of ['gestor@example.test', 'leitura@example.test', 'editor@example.test']) {
      assert.equal(await listarUsuarios(db, (await obterUsuarioAtivoPorEmail(db, email))!), null);
    }
    assert.equal(await listarUsuarios(db, { ...admin, ativo: false }), null);
    assert.equal(await listarUsuarios(db, null), null);
    // Um admin de outra prefeitura vê só a dele.
    const outro = (await obterUsuarioAtivoPorEmail(db, 'fora@example.test'))!;
    assert.deepEqual((await listarUsuarios(db, outro))!.map((u) => u.email), ['fora@example.test']);
  } finally { sqlite.close(); }
});
