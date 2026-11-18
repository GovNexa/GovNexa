// Gravação da localização (entrega B1): permissão, validação, isolamento por prefeitura, histórico e índices da migração 0004.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bancoTeste } from '../helpers/d1.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import { comInvalidacao, lerComCache, invalidarCache } from '../../src/lib/repositorio/cache.ts';
import { normalizarLocalizacao, resumoLocalizacao, salvarLocalizacao, type ContextoLocalizacao } from '../../src/lib/mapa/servico.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const PONTO = { tipo: 'ponto', ponto: { lat: -16.7180649, lng: -49.2944312 }, endereco: '  Av. T-63\n ' };
const SALVO = { tipo: 'ponto', ponto: { lat: -16.718065, lng: -49.294431 }, endereco: 'Av. T-63' };
const TRECHOS = { tipo: 'trechos', trechos: [{ rua: 'Avenida Exemplo', de: null, ate: 'Rua 1', linha: [{ lat: -16.7, lng: -49.3 }, { lat: -16.71, lng: -49.31 }] }] };
const usuario = (perfil: Usuario['perfil'], pref = 5208707): Usuario => ({ id: 'u1', email: `${perfil}@x.gov.br`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '' });
type Banco = ReturnType<typeof bancoTeste>;
function montar(perfil: Usuario['perfil'] = 'editor', pref = 5208707, bancoExistente?: Banco) {
  const banco = bancoExistente ?? bancoTeste('prefeitura');
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  banco.sqlite.exec(`INSERT OR IGNORE INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao, valores, recurso, datas, por_ano, atualizacao, operacional, origem, sei, pendencias) VALUES (${pref}, 'P-1', 1, 'Obra', 'SEINFRA', '{}','{}','{}','{}','{}','{}','{}','[]','[]')`);
  const c: ContextoLocalizacao = { usuario: usuario(perfil, pref), repositorio: { ...repositorioD1ParaTestes(banco.db, pref), prefeituraId: pref } };
  return { banco, c };
}
const linha = (banco: Banco, pref = 5208707) =>
  banco.sqlite.prepare('SELECT localizacao, revisao FROM projeto WHERE prefeitura_id = ? AND id = ?').get(pref, 'P-1') as { localizacao: string | null; revisao: number };
const eventos = (banco: Banco) =>
  banco.sqlite.prepare("SELECT prefeitura_id, projeto_id, tipo, origem, autor, descricao FROM evento_projeto WHERE tipo = 'localizacao_alterada' ORDER BY em, id").all() as any[];

test('normalizar: só os campos conhecidos, 6 casas e textos limpos', () => {
  const n = normalizarLocalizacao({ ...PONTO, intruso: '<script>', ponto: { ...PONTO.ponto, extra: 1 } });
  assert.deepEqual(n, { ok: true, valor: SALVO });
  const t = normalizarLocalizacao({ tipo: 'trechos', trechos: [{ ...TRECHOS.trechos[0], rua: ` ${'R'.repeat(300)} `, outro: 1 }] });
  assert.equal(t.ok && t.valor.tipo === 'trechos' && t.valor.trechos[0].rua.length, 120);
  assert.equal(t.ok && t.valor.tipo === 'trechos' && Object.keys(t.valor.trechos[0]).join(), 'rua,de,ate,linha');
  assert.equal(normalizarLocalizacao({ tipo: 'ponto', ponto: { lat: 0, lng: 0 } }).ok, false);
  // Rua só com caracteres de controle passa na primeira conferência e fica vazia depois da limpeza: recusada.
  assert.deepEqual(normalizarLocalizacao({ tipo: 'trechos', trechos: [{ ...TRECHOS.trechos[0], rua: '\u0001\u0002' }] }), { ok: false, erros: ['Trecho 1: informe o nome da rua.'] });
  assert.equal(normalizarLocalizacao('x').ok, false);
  assert.equal(normalizarLocalizacao(null).ok, false);
});

