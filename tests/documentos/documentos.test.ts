import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTeste } from '../helpers/d1.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import { cabecalhoDownload, nomeSeguro, validarArquivo, LIMITE_BYTES } from '../../src/lib/documentos/regras.ts';
import { ERRO_MUDOU, ERRO_TIPO, baixarDocumento, classificarDocumento, enviarDocumento, removerDocumento, type BucketR2, type Contexto } from '../../src/lib/documentos/servico.ts';
import { mesmaOrigem } from '../../src/lib/documentos/http.ts';
import { codigoDe, MENSAGENS } from '../../src/lib/documentos/mensagens.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const pdf = (extra = 'a') => new TextEncoder().encode(`%PDF-1.7 ${extra}`);
const pdfB = (extra = 'a') => new Blob([pdf(extra) as unknown as BlobPart]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);

function bucketFalso(): BucketR2 & { itens: Map<string, Uint8Array> } {
  const itens = new Map<string, Uint8Array>();
  return {
    itens,
    async put(k, v) { itens.set(k, v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v instanceof Uint8Array ? v : new Uint8Array(v)); return null; },
    async get(k) { const v = itens.get(k); return v ? { size: v.byteLength, body: new Response(v as unknown as BodyInit).body! } : null; },
    async delete(k) { itens.delete(k); },
  };
}
const usuario = (perfil: Usuario['perfil'], pref = 5208707): Usuario => ({ id: 'u1', email: `${perfil}@x.gov.br`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '' });
function montar(perfil: Usuario['perfil'] = 'editor', pref = 5208707, bancoExistente?: ReturnType<typeof bancoTeste>) {
  const banco = bancoExistente ?? bancoTeste('prefeitura');
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  banco.sqlite.exec(`INSERT OR IGNORE INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao, valores, recurso, datas, por_ano, atualizacao, operacional, origem, sei, pendencias) VALUES (${pref}, 'P-1', 1, 'Obra', 'SEINFRA', '{}','{}','{}','{}','{}','{}','{}','[]','[]')`);
  const repositorio = { ...repositorioD1ParaTestes(banco.db, pref), prefeituraId: pref };
  const bucket = bucketFalso();
  const c: Contexto = { usuario: usuario(perfil, pref), repositorio, bucket };
  return { banco, bucket, c };
}

