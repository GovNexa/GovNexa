// E9: fotos da obra (regras, serviço, banco, Histórico, mensagens e ordem das conferências nas rotas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bancoTeste } from '../helpers/d1.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import type { BucketR2 } from '../../src/lib/documentos/servico.ts';
import {
  LIMITE_FOTO_BYTES, LIMITE_LEGENDA, cabecalhoFoto, chaveFoto, hojeBrasilia, legendaSegura, validarDataFoto, validarFoto,
} from '../../src/lib/fotos/regras.ts';
import {
  LIMITE_FOTOS_POR_HORA, LIMITE_FOTOS_POR_PROJETO, enviarFoto, permissaoFotos, removerFoto, verFoto, type ContextoFotos,
} from '../../src/lib/fotos/servico.ts';
import { MENSAGENS_FOTOS, destinoFotos, mensagemFoto } from '../../src/lib/fotos/mensagens.ts';
import { resumoRegistro, rotuloAcao } from '../../src/lib/log/visoes.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const bytes = (cabeca: number[], extra = 'a') => new Uint8Array([...cabeca, ...new TextEncoder().encode(extra)]);
const blob = (cabeca: number[], extra = 'a') => new Blob([bytes(cabeca, extra) as unknown as BlobPart]);
const texto = (t: string) => new Blob([t]);
const HOJE = '2026-11-22';
const AGORA = new Date('2026-11-22T15:00:00.000Z');

function bucketFalso(): BucketR2 & { itens: Map<string, Uint8Array>; falharPut?: boolean; puts: number } {
  const itens = new Map<string, Uint8Array>();
  const b: BucketR2 & { itens: Map<string, Uint8Array>; falharPut?: boolean; puts: number } = {
    itens,
    puts: 0,
    async put(k, v) {
      b.puts += 1;
      if (b.falharPut) throw new Error('R2 fora do ar');
      itens.set(k, v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v instanceof Uint8Array ? v : new Uint8Array(v));
      return null;
    },
    async get(k) { const v = itens.get(k); return v ? { size: v.byteLength, body: new Response(v as unknown as BodyInit).body! } : null; },
    async delete(k) { itens.delete(k); },
  };
  return b;
}
const usuario = (perfil: Usuario['perfil'], pref = 5208707): Usuario => ({ id: 'u-' + perfil, email: `${perfil}@x.gov.br`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '' });
function montar(perfil: Usuario['perfil'] = 'editor', pref = 5208707, bancoExistente?: ReturnType<typeof bancoTeste>, bucketExistente?: ReturnType<typeof bucketFalso>) {
  const banco = bancoExistente ?? bancoTeste('prefeitura');
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  for (const p of ['P-1', 'P-2']) banco.sqlite.exec(`INSERT OR IGNORE INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (${pref}, '${p}', ${p === 'P-1' ? 1 : 2}, 'Obra', 'SEINFRA')`);
  const repositorio = { ...repositorioD1ParaTestes(banco.db, pref), prefeituraId: pref };
  const bucket = bucketExistente ?? bucketFalso();
  const c: ContextoFotos = { usuario: usuario(perfil, pref), repositorio, bucket, agora: () => AGORA };
  return { banco, bucket, c };
}
const fotosDe = (banco: ReturnType<typeof bancoTeste>) => banco.sqlite.prepare('SELECT * FROM projeto_foto ORDER BY rowid').all() as any[];
const eventosDe = (banco: ReturnType<typeof bancoTeste>, tipo: string) => banco.sqlite.prepare('SELECT * FROM evento_sistema WHERE tipo = ? ORDER BY rowid').all(tipo) as any[];