test('salvar: grava a localização, sobe a revisão e registra o evento na mesma operação', async () => {
  const { banco, c } = montar();
  const antes = linha(banco).revisao;
  const r = await salvarLocalizacao(c, 'P-1', PONTO);
  assert.equal(r.ok && r.mudou, true);
  assert.deepEqual(JSON.parse(linha(banco).localizacao!), SALVO);
  assert.equal(linha(banco).revisao, antes + 1);
  assert.deepEqual(eventos(banco).map((e) => ({ ...e })), [{
    prefeitura_id: 5208707, projeto_id: 'P-1', tipo: 'localizacao_alterada', origem: 'cadastro', autor: 'editor@x.gov.br',
    descricao: 'Localização cadastrada: ponto em latitude -16.718065, longitude -49.294431 (Av. T-63)',
  }]);
  assert.deepEqual((await c.repositorio.obterProjeto('P-1'))!.localizacao, SALVO);
});

test('salvar: repetir o mesmo valor não grava nem cria evento; trocar registra o antes', async () => {
  const { banco, c } = montar();
  await salvarLocalizacao(c, 'P-1', PONTO);
  const rev = linha(banco).revisao;
  const igual = await salvarLocalizacao(c, 'P-1', PONTO);
  assert.equal(igual.ok && igual.mudou, false);
  assert.equal(linha(banco).revisao, rev);
  assert.equal(eventos(banco).length, 1);
  assert.equal((await salvarLocalizacao(c, 'P-1', TRECHOS)).ok, true);
  assert.equal(eventos(banco)[1].descricao, 'Localização alterada: 1 trecho (Avenida Exemplo). Antes: ponto em latitude -16.718065, longitude -49.294431 (Av. T-63)');
  assert.equal(resumoLocalizacao(JSON.parse(linha(banco).localizacao!)), '1 trecho (Avenida Exemplo)');
});

test('salvar: perfil de leitura, projeto inexistente e valor inválido são recusados sem gravar', async () => {
  const leitura = montar('leitura');
  assert.equal(((await salvarLocalizacao(leitura.c, 'P-1', PONTO)) as any).status, 403);
  const inativo = montar();
  inativo.c.usuario = { ...inativo.c.usuario, ativo: false };
  assert.equal(((await salvarLocalizacao(inativo.c, 'P-1', PONTO)) as any).status, 403);
  const { banco, c } = montar();
  assert.equal(((await salvarLocalizacao(c, 'P-2', PONTO)) as any).status, 404);
  assert.equal(((await salvarLocalizacao(c, "P-1' OR '1'='1", PONTO)) as any).status, 404);
  const fora = (await salvarLocalizacao(c, 'P-1', { tipo: 'ponto', ponto: { lat: -10, lng: -40 }, endereco: null })) as any;
  assert.equal(fora.status, 400);
  assert.deepEqual(fora.erros, ['O ponto está fora de Goiânia e do entorno.']);
  assert.equal(((await salvarLocalizacao(c, 'P-1', { tipo: 'outro' })) as any).status, 400);
  for (const b of [leitura.banco, inativo.banco, banco]) {
    assert.equal(linha(b).localizacao, null);
    assert.equal(eventos(b).length, 0);
  }
  // Repositório sem gravação de localização (JSON, por exemplo): indisponível, sem erro de execução.
  const semGravacao = { ...c, repositorio: { ...c.repositorio, definirLocalizacao: undefined } };
  assert.equal(((await salvarLocalizacao(semGravacao, 'P-1', PONTO)) as any).status, 503);
});

test('salvar: uma prefeitura não altera o projeto de mesmo código de outra', async () => {
  const a = montar('editor', 5208707);
  const b = montar('editor', 5200000, a.banco);
  assert.equal((await salvarLocalizacao(b.c, 'P-1', PONTO)).ok, true);
  assert.equal(linha(a.banco, 5208707).localizacao, null);
  assert.notEqual(linha(a.banco, 5200000).localizacao, null);
  assert.deepEqual(eventos(a.banco).map((e) => e.prefeitura_id), [5200000]);
  assert.equal((await a.c.repositorio.historico('P-1')).length, 0);
  assert.equal((await b.c.repositorio.historico('P-1')).length, 1);
});

