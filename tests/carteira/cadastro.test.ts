// Cadastro de projeto novo (entrega B2): permissão, validação no servidor, campos conhecidos, histórico junto,
// isolamento por prefeitura, código único (migração 0006) e cadastros simultâneos.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Carteira } from '../../src/lib/carteira/tipos.ts';
import { bancoTeste } from '../helpers/d1.ts';
import { carregarExemplo } from '../helpers/carga.ts';
import { repositorioD1ParaTestes } from '../../src/lib/repositorio/index.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import { cadastrarProjeto, normalizarCadastro, type ContextoCadastro } from '../../src/lib/carteira/cadastro.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';

const usuario = (perfil: Usuario['perfil'], pref = 5208707): Usuario => ({ id: 'u1', email: `${perfil}@x.gov.br`, nome: 'N', cargo: null, perfil, prefeitura_id: pref, ativo: true, criado_em: '', atualizado_em: '' } as unknown as Usuario);
type Banco = ReturnType<typeof bancoTeste>;
function montar(perfil: Usuario['perfil'] = 'editor', pref = 5208707, existente?: Banco) {
  const banco = existente ?? bancoTeste('prefeitura');
  banco.sqlite.exec(`INSERT OR IGNORE INTO prefeitura (id, nome, uf) VALUES (${pref}, 'Teste', 'GO')`);
  const c: ContextoCadastro = { usuario: usuario(perfil, pref), repositorio: { ...repositorioD1ParaTestes(banco.db, pref), prefeituraId: pref } };
  return { banco, c };
}
const BASE = { nome: '  Nova UBS do teste ', orgao: 'SMS' };
const projetos = (b: Banco) => b.sqlite.prepare('SELECT id, codigo_legado, nome, orgao, macroetapa, compromisso, localizacao, prefeitura_id FROM projeto ORDER BY codigo_legado').all() as any[];
const eventos = (b: Banco) => b.sqlite.prepare("SELECT projeto_id, tipo, origem, autor, para, descricao FROM evento_projeto WHERE tipo = 'criado' ORDER BY projeto_id").all() as any[];

test('normalizar: obrigatórios, campos conhecidos, textos limpos e valores permitidos', () => {
  assert.deepEqual(normalizarCadastro(null), { ok: false, erros: ['Cadastro inválido.'] });
  assert.deepEqual(normalizarCadastro([]), { ok: false, erros: ['Cadastro inválido.'] });
  const vazio = normalizarCadastro({ nome: '  ', orgao: '' });
  assert.deepEqual(vazio, { ok: false, erros: ['Informe o nome do projeto.', 'Escolha o órgão ou digite a sigla.'] });
  const n = normalizarCadastro({ ...BASE, intruso: '<script>', prefeitura_id: 1, macroetapa: '05', id: 'P-1', observacao: 'a\u0001b\nc', responsavel: 'x'.repeat(500) });
  assert.ok(n.ok);
  if (!n.ok) return;
  assert.equal(n.dados.nome, 'Nova UBS do teste');
  assert.equal(n.dados.observacao, 'a b\nc', 'controle vira espaço, quebra de linha da observação fica');
  assert.equal(n.dados.responsavel?.length, 120);
  assert.equal(n.dados.compromisso, 'ideia');
  assert.equal((n.dados as any).prefeitura_id, undefined);
  assert.equal((n.dados as any).macroetapa, undefined);
  assert.equal((n.dados as any).id, undefined);
  assert.deepEqual(n.dados.sei, []);
});

