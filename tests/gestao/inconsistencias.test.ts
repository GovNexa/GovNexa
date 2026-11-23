// Testes do relatório de inconsistências e do painel da equipe (E10). Dados fictícios de data/exemplo.
process.env.GOVNEXA_EXEMPLO = '1';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import { hrefFicha, rotuloVolta, voltaSegura } from '../../src/lib/carteira/ficha.ts';
import { urlCom } from '../../src/lib/gestao/dashboard.ts';
import { podeVerEquipe, ROTA_INCONSISTENCIAS, ROTA_PAINEL_EQUIPE } from '../../src/lib/gestao/equipe.ts';
import {
  IDS_REGRAS, REGRAS, SEM_ORGAO, filtrosDaUrl, inconsistenciasDoProjeto, montarRelatorio, opcoesRelatorio, paraCsvInconsistencias, urlCsv, urlRelatorio,
  type Inconsistencia,
} from '../../src/lib/gestao/inconsistencias.ts';
import type { GeoBairros } from '../../src/lib/mapa/geo.ts';
import type { Usuario } from '../../src/lib/usuarios/tipos.ts';

const O = 'http://127.0.0.1:4321';
const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const GEO: GeoBairros = { bairros: { 'Bairro Mapeado': { encontrado: true, lat: -16.7, lng: -49.3 } } } as unknown as GeoBairros;
const LOCAL = { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: null } as unknown as Projeto['localizacao'];
const CTX = { hoje: '2026-03-01', geo: GEO };
/** P-900 completo e em dia em 01/03/2026: área, valor, localização, datas em ordem, sem SEI e sem pendência. */
const completo = (muda: (p: Projeto) => void = () => {}): Projeto => {
  const p = JSON.parse(JSON.stringify(carteira.projetos.find((x) => x.id === 'P-900'))) as Projeto;
  p.area = 'saude';
  p.localizacao = LOCAL;
  p.sei = [];
  p.pendencias = [];
  muda(p);
  return p;
};
const regras = (p: Projeto, ctx = CTX) => inconsistenciasDoProjeto(p, ctx).map((i) => i.regra);
const detalhe = (p: Projeto, regra: string, ctx = CTX) => inconsistenciasDoProjeto(p, ctx).find((i) => i.regra === regra)?.detalhe;
const cart = (projetos: Projeto[]): Carteira => ({ ...carteira, projetos });

test('inconsistências: regras na ordem combinada', () => {
  assert.deepEqual(IDS_REGRAS, ['sem_orgao', 'sem_area', 'sem_valor', 'sem_macroetapa', 'datas_faltando', 'datas_fora_de_ordem', 'macroetapa_vencida', 'sei_invalido', 'sem_localizacao', 'outras_pendencias']);
  assert.equal(REGRAS.length, 10);
});

test('inconsistências: projeto completo e em dia não tem nenhuma', () => {
  assert.deepEqual(regras(completo()), []);
});

test('inconsistências: campos essenciais faltando (órgão, área, valor, macroetapa)', () => {
  const p = completo((x) => { x.orgao = null; x.area = null; x.valores.total = null; x.valores.obra = null; x.macroetapa = null; });
  assert.deepEqual(regras(p), ['sem_orgao', 'sem_area', 'sem_valor', 'sem_macroetapa']);
  assert.equal(detalhe(p, 'sem_area'), 'Área não informada.');
  assert.equal(detalhe(p, 'sem_valor'), 'Sem valor total e sem valor de obra.');
  const zero = completo((x) => { x.valores.total = 0; x.valores.obra = 0; });
  assert.deepEqual(regras(zero), ['sem_valor']);
});

test('inconsistências: área sugerida pelo órgão aparece no detalhe', () => {
  assert.equal(detalhe(completo((x) => { x.orgao = 'SMS'; x.area = null; }), 'sem_area'), 'Área não informada (sugestão pelo órgão: Saúde).');
});