test('regras: aceita tipos permitidos e recusa o resto', () => {
  assert.equal(validarArquivo('a.pdf', pdf()).ok, true);
  assert.equal(validarArquivo('a.PNG', png).ok, true);
  assert.equal(validarArquivo('a.xlsx', zip).ok, true);
  for (const nome of ['a.svg', 'a.html', 'a.exe', 'a.js', 'a', 'a.pdf.exe']) assert.equal(validarArquivo(nome, pdf()).ok, false, nome);
});
test('regras: o conteúdo precisa combinar com a extensão', () => {
  assert.equal(validarArquivo('a.pdf', png).ok, false);
  assert.equal(validarArquivo('a.png', pdf()).ok, false);
  assert.equal(validarArquivo('a.jpg', new TextEncoder().encode('<script>alert(1)</script>')).ok, false);
});
test('regras: vazio e acima de 25 MB são recusados', () => {
  assert.equal(validarArquivo('a.pdf', new Uint8Array(0)).ok, false);
  const grande = new Uint8Array(LIMITE_BYTES + 1); grande.set(pdf());
  assert.match((validarArquivo('a.pdf', grande) as { erro: string }).erro, /25 MB/);
  const limite = new Uint8Array(LIMITE_BYTES); limite.set(pdf());
  assert.equal(validarArquivo('a.pdf', limite).ok, true);
});
test('regras: nome seguro remove caminho, controle e limita o tamanho', () => {
  assert.equal(nomeSeguro('..\\..\\etc/passwd.pdf'), 'passwd.pdf');
  assert.equal(nomeSeguro('a\r\nb".pdf'), 'ab.pdf');
  assert.equal(nomeSeguro('.oculto.pdf'), 'oculto.pdf');
  const n = nomeSeguro('x'.repeat(300) + '.pdf');
  assert.ok(n.length <= 120 && n.endsWith('.pdf'));
  const h = cabecalhoDownload('Relatório "final"; 2026.pdf');
  assert.ok(h.startsWith('attachment;') && !/[\r\n]/.test(h) && h.includes("filename*=UTF-8''Relat%C3%B3rio"));
});
test('origem: só aceita pedido da própria página', () => {
  const req = (origin?: string) => new Request('https://govnexa.com.br/plataforma/documentos-projeto/enviar/', { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal(mesmaOrigem(req('https://govnexa.com.br')), true);
  assert.equal(mesmaOrigem(req('https://outro.com')), false);
  assert.equal(mesmaOrigem(req()), false);
  assert.equal(mesmaOrigem(req('nao-e-url')), false);
});

test('envio: grava no R2 e no banco; chave gerada pelo sistema', async () => {
  const { c, bucket, banco } = montar();
  const r = await enviarDocumento(c, 'P-1', 'Termo.pdf', pdfB());
  assert.equal(r.ok, true);
  const linhas = banco.sqlite.prepare('SELECT * FROM documento').all() as any[];
  assert.equal(linhas.length, 1);
  assert.match(linhas[0].chave_r2, /^5208707\/P-1\/[0-9a-f-]{36}$/);
  assert.ok(bucket.itens.has(linhas[0].chave_r2));
  assert.equal(linhas[0].enviado_por, 'editor@x.gov.br');
  assert.equal(linhas[0].tipo_mime, 'application/pdf');
});
test('envio: perfil leitura não envia; projeto inexistente ou inválido é recusado', async () => {
  const { c } = montar('leitura');
  assert.equal((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB()) as any).status, 403);
  const { c: c2 } = montar('editor');
  assert.equal((await enviarDocumento(c2, 'P-999', 'a.pdf', pdfB()) as any).status, 404);
  assert.equal((await enviarDocumento(c2, '../x', 'a.pdf', pdfB()) as any).status, 404);
});
test('envio: arquivo repetido no mesmo projeto é recusado; sem R2 dá 503', async () => {
  const { c } = montar();
  assert.equal((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB('x'))).ok, true);
  assert.equal((await enviarDocumento(c, 'P-1', 'b.pdf', pdfB('x')) as any).status, 409);
  assert.equal((await enviarDocumento({ ...c, bucket: undefined }, 'P-1', 'c.pdf', pdfB('y')) as any).status, 503);
});
test('envio: se o banco falhar, o arquivo do R2 é apagado', async () => {
  const { c, bucket } = montar();
  const docs = c.repositorio.documentos!;
  c.repositorio = { ...c.repositorio, documentos: { ...docs, registrar: async () => { throw new Error('falhou'); } } };
  assert.equal((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB()) as any).status, 503);
  assert.equal(bucket.itens.size, 0);
});
test('download: devolve como anexo; outra prefeitura não enxerga', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'Termo ç.pdf', pdfB())) as any).id as string;
  const res = await baixarDocumento(c, id) as Response;
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition')!, /^attachment;/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal((await res.text()).startsWith('%PDF'), true);
  const outra = montar('admin', 3550308, banco);
  assert.equal((await baixarDocumento({ ...outra.c, bucket: c.bucket }, id) as any).status, 404);
  assert.equal((await baixarDocumento(c, 'nao-e-uuid') as any).status, 404);
});
test('remoção: só lógica, some da lista e do download, arquivo permanece e guarda quem removeu', async () => {
  const { c, banco, bucket } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB())) as any).id as string;
  assert.equal((await removerDocumento({ ...c, usuario: usuario('leitura') }, id) as any).status, 403);
  assert.equal((await removerDocumento(c, id)).ok, true);
  assert.equal((await removerDocumento(c, id) as any).status, 404);
  assert.equal((await baixarDocumento(c, id) as any).status, 404);
  assert.equal((await c.repositorio.documentos!.listar('P-1')).length, 0);
  const linha = banco.sqlite.prepare('SELECT removido_em, removido_por FROM documento').get() as any;
  assert.ok(linha.removido_em);
  assert.equal(linha.removido_por, 'editor@x.gov.br');
  assert.equal(bucket.itens.size, 1);
  assert.throws(() => banco.sqlite.exec('DELETE FROM documento'), /Remoção só lógica/);
});
test('mensagens: todo código devolvido existe na tabela', () => {
  for (const s of [403, 404, 409, 413, 503]) assert.ok(MENSAGENS[codigoDe({ ok: false, status: s, erro: '' })]);
  for (const e of ['O arquivo passa de 25 MB.', 'Tipo não aceito.', 'O conteúdo não corresponde', 'Informe']) assert.ok(MENSAGENS[codigoDe({ ok: false, status: 400, erro: e })]);
});