test('normalizar: SEI, valores em reais, datas, dias e listas fechadas são conferidos', () => {
  const ruim = normalizarCadastro({
    ...BASE, sei: ['123', '00.0.000000001-0'], valor_obra: -1, valor_projeto: '10', tipo: 'QUALQUER', prioridade: 'Urgente',
    tipo_contratacao: 'x', recurso_origem: 'y', tem_projeto: 'sim', termo: 1, compromisso: 'x',
    datas: { pecas_tecnicas: '2026-02-30', planejamento: '30/11/2026', execucao_dias: 1.5 },
  });
  assert.equal(ruim.ok, false);
  if (ruim.ok) return;
  const texto = ruim.erros.join(' | ');
  for (const parte of ['Processo SEI fora do formato', 'Valor estimado da obra', 'Valor do projeto', 'Tipo: valor não permitido', 'Prioridade', 'Tipo de contratação', 'Origem do recurso', 'Tem projeto?', 'Termo de compromisso', 'Compromisso', 'Entrega das peças técnicas: data inválida', 'Fim do planejamento: data inválida', 'Dias de execução']) {
    assert.ok(texto.includes(parte), `falta o erro: ${parte}`);
  }
  assert.equal(normalizarCadastro({ ...BASE, sei: Array.from({ length: 11 }, () => '00.0.000000001-0') }).ok, false);
  assert.equal(normalizarCadastro({ ...BASE, valor_obra: 1e13 }).ok, false);
  assert.equal(normalizarCadastro({ ...BASE, valor_obra: Number.NaN }).ok, false);
  const bom = normalizarCadastro({
    ...BASE, sei: ['00.0.000000001-0'], valor_obra: 1500000.456, valor_projeto: 0, tipo: 'REFORMA', prioridade: 'Alta', tem_projeto: false, termo: true,
    compromisso: 'decidido', datas: { pecas_tecnicas: '2026-03-01', planejamento: '2026-02-01', execucao_dias: 180 },
  });
  assert.ok(bom.ok);
  if (!bom.ok) return;
  assert.equal(bom.dados.valores?.obra, 1500000.46);
  assert.equal(bom.dados.recurso?.termo_compromisso, true);
  assert.equal(bom.dados.datas?.execucao_dias, 180);
  assert.match(bom.avisos[0], /Datas fora de ordem: Fim do planejamento \(01\/02\/2026\) é anterior a Entrega das peças técnicas \(01\/03\/2026\)/);
});

test('normalizar: localização fora de Goiânia e do entorno é recusada; a válida é normalizada', () => {
  const fora = normalizarCadastro({ ...BASE, localizacao: { tipo: 'ponto', ponto: { lat: -10, lng: -40 }, endereco: null } });
  assert.deepEqual(fora, { ok: false, erros: ['Localização: O ponto está fora de Goiânia e do entorno.'] });
  const ok = normalizarCadastro({ ...BASE, localizacao: { tipo: 'ponto', ponto: { lat: -16.7180649, lng: -49.2944312 }, endereco: ' Av. T-63 ', extra: 1 } });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.dados.localizacao, { tipo: 'ponto', ponto: { lat: -16.718065, lng: -49.294431 }, endereco: 'Av. T-63' });
});

test('cadastrar: perfil de leitura é recusado (403) e nada é gravado', async () => {
  const { banco, c } = montar('leitor' as Usuario['perfil']);
  const r = await cadastrarProjeto(c, BASE);
  assert.deepEqual(r, { ok: false, status: 403, erro: 'Seu perfil não permite cadastrar projetos.' });
  assert.equal(projetos(banco).length, 0);
  assert.equal(eventos(banco).length, 0);
});

