// E7: Kanban (cards enxutos, saída do marco, sem Conclusão, filtros) e mudança de etapa gravando no D1 (B3).
process.env.GOVNEXA_EXEMPLO = '1';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { FILTROS_VAZIOS, lerFiltros, opcoesFiltros } from '../../src/lib/carteira/filtros.ts';
import { DESTINOS_MOVER, ETAPAS_KANBAN, montarKanban, saidaDoMarco, textoSaida } from '../../src/lib/carteira/kanban.ts';
import { ERROS_MOVER, moverProjeto, normalizarMovimento, podeMover, podeMoverNaTela, type ContextoMover } from '../../src/lib/carteira/mover.ts';
import { ERRO_REDE, ERRO_RESPOSTA, enviarMovimento, lerResposta } from '../../src/lib/carteira/mover-cliente.ts';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import { dataBr } from '../../src/lib/datas.ts';
import { comInvalidacao, invalidarCache, lerComCache } from '../../src/lib/repositorio/cache.ts';
import { criarRepositorioD1, type BancoD1 } from '../../src/lib/repositorio/d1.ts';
import { criarRepositorioJson } from '../../src/lib/repositorio/json.ts';
import type { Usuario } from '../../src/lib/usuarios/index.ts';
import { bancoTeste } from '../helpers/d1.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const P = (id: string) => JSON.parse(JSON.stringify(carteira.projetos.find((p) => p.id === id))) as Projeto;
const opcoes = opcoesFiltros(carteira.projetos, '2026-11-22');
const filtros = (q: string) => lerFiltros(new URLSearchParams(q), opcoes).filtros;
const PREFEITURA = 5208707;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pessoa = (perfil: Usuario['perfil'], ativo = true): Usuario => ({
  id: 'u-' + perfil, email: perfil + '@exemplo.invalid', nome: 'Pessoa', cargo: null, perfil, prefeitura_id: PREFEITURA, ativo, criado_em: '', atualizado_em: '',
});

function montar(t: TestContext, perfil: Usuario['perfil'] = 'gestor') {
  const banco = bancoTeste();
  t.after(() => banco.sqlite.close());
  banco.sqlite.prepare("INSERT INTO prefeitura (id, nome, uf) VALUES (?, 'Teste', 'GO')").run(PREFEITURA);
  banco.sqlite.prepare("INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao, macroetapa) VALUES (?, 'P-1', 1, 'Obra', 'SMS', '00')").run(PREFEITURA);
  const lotes: number[] = [];
  const db: BancoD1 = { prepare: (sql) => banco.db.prepare(sql), batch: (s) => { lotes.push(s.length); return banco.db.batch(s); } };
  const c: ContextoMover = { usuario: pessoa(perfil), repositorio: criarRepositorioD1(db, PREFEITURA) };
  const mover = (corpo: Record<string, unknown>, id = 'P-1') => moverProjeto(c, id, { origem: 'kanban', ...corpo });
  const ler = () => c.repositorio.obterProjetoComRevisao!('P-1');
  const eventos = async () => (await c.repositorio.historico('P-1')).filter((h) => h.tipo === 'mover_macroetapa');
  return { banco, c, lotes, mover, ler, eventos };
}

test('kanban: colunas de Em estruturação até Execução, sem a Conclusão', () => {
  const q = montarKanban(carteira.projetos, FILTROS_VAZIOS);
  assert.deepEqual(q.colunas.map((c) => c.codigo), ['00', '01', '02', '03', '04', '05']);
  assert.deepEqual(q.colunas.map((c) => c.nome), ['Em estruturação', 'Planejamento', 'Preparatório para Contratação', 'Contratação', 'Mobilização', 'Execução']);
  assert.deepEqual(ETAPAS_KANBAN.map((m) => m.codigo), ['00', '01', '02', '03', '04', '05']);
  assert.equal(q.total, 12);
  assert.equal(q.concluidos, 2);
  assert.ok(!q.colunas.some((c) => c.cards.some((k) => k.id === 'P-906' || k.id === 'P-913')));
  assert.equal(DESTINOS_MOVER.at(-1)!.rotulo, 'Conclusão (sai do Kanban)');
});