test('nome: barra invertida sozinha também é cortada', () => {
  assert.equal(nomeSeguro('a\\b.pdf'), 'b.pdf');
});
test('isolamento: outra prefeitura não lista nem remove', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB())) as any).id as string;
  const outra = montar('admin', 3550308, banco);
  assert.equal((await outra.c.repositorio.documentos!.listar('P-1')).length, 0);
  assert.equal((await removerDocumento(outra.c, id) as any).status, 404);
  const linha = banco.sqlite.prepare('SELECT removido_em FROM documento WHERE id = ?').get(id) as any;
  assert.equal(linha.removido_em, null);
  assert.equal((await c.repositorio.documentos!.listar('P-1')).length, 1);
});
test('limite: a 31ª tentativa na hora é recusada (429)', async () => {
  const { c, banco } = montar();
  for (let i = 0; i < 30; i++) {
    banco.sqlite.prepare(`INSERT INTO documento (id, prefeitura_id, projeto_id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por) VALUES (?, 5208707, 'P-1', 'x.pdf', ?, 'application/pdf', 10, ?, 'editor@x.gov.br')`)
      .run(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `k${i}`, i.toString(16).padStart(64, '0'));
  }
  assert.equal((await enviarDocumento(c, 'P-1', 'novo.pdf', pdfB('novo')) as any).status, 429);
  const outroUsuario = { ...c, usuario: { ...usuario('editor'), email: 'outro@x.gov.br' } };
  assert.equal((await enviarDocumento(outroUsuario, 'P-1', 'novo.pdf', pdfB('novo')) as any).ok, true);
});
test('corrida: dois envios iguais ao mesmo tempo gravam um só (a trava do banco é provada no teste do índice)', async () => {
  const { c, bucket, banco } = montar();
  const [a, b] = await Promise.all([enviarDocumento(c, 'P-1', 'a.pdf', pdfB('igual')), enviarDocumento(c, 'P-1', 'b.pdf', pdfB('igual'))]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal([a, b].filter((r) => !r.ok && (r as any).status === 409).length, 1);
  assert.equal(bucket.itens.size, 1);
  assert.equal((banco.sqlite.prepare('SELECT count(*) AS n FROM documento').get() as any).n, 1);
});
test('remoção: a segunda remoção do mesmo documento não vale (decide pelas linhas alteradas)', async () => {
  const { c } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB())) as any).id as string;
  assert.equal((await removerDocumento(c, id)).ok, true);
  assert.equal((await removerDocumento(c, id)).ok, false);
});
test('acima de 25 MB é recusado lendo só 16 bytes do arquivo', async () => {
  const { c } = montar();
  let lidos = 0;
  const falso = {
    size: LIMITE_BYTES + 1,
    slice: (a: number, b: number) => { lidos += b - a; return new Blob([pdf() as unknown as BlobPart]); },
    arrayBuffer: async () => { lidos += LIMITE_BYTES + 1; return new ArrayBuffer(0); },
    stream: () => { lidos += LIMITE_BYTES + 1; return new Blob([]).stream(); },
  } as unknown as Blob;
  assert.equal((await enviarDocumento(c, 'P-1', 'g.pdf', falso) as any).status, 400);
  assert.equal(lidos, 16);
});
test('índice único: dois ativos iguais no projeto são barrados; removido libera; outro projeto pode', () => {
  const { banco } = montar();
  banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao, valores, recurso, datas, por_ano, atualizacao, operacional, origem, sei, pendencias) VALUES (5208707, 'P-2', 2, 'Obra 2', 'SEINFRA', '{}','{}','{}','{}','{}','{}','{}','[]','[]')");
  const h = 'a'.repeat(64);
  const ins = (id: string, proj: string) => banco.sqlite.prepare("INSERT INTO documento (id, prefeitura_id, projeto_id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por) VALUES (?, 5208707, ?, 'x.pdf', ?, 'application/pdf', 10, ?, 'u@x')").run(id, proj, 'k' + id, h);
  ins('d1', 'P-1');
  assert.throws(() => ins('d2', 'P-1'), /UNIQUE/);
  ins('d3', 'P-2');
  banco.sqlite.exec("UPDATE documento SET removido_em = '2026-01-01T00:00:00.000Z' WHERE id = 'd1'");
  ins('d4', 'P-1');
});
test('envio: falha no R2 devolve 503 sem registrar no banco', async () => {
  const { c, banco, bucket } = montar();
  bucket.put = async () => { throw new Error('R2 fora'); };
  assert.equal((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB()) as any).status, 503);
  assert.equal((banco.sqlite.prepare('SELECT count(*) AS n FROM documento').get() as any).n, 0);
});