test('inconsistências: datas previstas faltando só da macroetapa atual em diante', () => {
  const p = completo((x) => { x.macroetapa = '03'; x.datas.planejamento = null; x.datas.contratacao = null; x.datas.mobilizacao = null; });
  assert.equal(detalhe(p, 'datas_faltando', { ...CTX, hoje: '2026-01-01' }), 'Faltam: Contratação, Mobilização.');
  const concluido = completo((x) => { x.macroetapa = '06'; x.datas.encerramento = null; x.datas.contratacao = null; });
  assert.deepEqual(regras(concluido), []);
  const semEtapa = completo((x) => { x.macroetapa = null; x.datas.pecas_tecnicas = null; });
  assert.equal(detalhe(semEtapa, 'datas_faltando'), 'Faltam: Peças técnicas.');
});

test('inconsistências: datas fora de ordem', () => {
  const p = completo((x) => { x.datas.planejamento = '2026-03-01'; });
  assert.equal(detalhe(p, 'datas_fora_de_ordem', { ...CTX, hoje: '2026-01-01' }), 'Planejamento (01/03/2026) termina antes de Peças técnicas (02/04/2026).');
});

test('inconsistências: macroetapa vencida pela data de saída do marco', () => {
  assert.equal(detalhe(completo(), 'macroetapa_vencida', { ...CTX, hoje: '2026-04-12' }), 'Saída de Em estruturação prevista para 02/04/2026: vencida há 10 dias.');
  assert.equal(detalhe(completo(), 'macroetapa_vencida', { ...CTX, hoje: '2026-04-03' }), 'Saída de Em estruturação prevista para 02/04/2026: vencida há 1 dia.');
  assert.equal(detalhe(completo(), 'macroetapa_vencida', { ...CTX, hoje: '2026-04-02' }), undefined);
  assert.deepEqual(regras(completo((x) => { x.macroetapa = '06'; }), { ...CTX, hoje: '2030-01-01' }), []);
});

test('inconsistências: SEI inválido pelo formato e pela pendência da carga', () => {
  assert.equal(detalhe(completo((x) => { x.sei = ['26.18.000001001-1', '123']; }), 'sei_invalido'), 'Fora do formato 00.0.000000000-0: 123.');
  assert.equal(detalhe(completo((x) => { x.pendencias = ['SEI inválido']; }), 'sei_invalido'), 'O número do SEI na planilha não foi reconhecido.');
  assert.deepEqual(regras(completo((x) => { x.sei = ['26.18.000001001-1']; })), []);
});

test('inconsistências: projeto sem localização', () => {
  assert.equal(detalhe(completo((x) => { x.localizacao = null; x.bairro = 'Bairro Inexistente'; }), 'sem_localizacao'), 'Sem localização cadastrada e o bairro Bairro Inexistente não está no mapa.');
  assert.equal(detalhe(completo((x) => { x.localizacao = null; x.bairro = null; }), 'sem_localizacao'), 'Sem localização cadastrada e sem bairro.');
  assert.deepEqual(regras(completo((x) => { x.localizacao = null; x.bairro = 'Bairro Mapeado'; })), []);
});

test('inconsistências: outras pendências sem repetir as que viraram regra', () => {
  const p = completo((x) => { x.pendencias = ['Sem região', 'Sem órgão', 'Soma por ano diferente do valor total', 'Sem região']; });
  assert.deepEqual(regras(p), ['outras_pendencias']);
  assert.equal(detalhe(p, 'outras_pendencias'), 'Sem região; Soma por ano diferente do valor total.');
});

test('inconsistências: projeto com várias inconsistências entra uma vez por regra, na ordem', () => {
  const p = completo((x) => {
    x.orgao = null; x.area = null; x.valores.total = null; x.valores.obra = null; x.datas.planejamento = '2026-03-01';
    x.sei = ['x']; x.localizacao = null; x.bairro = null; x.pendencias = ['Sem região'];
  });
  const r = regras(p, { ...CTX, hoje: '2026-05-01' });
  assert.deepEqual(r, ['sem_orgao', 'sem_area', 'sem_valor', 'datas_fora_de_ordem', 'macroetapa_vencida', 'sei_invalido', 'sem_localizacao', 'outras_pendencias']);
  assert.equal(new Set(r).size, r.length);
});

