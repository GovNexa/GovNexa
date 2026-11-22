import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerCorrecoes, resolverCodigosRepetidos } from '../../scripts/importar-carteira.ts';
import { codigosNaFaixaDoCadastro, importarPlanilhas, relatorioMd } from '../../scripts/importar-planilhas.ts';
import type { Projeto } from '../../src/lib/carteira/tipos.ts';

const proj = (codigo: number, orgao: string | null, linha: number): Projeto =>
  ({ id: `P-${codigo}`, codigo_legado: codigo, orgao, origem: { aba: 'PIPELINE', linha } }) as unknown as Projeto;

test('códigos repetidos: sem repetição nada muda', () => {
  const ps = [proj(1, 'A', 2), proj(2, 'B', 3)];
  const r = resolverCodigosRepetidos(ps, []);
  assert.deepEqual(r.repetidos, []);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(ps.map((p) => p.id), ['P-1', 'P-2']);
});

test('códigos repetidos: repetição sem correção fica "não resolvida" e traz só código, linhas e órgãos', () => {
  const ps = [proj(450, 'SECAP', 280), proj(450, 'SEINFRA', 281), proj(7, 'X', 5)];
  const r = resolverCodigosRepetidos(ps, []);
  assert.equal(r.repetidos.length, 1);
  assert.deepEqual(r.repetidos[0], { codigo: 450, linhas: [280, 281], orgaos: ['SECAP', 'SEINFRA'], resolvido: false });
  assert.deepEqual(ps.map((p) => p.id).sort(), ['P-450', 'P-450', 'P-7']); // nada foi alterado sozinho
});

test('códigos repetidos: a correção renumera só o projeto do órgão indicado (sem diferenciar maiúsculas) e deixa ids únicos', () => {
  const ps = [proj(450, 'SECAP', 280), proj(450, 'SEINFRA', 281), proj(505, 'Y', 9)];
  const r = resolverCodigosRepetidos(ps, [{ codigo: 450, orgao: ' secap ', novo: 506 }]);
  assert.equal(r.repetidos[0].resolvido, true);
  assert.equal(r.repetidos[0].novo, 506);
  assert.deepEqual(r.naoUsadas, []);
  assert.deepEqual(r.erros, []);
  const porId = Object.fromEntries(ps.map((p) => [p.id, p.orgao]));
  assert.deepEqual(porId, { 'P-450': 'SEINFRA', 'P-506': 'SECAP', 'P-505': 'Y' });
  assert.equal(new Set(ps.map((p) => p.id)).size, 3);
  assert.deepEqual(ps.map((p) => p.codigo_legado), [450, 505, 506]); // reordenado pelo código
});

test('códigos repetidos: código novo que já existe, ou usado duas vezes, é erro e nada é renumerado', () => {
  const ps = [proj(450, 'SECAP', 2), proj(450, 'SEINFRA', 3), proj(506, 'Z', 4)];
  const r = resolverCodigosRepetidos(ps, [{ codigo: 450, orgao: 'SECAP', novo: 506 }]);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /já existe/);
  assert.equal(r.repetidos[0].resolvido, false);
  const ps2 = [proj(1, 'A', 2), proj(1, 'B', 3), proj(2, 'C', 4), proj(2, 'D', 5)];
  const r2 = resolverCodigosRepetidos(ps2, [{ codigo: 1, orgao: 'A', novo: 9 }, { codigo: 2, orgao: 'C', novo: 9 }]);
  assert.match(r2.erros.join(' '), /mais de uma correção/);
});

test('códigos repetidos: correção que não casa com nenhum repetido é avisada como sem efeito', () => {
  const ps = [proj(1, 'A', 2), proj(2, 'B', 3)];
  const r = resolverCodigosRepetidos(ps, [{ codigo: 450, orgao: 'SECAP', novo: 506 }]);
  assert.equal(r.naoUsadas.length, 1);
  assert.deepEqual(r.repetidos, []);
});

