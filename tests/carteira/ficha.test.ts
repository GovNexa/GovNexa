process.env.GOVNEXA_EXEMPLO = '1';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ABAS, abaValida, hrefFicha, podeEditarFicha, rotuloVolta, voltaSegura } from '../../src/lib/carteira/ficha.ts';
import { montarFicha, ROTULOS_FORA_DA_FICHA } from '../../src/lib/carteira/ficha-dados.ts';
import { usuarioPode } from '../../src/lib/usuarios/index.ts';
import type { Usuario } from '../../src/lib/usuarios/tipos.ts';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import type { Cronograma } from '../../src/lib/cronograma/tipos.ts';

const O = 'http://127.0.0.1:4321';
const FONTE = { ficticio: true, arquivo: 'exemplo.json', importado_em: '2026-11-10' };
const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const cronogramas = JSON.parse(readFileSync('data/exemplo/cronogramas/cronogramas.json', 'utf8')).cronogramas as Cronograma[];
const P = (id: string) => JSON.parse(JSON.stringify(carteira.projetos.find((p) => p.id === id))) as Projeto;

test('ficha: abas na ordem pedida, Governança por último', () => {
  assert.deepEqual(ABAS.map((a) => a.id), ['cadastro', 'recurso', 'entrega', 'localizacao', 'fotos', 'documentos', 'sei', 'cronograma', 'historico', 'governanca']);
});

test('ficha: aba inválida abre Cadastro', () => {
  assert.equal(abaValida('<script>'), 'cadastro');
  assert.equal(abaValida(null), 'cadastro');
  assert.equal(abaValida('governanca'), 'governanca');
});

test('ficha: volta só aceita telas internas permitidas', () => {
  for (const ok of ['/plataforma/projetos-carteira/?orgao=SMS', '/plataforma/gestao/?sel=obra%3AP-905#mapa']) assert.equal(voltaSegura(ok, O), ok);
  for (const ruim of ['https://externo.example/', '//externo.example/plataforma/gestao/', '/\\externo.example/plataforma/gestao/', 'javascript:alert(1)',
    '/plataforma/usuarios/', '/plataforma/gestao/../usuarios/', '/plataforma/projetos-carteira/\u0000', '/plataforma/gestao/' + 'x'.repeat(2000), '', null]) {
    assert.equal(voltaSegura(ruim, O), null, String(ruim));
  }
});

test('ficha: rótulo do X conforme a origem', () => {
  assert.equal(rotuloVolta('/plataforma/gestao/?sel=x'), 'Fechar e voltar ao mapa');
  assert.equal(rotuloVolta('/plataforma/projetos-kanban/'), 'Fechar e voltar ao Kanban');
  assert.equal(rotuloVolta('/plataforma/projetos-gantt/'), 'Fechar e voltar ao Gantt');
  assert.equal(rotuloVolta(null), 'Fechar e voltar à Carteira');
  assert.equal(rotuloVolta('/plataforma/projetos-carteira/'), 'Fechar e voltar à Carteira');
});

test('ficha: endereço com aba e volta codificados', () => {
  assert.equal(hrefFicha('P-900', '/plataforma/projetos-carteira/?orgao=SMS'), '/plataforma/projeto/P-900/?volta=%2Fplataforma%2Fprojetos-carteira%2F%3Forgao%3DSMS');
  assert.equal(hrefFicha('P-905', null, 'localizacao'), '/plataforma/projeto/P-905/?aba=localizacao');
  assert.equal(hrefFicha('P-1', null, 'cadastro'), '/plataforma/projeto/P-1/');
});

test('ficha: perfil leitura não vê controles de edição', () => {
  const base: Usuario = { id: 'u1', email: 'a@exemplo.invalid', nome: 'Pessoa', cargo: null, perfil: 'leitura', prefeitura_id: 1, ativo: true, criado_em: '2026-11-01T00:00:00Z', atualizado_em: '2026-11-01T00:00:00Z' };
  assert.equal(podeEditarFicha({ podeEditar: usuarioPode(base, 'editar_projeto'), podeGravar: true, temEditar: true, revisao: 3 }), false);
  const editor: Usuario = { ...base, perfil: 'editor' };
  assert.equal(podeEditarFicha({ podeEditar: usuarioPode(editor, 'editar_projeto'), podeGravar: true, temEditar: true, revisao: 3 }), true);
  assert.equal(podeEditarFicha({ podeEditar: usuarioPode(editor, 'editar_projeto'), podeGravar: true, temEditar: true, revisao: null }), false);
});