test('regras: aceita JPG, PNG e WEBP com o conteúdo certo e recusa SVG, GIF, PDF, HTML e sem extensão', () => {
  assert.deepEqual(validarFoto('obra.jpg', bytes(JPG)), { ok: true, mime: 'image/jpeg', extensao: 'jpg' });
  assert.deepEqual(validarFoto('obra.JPEG', bytes(JPG)), { ok: true, mime: 'image/jpeg', extensao: 'jpg' });
  assert.deepEqual(validarFoto('obra.png', bytes(PNG)), { ok: true, mime: 'image/png', extensao: 'png' });
  assert.deepEqual(validarFoto('obra.webp', bytes(WEBP)), { ok: true, mime: 'image/webp', extensao: 'webp' });
  for (const nome of ['a.svg', 'a.gif', 'a.pdf', 'a.html', 'a.heic', 'a', 'a.png.svg']) assert.deepEqual(validarFoto(nome, bytes(PNG)), { ok: false, codigo: 'tipo' }, nome);
});

test('regras: o conteúdo precisa combinar com a extensão (arquivo falso e SVG com nome de PNG)', () => {
  assert.deepEqual(validarFoto('a.jpg', bytes(PNG)), { ok: false, codigo: 'conteudo' });
  assert.deepEqual(validarFoto('a.png', bytes(JPG)), { ok: false, codigo: 'conteudo' });
  assert.deepEqual(validarFoto('a.png', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), { ok: false, codigo: 'conteudo' });
  assert.deepEqual(validarFoto('a.webp', bytes([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), { ok: false, codigo: 'conteudo' });
});

test('regras: vazio é recusado e o limite de 10 MB vale nas duas fronteiras', () => {
  assert.deepEqual(validarFoto('a.png', new Uint8Array(0)), { ok: false, codigo: 'vazio' });
  assert.equal(validarFoto('a.png', bytes(PNG), LIMITE_FOTO_BYTES).ok, true);
  assert.deepEqual(validarFoto('a.png', bytes(PNG), LIMITE_FOTO_BYTES + 1), { ok: false, codigo: 'tamanho' });
  assert.equal(LIMITE_FOTO_BYTES, 10485760);
});

test('regras: legenda limpa controle, direção e espaços; 200 caracteres passam e 201 não', () => {
  assert.deepEqual(legendaSegura('  Fundação\n\tconcluída\u202e  '), { ok: true, valor: 'Fundação concluída' });
  assert.deepEqual(legendaSegura(''), { ok: true, valor: null });
  assert.deepEqual(legendaSegura(null), { ok: true, valor: null });
  assert.deepEqual(legendaSegura('x'.repeat(LIMITE_LEGENDA)), { ok: true, valor: 'x'.repeat(200) });
  assert.deepEqual(legendaSegura('x'.repeat(LIMITE_LEGENDA + 1)), { ok: false });
  assert.deepEqual(legendaSegura(new Blob(['a'])), { ok: false });
});

test('regras: data da foto obrigatória, dia que existe, de 01/01/2000 até hoje', () => {
  assert.deepEqual(validarDataFoto('2026-11-22', HOJE), { ok: true, valor: '2026-11-22' });
  assert.deepEqual(validarDataFoto('2000-01-01', HOJE), { ok: true, valor: '2000-01-01' });
  for (const v of ['2026-11-23', '1999-12-31', '2026-02-30', '22/11/2026', '', '2026-1-5', null, 20261122]) assert.deepEqual(validarDataFoto(v, HOJE), { ok: false }, String(v));
});

test('regras: hoje no horário de Brasília (02:00 UTC de 23/11 ainda é 22/11)', () => {
  assert.equal(hojeBrasilia(new Date('2026-11-23T02:00:00.000Z')), '2026-11-22');
  assert.equal(hojeBrasilia(new Date('2026-11-23T03:00:00.000Z')), '2026-11-23');
});

test('regras: chave com prefixo próprio e exibição inline com nome gerado pelo sistema', () => {
  assert.equal(chaveFoto(5208707, 'P-1', 'abc'), 'fotos/5208707/P-1/abc');
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(cabecalhoFoto(id, 'image/jpeg'), `inline; filename="foto-${id}.jpg"`);
  assert.equal(cabecalhoFoto(id, 'image/webp'), `inline; filename="foto-${id}.webp"`);
});

test('envio: grava no R2 e no banco com chave gerada, legenda, data e autor, e o evento entra no Histórico do projeto', async () => {
  const { c, bucket, banco } = montar();
  const r = await enviarFoto(c, 'P-1', blob(PNG), 'C:\\fotos\\obra 1.png', ' Fundação ', '2026-11-20');
  assert.equal(r.ok, true);
  const [f] = fotosDe(banco);
  assert.match(f.arquivo_chave, /^fotos\/5208707\/P-1\/[0-9a-f-]{36}$/);
  assert.ok(bucket.itens.has(f.arquivo_chave));
  assert.equal(f.legenda, 'Fundação');
  assert.equal(f.tirada_em, '2026-11-20');
  assert.equal(f.enviada_por, 'editor@x.gov.br');
  assert.equal(f.tipo_mime, 'image/png');
  assert.equal(f.enviada_em, AGORA.toISOString());
  assert.match(f.sha256, /^[0-9a-f]{64}$/);
  const [e] = eventosDe(banco, 'foto_enviada');
  assert.equal(e.descricao, 'Foto enviada: Fundação (foto de 20/11/2026)');
  assert.equal(e.origem, 'ficha');
  assert.deepEqual(JSON.parse(e.detalhes), { projeto_id: 'P-1', foto_id: f.id });
  const hist = await c.repositorio.historico('P-1');
  assert.ok(hist.some((h) => h.tipo === ('foto_enviada' as never) && h.descricao === e.descricao));
  assert.deepEqual((await c.repositorio.fotos!.listar('P-1', 60)).map((x) => x.id), [f.id]);
});

test('envio: perfil leitura é recusado sem tocar no R2 nem no banco; editor, gestor e administrador podem', async () => {
  const { c, bucket, banco } = montar('leitura');
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG), 'a.png', '', HOJE), { ok: false, status: 403, codigo: 'permissao' });
  assert.equal(bucket.itens.size, 0);
  assert.equal(fotosDe(banco).length, 0);
  for (const perfil of ['editor', 'gestor', 'admin'] as const) {
    const m = montar(perfil);
    assert.equal((await enviarFoto(m.c, 'P-1', blob(PNG, perfil), 'a.png', '', HOJE)).ok, true, perfil);
  }
  assert.deepEqual(permissaoFotos(usuario('leitura'), true), { podeGerir: false, aviso: 'Seu perfil permite apenas ver as fotos.' });
  assert.deepEqual(permissaoFotos(usuario('editor'), true), { podeGerir: true, aviso: null });
  assert.equal(permissaoFotos(usuario('admin'), false).podeGerir, false);
});