test('kanban: card só com nome, órgão e saída prevista (sem valor e sem farol)', () => {
  const q = montarKanban(carteira.projetos, FILTROS_VAZIOS);
  const card = q.colunas[0].cards.find((k) => k.id === 'P-900')!;
  assert.deepEqual(Object.keys(card), ['id', 'nome', 'orgao', 'macro', 'saida']);
  assert.deepEqual(card, { id: 'P-900', nome: 'Unidade de Saúde Exemplo A', orgao: 'SEINFRA', macro: '00', saida: '2026-04-02' });
  const fonte = readFileSync('src/components/carteira/Kanban.astro', 'utf8');
  for (const proibido of ['farol', 'reais(', 'valorProjeto', 'set:html', 'innerHTML', 'data-projeto']) assert.ok(!fonte.includes(proibido), proibido);
});

test('kanban: cada coluna mostra a previsão de saída do marco da aba PIPELINE', () => {
  const q = montarKanban(carteira.projetos, FILTROS_VAZIOS);
  assert.deepEqual(q.colunas.map((c) => c.marco), [
    'Previsão de saída: entrega das peças técnicas', 'Previsão de saída: fim do planejamento', 'Previsão de saída: fim do preparatório',
    'Previsão de saída: contratação', 'Previsão de saída: mobilização', 'Previsão de saída: entrega da obra',
  ]);
  const esperado: Record<string, string | null> = {
    'P-900': '2026-04-02', 'P-901': '2026-05-11', 'P-902': '2026-06-19', 'P-903': '2026-09-26', 'P-904': '2026-11-04', 'P-905': '2027-07-11', 'P-906': null,
  };
  for (const [id, saida] of Object.entries(esperado)) assert.equal(saidaDoMarco(P(id)), saida, id);
  assert.equal(textoSaida('2026-04-02', dataBr), 'Saída prevista: 02/04/2026');
  assert.equal(textoSaida(null, dataBr), 'Sem previsão de saída');
});

test('kanban: sem data de saída mostra o aviso e vai para o fim da coluna', () => {
  const a = P('P-900');
  a.datas.pecas_tecnicas = null;
  const b = P('P-907');
  const q = montarKanban([a, b], FILTROS_VAZIOS);
  assert.deepEqual(q.colunas[0].cards.map((k) => [k.id, k.saida]), [['P-907', '2026-06-04'], ['P-900', null]]);
  const inv = P('P-900');
  inv.datas.pecas_tecnicas = '2026-02-30';
  assert.equal(saidaDoMarco(inv), null);
  const exec = P('P-905');
  exec.datas.encerramento = null;
  assert.equal(saidaDoMarco(exec), '2027-07-11'); // mobilização + 240 dias
  exec.datas.mobilizacao = null;
  assert.equal(saidaDoMarco(exec), null);
});

test('kanban: filtros do padrão (órgão, área, período de entrega, macroetapa e nome)', () => {
  const ids = (q: string) => montarKanban(carteira.projetos, filtros(q)).colunas.flatMap((c) => c.cards.map((k) => k.id)).sort();
  assert.deepEqual(ids('orgao=SEINFRA'), ['P-900', 'P-905', 'P-910']);
  assert.deepEqual(ids('area=saude'), ['P-901']);
  assert.equal(montarKanban(carteira.projetos, filtros('area=saude')).concluidos, 1);
  assert.deepEqual(ids('q=ponte'), ['P-901', 'P-909']);
  assert.deepEqual(ids('de_mes=01&de_ano=2027&ate_mes=06&ate_ano=2027'), ['P-900', 'P-901', 'P-904', 'P-908']);
  assert.deepEqual(ids('macro=02'), ['P-902', 'P-909']);
  const conclusao = montarKanban(carteira.projetos, filtros('macro=06'));
  assert.equal(conclusao.total, 0);
  assert.equal(conclusao.concluidos, 2);
  assert.equal(conclusao.colunas.length, 6);
});