test('salvar: duas gravações ao mesmo tempo: só uma vale, a outra recebe conflito e nada fica pela metade', async () => {
  const { banco, c } = montar();
  const repo = c.repositorio;
  // Enquanto a primeira pessoa decide, outra grava: a revisão lida já não é a do banco.
  const r = await repo.definirLocalizacao!('P-1', () => {
    banco.sqlite.exec("UPDATE projeto SET localizacao = '{\"tipo\":\"ponto\",\"ponto\":{\"lat\":-16.6,\"lng\":-49.2},\"endereco\":null}', revisao = revisao + 1 WHERE id = 'P-1'");
    return { valor: SALVO as any, descricao: 'x' };
  }, 'editor@x.gov.br');
  assert.equal(r, 'conflito');
  assert.deepEqual(JSON.parse(linha(banco).localizacao!).ponto, { lat: -16.6, lng: -49.2 });
  assert.equal(eventos(banco).length, 0);
  // Pelo serviço, o conflito vira 409 com mensagem para recarregar.
  const conflitante = { ...c, repositorio: { ...repo, definirLocalizacao: async () => 'conflito' as const } };
  const s = (await salvarLocalizacao(conflitante, 'P-1', PONTO)) as any;
  assert.equal(s.status, 409);
  assert.match(s.erro, /Recarregue/);
  // Localização antiga em formato que a validação não aceita conta como "sem localização": grava como cadastrada.
  banco.sqlite.exec("UPDATE projeto SET localizacao = '{\"tipo\":\"ponto\",\"lat\":-16.68,\"lng\":-49.25}' WHERE id = 'P-1'");
  assert.equal((await salvarLocalizacao(c, 'P-1', PONTO)).ok, true);
  assert.match(eventos(banco)[0].descricao, /^Localização cadastrada:/);
});

test('salvar: edição do projeto baseada em leitura anterior à localização é recusada', async () => {
  const { banco, c } = montar();
  const revAntiga = linha(banco).revisao;
  await salvarLocalizacao(c, 'P-1', PONTO);
  // Quem leu o projeto antes grava com a revisão antiga, como faz `aplicar`: nada é alterado.
  const r = banco.sqlite.prepare("UPDATE projeto SET nome = 'X', revisao = revisao + 1 WHERE id = 'P-1' AND revisao = ?").run(revAntiga);
  assert.equal(Number(r.changes), 0);
  assert.notEqual(linha(banco).localizacao, null);
});

test('cache: salvar a localização limpa o cache da prefeitura', async () => {
  invalidarCache();
  const { banco, c } = montar();
  const repo = comInvalidacao({ ...repositorioD1ParaTestes(banco.db, 5208707) }, 5208707);
  let leituras = 0;
  const ler = () => lerComCache(5208707, async () => { leituras++; return (await repo.obterProjeto('P-1'))!.localizacao ?? null; });
  assert.equal(await ler(), null);
  assert.equal(await ler(), null);
  assert.equal(leituras, 1);
  assert.equal((await salvarLocalizacao({ ...c, repositorio: repo }, 'P-1', PONTO)).ok, true);
  assert.notEqual(await ler(), null);
  assert.equal(leituras, 2);
  invalidarCache();
});

test('histórico do projeto: junta eventos de projeto e de sistema, em ordem, igual à visão log_alteracoes', async () => {
  const { banco, c } = montar();
  await salvarLocalizacao(c, 'P-1', PONTO);
  const ins = banco.sqlite.prepare('INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) VALUES (?, 5208707, ?, ?, ?, ?, ?, ?)');
  ins.run('s1', 'documento_classificado', 'cadastro', 'a@x.gov.br', '2020-01-01T00:00:00.000Z', 'Tipo', JSON.stringify({ projeto_id: 'P-1', tipo_de: null, tipo_para: 'etp' }));
  ins.run('s2', 'carga', 'importacao', 'rotina', '2020-01-02T00:00:00.000Z', 'Carga', null);
  ins.run('s3', 'carga', 'importacao', 'rotina', '2020-01-03T00:00:00.000Z', 'Outro projeto', JSON.stringify({ projeto_id: 'P-9' }));
  ins.run('s4', 'carga', 'importacao', 'rotina', '2020-01-04T00:00:00.000Z', 'Lista', JSON.stringify(['P-1']));
  const h = await c.repositorio.historico('P-1');
  assert.deepEqual(h.map((x) => (x.id.length === 36 ? 'local' : x.id)), ['s1', 'local']);
  const visao = banco.sqlite.prepare("SELECT id FROM log_alteracoes WHERE prefeitura_id = 5208707 AND projeto_id = 'P-1' ORDER BY em, id").all() as { id: string }[];
  assert.deepEqual(h.map((x) => x.id), visao.map((x) => x.id));
  // A coluna calculada reflete `detalhes` e não aceita gravação direta.
  const colunas = (banco.sqlite.prepare('SELECT id, projeto_id FROM evento_sistema ORDER BY id').all() as any[]).map((x) => `${x.id}:${x.projeto_id}`);
  assert.deepEqual(colunas, ['s1:P-1', 's2:null', 's3:P-9', 's4:null']);
  assert.throws(() => banco.sqlite.exec("INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, projeto_id) VALUES ('s5', 5208707, 'x', 'x', 'x', '2020-01-05T00:00:00.000Z', 'P-1')"));
});