test('envio: projeto de outra prefeitura dá 404 e nada é gravado', async () => {
  const banco = bancoTeste('prefeitura');
  const outra = montar('editor', 1, banco);
  outra.banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (1, 'P-77', 77, 'Obra de outra', 'SMS')");
  const { c, bucket } = montar('editor', 5208707, banco);
  assert.deepEqual(await enviarFoto(c, 'P-77', blob(PNG), 'a.png', '', HOJE), { ok: false, status: 404, codigo: 'projeto' });
  assert.deepEqual(await enviarFoto(c, '../P-1', blob(PNG), 'a.png', '', HOJE), { ok: false, status: 404, codigo: 'projeto' });
  assert.equal(bucket.itens.size, 0);
  assert.equal(fotosDe(banco).length, 0);
});

test('envio: arquivo falso, SVG, legenda longa e data inválida são recusados antes do R2', async () => {
  const { c, bucket, banco } = montar();
  assert.deepEqual(await enviarFoto(c, 'P-1', texto('<html><script>alert(1)</script></html>'), 'falso.jpg', '', HOJE), { ok: false, status: 400, codigo: 'conteudo' });
  assert.deepEqual(await enviarFoto(c, 'P-1', texto('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'desenho.svg', '', HOJE), { ok: false, status: 400, codigo: 'tipo' });
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG), 'a.png', 'x'.repeat(201), HOJE), { ok: false, status: 400, codigo: 'legenda' });
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG), 'a.png', '', '2026-11-23'), { ok: false, status: 400, codigo: 'data' });
  assert.equal(bucket.itens.size, 0);
  assert.equal(fotosDe(banco).length, 0);
});

