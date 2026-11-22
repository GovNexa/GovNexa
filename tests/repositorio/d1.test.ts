process.env.GOVNEXA_EXEMPLO = '1';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bancoTeste } from '../helpers/d1.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { criarRepositorioD1, type BancoD1 } from '../../src/lib/repositorio/d1.ts';
import { repositorio, repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import { carregarCarteira } from '../../src/lib/carteira/carga.ts';

const base = { origem: 'ficha' as const, autor: '', em: '2026-11-16T12:00:00.000Z', projeto_id: 'P-900' };
test('D1: padrões literais GLOB e LIKE respeitam o limite de 50 bytes', () => {
 function verificar(diretorio: string) {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
   const caminho = join(diretorio, entrada.name);
   if (entrada.isDirectory()) { verificar(caminho); continue; }
   if (!entrada.name.endsWith('.sql')) continue;
   // Tokeniza comentários e strings inteiros para não confundir seu conteúdo com operadores.
   const tokens = readFileSync(caminho, 'utf8').match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g) ?? [];
   let operador = '';
   for (const token of tokens) {
    if (token.startsWith('--') || token.startsWith('/*')) continue;
    if (operador && token.startsWith("'")) {
     const padrao = token.slice(1, -1).replaceAll("''", "'");
     assert.ok(Buffer.byteLength(padrao, 'utf8') <= 50, `${caminho}: ${operador} excede 50 bytes: ${token}`);
    }
    operador = /^(GLOB|LIKE)$/i.test(token) ? token : '';
   }
  }
 }
 verificar('db/d1');
});
function preparar() {
 const b = bancoTeste();
 carregarExemplo(b.sqlite);
 return { ...b, repo: criarRepositorioD1(b.db, carregarCarteira().prefeitura_id) };
}
test('D1: leituras de exemplos, cronogramas e log com JSON e booleanos', async () => {
 const { sqlite, repo, db } = preparar();
 try {
  assert.equal(repo.podeGravar, true);
  assert.equal(repositorio().podeGravar, false);
  assert.equal(repositorioD1ParaTestes(db, carregarCarteira().prefeitura_id).podeGravar, true);
  assert.throws(() => criarRepositorioD1(db, 0));
  assert.equal((await repo.listarProjetos()).length, 14);
  const p = await repo.obterProjeto('P-900');
  assert.ok(p);
  assert.deepEqual(p.valores, carregarCarteira().projetos.find(x => x.id === p.id)!.valores);
  assert.ok(Array.isArray(p.sei));
  assert.ok(p.tem_projeto === null || typeof p.tem_projeto === 'boolean');
  assert.equal(await repo.obterProjeto('ausente'), null);
  const c = await repo.listarCronogramas();
  assert.equal(c.length, 2);
  assert.ok(Array.isArray(c[0].sei));
  assert.ok(Array.isArray(c[0].fases[0].etapas[0].pendencias));
  const h = await repo.listarHistorico();
  assert.ok(h.length >= 20);
  assert.ok(h.some(x => x.tipo === 'carga' && x.projeto_id === '*'));
  assert.ok(h.some(x => x.projeto_id === 'P-900' && x.projeto_nome));
  for (let i=1;i<h.length;i++) assert.ok(h[i-1].em >= h[i].em);
  assert.ok((await repo.historico('P-900')).every(x => x.projeto_id === 'P-900'));
  assert.deepEqual(await repo.historico("x'; DROP TABLE projeto; --"), []);
 } finally { sqlite.close(); }
});
test('D1: grava com parâmetros, valida regras e cria projeto com histórico', async () => {
 const { sqlite, repo } = preparar();
 try {
  const p = (await repo.obterProjeto('P-900'))!;
  const antes = await repo.historico(p.id);
  assert.deepEqual(await repo.aplicar({...base, tipo:'mover_macroetapa', para:p.macroetapa!}),
   {ok:false, erro:'O projeto já está nesta macroetapa.'});
  assert.deepEqual(await repo.historico(p.id), antes);
  const malicioso = "x'); DROP TABLE projeto; --";
  assert.ok((await repo.aplicar({...base,tipo:'atualizar_campos',campos:{nome:malicioso}})).ok);
  assert.equal((await repo.obterProjeto(p.id))!.nome, malicioso);
  assert.ok((await repo.historico(p.id)).some(x => x.campos?.some(c => c.depois === malicioso)));
  assert.deepEqual(await repo.aplicar({...base, projeto_id:'ausente',tipo:'registrar_passo',descricao:'',data:''}),
   {ok:false,erro:'Projeto não encontrado.'});
  assert.equal((await repo.criarProjeto({nome:'',orgao:''},'')).ok,false);
  const novo = await repo.criarProjeto({nome:malicioso,orgao: 'TESTE'},'');
  assert.ok(novo.ok);
  assert.equal(novo.projeto.id, 'P-9000');
  assert.equal((await repo.historico(novo.projeto.id))[0].tipo,'criado');
  assert.equal((await repo.obterProjeto(novo.projeto.id))!.compromisso,'ideia');
 } finally { sqlite.close(); }
});
test('D1: falha ao inserir evento reverte atualização do projeto', async () => {
 const { sqlite, repo } = preparar();
 try {
  const e = {...base,tipo:'atualizar_campos' as const,campos:{nome:'Teste'}};
  assert.ok((await repo.aplicar(e)).ok);
  await assert.rejects(repo.aplicar({...e,campos:{nome:'Teste posterior'}}));
  assert.equal((await repo.obterProjeto('P-900'))!.nome,'Teste');
 } finally { sqlite.close(); }
});
test('D1: eventos de projeto e sistema são imutáveis', () => {
 const { sqlite } = preparar();
 try {
  for (const tabela of ['evento_projeto','evento_sistema']) {
   assert.ok(Number(sqlite.prepare('SELECT count(*) AS n FROM '+tabela).get()!.n)>0);
   assert.throws(()=>sqlite.exec('UPDATE '+tabela+" SET autor=''"),/imutável/);
   assert.throws(()=>sqlite.exec('DELETE FROM '+tabela),/imutável/);
  }
 } finally { sqlite.close(); }
});
test('D1: todas as leituras e gravações isolam a prefeitura', async () => {
 const { sqlite, db, repo } = preparar();
 try {
  sqlite.exec("INSERT INTO prefeitura(id,nome,uf) VALUES(1,'',''); INSERT INTO projeto(prefeitura_id,id,nome,codigo_legado) VALUES(1,'outro','',1); INSERT INTO evento_sistema(id,prefeitura_id,tipo,origem,autor,em) VALUES('outro',1,'carga','importacao','','2026-11-16T00:00:00Z'); INSERT INTO cronograma(prefeitura_id,id) VALUES(1,'outro')");
  assert.equal(await repo.obterProjeto('outro'),null);
  assert.ok(!(await repo.listarProjetos()).some(x=>x.id==='outro'));
  assert.ok(!(await repo.listarHistorico()).some(x=>x.id==='outro'));
  assert.deepEqual(await repo.historico('outro'),[]);
  assert.ok(!(await repo.listarCronogramas()).some(x=>x.id==='outro'));
  assert.equal((await repo.aplicar({...base,projeto_id:'outro',tipo:'registrar_passo',descricao:'Teste',data:'2026-11-16'})).ok,false);
  assert.equal((await criarRepositorioD1(db,1).listarProjetos()).length,1);
 } finally { sqlite.close(); }
});
test('D1: revisão rejeita leitura concorrente antiga sem perder o histórico', async () => {
 const { sqlite, db, repo } = preparar();
 try {
  let intercalar = true;
  const concorrente: BancoD1 = {
   prepare: sql => db.prepare(sql),
   async batch(statements) {
    if (intercalar) {
     intercalar = false;
     await repo.aplicar({...base,tipo:'atualizar_campos',campos:{nome:'Concorrente'}});
    }
    return db.batch(statements);
   },
  };
  assert.deepEqual(await criarRepositorioD1(concorrente, carregarCarteira().prefeitura_id).aplicar({
   ...base, em:'2026-11-16T13:00:00Z',tipo:'atualizar_campos',campos:{nome:'Leitura antiga'},
  }), {ok:false, erro:'Projeto alterado por outra pessoa; recarregue a página.'});
  assert.equal((await repo.obterProjeto('P-900'))!.nome,'Concorrente');
 } finally { sqlite.close(); }
});