const A = completo((x) => { x.id = 'P-A'; x.nome = 'Bloco Saúde'; x.orgao = 'SMS'; x.area = null; x.localizacao = null; x.bairro = null; });
const B = completo((x) => { x.id = 'P-B'; x.nome = 'Escola'; x.orgao = 'SME'; x.valores.total = null; x.valores.obra = null; });
const C = completo((x) => { x.id = 'P-C'; x.nome = 'Sem dono'; x.orgao = null; });
const D = completo((x) => { x.id = 'P-D'; x.nome = 'Academia'; x.orgao = 'SMS'; });
const E = completo((x) => { x.id = 'P-E'; x.nome = 'Abrigo'; x.orgao = 'SMS'; x.sei = ['1']; });
const CARTEIRA = cart([A, B, C, D, E]);

test('relatório: geral conta por regra e por órgão, com sem órgão por último', () => {
  const r = montarRelatorio(CARTEIRA, CTX, { orgao: null, regra: null });
  assert.equal(r.totalProjetos, 5);
  assert.equal(r.projetosComInconsistencia, 4);
  assert.equal(r.porRegra.length, 10);
  assert.equal(r.porRegra.reduce((s, g) => s + g.qtd, 0), r.itens.length);
  assert.deepEqual(r.porRegra.filter((g) => g.qtd > 0).map((g) => [g.id, g.qtd]), [['sem_orgao', 1], ['sem_area', 1], ['sem_valor', 1], ['sei_invalido', 1], ['sem_localizacao', 1]]);
  assert.deepEqual(r.porOrgao, [{ orgao: 'SME', projetos: 1, qtd: 1 }, { orgao: 'SMS', projetos: 2, qtd: 3 }, { orgao: null, projetos: 1, qtd: 1 }]);
  assert.deepEqual(r.itens.map((i) => `${i.projeto.id}:${i.regra}`), ['P-B:sem_valor', 'P-E:sei_invalido', 'P-A:sem_area', 'P-A:sem_localizacao', 'P-C:sem_orgao']);
});

test('relatório: filtro por órgão e por regra', () => {
  const sms = montarRelatorio(CARTEIRA, CTX, { orgao: 'SMS', regra: null });
  assert.equal(sms.totalProjetos, 3);
  assert.ok(sms.itens.every((i) => i.projeto.orgao === 'SMS'));
  assert.equal(sms.porRegra.reduce((s, g) => s + g.qtd, 0), sms.itens.length);
  const area = montarRelatorio(CARTEIRA, CTX, { orgao: 'SMS', regra: 'sem_area' });
  assert.deepEqual(area.itens.map((i) => i.projeto.id), ['P-A']);
  assert.equal(area.porRegra.find((g) => g.id === 'sei_invalido')?.qtd, 1); // a contagem por regra não depende da regra escolhida
  const sem = montarRelatorio(CARTEIRA, CTX, { orgao: SEM_ORGAO, regra: null });
  assert.deepEqual(sem.itens.map((i) => i.projeto.id), ['P-C']);
  assert.equal(sem.totalProjetos, 1);
});

test('relatório: carteira vazia e carteira sem inconsistência', () => {
  const vazia = montarRelatorio(cart([]), CTX, { orgao: null, regra: null });
  assert.equal(vazia.totalProjetos, 0);
  assert.deepEqual(vazia.itens, []);
  assert.deepEqual(vazia.porOrgao, []);
  assert.ok(vazia.porRegra.every((g) => g.qtd === 0));
  const limpa = montarRelatorio(cart([D]), CTX, { orgao: null, regra: null });
  assert.equal(limpa.totalProjetos, 1);
  assert.equal(limpa.projetosComInconsistencia, 0);
  assert.deepEqual(limpa.itens, []);
});