test('envio: a mesma foto duas vezes no projeto é recusada; em outro projeto pode; depois de removida pode de novo', async () => {
  const { c, banco } = montar();
  const r1 = await enviarFoto(c, 'P-1', blob(PNG, 'igual'), 'a.png', '', HOJE);
  assert.equal(r1.ok, true);
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG, 'igual'), 'b.png', 'outra', HOJE), { ok: false, status: 409, codigo: 'duplicada' });
  assert.equal((await enviarFoto(c, 'P-2', blob(PNG, 'igual'), 'a.png', '', HOJE)).ok, true);
  assert.equal((await removerFoto(c, (r1 as { id: string }).id)).ok, true);
  assert.equal((await enviarFoto(c, 'P-1', blob(PNG, 'igual'), 'a.png', '', HOJE)).ok, true);
  assert.equal(fotosDe(banco).length, 3);
});

test('envio: limite por pessoa por hora nas duas fronteiras (59 deixa, 60 recusa) e só conta a última hora', async () => {
  const { c, banco, bucket } = montar();
  const ins = banco.sqlite.prepare("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por, enviada_em) VALUES (5208707, 'P-2', ?, ?, 'image/png', 1, 'editor@x.gov.br', ?)");
  for (let i = 0; i < LIMITE_FOTOS_POR_HORA - 1; i++) ins.run(`h${i}`, `k${i}`, '2026-11-22T14:30:00.000Z');
  ins.run('velha', 'kv', '2026-11-22T13:59:59.999Z');
  assert.equal((await enviarFoto(c, 'P-1', blob(PNG, 'a'), 'a.png', '', HOJE)).ok, true);
  const puts = bucket.puts;
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG, 'b'), 'b.png', '', HOJE), { ok: false, status: 429, codigo: 'limite' });
  assert.equal(bucket.puts, puts, 'recusa pelo limite não grava no R2');
  // Outra pessoa da mesma prefeitura não é afetada (limite por pessoa, nunca global).
  const outra = { ...c, usuario: usuario('gestor') };
  assert.equal((await enviarFoto(outra, 'P-1', blob(PNG, 'c'), 'c.png', '', HOJE)).ok, true);
});

test('envio: limite de fotos ativas por projeto nas duas fronteiras (199 deixa, 200 recusa)', async () => {
  const { c, banco, bucket } = montar();
  const ins = banco.sqlite.prepare("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por, enviada_em) VALUES (5208707, 'P-1', ?, ?, 'image/png', 1, 'antigo@x.gov.br', '2020-01-01T00:00:00.000Z')");
  for (let i = 0; i < LIMITE_FOTOS_POR_PROJETO - 1; i++) ins.run(`p${i}`, `c${i}`);
  assert.equal((await enviarFoto(c, 'P-1', blob(PNG, 'a'), 'a.png', '', HOJE)).ok, true);
  const puts = bucket.puts;
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG, 'b'), 'b.png', '', HOJE), { ok: false, status: 409, codigo: 'cheio' });
  assert.equal(bucket.puts, puts, 'recusa pelo limite não grava no R2');
});

test('banco: a trava dos limites vale dentro da gravação (nada de foto nem evento quando já está no limite)', async () => {
  const { c, banco } = montar();
  const f = { id: 'f1', projeto_id: 'P-1', arquivo_chave: 'fotos/5208707/P-1/f1', tipo_mime: 'image/png', tamanho_bytes: 1, legenda: null, tirada_em: HOJE, enviada_por: 'editor@x.gov.br', sha256: 'a'.repeat(64) };
  assert.equal(await c.repositorio.fotos!.registrar(f, { porProjeto: 0, porHora: 10, desdeIso: '2026-11-22T14:00:00.000Z' }, 'x', AGORA.toISOString()), 'limite');
  assert.equal(await c.repositorio.fotos!.registrar(f, { porProjeto: 10, porHora: 0, desdeIso: '2026-11-22T14:00:00.000Z' }, 'x', AGORA.toISOString()), 'limite');
  assert.equal(fotosDe(banco).length, 0);
  assert.equal(eventosDe(banco, 'foto_enviada').length, 0);
  assert.equal(await c.repositorio.fotos!.registrar(f, { porProjeto: 1, porHora: 1, desdeIso: '2026-11-22T14:00:00.000Z' }, 'x', AGORA.toISOString()), 'ok');
  assert.equal(eventosDe(banco, 'foto_enviada').length, 1);
});