test('kanban: projeto sem macroetapa abre a coluna Sem macroetapa no fim', () => {
  const a = P('P-900');
  a.macroetapa = null;
  const q = montarKanban([a, P('P-901')], FILTROS_VAZIOS);
  assert.deepEqual(q.colunas.map((c) => c.codigo), ['00', '01', '02', '03', '04', '05', 'sem']);
  assert.equal(q.colunas[6].marco, 'Sem previsão de saída');
  assert.deepEqual(q.colunas[6].cards.map((k) => [k.id, k.saida]), [['P-900', null]]);
  assert.equal(montarKanban([P('P-901')], FILTROS_VAZIOS).colunas.length, 6);
});

test('mover: normaliza o pedido e recusa campo desconhecido, tipo errado e etapa inválida', () => {
  assert.deepEqual(normalizarMovimento({ revisao: 0, de: '00', para: '01', origem: 'kanban' }),
    { ok: true, pedido: { revisao: 0, de: '00', para: '01', motivo: null, forcar: false, origem: 'kanban' } });
  assert.deepEqual(normalizarMovimento({ revisao: 7, de: null, para: '00', origem: 'pendencia', motivo: '  Decisão do gabinete ', forcar: true }),
    { ok: true, pedido: { revisao: 7, de: null, para: '00', motivo: 'Decisão do gabinete', forcar: true, origem: 'pendencia' } });
  const base = { revisao: 0, de: '00', para: '01', origem: 'kanban' };
  const ruins: unknown[] = [
    null, [], 'texto', { ...base, extra: 1 }, { ...base, revisao: -1 }, { ...base, revisao: 1.5 }, { ...base, revisao: '0' },
    { ...base, de: 'sem' }, { ...base, de: '07' }, { ...base, para: '06 ' }, { ...base, para: null }, { ...base, motivo: 5 },
    { ...base, forcar: 'sim' }, { ...base, origem: 'ficha' }, { ...base, origem: undefined }, JSON.parse('{"revisao":0,"de":"00","para":"01","origem":"kanban","__proto__":{"x":1}}'),
  ];
  for (const r of ruins) assert.equal(normalizarMovimento(r).ok, false, JSON.stringify(r));
  assert.deepEqual(normalizarMovimento({ ...base, motivo: 'a'.repeat(501) }), { ok: false, erro: 'Motivo: até 500 caracteres.' });
  assert.equal(normalizarMovimento({ ...base, motivo: 'é'.repeat(500) }).ok, true);
});

test('mover: perfil leitura não move; editor move no Kanban mas não nas Pendências; gestor nas duas', (t) => {
  const { c } = montar(t);
  const com = (usuario: Usuario | null) => ({ ...c, usuario });
  assert.deepEqual(podeMover(com(pessoa('leitura'))), { ok: false, status: 403, erro: ERROS_MOVER.perfil });
  assert.deepEqual(podeMover(com(null)), { ok: false, status: 403, erro: ERROS_MOVER.perfil });
  assert.deepEqual(podeMover(com(pessoa('gestor', false))), { ok: false, status: 403, erro: ERROS_MOVER.perfil });
  assert.deepEqual(podeMover(com(pessoa('editor'))), { ok: true });
  assert.deepEqual(podeMover(com(pessoa('editor')), 'pendencia'), { ok: false, status: 403, erro: ERROS_MOVER.perfilPendencia });
  assert.deepEqual(podeMover(com(pessoa('gestor')), 'pendencia'), { ok: true });
  assert.equal(podeMoverNaTela(pessoa('leitura'), c.repositorio, 'kanban'), 'perfil');
  assert.equal(podeMoverNaTela(pessoa('editor'), c.repositorio, 'kanban'), 'ok');
  assert.equal(podeMoverNaTela(pessoa('editor'), c.repositorio, 'pendencia'), 'perfil');
  assert.equal(podeMoverNaTela(pessoa('admin'), c.repositorio, 'pendencia'), 'ok');
  assert.equal(podeMoverNaTela(pessoa('admin'), criarRepositorioJson(), 'kanban'), 'indisponivel');
  assert.deepEqual(podeMover({ usuario: pessoa('admin'), repositorio: criarRepositorioJson() }), { ok: false, status: 503, erro: ERROS_MOVER.indisponivel });
});