test('ficha: topo do prefeito e nada dos campos retirados', () => {
  const f = montarFicha({ projeto: P('P-900'), fonte: FONTE, localizacao: 'Sem localização no mapa', cronogramas, hoje: '2026-11-22' });
  assert.deepEqual(f.topo.map((r) => r.rotulo), ['Órgão', 'Área', 'Valor total', 'Macroetapa', 'Entrega prevista', 'Localização']);
  assert.match(f.topo[2].valor, /R\$\s*1\.200\.000/);
  assert.equal(f.topo[3].valor, 'Em estruturação');
  assert.equal(f.topo[4].valor, '28/03/2027');
  assert.equal(f.observacao, 'Registro fictício para demonstração.');
  assert.deepEqual(f.recurso.map((r) => r.rotulo), ['Valor total', 'Fonte de captação', 'Contrapartida']);
  assert.equal(f.recurso[1].valor, 'Municipal');
  assert.equal(f.recurso[2].valor, 'Não informada');
  assert.deepEqual(f.entrega.map((r) => r.rotulo), ['Chegada da demanda', 'Peças técnicas', 'Planejamento', 'Preparatório', 'Contratação', 'Mobilização', 'Dias de obra', 'Encerramento (entrega prevista)']);
  assert.equal(f.entrega[6].valor, '180 dias');
  const rotulos = [...f.topo, ...f.cadastro, ...f.recurso, ...f.entrega, ...f.governanca.responsavel, ...f.governanca.acompanhamento, ...f.cronogramas.flatMap((c) => c.linhas)].map((l) => l.rotulo);
  for (const r of rotulos) assert.ok(!ROTULOS_FORA_DA_FICHA.includes(r), r);
});

test('ficha: projeto vazio mostra textos de ausência', () => {
  const p = P('P-900');
  p.observacao = null; p.area = null; p.orgao = null; p.sei = []; p.pendencias = []; p.operacional = null; p.compromisso = null; p.tem_projeto = null;
  p.valores.total = null; p.valores.obra = null;
  for (const k of Object.keys(p.datas)) (p.datas as unknown as Record<string, unknown>)[k] = null;
  const f = montarFicha({ projeto: p, fonte: FONTE, localizacao: 'Sem localização no mapa', cronogramas, hoje: '2026-11-22' });
  assert.equal(f.observacao, null);
  assert.equal(f.topo[0].valor, 'Não informado');
  assert.equal(f.topo[1].valor, 'Não informada');
  assert.equal(f.topo[2].valor, 'Não informado');
  assert.equal(f.topo[4].valor, 'Sem data');
  assert.equal(f.entrega[6].valor, 'Sem prazo');
  f.entrega.filter((_, i) => i !== 6).forEach((l) => assert.equal(l.valor, 'Sem data', l.rotulo));
  assert.deepEqual(f.sei, []);
  assert.equal(f.governanca.sei, 'Nenhum processo vinculado.');
  assert.deepEqual(f.governanca.atencao, ['Nenhum ponto de atenção registrado.']);
  assert.deepEqual(f.governanca.dependencias, ['Nenhuma dependência registrada.']);
});

test('ficha: cronograma só do próprio projeto', () => {
  const a = montarFicha({ projeto: P('P-900'), fonte: FONTE, localizacao: 'x', cronogramas, hoje: '2026-11-22' });
  assert.equal(a.cronogramas.length, 1);
  assert.equal(a.cronogramas[0].id, 'C-exemplo-001');
  const b = montarFicha({ projeto: P('P-901'), fonte: FONTE, localizacao: 'x', cronogramas, hoje: '2026-11-22' });
  assert.equal(b.cronogramas.length, 0);
});

test('ficha: dependências de recurso externo e de projeto técnico', () => {
  const p = P('P-900');
  p.compromisso = 'condicionado'; p.tem_projeto = false;
  const f = montarFicha({ projeto: p, fonte: FONTE, localizacao: 'x', cronogramas, hoje: '2026-11-22' });
  assert.ok(f.governanca.dependencias.includes('Depende de recurso externo para ser executado.'));
  assert.ok(f.governanca.dependencias.includes('Ainda não tem projeto técnico.'));
});