test('correções: arquivo é validado', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gn-corr-'));
  try {
    const ok = join(pasta, 'ok.json');
    writeFileSync(ok, JSON.stringify([{ codigo: 450, orgao: 'SECAP', novo: 506, motivo: 'x' }]));
    assert.deepEqual(lerCorrecoes(ok), [{ codigo: 450, orgao: 'SECAP', novo: 506, motivo: 'x' }]);
    const ruim = join(pasta, 'ruim.json');
    writeFileSync(ruim, JSON.stringify([{ codigo: 'x', orgao: '', novo: -1 }]));
    assert.throws(() => lerCorrecoes(ruim), /inválida/);
    const naoLista = join(pasta, 'obj.json');
    writeFileSync(naoLista, '{}');
    assert.throws(() => lerCorrecoes(naoLista), /lista/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('gerador de SQL: reimportação preserva localização e compromisso, apaga etapas que saíram e pode omitir o histórico', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gn-sql-'));
  try {
    const gerar = (extra: string[]) => {
      const saida = join(pasta, `carga-${extra.length}.sql`);
      execFileSync('node', ['scripts/gerar-sql-carga.ts', '--dados', 'data/exemplo', '--saida', saida, '--dialeto', 'sqlite', ...extra], { stdio: 'pipe' });
      return readFileSync(saida, 'utf8');
    };
    const com = gerar([]);
    const sem = gerar(['--sem-historico']);
    const upsertProjeto = com.split('\n').find((l) => l.startsWith('INSERT INTO projeto')) ?? '';
    assert.match(upsertProjeto, /compromisso/); // grava na inclusão
    const aposConflito = com.slice(com.indexOf('INSERT INTO projeto'), com.indexOf('INSERT INTO projeto') + 20000).split('ON CONFLICT (prefeitura_id, id) DO UPDATE SET ')[1].split(';')[0];
    assert.doesNotMatch(aposConflito, /compromisso|localizacao/); // mas não sobrescreve ao atualizar
    assert.match(aposConflito, /nome = EXCLUDED\.nome/);
    assert.match(com, /DELETE FROM etapa_cronograma WHERE prefeitura_id = \d+ AND cronograma_id = '[^']+' AND ordem NOT IN/);
    assert.match(com, /INSERT INTO evento_projeto/);
    assert.doesNotMatch(sem, /INSERT INTO evento_projeto|INSERT INTO evento_sistema/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('rotina: pasta sem planilha, com planilha duplicada ou inexistente é recusada com mensagem clara', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gn-rot-'));
  try {
    await assert.rejects(importarPlanilhas({ planilhas: join(pasta, 'nao-existe'), saida: join(pasta, 's'), autor: 't', destino: 'nenhum' }), /não encontrada/);
    mkdirSync(join(pasta, 'vazia'));
    await assert.rejects(importarPlanilhas({ planilhas: join(pasta, 'vazia'), saida: join(pasta, 's'), autor: 't', destino: 'nenhum' }), /Planilha de carteira não encontrada/);
    const dupla = join(pasta, 'dupla');
    mkdirSync(dupla);
    writeFileSync(join(dupla, 'Projeto_obras_prioritarias.xlsx'), 'x');
    writeFileSync(join(dupla, 'Projeto_obras_prioritarias_v2.xlsx'), 'x');
    await assert.rejects(importarPlanilhas({ planilhas: dupla, saida: join(pasta, 's'), autor: 't', destino: 'nenhum' }), /Mais de uma planilha de carteira/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('relatório: traz só contagens, códigos e linhas; diz se gravou ou só conferiu', () => {
  const resumo = {
    projetos: 334, cronogramas: 13, etapas: 725,
    codigosRepetidos: [{ codigo: 450, linhas: [280, 281], orgaos: ['SECAP', 'SEINFRA'], resolvido: true, novo: 506 }],
    correcoesSemEfeito: 0, casamentoCronogramas: { sei: 7, nome: 4, semPar: 2 },
    novos: null, atualizados: null, editadosNoSistema: null, foraDaPlanilha: null, cronogramasForaDaPlanilha: null,
    avisos: ['Código 450 repetido nas linhas 280, 281 (órgãos SECAP, SEINFRA): corrigido.'],
    arquivos: { carteira: 'Projeto_obras_prioritarias.xlsx', cronogramas: 'GEPP.xlsx' }, sql: 'x.sql',
  };
  const conferencia = relatorioMd(resumo, 'nenhum');
  assert.match(conferencia, /só conferência \(nada foi gravado/);
  assert.match(conferencia, /\| Projetos na planilha \| 334 \|/);
  assert.doesNotMatch(conferencia, /Projetos novos no banco/);
  const remoto = relatorioMd({ ...resumo, novos: 0, atualizados: 334, editadosNoSistema: 0, foraDaPlanilha: 0, cronogramasForaDaPlanilha: 0 }, 'remoto');
  assert.match(remoto, /gravado no banco de produção/);
  assert.match(remoto, /Projetos atualizados \| 334/);
});

// ---------- decisão (pura) ----------
import { avaliarImportacao, PROPORCAO_MINIMA } from '../../scripts/importar-planilhas.ts';
import { bancoTeste } from '../helpers/d1.ts';
import { cpSync } from 'node:fs';

const mapa = (itens: [string, string | null][]) => new Map(itens.map(([id, orgao]) => [id, { orgao }]));

test('avaliação: banco vazio = tudo novo, sem erro', () => {
  const r = avaliarImportacao(mapa([['P-1', 'A'], ['P-2', 'B']]), mapa([]), new Set());
  assert.deepEqual(r.novos, ['P-1', 'P-2']);
  assert.deepEqual(r.erros, []);
});

test('avaliação: um código que muda de órgão para tudo (identidade do projeto)', () => {
  const r = avaliarImportacao(mapa([['P-450', 'SECAP'], ['P-1', 'A']]), mapa([['P-450', 'SEINFRA'], ['P-1', 'A']]), new Set());
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /P-450 \(no banco: SEINFRA; na planilha: SECAP\)/);
  assert.match(r.erros[0], /Nada foi gravado|nada foi gravado/);
  // maiúsculas e espaços não contam como mudança; órgão vazio num dos lados também não
  const ok = avaliarImportacao(mapa([['P-1', ' secap '], ['P-2', 'X']]), mapa([['P-1', 'SECAP'], ['P-2', null]]), new Set());
  assert.deepEqual(ok.erros, []);
  assert.deepEqual(ok.atualizados, ['P-1', 'P-2']);
});

test('avaliação: projeto alterado no sistema é pulado (não entra em "atualizados") e aparece no aviso', () => {
  const r = avaliarImportacao(mapa([['P-1', 'A'], ['P-2', 'A']]), mapa([['P-1', 'A'], ['P-2', 'A']]), new Set(['P-2']));
  assert.deepEqual(r.atualizados, ['P-1']);
  assert.deepEqual(r.editadosNoSistema, ['P-2']);
  assert.match(r.avisos.join(' '), /já foram alterados no sistema e NÃO foram atualizados.*P-2/);
});

test('avaliação: planilha incompleta, projetos demais de uma vez e projetos que saíram', () => {
  const banco = mapa(Array.from({ length: 30 }, (_, i) => [`P-${i + 1}`, 'A'] as [string, string]));
  const poucos = avaliarImportacao(mapa([['P-1', 'A']]), banco, new Set());
  assert.match(poucos.erros.join(' '), /parece incompleta/);
  const noLimite = avaliarImportacao(mapa(Array.from({ length: Math.ceil(30 * PROPORCAO_MINIMA) }, (_, i) => [`P-${i + 1}`, 'A'] as [string, string])), banco, new Set());
  assert.deepEqual(noLimite.erros, []);
  assert.equal(noLimite.foraDaPlanilha.length, 15);
  assert.match(noLimite.avisos.join(' '), /15 projeto\(s\) estão no banco e não estão mais na planilha/);
  const muitos = avaliarImportacao(mapa([...banco.keys(), ...Array.from({ length: 20 }, (_, i) => `P-N${i}`)].map((id) => [id, 'A'] as [string, string])), banco, new Set());
  assert.match(muitos.erros.join(' '), /projetos novos de uma vez/);
  // banco pequeno: a guarda de "novos" não se aplica (carga inicial de teste)
  assert.deepEqual(avaliarImportacao(mapa([['P-1', 'A'], ['P-2', 'A'], ['P-3', 'A']]), mapa([['P-1', 'A']]), new Set()).erros, []);
});

test('faixa 9000: códigos da planilha na faixa da tela são listados', () => {
  const projetos = [12000, 8999, 9000, 42, 9002].map((codigo_legado) => ({ codigo_legado }));
  assert.deepEqual(codigosNaFaixaDoCadastro(projetos), [9000, 9002, 12000]);
});

// ---------- gravação em banco de teste (SQLite em memória, mesmo esquema do D1) ----------

function copiarExemploEditavel(): { pasta: string; dados: string } {
  const pasta = mkdtempSync(join(tmpdir(), 'gn-imp-'));
  const dados = join(pasta, 'dados');
  cpSync('data/exemplo', dados, { recursive: true });
  return { pasta, dados };
}
const sqlDe = (dados: string, pasta: string, nome: string): string => {
  const saida = join(pasta, nome);
  execFileSync('node', ['scripts/gerar-sql-carga.ts', '--dados', dados, '--saida', saida, '--dialeto', 'sqlite', '--sem-historico'], { stdio: 'pipe' });
  return readFileSync(saida, 'utf8');
};
const numero = (sqlite: ReturnType<typeof bancoTeste>['sqlite'], sql: string): number => Number((sqlite.prepare(sql).get() as { n: number }).n);

test('gravação: reimportar preserva localização e compromisso e mantém o restante idêntico', () => {
  const { pasta, dados } = copiarExemploEditavel();
  const { sqlite } = bancoTeste();
  try {
    const sql = sqlDe(dados, pasta, 'a.sql');
    sqlite.exec(sql);
    const id = (sqlite.prepare('SELECT id FROM projeto ORDER BY id LIMIT 1').get() as { id: string }).id;
    sqlite.prepare("UPDATE projeto SET compromisso = 'decidido', localizacao = ? WHERE id = ?").run(JSON.stringify({ tipo: 'ponto', lat: -16.68, lng: -49.25 }), id);
    const nomeAntes = (sqlite.prepare('SELECT nome FROM projeto WHERE id = ?').get(id) as { nome: string }).nome;
    sqlite.exec(sql);
    const linha = sqlite.prepare('SELECT compromisso, localizacao, nome FROM projeto WHERE id = ?').get(id) as { compromisso: string; localizacao: string; nome: string };
    assert.equal(linha.compromisso, 'decidido');
    assert.deepEqual(JSON.parse(linha.localizacao), { tipo: 'ponto', lat: -16.68, lng: -49.25 });
    assert.equal(linha.nome, nomeAntes);
    assert.equal(numero(sqlite, 'SELECT count(*) AS n FROM projeto'), 14);
  } finally {
    sqlite.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('gravação: etapa que saiu do cronograma some; as dos outros cronogramas ficam; cronograma sem etapas esvazia só o dele', () => {
  const { pasta, dados } = copiarExemploEditavel();
  const { sqlite } = bancoTeste();
  try {
    sqlite.exec(sqlDe(dados, pasta, 'a.sql'));
    const total = numero(sqlite, 'SELECT count(*) AS n FROM etapa_cronograma');
    const arquivo = join(dados, 'cronogramas', 'cronogramas.json');
    const json = JSON.parse(readFileSync(arquivo, 'utf8')) as { cronogramas: { id: string; fases: { etapas: { ordem: number }[] }[] }[] };
    assert.ok(json.cronogramas.length >= 2, 'o exemplo tem pelo menos 2 cronogramas');
    const [c1, c2] = json.cronogramas;
    const doC1 = (sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c1.id) as { n: number }).n;
    const doC2 = (sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c2.id) as { n: number }).n;
    // 1) tira uma etapa do cronograma 1
    const fase = c1.fases.find((f) => f.etapas.length > 0)!;
    fase.etapas.pop();
    writeFileSync(arquivo, JSON.stringify(json));
    sqlite.exec(sqlDe(dados, pasta, 'b.sql'));
    assert.equal(numero(sqlite, 'SELECT count(*) AS n FROM etapa_cronograma'), total - 1);
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c1.id) as { n: number }).n, doC1 - 1);
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c2.id) as { n: number }).n, doC2);
    // 2) cronograma 2 sem nenhuma etapa: as antigas dele saem, as do cronograma 1 ficam
    for (const f of c2.fases) f.etapas = [];
    writeFileSync(arquivo, JSON.stringify(json));
    sqlite.exec(sqlDe(dados, pasta, 'c.sql'));
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c2.id) as { n: number }).n, 0);
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM etapa_cronograma WHERE cronograma_id = ?').get(c1.id) as { n: number }).n, doC1 - 1);
  } finally {
    sqlite.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