test('mover: perfil leitura recebe 403 e nada é gravado', async (t) => {
  const { c, ler, eventos, lotes } = montar(t);
  const r = await moverProjeto({ ...c, usuario: pessoa('leitura') }, 'P-1', { revisao: 0, de: '00', para: '01', origem: 'kanban' });
  assert.deepEqual(r, { ok: false, status: 403, erro: ERROS_MOVER.perfil });
  assert.equal((await ler())!.projeto.macroetapa, '00');
  assert.deepEqual(await eventos(), []);
  assert.deepEqual(lotes, []);
});

test('mover: grava a etapa e o evento no mesmo lote, sobe a revisão e aparece no Histórico', async (t) => {
  const { c, lotes, mover, ler, eventos } = montar(t);
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '01' }), { ok: true, revisao: 1, macroetapa: '01', saida: null, forcado: false });
  assert.deepEqual(lotes, [2]);
  const atual = (await ler())!;
  assert.equal(atual.revisao, 1);
  assert.equal(atual.projeto.macroetapa, '01');
  const [h, ...resto] = await eventos();
  assert.deepEqual(resto, []);
  assert.match(h.id, UUID);
  assert.equal(h.origem, 'kanban');
  assert.equal(h.autor, c.usuario!.email);
  assert.equal(h.de, '00');
  assert.equal(h.para, '01');
  assert.equal(h.motivo, undefined);
  assert.equal(h.forcado, undefined);
});

test('mover: revisão velha ou etapa diferente da vista devolve 409 sem gravar', async (t) => {
  const { mover, eventos, ler } = montar(t);
  assert.equal((await mover({ revisao: 0, de: '00', para: '01' })).ok, true);
  const conflito = { ok: false, status: 409, erro: 'O projeto foi alterado por outra pessoa. Recarregue a página e tente de novo.' };
  assert.deepEqual(await mover({ revisao: 0, de: '01', para: '02', forcar: true, motivo: 'x' }), conflito);
  assert.deepEqual(await mover({ revisao: 1, de: '00', para: '01' }), conflito);
  assert.equal((await eventos()).length, 1);
  assert.equal((await ler())!.revisao, 1);
});

test('mover: duas pessoas ao mesmo tempo, só uma grava', async (t) => {
  const { banco, c, eventos, ler } = montar(t);
  const outra = criarRepositorioD1(banco.db, PREFEITURA);
  let intercalar = true;
  const concorrente: BancoD1 = {
    prepare: (sql) => banco.db.prepare(sql),
    async batch(statements) {
      if (intercalar) {
        intercalar = false;
        const r = await outra.moverProjeto!('P-1', { revisao: 0, de: '00', para: '01', motivo: null, forcar: false, origem: 'kanban' }, 'outra@exemplo.invalid');
        assert.equal(r.ok, true);
      }
      return banco.db.batch(statements);
    },
  };
  const r = await moverProjeto({ ...c, repositorio: criarRepositorioD1(concorrente, PREFEITURA) }, 'P-1', { revisao: 0, de: '00', para: '01', origem: 'kanban' });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 409);
  const lista = await eventos();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].autor, 'outra@exemplo.invalid');
  assert.equal((await ler())!.revisao, 1);
});