test('envio: se o banco falhar o arquivo sai do R2; se o R2 falhar nada vai para o banco', async () => {
  const { c, bucket, banco } = montar();
  const fotos = c.repositorio.fotos!;
  c.repositorio = { ...c.repositorio, fotos: { ...fotos, registrar: async () => { throw new Error('D1 fora do ar'); } } };
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG), 'a.png', '', HOJE), { ok: false, status: 503, codigo: 'indisponivel' });
  assert.equal(bucket.itens.size, 0);
  c.repositorio = { ...c.repositorio, fotos };
  bucket.falharPut = true;
  assert.deepEqual(await enviarFoto(c, 'P-1', blob(PNG), 'a.png', '', HOJE), { ok: false, status: 503, codigo: 'indisponivel' });
  assert.equal(fotosDe(banco).length, 0);
});

test('ver: devolve a foto com o tipo certo, nosniff, inline com nome gerado e sem cache; perfil leitura vê', async () => {
  const { c, banco, bucket } = montar();
  const r = await enviarFoto(c, 'P-1', blob(JPG, 'conteudo'), 'minha casa.jpg', 'Pilar', HOJE) as { ok: true; id: string };
  const leitor = montar('leitura', 5208707, banco, bucket).c;
  const resp = await verFoto(leitor, r.id);
  assert.ok(resp instanceof Response);
  assert.equal(resp.headers.get('content-type'), 'image/jpeg');
  assert.equal(resp.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(resp.headers.get('content-disposition'), `inline; filename="foto-${r.id}.jpg"`);
  assert.equal(resp.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await resp.arrayBuffer()), bytes(JPG, 'conteudo'));
});

test('ver: foto de outra prefeitura, removida, id inválido ou chave fora do prefixo dá 404', async () => {
  const banco = bancoTeste('prefeitura');
  const bucket = bucketFalso();
  const a = montar('editor', 1, banco, bucket);
  const daOutra = await enviarFoto(a.c, 'P-1', blob(PNG, 'outra'), 'a.png', '', HOJE) as { ok: true; id: string };
  const { c } = montar('admin', 5208707, banco, bucket);
  assert.deepEqual(await verFoto(c, daOutra.id), { ok: false, status: 404, codigo: 'naoencontrada' });
  assert.deepEqual(await verFoto(c, 'qualquer-coisa'), { ok: false, status: 404, codigo: 'naoencontrada' });
  // Linha desta prefeitura apontando para o arquivo (existente) da outra: a chave fora do prefixo não é servida.
  const chaveOutra = (banco.sqlite.prepare('SELECT arquivo_chave FROM projeto_foto WHERE id = ?').get(daOutra.id) as { arquivo_chave: string }).arquivo_chave;
  assert.ok(bucket.itens.has(chaveOutra));
  const minha = await enviarFoto(c, 'P-1', blob(PNG, 'minha'), 'a.png', '', HOJE) as { ok: true; id: string };
  banco.sqlite.prepare('UPDATE projeto_foto SET arquivo_chave = ? WHERE id = ?').run(chaveOutra, minha.id);
  assert.deepEqual(await verFoto(c, minha.id), { ok: false, status: 404, codigo: 'naoencontrada' });
  // Linha da outra prefeitura com chave forjada no prefixo desta: o filtro do banco não deixa ver nem remover.
  const forjada = '00000000-0000-4000-8000-0000000000aa';
  bucket.itens.set('fotos/5208707/P-1/' + forjada, bytes(PNG, 'forjada'));
  banco.sqlite.prepare("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por) VALUES (1, 'P-1', ?, ?, 'image/png', 1, 'x')").run(forjada, 'fotos/5208707/P-1/' + forjada);
  assert.deepEqual(await verFoto(c, forjada), { ok: false, status: 404, codigo: 'naoencontrada' });
  assert.deepEqual(await removerFoto(c, forjada), { ok: false, status: 404, codigo: 'naoencontrada' });
  const outra = await enviarFoto(c, 'P-1', blob(PNG, 'remover'), 'a.png', '', HOJE) as { ok: true; id: string };
  await removerFoto(c, outra.id);
  assert.deepEqual(await verFoto(c, outra.id), { ok: false, status: 404, codigo: 'naoencontrada' });
});