test('relatório: parâmetros do endereço por lista fechada', () => {
  const opcoes = opcoesRelatorio(CARTEIRA);
  assert.deepEqual(opcoes, { orgaos: ['SME', 'SMS'], temSemOrgao: true });
  assert.deepEqual(filtrosDaUrl(new URLSearchParams('orgao=XYZ&regra=%3Cscript%3E'), opcoes), { orgao: null, regra: null, orgaoInvalido: true, regraInvalida: true });
  assert.deepEqual(filtrosDaUrl(new URLSearchParams('orgao=SMS&regra=sem_area'), opcoes), { orgao: 'SMS', regra: 'sem_area', orgaoInvalido: false, regraInvalida: false });
  assert.deepEqual(filtrosDaUrl(new URLSearchParams('orgao=_sem'), opcoes), { orgao: SEM_ORGAO, regra: null, orgaoInvalido: false, regraInvalida: false });
  assert.deepEqual(filtrosDaUrl(new URLSearchParams('orgao=&regra='), opcoes), { orgao: null, regra: null, orgaoInvalido: false, regraInvalida: false });
  assert.equal(urlRelatorio({}), ROTA_INCONSISTENCIAS);
  assert.equal(urlRelatorio({ orgao: 'SMS', regra: 'sem_area' }), '/plataforma/gestao-inconsistencias/?orgao=SMS&regra=sem_area');
  assert.equal(urlCsv({ orgao: 'SMS', regra: null }), '/plataforma/gestao-inconsistencias/csv/?orgao=SMS');
});

test('CSV: cabeçalho, aspas e proteção contra fórmula', () => {
  const item = (nome: string, detalhe = 'x'): Inconsistencia => ({ regra: 'sem_area', projeto: { id: 'P-1', nome, orgao: null }, detalhe });
  const csv = paraCsvInconsistencias([item('=HYPERLINK("http://x")'), item('+1'), item('-2'), item('@SOMA(A1)'), item('\tTab'), item('Normal', '=1+1')]);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[0], '"Órgão";"Código do projeto";"Projeto";"Regra";"O que corrigir"');
  assert.equal(linhas[1], '"Sem órgão";"P-1";"\'=HYPERLINK(""http://x"")";"Sem área";"x"');
  assert.equal(linhas[6], '"Sem órgão";"P-1";"Normal";"Sem área";"\'=1+1"');
  assert.ok(csv.endsWith('\r\n'));
  for (const l of linhas.slice(1, -1)) assert.doesNotMatch(l, /(^|;)"[=+\-@\t]/, l);
});

test('equipe: só administrador, gestor e editor veem o painel e o relatório', () => {
  const base: Usuario = { id: 'u1', email: 'a@exemplo.invalid', nome: 'Pessoa', cargo: null, perfil: 'leitura', prefeitura_id: 1, ativo: true, criado_em: '2026-11-01T00:00:00Z', atualizado_em: '2026-11-01T00:00:00Z' };
  assert.equal(podeVerEquipe(base), false);
  for (const perfil of ['admin', 'gestor', 'editor'] as const) assert.equal(podeVerEquipe({ ...base, perfil }), true, perfil);
  assert.equal(podeVerEquipe({ ...base, perfil: 'admin', ativo: false }), false);
  assert.equal(podeVerEquipe(null), false);
});

test('ficha: volta aceita o painel da equipe e o relatório', () => {
  assert.equal(voltaSegura('/plataforma/gestao-inconsistencias/?orgao=SMS', O), '/plataforma/gestao-inconsistencias/?orgao=SMS');
  assert.equal(voltaSegura('/plataforma/gestao-equipe/?cartao=carteira', O), '/plataforma/gestao-equipe/?cartao=carteira');
  assert.equal(rotuloVolta('/plataforma/gestao-inconsistencias/'), 'Fechar e voltar ao relatório');
  assert.equal(rotuloVolta('/plataforma/gestao-equipe/'), 'Fechar e voltar ao painel da equipe');
  assert.equal(rotuloVolta('/plataforma/gestao/'), 'Fechar e voltar ao mapa');
  assert.equal(hrefFicha('P-900', '/plataforma/gestao-inconsistencias/?orgao=SMS', 'governanca'), '/plataforma/projeto/P-900/?aba=governanca&volta=%2Fplataforma%2Fgestao-inconsistencias%2F%3Forgao%3DSMS');
});

test('painel da equipe: endereços usam a rota da equipe sem mudar a tela antiga', () => {
  assert.equal(urlCom({ orgao: 'SMS' }, 'carteira', undefined, ROTA_PAINEL_EQUIPE), '/plataforma/gestao-equipe/?orgao=SMS&cartao=carteira');
  assert.equal(urlCom({}, undefined, undefined, ROTA_PAINEL_EQUIPE), '/plataforma/gestao-equipe/');
  assert.equal(urlCom({}), '/plataforma/');
});
