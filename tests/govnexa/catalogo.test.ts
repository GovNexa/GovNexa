// Testes do catálogo de módulos (menu nas três visões, E11), da marca e do município ativo do GovNexa.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import modules from '../../src/data/modules.json' with { type: 'json' };
import { FORA_DO_MENU, ITENS_DA_VISAO, PERMISSAO_DO_ITEM, catalogoCompleto, itemVisivel, menuPorModulo, moduloDoItem } from '../../src/lib/govnexa/catalogo.ts';
import { podeVerEquipe } from '../../src/lib/gestao/equipe.ts';
import { nomeDaMarca } from '../../src/lib/marca.ts';
import { municipioAtivo } from '../../src/lib/municipio-ativo.ts';
import { usuarioPode, type Perfil, type Usuario } from '../../src/lib/usuarios/index.ts';

const catalogo = catalogoCompleto(modules as { slug: string; title: string; group: string }[]);
const usuario = (perfil: Perfil): Usuario => ({ id: `u-${perfil}`, email: `${perfil}@exemplo.invalid`, nome: perfil, cargo: null, perfil, prefeitura_id: 5208707, ativo: true, criado_em: '', atualizado_em: '' }) as Usuario;
const menuDe = (perfil?: Perfil) => menuPorModulo(catalogo, perfil ? (acao) => usuarioPode(usuario(perfil), acao) : undefined);
const slugsDe = (menu: ReturnType<typeof menuDe>) => menu.flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => i.slug)));

test('toda tela do catálogo tem lugar no menu (ou está fora dele de propósito)', () => {
  for (const item of catalogo) if (!FORA_DO_MENU.includes(item.slug)) assert.doesNotThrow(() => moduloDoItem(item), item.slug);
  assert.throws(() => moduloDoItem({ slug: 'tela-nova', group: 'Grupo novo' }), /Tela sem lugar no menu: tela-nova/);
});

test('catálogo completo sem slug repetido, com a Visão Convênios e o Mapa e painel', () => {
  const slugs = catalogo.map((m) => m.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(catalogo.find((m) => m.slug === 'convenios')?.title, 'Visão Convênios');
  assert.equal(catalogo.find((m) => m.slug === 'gestao')?.title, 'Mapa e painel');
});

test('menu nas três visões, depois Licitações (demonstrativo) e Conta', () => {
  assert.deepEqual(menuDe().map((m) => [m.id, m.nome]), [
    ['gerencial', 'Visão gerencial'], ['governanca', 'Governança da execução'], ['convenios', 'Convênios'], ['licitacoes', 'Licitações'], ['conta', 'Conta'],
  ]);
});

test('cada visão tem as telas combinadas, nesta ordem, numa lista simples', () => {
  const menu = menuDe();
  for (const id of ['gerencial', 'governanca', 'convenios', 'conta'] as const) {
    const mod = menu.find((m) => m.id === id)!;
    assert.equal(mod.grupos.length, 1, id);
    assert.equal(mod.grupos[0].grupo, mod.nome, id);
    assert.deepEqual(mod.grupos[0].itens.map((i) => i.slug), [...ITENS_DA_VISAO[id]], id);
  }
  const gerencial = menu.find((m) => m.id === 'gerencial')!.grupos[0].itens;
  assert.deepEqual(gerencial.map((i) => i.title), ['Projetos prioritários', 'Carteira de projetos', 'Mapa e painel', 'Kanban por macroetapa', 'Gantt geral']);
  const governanca = menu.find((m) => m.id === 'governanca')!.grupos[0].itens.map((i) => i.title);
  for (const t of ['Painel da equipe', 'Cronogramas', 'Responsáveis', 'Onde está parado', 'Inconsistências de dados', 'Pendências de etapa', 'Reunião semanal', 'Sala de guerra', 'Histórico de alterações']) assert.ok(governanca.includes(t), t);
  assert.equal(menu.find((m) => m.id === 'convenios')!.grupos[0].itens[0].title, 'Visão Convênios');
});

test('Licitações (demonstrativo) mantém os grupos de origem', () => {
  const lic = menuDe().find((m) => m.id === 'licitacoes')!;
  assert.deepEqual(lic.grupos.map((g) => g.grupo), ['Operação', 'Planejamento', 'Preços', 'Automação', 'Mercado', 'Cadastros', 'Prazos']);
  assert.ok(!lic.grupos.some((g) => g.itens.some((i) => i.slug === '')), 'Projetos prioritários saiu de Licitações');
});

test('para o administrador, toda tela do menu aparece uma única vez', () => {
  const slugs = slugsDe(menuDe('admin'));
  const esperadas = catalogo.map((m) => m.slug).filter((s) => !FORA_DO_MENU.includes(s));
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual([...slugs].sort(), [...esperadas].sort());
});

test('perfil leitura não vê as guias que não pode abrir; editor e gestor não veem Usuários', () => {
  const escondidas = Object.keys(PERMISSAO_DO_ITEM).sort();
  assert.deepEqual(escondidas, ['gestao-equipe', 'gestao-inconsistencias', 'usuarios']);
  const leitura = slugsDe(menuDe('leitura'));
  for (const s of escondidas) assert.ok(!leitura.includes(s), s);
  assert.ok(leitura.includes('convenios') && leitura.includes('') && leitura.includes('projetos-parado'));
  for (const perfil of ['editor', 'gestor'] as const) {
    const s = slugsDe(menuDe(perfil));
    assert.ok(s.includes('gestao-equipe') && s.includes('gestao-inconsistencias') && !s.includes('usuarios'), perfil);
  }
  // Sem a função de permissão (testes e scripts), nada é escondido; com perfil ausente, só o que não exige permissão.
  assert.equal(itemVisivel('usuarios', () => false), false);
  assert.equal(itemVisivel('convenios', () => false), true);
});

test('o menu esconde o Painel da equipe exatamente para quem a página recusa', () => {
  for (const perfil of ['admin', 'gestor', 'editor', 'leitura'] as const) {
    const u = usuario(perfil);
    const s = slugsDe(menuPorModulo(catalogo, (acao) => usuarioPode(u, acao)));
    assert.equal(s.includes('gestao-equipe'), podeVerEquipe(u), perfil);
    assert.equal(s.includes('gestao-inconsistencias'), podeVerEquipe(u), perfil);
    assert.equal(s.includes('usuarios'), usuarioPode(u, 'gerenciar_usuarios'), perfil);
  }
  const inativo = { ...usuario('admin'), ativo: false } as Usuario;
  assert.ok(!slugsDe(menuPorModulo(catalogo, (acao) => usuarioPode(inativo, acao))).includes('usuarios'));
});

test('nome da marca', () => {
  assert.equal(nomeDaMarca(true), 'GovNexa');
  assert.equal(nomeDaMarca(false), 'GovNexa');
});
test('município ativo', () => {
  const m = municipioAtivo();
  assert.equal(m.codigo_ibge, 5208707);
  assert.equal(m.nomeExibicao, 'Prefeitura Municipal de Goiânia');
});

test('E13: o painel Responsáveis aparece para o perfil leitura e para o editor', () => {
  for (const perfil of ['leitura', 'editor'] as Perfil[]) {
    const governanca = menuDe(perfil).find((m) => m.id === 'governanca')!.grupos[0].itens;
    assert.ok(governanca.some((i) => i.slug === 'gestao-responsaveis' && i.title === 'Responsáveis'), perfil);
  }
});
