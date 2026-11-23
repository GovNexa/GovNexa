import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from './stub-cloudflare-workers.mjs';
import { bancoTeste } from '../helpers/d1.ts';
// Executado em processo filho com --import ./tests/login/registrar-stub.mjs (ver acao-limite.test.ts).
test('acao.ts: limitador que recusa devolve erro=limite e não executa a ação', async () => {
 const b = bancoTeste('central');
 try {
  b.sqlite.exec("INSERT INTO usuario(id,email,nome,perfil,prefeitura_id) VALUES('admin','dev@exemplo.invalid','Administrador local','admin',5208707),('alvo','alvo@exemplo.invalid','Alvo','leitura',5208707)");
  let chamadas = 0;
  Object.assign(env, { DB_CENTRAL: b.db, LIMITE_API: { async limit() { chamadas++; return { success: false }; } } });
  const { POST } = await import('../../src/pages/plataforma/usuarios/acao.ts');
  const usuario = b.sqlite.prepare("SELECT * FROM usuario WHERE id = 'admin'").get() as any;
  const corpo = new URLSearchParams({ acao: 'desativar', id: 'alvo', confirmar: 'sim' }).toString();
  const request = new Request('http://localhost/plataforma/usuarios/acao/', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(corpo.length) }, body: corpo });
  const r = await (POST as any)({ request, locals: { usuario: { ...usuario, ativo: true } }, redirect: (url: string, status: number) => new Response(null, { status, headers: { Location: url } }) }) as Response;
  assert.equal(r.headers.get('Location'), '/plataforma/usuarios/?erro=limite');
  assert.ok(chamadas >= 1);
  assert.equal(b.sqlite.prepare("SELECT ativo FROM usuario WHERE id = 'alvo'").get()!.ativo, 1);
 } finally { b.sqlite.close(); }
});