test('cadastrar: editor grava o projeto na macroetapa 00, com o autor da sessão e o histórico junto', async () => {
  const { banco, c } = montar('editor');
  const r = await cadastrarProjeto(c, { ...BASE, compromisso: 'decidido', prefeitura_id: 999, autor: 'invasor@x.gov.br', localizacao: { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: null } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.projeto.id, 'P-9000');
  assert.equal(r.projeto.macroetapa, '00');
  assert.ok(r.pendencias.includes('Sem região'));
  const [p] = projetos(banco);
  assert.equal(p.prefeitura_id, 5208707, 'a prefeitura vem do repositório, não do pedido');
  assert.equal(p.nome, 'Nova UBS do teste');
  assert.equal(p.compromisso, 'decidido');
  assert.deepEqual(JSON.parse(p.localizacao), { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: null });
  assert.deepEqual(eventos(banco).map((e) => ({ ...e })), [{ projeto_id: 'P-9000', tipo: 'criado', origem: 'cadastro', autor: 'editor@x.gov.br', para: '00', descricao: 'Projeto incluído no cadastro' }]);
});

test('cadastrar: dado inválido devolve 400 com a lista e não grava nada', async () => {
  const { banco, c } = montar('gestor');
  const r = await cadastrarProjeto(c, { nome: '', orgao: '' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.deepEqual(r.erros, ['Informe o nome do projeto.', 'Escolha o órgão ou digite a sigla.']);
  }
  assert.equal(projetos(banco).length, 0);
});

test('cadastrar: texto malicioso fica só como parâmetro (SQL) e como texto puro', async () => {
  const { banco, c } = montar('editor');
  const sql = "x'); DROP TABLE projeto; --";
  const r = await cadastrarProjeto(c, { nome: sql, orgao: '<img src=x onerror=alert(1)>', observacao: '<script>alert(1)</script>' });
  assert.ok(r.ok);
  assert.equal(projetos(banco)[0].nome, sql);
  assert.equal(projetos(banco)[0].orgao, '<img src=x onerror=alert(1)>');
  assert.equal(banco.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'projeto'").get()!.n, 1);
});

test('códigos: cada cadastro recebe o número seguinte e o código nunca se repete na prefeitura', async () => {
  const { banco, c } = montar('editor');
  for (let i = 0; i < 3; i++) assert.ok((await cadastrarProjeto(c, { ...BASE, nome: `Obra ${i}` })).ok);
  assert.deepEqual(projetos(banco).map((p) => p.id), ['P-9000', 'P-9001', 'P-9002']);
  assert.throws(() => banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (5208707, 'OUTRO', 9001, 'Repetido')"), /UNIQUE constraint failed: projeto\.prefeitura_id, projeto\.codigo_legado/);
  // Outra prefeitura pode usar o mesmo número; projeto sem número (nulo) continua permitido.
  banco.sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1111111, 'Outra', 'GO')");
  banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (1111111, 'P-9001', 9001, 'Da outra')");
  banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (5208707, 'SEM-1', NULL, 'Sem número 1')");
  banco.sqlite.exec("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (5208707, 'SEM-2', NULL, 'Sem número 2')");
});

test('códigos: dois cadastros ao mesmo tempo não repetem número, não perdem projeto nem deixam histórico solto', async () => {
  const { banco, c } = montar('editor');
  let lotes = 0;
  const original = banco.db.batch.bind(banco.db);
  banco.db.batch = (s: any[]) => { lotes += 1; return original(s); };
  const resultados = await Promise.all(Array.from({ length: 5 }, (_, i) => cadastrarProjeto(c, { ...BASE, nome: `Simultâneo ${i}` })));
  assert.ok(lotes > 5, `houve colisão de verdade e repetição (lotes enviados: ${lotes})`);
  assert.ok(resultados.every((r) => r.ok), JSON.stringify(resultados.filter((r) => !r.ok)));
  const ids = projetos(banco).map((p) => p.id).sort();
  assert.deepEqual(ids, ['P-9000', 'P-9001', 'P-9002', 'P-9003', 'P-9004']);
  assert.equal(eventos(banco).length, 5);
  assert.equal(banco.sqlite.prepare('SELECT count(*) AS n FROM evento_projeto e LEFT JOIN projeto p ON p.prefeitura_id = e.prefeitura_id AND p.id = e.projeto_id WHERE p.id IS NULL').get()!.n, 0);
});

test('códigos: se o banco recusar sempre, o repositório desiste com mensagem e nada fica gravado', async () => {
  const { banco } = montar('editor');
  const teimoso = {
    prepare: (sql: string) => banco.db.prepare(sql),
    async batch(_s: any[]) { throw new Error('D1_ERROR: UNIQUE constraint failed: projeto.prefeitura_id, projeto.codigo_legado: SQLITE_CONSTRAINT'); },
  };
  const repo = criarRepositorioD1(teimoso as any, 5208707);
  const r = await repo.criarProjeto({ nome: 'A', orgao: 'B' }, 'x@x');
  assert.deepEqual(r, { ok: false, codigo: 'concorrencia', erro: 'Muitos cadastros ao mesmo tempo. Tente de novo em instantes.' });
  assert.equal(projetos(banco).length, 0);
  // Outro erro do banco não é engolido.
  const quebrado = { prepare: teimoso.prepare, async batch() { throw new Error('D1_ERROR: disco cheio'); } };
  await assert.rejects(criarRepositorioD1(quebrado as any, 5208707).criarProjeto({ nome: 'A', orgao: 'B' }, 'x@x'), /disco cheio/);
});

test('migração 0006: índice único parcial do código e nenhuma alteração de dados', () => {
  const sql = readFileSync('db/d1/prefeitura/0006_codigo_projeto_unico.sql', 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS projeto_codigo_unico ON projeto \(prefeitura_id, codigo_legado\) WHERE codigo_legado IS NOT NULL/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(UPDATE|DELETE|DROP|ALTER|INSERT)\b/i);
});

test('normalizar: invisíveis, controles C1 e marcas de direção viram espaço; o corte não parte caractere', () => {
  const n = normalizarCadastro({ nome: 'Obra‮x​y', orgao: 'S­mS', responsavel: '😀'.repeat(200) });
  assert.ok(n.ok);
  if (!n.ok) return;
  assert.equal(n.dados.nome, 'Obra x  y');
  assert.equal(n.dados.orgao, 'S mS');
  assert.equal(Array.from(n.dados.responsavel ?? '').length, 120);
  assert.equal(n.dados.responsavel, '😀'.repeat(120));
});

test('histórico do cadastro inclui a localização inicial', async () => {
  const { banco, c } = montar('editor');
  await cadastrarProjeto(c, { ...BASE, localizacao: { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: null } });
  const campos = JSON.parse((banco.sqlite.prepare("SELECT campos FROM evento_projeto WHERE tipo = 'criado'").get() as any).campos);
  assert.ok(campos.some((x: any) => x.campo === 'localizacao' && x.depois.tipo === 'ponto'));
});

test('repetição: só código ou id repetido é tentado de novo; outro índice único vira erro de verdade', async () => {
  const { banco } = montar('editor');
  const outro = { prepare: (sql: string) => banco.db.prepare(sql), async batch() { throw new Error('D1_ERROR: UNIQUE constraint failed: projeto.prefeitura_id, projeto.sei: SQLITE_CONSTRAINT'); } };
  await assert.rejects(criarRepositorioD1(outro as any, 5208707).criarProjeto({ nome: 'A', orgao: 'B' }, 'x@x'), /projeto\.sei/);
});

test('faixa 9000: carga 900–913 com ou sem código 8999 precede P-9000; código 12000 precede P-12001', async (t) => {
  for (const comCodigoManual of [false, true]) {
    const { banco, c } = montar();
    t.after(() => banco.sqlite.close());
    carregarExemplo(banco.sqlite);
    const inserir = banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome) VALUES (?, ?, ?, 'Manual')");
    if (comCodigoManual) inserir.run(5208707, 'P-8999', 8999);
    const primeiro = await cadastrarProjeto(c, BASE);
    assert.ok(primeiro.ok);
    assert.equal(primeiro.projeto.id, 'P-9000');
    inserir.run(5208707, 'P-12000', 12000);
    const proximo = await cadastrarProjeto(c, BASE);
    assert.ok(proximo.ok);
    assert.equal(proximo.projeto.id, 'P-12001');
  }
});

test('cadastro: área e prioritário entram no projeto e no histórico; área fora do catálogo é recusada', async (t) => {
  const { banco, c } = montar();
  t.after(() => banco.sqlite.close());
  const invalido = await cadastrarProjeto(c, { ...BASE, area: 'inexistente' });
  assert.deepEqual(invalido, { ok: false, status: 400, erro: 'Cadastro inválido.', erros: ['Área: valor não permitido.'] });
  assert.deepEqual(projetos(banco), []);
  const r = await cadastrarProjeto(c, { ...BASE, area: 'saude', prioritario: true });
  assert.ok(r.ok);
  const p = await c.repositorio.obterProjeto(r.projeto.id);
  assert.equal(p!.area, 'saude');
  assert.equal(p!.prioritario, true);
  const [h] = await c.repositorio.historico(r.projeto.id);
  assert.deepEqual(h.campos?.filter(({ campo }) => campo === 'area' || campo === 'prioritario'), [
    { campo: 'area', antes: null, depois: 'saude' },
    { campo: 'prioritario', antes: null, depois: true },
  ]);
  const semArea = await cadastrarProjeto(c, BASE);
  assert.ok(semArea.ok);
  const padrao = await c.repositorio.obterProjeto(semArea.projeto.id);
  assert.equal(padrao!.area, null);
  assert.equal(padrao!.prioritario, false);
});

test('carga de planilha: área e prioritário entram; ausente mantém; CADASTRO e área fora do catálogo são preservados', (t) => {
  const { sqlite } = bancoTeste();
  t.after(() => sqlite.close());
  carregarExemplo(sqlite);
  const campos = (id: string) => ({ ...sqlite.prepare('SELECT area, prioritario FROM projeto WHERE prefeitura_id = ? AND id = ?').get(5208707, id) });
  assert.deepEqual(campos('P-901'), { area: 'saude', prioritario: 1 });
  assert.deepEqual(campos('P-902'), { area: 'educacao', prioritario: 0 });
  sqlite.exec("UPDATE projeto SET area = 'esporte', prioritario = 1 WHERE prefeitura_id = 5208707 AND id IN ('P-900', 'P-902')");
  sqlite.prepare("UPDATE projeto SET area = NULL, prioritario = 0, origem = ? WHERE prefeitura_id = ? AND id = ?").run(JSON.stringify({ aba: 'CADASTRO' }), 5208707, 'P-904');

  const pasta = mkdtempSync('.tmp/carga-e1-');
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  cpSync('data/exemplo', pasta, { recursive: true });
  const arquivo = join(pasta, 'carteira', 'carteira.json');
  const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as Carteira;
  dados.projetos.find((p) => p.id === 'P-902')!.area = 'inexistente';
  dados.projetos.find((p) => p.id === 'P-906')!.prioritario = false;
  sqlite.exec("UPDATE projeto SET prioritario = 1 WHERE prefeitura_id = 5208707 AND id = 'P-906'");
  writeFileSync(arquivo, JSON.stringify(dados), 'utf8');
  const saida = join(pasta, 'carga.sql');
  execFileSync(process.execPath, ['scripts/gerar-sql-carga.ts', '--dados', pasta, '--saida', saida, '--dialeto', 'sqlite']);
  sqlite.exec(readFileSync(saida, 'utf8'));
  assert.deepEqual(campos('P-900'), { area: 'esporte', prioritario: 1 });
  assert.deepEqual(campos('P-902'), { area: 'esporte', prioritario: 1 });
  assert.deepEqual(campos('P-904'), { area: null, prioritario: 0 });
  assert.deepEqual(campos('P-906'), { area: 'saude', prioritario: 0 });
});

test('carga de planilha: nunca sobrescreve projeto cadastrado pela tela, mesmo com o mesmo código', () => {
  const banco = bancoTeste('prefeitura');
  const sql = carregarExemplo(banco.sqlite);
  assert.match(sql, /DO UPDATE SET[^;]*WHERE json_extract\(projeto\.origem, '\$\.aba'\) IS NOT 'CADASTRO';/);
  banco.sqlite.exec("UPDATE projeto SET nome = 'Cadastrado pela tela', origem = '{\"aba\":\"CADASTRO\",\"linha\":0}' WHERE id = 'P-900'");
  banco.sqlite.exec(sql); // nova importação com o mesmo código
  assert.equal((banco.sqlite.prepare("SELECT nome FROM projeto WHERE id = 'P-900'").get() as any).nome, 'Cadastrado pela tela');
  assert.notEqual((banco.sqlite.prepare("SELECT nome FROM projeto WHERE id = 'P-901'").get() as any).nome, 'Cadastrado pela tela');
});