const eventos = (banco: ReturnType<typeof bancoTeste>) => banco.sqlite.prepare("SELECT * FROM evento_sistema WHERE tipo = 'documento_classificado' ORDER BY rowid").all() as any[];
test('tipos: DFD, ETP e TR ativos; os outros existem desativados, por prefeitura', async () => {
  const { c, banco } = montar();
  assert.deepEqual((await c.repositorio.documentos!.listarTipos()).map((t) => t.codigo), ['dfd', 'etp', 'tr']);
  const todos = banco.sqlite.prepare('SELECT codigo, ativo, sistema FROM tipo_documento WHERE prefeitura_id = 5208707 ORDER BY ordem').all() as any[];
  assert.equal(todos.length, 8);
  assert.deepEqual(todos.filter((t) => !t.ativo).map((t) => t.codigo), ['mapa_riscos', 'projeto_basico', 'orcamento_referencia', 'art', 'licenca_ambiental']);
  montar('admin', 3550308, banco);
  assert.equal((banco.sqlite.prepare('SELECT count(*) AS n FROM tipo_documento WHERE prefeitura_id = 3550308').get() as any).n, 8);
});
test('tipos: sem DELETE; tipo de sistema não desativa; código não muda; ativar outro funciona', async () => {
  const { c, banco } = montar();
  assert.throws(() => banco.sqlite.exec("DELETE FROM tipo_documento WHERE codigo = 'art'"), /não se apaga/);
  assert.throws(() => banco.sqlite.exec("UPDATE tipo_documento SET ativo = 0 WHERE codigo = 'dfd'"), /CHECK/);
  assert.throws(() => banco.sqlite.exec("UPDATE tipo_documento SET codigo = 'xx' WHERE codigo = 'art'"), /não mudam/);
  banco.sqlite.exec("UPDATE tipo_documento SET ativo = 1 WHERE prefeitura_id = 5208707 AND codigo = 'art'");
  assert.ok((await c.repositorio.documentos!.listarTipos()).some((t) => t.codigo === 'art'));
});
test('envio com tipo: grava o código; inexistente, desativado ou só de outra prefeitura é recusado antes do R2', async () => {
  const { c, banco, bucket } = montar();
  assert.equal((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB('t1'), 'dfd')).ok, true);
  assert.equal((banco.sqlite.prepare('SELECT tipo_codigo FROM documento').get() as any).tipo_codigo, 'dfd');
  montar('admin', 3550308, banco);
  banco.sqlite.exec("UPDATE tipo_documento SET ativo = 1 WHERE prefeitura_id = 3550308 AND codigo = 'art'");
  for (const t of ['xyz', 'art', 'DFD', '../x', 'a', null]) {
    const r = await enviarDocumento(c, 'P-1', 'b.pdf', pdfB('t2'), t) as any;
    assert.equal(r.status, 400, String(t));
    assert.equal(r.erro, ERRO_TIPO);
  }
  assert.equal(bucket.itens.size, 1);
  assert.throws(() => banco.sqlite.exec("INSERT INTO documento (id, prefeitura_id, projeto_id, nome_original, chave_r2, tipo_mime, tamanho_bytes, sha256, enviado_por, tipo_codigo) VALUES ('d9', 5208707, 'P-1', 'x.pdf', 'k9', 'application/pdf', 10, '" + 'b'.repeat(64) + "', 'u@x', 'art')"), /Tipo de documento inválido/);
  assert.equal((await enviarDocumento(c, 'P-1', 'sem.pdf', pdfB('t3'))).ok, true);
});
test('classificar: troca o tipo e grava o evento com de/para e o projeto do banco; mesmo tipo não grava', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB())) as any).id as string;
  assert.equal((await classificarDocumento(c, id, 'etp')).ok, true);
  assert.equal((banco.sqlite.prepare('SELECT tipo_codigo FROM documento WHERE id = ?').get(id) as any).tipo_codigo, 'etp');
  let ev = eventos(banco);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].prefeitura_id, 5208707);
  assert.equal(ev[0].autor, 'editor@x.gov.br');
  assert.equal(ev[0].origem, 'cadastro');
  assert.deepEqual(JSON.parse(ev[0].detalhes), { projeto_id: 'P-1', documento_id: id, tipo_de: null, tipo_para: 'etp' });
  // No Histórico: frase legível, e de/para (que são de ETAPA) ficam vazios para não aparecer como troca de etapa.
  const log = banco.sqlite.prepare("SELECT projeto_id, de, para, descricao FROM log_alteracoes WHERE tipo = 'documento_classificado'").get() as any;
  assert.deepEqual({ ...log }, { projeto_id: 'P-1', de: null, para: null, descricao: 'Tipo do documento a.pdf: Sem tipo → ETP' });
  assert.equal((await classificarDocumento(c, id, 'etp')).ok, true);
  assert.equal(eventos(banco).length, 1);
  assert.equal((await classificarDocumento(c, id, '')).ok, true);
  ev = eventos(banco);
  assert.equal(ev.length, 2);
  assert.deepEqual(JSON.parse(ev[1].detalhes), { projeto_id: 'P-1', documento_id: id, tipo_de: 'etp', tipo_para: null });
  assert.equal(ev[1].descricao, 'Tipo do documento a.pdf: ETP → Sem tipo');
});
test('classificar: leitura 403; id inválido 404; outra prefeitura 404; tipo inválido ou ausente 400; nada gravado', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB(), 'dfd')) as any).id as string;
  assert.equal((await classificarDocumento({ ...c, usuario: usuario('leitura') }, id, 'etp') as any).status, 403);
  assert.equal((await classificarDocumento(c, 'nao-e-uuid', 'etp') as any).status, 404);
  const outra = montar('admin', 3550308, banco);
  assert.equal((await classificarDocumento({ ...outra.c, bucket: c.bucket }, id, 'etp') as any).status, 404);
  for (const t of ['xyz', 'art', null, undefined]) assert.equal((await classificarDocumento(c, id, t) as any).status, 400, String(t));
  assert.equal((banco.sqlite.prepare('SELECT tipo_codigo FROM documento WHERE id = ?').get(id) as any).tipo_codigo, 'dfd');
  assert.equal(eventos(banco).length, 0);
});
test('classificar: documento removido não muda de tipo e não conta', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB('r1'), 'dfd')) as any).id as string;
  await enviarDocumento(c, 'P-1', 'b.pdf', pdfB('r2'), 'tr');
  assert.deepEqual(await c.repositorio.documentos!.contarPorTipo('P-1'), { dfd: 1, tr: 1 });
  assert.equal((await removerDocumento(c, id)).ok, true);
  assert.deepEqual(await c.repositorio.documentos!.contarPorTipo('P-1'), { tr: 1 });
  assert.equal((await classificarDocumento(c, id, 'etp') as any).status, 404);
  assert.throws(() => banco.sqlite.prepare("UPDATE documento SET tipo_codigo = 'etp' WHERE id = ?").run(id), /removido não muda/);
  assert.equal(eventos(banco).length, 0);
});
test('classificar: tipo mudou entre ler e gravar responde 409 e não grava evento', async () => {
  const { c, banco } = montar();
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB())) as any).id as string;
  assert.equal(await c.repositorio.documentos!.classificar(id, 'tr', 'etp', 'editor@x.gov.br', 'P-1', 'x'), 'mudou');
  const docs = c.repositorio.documentos!;
  const velho = { ...c, repositorio: { ...c.repositorio, documentos: { ...docs, obter: async (x: string) => ({ ...(await docs.obter(x))!, tipo_codigo: 'tr' }) } } };
  const r = await classificarDocumento(velho, id, 'etp') as any;
  assert.equal(r.status, 409);
  assert.equal(r.erro, ERRO_MUDOU);
  assert.equal(codigoDe(r), 'mudou');
  assert.equal((banco.sqlite.prepare('SELECT tipo_codigo FROM documento WHERE id = ?').get(id) as any).tipo_codigo, null);
  assert.equal(eventos(banco).length, 0);
});
test('classificar: documento com tipo desativado depois mantém o tipo, aparece com o nome e pode trocar para um ativo', async () => {
  const { c, banco } = montar();
  banco.sqlite.exec("UPDATE tipo_documento SET ativo = 1 WHERE prefeitura_id = 5208707 AND codigo = 'art'");
  const id = ((await enviarDocumento(c, 'P-1', 'a.pdf', pdfB('d1'), 'art')) as any).id as string;
  banco.sqlite.exec("UPDATE tipo_documento SET ativo = 0 WHERE prefeitura_id = 5208707 AND codigo = 'art'");
  const docs = c.repositorio.documentos!;
  assert.equal((await docs.listarTipos()).some((t) => t.codigo === 'art'), false);
  assert.equal((await docs.nomesTipos()).art, 'ART');
  assert.deepEqual(await docs.contarPorTipo('P-1'), { art: 1 });
  // Salvar sem mudar não apaga o tipo nem grava evento.
  assert.equal((await classificarDocumento(c, id, 'art')).ok, true);
  assert.equal((banco.sqlite.prepare('SELECT tipo_codigo FROM documento WHERE id = ?').get(id) as any).tipo_codigo, 'art');
  assert.equal(eventos(banco).length, 0);
  // Outro documento não pode receber o tipo desativado.
  const outro = ((await enviarDocumento(c, 'P-1', 'b.pdf', pdfB('d2'))) as any).id as string;
  assert.equal((await classificarDocumento(c, outro, 'art') as any).status, 400);
  // Trocar para um tipo ativo funciona e o Histórico traz o nome do tipo antigo.
  assert.equal((await classificarDocumento(c, id, 'tr')).ok, true);
  assert.equal(eventos(banco)[0].descricao, 'Tipo do documento a.pdf: ART → TR');
});
test('mensagens da classificação', () => {
  assert.equal(codigoDe({ ok: false, status: 400, erro: ERRO_TIPO }), 'tipodoc');
  for (const k of ['classificado', 'tipodoc', 'mudou']) assert.ok(MENSAGENS[k], k);
});