test('mover: mesma etapa, pular etapa, voltar sem motivo e portão com o que falta (422)', async (t) => {
  const { mover, eventos } = montar(t);
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '00' }), { ok: false, status: 422, erro: 'O projeto já está nesta macroetapa.' });
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '02' }), { ok: false, status: 422, erro: 'Avançar mais de uma etapa exige forçar com motivo.', forcavel: true });
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '02', forcar: true }), { ok: false, status: 422, erro: 'Avançar mais de uma etapa exige forçar com motivo.', forcavel: true });
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '02', forcar: true, motivo: 'Decisão do gabinete' }), { ok: true, revisao: 1, macroetapa: '02', saida: null, forcado: true });
  assert.deepEqual(await mover({ revisao: 1, de: '02', para: '01' }), { ok: false, status: 422, erro: 'Para voltar de etapa, informe o motivo.' });
  assert.deepEqual(await mover({ revisao: 1, de: '02', para: '01', motivo: 'Faltou o orçamento' }), { ok: true, revisao: 2, macroetapa: '01', saida: null, forcado: false });
  assert.deepEqual(await mover({ revisao: 2, de: '01', para: '02' }), {
    ok: false, status: 422, erro: 'Faltam requisitos para avançar.', faltando: ['Valor da obra', 'Origem do valor', 'Data de entrega das peças técnicas'], forcavel: true,
  });
  const lista = await eventos();
  // Os dois eventos podem ter o mesmo milissegundo: a comparação não depende da ordem.
  assert.deepEqual(lista.map((h) => JSON.stringify([h.de, h.para, h.motivo ?? null, h.forcado ?? null])).sort(),
    [JSON.stringify(['00', '02', 'Decisão do gabinete', true]), JSON.stringify(['02', '01', 'Faltou o orçamento', null])]);
});

test('mover: projeto de outra prefeitura ou id malformado é 404 e nada muda', async (t) => {
  const { banco, mover, lotes } = montar(t);
  banco.sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Outra', 'GO'); INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao, macroetapa) VALUES (1, 'P-2', 1, 'Obra de fora', 'SMS', '00')");
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '01' }, 'P-2'), { ok: false, status: 404, erro: ERROS_MOVER.inexistente });
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '01' }, '<script>'), { ok: false, status: 404, erro: ERROS_MOVER.inexistente });
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '01' }, 'P-' + 'x'.repeat(40)), { ok: false, status: 404, erro: ERROS_MOVER.inexistente });
  assert.deepEqual(lotes, []);
  const fora = banco.sqlite.prepare("SELECT macroetapa, revisao FROM projeto WHERE prefeitura_id = 1 AND id = 'P-2'").get();
  assert.deepEqual({ ...fora }, { macroetapa: '00', revisao: 0 });
  assert.equal(Number(banco.sqlite.prepare("SELECT count(*) AS n FROM evento_projeto WHERE projeto_id = 'P-2'").get()!.n), 0);
});

test('mover: projeto sem etapa só entra em 00, também pelo Kanban', async (t) => {
  const { mover } = montar(t);
  assert.deepEqual(await mover({ revisao: 0, de: null, para: '05', forcar: true, motivo: 'x', origem: 'kanban' }), { ok: false, status: 400, erro: ERROS_MOVER.primeiraEtapa });
  assert.deepEqual(await mover({ revisao: 0, de: null, para: '06', motivo: 'x', origem: 'kanban' }), { ok: false, status: 400, erro: ERROS_MOVER.primeiraEtapa });
});

test('mover: Pendências só andam uma etapa e exigem aprovar_etapa', async (t) => {
  const { c, mover, eventos } = montar(t);
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '02', forcar: true, motivo: 'x', origem: 'pendencia' }), { ok: false, status: 400, erro: ERROS_MOVER.umaEtapa });
  const editor = await moverProjeto({ ...c, usuario: pessoa('editor') }, 'P-1', { revisao: 0, de: '00', para: '01', origem: 'pendencia' });
  assert.deepEqual(editor, { ok: false, status: 403, erro: ERROS_MOVER.perfilPendencia });
  assert.equal((await mover({ revisao: 0, de: '00', para: '01', origem: 'pendencia' })).ok, true);
  assert.equal((await eventos())[0].origem, 'pendencia');
  assert.deepEqual(await mover({ revisao: 1, de: '01', para: '00', origem: 'pendencia' }), { ok: false, status: 422, erro: 'Para voltar de etapa, informe o motivo.' });
});