test('remover: lógica, com quem removeu e o evento no Histórico; leitura não remove; segunda remoção dá 404', async () => {
  const { c, banco, bucket } = montar();
  const r = await enviarFoto(c, 'P-1', blob(PNG), 'a.png', 'Laje', '2026-11-01') as { ok: true; id: string };
  const leitor = montar('leitura', 5208707, banco, bucket).c;
  assert.deepEqual(await removerFoto(leitor, r.id), { ok: false, status: 403, codigo: 'permissao' });
  assert.equal((await removerFoto(c, r.id)).ok, true);
  const [f] = fotosDe(banco);
  assert.equal(f.removida_por, 'editor@x.gov.br');
  assert.equal(f.removida_em, AGORA.toISOString());
  assert.equal(bucket.itens.size, 1);
  assert.throws(() => banco.sqlite.exec('DELETE FROM projeto_foto'), /Remoção só lógica/);
  const [e] = eventosDe(banco, 'foto_removida');
  assert.equal(e.descricao, 'Foto removida: Laje (foto de 01/11/2026)');
  assert.deepEqual(JSON.parse(e.detalhes), { projeto_id: 'P-1', foto_id: r.id });
  assert.deepEqual(await removerFoto(c, r.id), { ok: false, status: 404, codigo: 'naoencontrada' });
  assert.deepEqual(await c.repositorio.fotos!.listar('P-1', 60), []);
});

test('remover: duas remoções ao mesmo tempo, só uma vale e só um evento é gravado', async () => {
  const { c, banco } = montar();
  const r = await enviarFoto(c, 'P-1', blob(PNG), 'a.png', '', HOJE) as { ok: true; id: string };
  const resultados = await Promise.all([removerFoto(c, r.id), removerFoto(c, r.id)]);
  assert.equal(resultados.filter((x) => x.ok).length, 1);
  assert.equal(eventosDe(banco, 'foto_removida').length, 1);
});

test('migração 0008: só acrescenta (2 colunas em projeto_foto e índices) e não altera linha existente', (t) => {
  const pasta = 'db/d1/prefeitura';
  const arquivo = '0008_foto_projeto.sql';
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const nome of readdirSync(pasta).filter((n) => /^\d{4}_.*\.sql$/.test(n) && n < arquivo).sort()) sqlite.exec(readFileSync(pasta + '/' + nome, 'utf8'));
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Teste', 'GO')");
  sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (1, 'P-1', 1, 'Obra')");
  sqlite.exec("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por) VALUES (1, 'P-1', 'antiga', 'k', 'image/png', 1, 'a')");
  const antes = sqlite.prepare('SELECT * FROM projeto_foto').get() as Record<string, unknown>;
  const sql = readFileSync(pasta + '/' + arquivo, 'utf8');
  const semComentarios = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(semComentarios, /\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b|\bCREATE\s+TABLE\b/i);
  const alteracoes = [...semComentarios.matchAll(/^\s*ALTER TABLE[^\n]*/gim)].map((m) => m[0].trim());
  assert.equal(alteracoes.length, 2);
  for (const a of alteracoes) assert.match(a, /^ALTER TABLE projeto_foto ADD COLUMN /i);
  sqlite.exec(sql);
  const depois = sqlite.prepare('SELECT * FROM projeto_foto').get() as Record<string, unknown>;
  assert.deepEqual({ ...depois }, { ...antes, removida_por: null, sha256: null });
  assert.throws(() => sqlite.exec("UPDATE projeto_foto SET sha256 = 'A' WHERE id = 'antiga'"));
  const ins = sqlite.prepare("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por, sha256) VALUES (1, 'P-1', ?, ?, 'image/png', 1, 'a', ?)");
  ins.run('n1', 'k1', 'b'.repeat(64));
  assert.throws(() => ins.run('n2', 'k2', 'b'.repeat(64)), /UNIQUE/);
  assert.throws(() => sqlite.exec("INSERT INTO projeto_foto (prefeitura_id, projeto_id, id, arquivo_chave, tipo_mime, tamanho_bytes, enviada_por) VALUES (1, 'P-1', 'svg', 'k3', 'image/svg+xml', 1, 'a')"));
});