test('migração 0004: aplicada sobre banco já com dados, mantém a visão do histórico e os gatilhos', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const migrar = (arq: string) => sqlite.exec(readFileSync(`db/d1/prefeitura/${arq}`, 'utf8'));
  for (const arq of ['0001_carteira.sql', '0002_documento_removido_por.sql', '0003_tipo_documento.sql']) migrar(arq);
  sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'A', 'GO')");
  sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (1, 'P-1', 1, 'Obra')");
  sqlite.exec("INSERT INTO evento_projeto (id, prefeitura_id, projeto_id, tipo, origem, autor, em) VALUES ('e1', 1, 'P-1', 'criado', 'cadastro', 'a', '2020-01-01T00:00:00.000Z')");
  const ins = sqlite.prepare("INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao, detalhes) VALUES (?, 1, 'x', 'importacao', 'a', ?, 'd', ?)");
  ins.run('s1', '2020-01-02T00:00:00.000Z', JSON.stringify({ projeto_id: 'P-1', de: '00', para: '01' }));
  ins.run('s2', '2020-01-03T00:00:00.000Z', null);
  ins.run('s3', '2020-01-04T00:00:00.000Z', JSON.stringify(['P-1']));
  ins.run('s4', '2020-01-05T00:00:00.000Z', JSON.stringify('texto solto'));
  const visao = () => JSON.stringify(sqlite.prepare('SELECT * FROM log_alteracoes ORDER BY em, id').all());
  const antes = visao();
  migrar('0004_historico_por_projeto.sql');
  assert.equal(visao(), antes);
  assert.deepEqual((sqlite.prepare('SELECT id, projeto_id FROM evento_sistema ORDER BY id').all() as any[]).map((x) => x.projeto_id), ['P-1', null, null, null]);
  // O código anterior à migração continua gravando: INSERT com e sem lista de colunas.
  sqlite.exec("INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em) VALUES ('s5', 1, 'x', 'x', 'a', '2020-01-06T00:00:00.000Z')");
  sqlite.exec("INSERT INTO evento_sistema VALUES ('s6', 1, 'x', 'x', 'a', '2020-01-07T00:00:00.000Z', NULL, NULL)");
  assert.throws(() => sqlite.exec("UPDATE evento_sistema SET descricao = 'y' WHERE id = 's1'"), /Histórico imutável/);
  assert.throws(() => sqlite.exec("DELETE FROM evento_projeto WHERE id = 'e1'"), /Histórico imutável/);
  assert.equal((sqlite.prepare('PRAGMA integrity_check').get() as any).integrity_check, 'ok');
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('migração 0004: o histórico de um projeto usa os índices, sem varrer as tabelas', () => {
  const { banco } = montar();
  const plano = (sql: string) => (banco.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((x) => x.detail).join(' | ');
  const p = plano("SELECT id, em FROM evento_projeto WHERE prefeitura_id = 1 AND projeto_id = 'P-1' UNION ALL SELECT id, em FROM evento_sistema WHERE prefeitura_id = 1 AND projeto_id = 'P-1' ORDER BY em, id");
  assert.match(p, /evento_projeto_projeto_em_idx/);
  assert.match(p, /evento_sistema_projeto_em_idx/);
  assert.doesNotMatch(p, /SCAN evento_(projeto|sistema)(?! USING)/);
  const indices = (banco.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'evento_projeto'").all() as { name: string }[]).map((x) => x.name);
  assert.equal(indices.includes('evento_projeto_projeto_idx'), false);
});