test('mover: ir para Conclusão exige o valor executado; projeto em Conclusão só volta com motivo', async (t) => {
  const { banco, mover } = montar(t);
  banco.sqlite.exec("UPDATE projeto SET macroetapa = '05' WHERE id = 'P-1'");
  assert.deepEqual(await mover({ revisao: 0, de: '05', para: '06' }), { ok: false, status: 422, erro: 'Faltam requisitos para avançar.', faltando: ['Valor executado'], forcavel: true });
  assert.deepEqual(await mover({ revisao: 0, de: '05', para: '06', forcar: true, motivo: 'Obra entregue; valor em conferência' }), { ok: true, revisao: 1, macroetapa: '06', saida: null, forcado: true });
  assert.deepEqual(await mover({ revisao: 1, de: '06', para: '05' }), { ok: false, status: 422, erro: 'Para voltar de etapa, informe o motivo.' });
  assert.equal((await mover({ revisao: 1, de: '06', para: '05', motivo: 'Reaberta para reparo' })).ok, true);
});

test('mover: devolve a saída prevista da nova etapa e lista as revisões só da prefeitura', async (t) => {
  const { banco, c, mover } = montar(t);
  banco.sqlite.exec(`UPDATE projeto SET datas = '{"planejamento":"2026-05-11"}' WHERE id = 'P-1'`);
  assert.deepEqual(await mover({ revisao: 0, de: '00', para: '01' }), { ok: true, revisao: 1, macroetapa: '01', saida: '2026-05-11', forcado: false });
  banco.sqlite.exec("INSERT INTO prefeitura (id, nome, uf) VALUES (1, 'Outra', 'GO'); INSERT INTO projeto (prefeitura_id, id, codigo_legado, nome, orgao) VALUES (1, 'P-2', 1, 'Obra de fora', 'SMS')");
  assert.deepEqual([...(await c.repositorio.listarRevisoes!())], [['P-1', 1]]);
});

test('mover: o cache da prefeitura é limpo depois de mover', async (t) => {
  invalidarCache();
  const { c } = montar(t);
  const repo = comInvalidacao(c.repositorio, PREFEITURA);
  assert.equal(await lerComCache(PREFEITURA, async () => 'antes', 0), 'antes');
  assert.equal(await lerComCache(PREFEITURA, async () => 'outro', 1), 'antes');
  assert.equal((await repo.moverProjeto!('P-1', { revisao: 0, de: '00', para: '01', motivo: null, forcar: false, origem: 'kanban' }, 'a@exemplo.invalid')).ok, true);
  assert.equal(await lerComCache(PREFEITURA, async () => 'depois', 2), 'depois');
  invalidarCache();
});

test('mover: resposta da rota vira dados conferidos no navegador', () => {
  assert.deepEqual(lerResposta(200, { ok: true, revisao: 2, macroetapa: '01', saida: '2026-05-11', forcado: false }), { ok: true, revisao: 2, macroetapa: '01', saida: '2026-05-11', forcado: false });
  assert.deepEqual(lerResposta(200, { ok: true, revisao: 2, macroetapa: '06', saida: null, forcado: true }), { ok: true, revisao: 2, macroetapa: '06', saida: null, forcado: true });
  for (const ruim of [{ ok: true, revisao: '2', macroetapa: '01', saida: null }, { ok: true, revisao: 2, macroetapa: 'sem', saida: null }, { ok: true, revisao: 2, macroetapa: '01', saida: '<img src=x>' }, null, 'ok']) {
    assert.deepEqual(lerResposta(200, ruim), { ok: false, status: 200, erro: ERRO_RESPOSTA, faltando: [], forcavel: false }, JSON.stringify(ruim));
  }
  assert.deepEqual(lerResposta(409, { ok: false, erro: 'Alterado por outra pessoa.', forcavel: true }), { ok: false, status: 409, erro: 'Alterado por outra pessoa.', faltando: [], forcavel: false });
  assert.deepEqual(lerResposta(422, { ok: false, erro: 'Faltam requisitos para avançar.', faltando: ['Valor da obra', 5, '', ' Origem do valor '], forcavel: true }),
    { ok: false, status: 422, erro: 'Faltam requisitos para avançar.', faltando: ['Valor da obra', 'Origem do valor'], forcavel: true });
  assert.equal((lerResposta(422, { erro: 'Para voltar de etapa, informe o motivo.' }) as { forcavel: boolean }).forcavel, false);
  assert.equal((lerResposta(422, { erro: 'x', faltando: Array.from({ length: 30 }, (_, i) => 'item ' + i) }) as { faltando: string[] }).faltando.length, 20);
  assert.equal((lerResposta(400, { erro: 'a'.repeat(400) }) as { erro: string }).erro.length, 300);
  assert.deepEqual(lerResposta(500, null), { ok: false, status: 500, erro: ERRO_RESPOSTA, faltando: [], forcavel: false });
});