test('Histórico: rótulos das ações de foto e resumo pela descrição', () => {
  assert.equal(rotuloAcao('foto_enviada'), 'Foto enviada');
  assert.equal(rotuloAcao('foto_removida'), 'Foto removida');
  const base = { id: 'e', projeto_id: 'P-1', origem: 'ficha' as const, autor: 'a', em: AGORA.toISOString() };
  assert.equal(resumoRegistro({ ...base, tipo: 'foto_enviada', descricao: 'Foto enviada: Laje (foto de 01/11/2026)' }), 'Foto enviada: Laje (foto de 01/11/2026)');
});

test('mensagens: lista fechada e volta à aba Fotos da ficha só com tela de volta permitida', () => {
  assert.equal(mensagemFoto('enviada')?.ok, true);
  for (const c of ['constructor', '__proto__', 'toString', 'nada', '', null]) assert.equal(mensagemFoto(c), null, String(c));
  for (const m of Object.values(MENSAGENS_FOTOS)) assert.ok(m.texto.length > 0);
  const origem = 'https://govnexa.com.br';
  assert.equal(destinoFotos('P-1', '/plataforma/projetos-kanban/?orgao=SMS', origem, 'enviada'), '/plataforma/projeto/P-1/?aba=fotos&volta=%2Fplataforma%2Fprojetos-kanban%2F%3Forgao%3DSMS&rf=enviada');
  assert.equal(destinoFotos('P-1', 'https://site-malicioso.example/', origem, 'origem'), '/plataforma/projeto/P-1/?aba=fotos&rf=origem');
  assert.equal(destinoFotos('P-1', '//site-malicioso.example/', origem, 'origem'), '/plataforma/projeto/P-1/?aba=fotos&rf=origem');
  assert.equal(destinoFotos('<x>', null, origem, 'vazio'), '/plataforma/projetos-carteira/');
  assert.equal(destinoFotos(null, null, origem, 'vazio'), '/plataforma/projetos-carteira/');
});

test('rotas de fotos: origem, perfil, tamanho e limite conferidos antes de abrir o corpo; foto servida pelo serviço', () => {
  for (const arq of ['src/pages/plataforma/fotos-projeto/enviar.ts', 'src/pages/plataforma/fotos-projeto/remover/[id].ts']) {
    const t = readFileSync(arq, 'utf8');
    const origem = t.indexOf('mesmaOrigem(request)'), perfil = t.indexOf('podeGerirFotos(contexto)'), tamanho = t.indexOf("get('content-length')");
    const limite = t.indexOf('dentroDoLimite('), corpo = t.indexOf('formData(');
    assert.ok(origem > 0 && perfil > origem && tamanho > perfil && limite > tamanho, arq);
    assert.ok(corpo === -1 || corpo > limite, arq);
    assert.match(t, /destino\('limite'\)/, arq);
  }
  const ver = readFileSync('src/pages/plataforma/fotos-projeto/foto/[id].ts', 'utf8');
  assert.match(ver, /verFoto\(/);
  assert.doesNotMatch(ver, /\.get\(/);
});