test('D1: bloqueia DELETE físico e valida metadados de arquivos', () => {
 const { sqlite } = preparar();
 try {
  const id = carregarCarteira().prefeitura_id;
  sqlite.prepare("INSERT INTO projeto_foto(prefeitura_id,projeto_id,id,arquivo_chave,tipo_mime,tamanho_bytes,enviada_por) VALUES(?,'P-900','teste','teste','image/png',1,'')").run(id);
  sqlite.prepare("INSERT INTO documento(prefeitura_id,projeto_id,id,nome_original,chave_r2,tipo_mime,tamanho_bytes,sha256,enviado_por) VALUES(?,'P-900','teste','','teste','application/pdf',1,?,'')").run(id,'a'.repeat(64));
  for (const tabela of ['projeto_foto','documento']) assert.throws(()=>sqlite.exec('DELETE FROM '+tabela),/Remoção só lógica/);
  assert.throws(()=>sqlite.exec('UPDATE projeto_foto SET capa=2'));
  for (const coluna of ["sha256='A'","tipo_mime=''"]) assert.throws(()=>sqlite.exec('UPDATE documento SET '+coluna));
 } finally { sqlite.close(); }
});
test('D1: código legado considera somente a prefeitura corrente', async () => {
 const { sqlite, repo } = preparar();
 try {
  sqlite.exec("INSERT INTO prefeitura(id,nome,uf) VALUES(1,'',''); INSERT INTO projeto(prefeitura_id,id,nome,codigo_legado) VALUES(1,'outro','',999999)");
  const novo = await repo.criarProjeto({nome:'Teste',orgao:'TESTE'},'');
  assert.ok(novo.ok);
  assert.equal(novo.projeto.codigo_legado,9000);
 } finally { sqlite.close(); }
});
test('D1: adaptador recusa escrita fora do batch', async () => {
 const { sqlite, db } = bancoTeste();
 try {
  await assert.rejects(db.prepare('DELETE FROM projeto').all(),/fora do batch/);
  await assert.rejects(db.prepare('DELETE FROM projeto').run(),/fora do batch/);
 } finally { sqlite.close(); }
});

test('D1: normaliza eventos em UTC e recusa datas sem Z no banco', async () => {
 const { sqlite, repo } = preparar();
 try {
  const res = await repo.aplicar({...base,em:'2026-11-16T12:00:00-03:00',tipo:'atualizar_campos',campos:{nome:'Teste UTC'}});
  assert.ok(res.ok);
  assert.equal(res.historico[0].em,'2026-11-16T15:00:00.000Z');
  assert.deepEqual((await repo.historico('P-900')).find(h=>h.id===res.historico[0].id),res.historico[0]);
  assert.ok((await repo.historico('P-900')).some(h=>h.em==='2026-11-16T15:00:00.000Z'));
  for (const em of ['2026-11-16T12:00:00','inválidaZ','2026-99-16T12:00:00Z']) {
   assert.throws(()=>sqlite.prepare("INSERT INTO evento_sistema(id,prefeitura_id,tipo,origem,autor,em) VALUES('data',?,'carga','importacao','',?)").run(carregarCarteira().prefeitura_id,em));
  }
 } finally { sqlite.close(); }
});