test('mover: o navegador envia JSON à rota do projeto e falha de rede vira aviso', async () => {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const falso = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify({ ok: true, revisao: 4, macroetapa: '01', saida: null, forcado: false }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await enviarMovimento({ id: 'P-1', revisao: 3, de: '00', para: '01', motivo: ' m ', origem: 'kanban' }, falso);
  assert.deepEqual(r, { ok: true, revisao: 4, macroetapa: '01', saida: null, forcado: false });
  assert.equal(chamadas[0].url, '/plataforma/projeto/mover/P-1/');
  assert.equal(chamadas[0].init.method, 'POST');
  assert.equal(chamadas[0].init.credentials, 'same-origin');
  assert.deepEqual(chamadas[0].init.headers, { 'content-type': 'application/json' });
  assert.deepEqual(JSON.parse(String(chamadas[0].init.body)), { revisao: 3, de: '00', para: '01', origem: 'kanban', motivo: 'm' });
  assert.ok(chamadas[0].init.signal instanceof AbortSignal);
  await enviarMovimento({ id: 'P-1/../x', revisao: 0, de: null, para: '00', origem: 'pendencia', forcar: true }, falso);
  assert.equal(chamadas[1].url, '/plataforma/projeto/mover/P-1%2F..%2Fx/');
  assert.deepEqual(JSON.parse(String(chamadas[1].init.body)), { revisao: 0, de: null, para: '00', origem: 'pendencia', forcar: true });
  const quebrado = (async () => { throw new TypeError('rede'); }) as unknown as typeof fetch;
  assert.deepEqual(await enviarMovimento({ id: 'P-1', revisao: 0, de: '00', para: '01', origem: 'kanban' }, quebrado), { ok: false, status: 0, erro: ERRO_REDE, faltando: [], forcavel: false });
});

test('mover: a rota confere na mesma ordem da edição (origem, perfil, formato, limite, tamanho, JSON)', () => {
  const fonte = readFileSync('src/pages/plataforma/projeto/mover/[id].ts', 'utf8');
  const ordem = ['mesmaOrigem(request)', 'podeMover(contexto)', "request.headers.get('content-type')", 'dentroDoLimite(', "request.headers.get('content-length')", 'request.text()', 'JSON.parse(texto)', 'moverProjeto(contexto'];
  const posicoes = ordem.map((t) => fonte.indexOf(t));
  for (let i = 0; i < ordem.length; i++) assert.ok(posicoes[i] >= 0, ordem[i]);
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes);
  assert.ok(fonte.includes('LIMITE_CORPO_MOVER'));
  for (const arquivo of ['src/components/carteira/Kanban.astro', 'src/components/carteira/PendenciasEtapa.astro']) {
    const tela = readFileSync(arquivo, 'utf8');
    assert.ok(!tela.includes('set:html') && !tela.includes('innerHTML') && !tela.includes('simularMovimento') && !tela.includes('AVISO_SIMULACAO'), arquivo);
  }
});
