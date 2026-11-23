process.env.GOVNEXA_EXEMPLO = '1'; // usa os dados fictícios de data/exemplo
// E4: mapa das obras por área (cor da E3), macroetapa da E3, sem farol; bolhas e marcadores sem sobreposição.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AREAS_PADRAO } from '../../src/lib/carteira/area.ts';
import type { Carteira, Projeto } from '../../src/lib/carteira/tipos.ts';
import { SEM_AREA, coresDasAreas, filtrarPrioritarios, FILTROS_PRIORITARIOS_VAZIOS } from '../../src/lib/gestao/prioritarios.ts';
import { FOLGA_ALVOS, posicionarSemSobrepor, type Alvo, type Obstaculo } from '../../src/lib/mapa/bolhas.ts';
import { SERIES_COR, VAR_COR, glifoDaArea, serieDaCor } from '../../src/lib/mapa/cores-area.ts';
import type { GeoBairros } from '../../src/lib/mapa/geo.ts';
import { urlMapaCompleto } from '../../src/lib/mapa/link.ts';
import { obrasDoMapa, obrasSemLocal } from '../../src/lib/mapa/obras.ts';

const carteira = JSON.parse(readFileSync('data/exemplo/carteira/carteira.json', 'utf8')) as Carteira;
const GEO: GeoBairros = { bairros: { 'Bairro Exemplo': { busca: 'Bairro Exemplo', lat: -16.69, lng: -49.26, encontrado: true } } };
const SEM_GEO: GeoBairros = { bairros: {} };
const copia = (): Projeto[] => JSON.parse(JSON.stringify(carteira.projetos)) as Projeto[];
const cart = (projetos: Projeto[]): Carteira => ({ ...carteira, projetos });

/** Dois quadrados (centro e metade do lado) se sobrepõem ou ficam a menos de `folga` px. */
const encostam = (a: { x: number; y: number; m: number }, b: { x: number; y: number; m: number }, folga: number): boolean =>
  Math.abs(a.x - b.x) < a.m + b.m + folga - 1e-9 && Math.abs(a.y - b.y) < a.m + b.m + folga - 1e-9;
function semSobreposicao(alvos: Alvo[], posicoes: Map<string, { x: number; y: number }>, obstaculos: Obstaculo[] = []): boolean {
  const caixas = alvos.map((a) => ({ ...posicoes.get(a.id)!, m: a.meio }));
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) if (encostam(caixas[i], caixas[j], FOLGA_ALVOS)) return false;
    for (const o of obstaculos) {
      if (Math.abs(caixas[i].x - o.x) < caixas[i].m + o.meioL + FOLGA_ALVOS - 1e-9 && Math.abs(caixas[i].y - o.y) < caixas[i].m + o.meioA + FOLGA_ALVOS - 1e-9) return false;
    }
  }
  return true;
}

test('mapa por área: cada obra leva a área da E3 (gravada ou sugerida), a cor da E3 e a macroetapa; sem farol nem tipo', () => {
  const projetos = copia();
  const { obras, semLocal } = obrasDoMapa(cart(projetos), GEO);
  assert.equal(semLocal, 0);
  assert.equal(obras.length, projetos.length);
  const cores = coresDasAreas(projetos, AREAS_PADRAO);
  const por = (id: string) => obras.find((o) => o.id === id)!;
  assert.equal(por('P-901').area, 'saude');
  assert.equal(por('P-901').areaNome, 'Saúde');
  assert.equal(por('P-903').area, 'assistencia_social'); // sugerida pelo órgão (SEMASDH)
  assert.equal(por('P-900').area, SEM_AREA);
  assert.equal(por('P-900').areaNome, 'Sem área');
  assert.equal(por('P-900').cor, null);
  for (const o of obras) {
    assert.equal(o.cor, o.area === SEM_AREA ? null : cores.get(o.area) ?? null, o.id);
    for (const campo of ['farol', 'prazo', 'categoria', 'situacao']) assert.equal(campo in o, false, `${o.id} ${campo}`);
  }
  assert.equal(por('P-905').etapa, 'execucao');
  assert.equal(por('P-904').etapa, 'execucao'); // 04 e 05 = Execução, como na E3
  assert.equal(por('P-903').etapa, 'contratacao');
  assert.equal(por('P-906').etapa, 'concluida');
  assert.equal(por('P-900').entrega, '2027-03-28');
});

test('mapa por área: as cores vêm da carteira inteira e não mudam com o filtro da tela do prefeito', () => {
  const projetos = copia();
  const cores = coresDasAreas(projetos, AREAS_PADRAO);
  const filtrados = filtrarPrioritarios(projetos, { ...FILTROS_PRIORITARIOS_VAZIOS, area: 'cultura' }, AREAS_PADRAO);
  assert.ok(filtrados.length > 0);
  const { obras } = obrasDoMapa(cart(filtrados), GEO, undefined, { areas: AREAS_PADRAO, cores });
  assert.ok(obras.every((o) => o.area === 'cultura' && o.cor === cores.get('cultura')));
  const semCoresPassadas = obrasDoMapa(cart(filtrados), GEO);
  assert.equal(semCoresPassadas.obras[0].cor, 1, 'sem as cores da tela, uma área sozinha vira a cor 1');
});

test('mapa por área: área fora do catálogo ativo continua com nome e filtro; uma só área; sem área', () => {
  const projetos = copia().slice(0, 3);
  projetos[0].area = 'saude';
  projetos[1].area = 'meio_ambiente';
  projetos[2].area = null;
  projetos[2].orgao = 'SEINFRA';
  const catalogo = AREAS_PADRAO.filter((a) => a.codigo !== 'saude').map(({ codigo, nome }) => ({ codigo, nome }));
  const { obras } = obrasDoMapa(cart(projetos), GEO, undefined, { areas: catalogo });
  assert.deepEqual(obras.map((o) => [o.area, o.areaNome]), [['saude', 'Saúde'], ['meio_ambiente', 'meio_ambiente'], [SEM_AREA, 'Sem área']]);
  const so = copia().slice(0, 2).map((p) => ({ ...p, area: 'educacao' }));
  const unica = obrasDoMapa(cart(so), GEO);
  assert.deepEqual([...new Set(unica.obras.map((o) => `${o.area}:${o.cor}`))], ['educacao:1']);
});

test('mapa por área: todas as obras sem localização vão para semLocal e para a lista sem local', () => {
  const projetos = copia().map((p) => ({ ...p, localizacao: null }));
  const { obras, semLocal } = obrasDoMapa(cart(projetos), SEM_GEO);
  assert.equal(obras.length, 0);
  assert.equal(semLocal, projetos.length);
  const lista = obrasSemLocal(cart(projetos), SEM_GEO);
  assert.equal(lista.length, projetos.length);
  assert.ok(lista.every((o) => typeof o.area === 'string' && typeof o.areaNome === 'string' && !('farol' in o)));
});

test('mapa por área: nome com marcação vai como texto no dado (o escape é feito na tela)', () => {
  const projetos = copia().slice(0, 1);
  projetos[0].nome = '<img src=x onerror=alert(1)>';
  const { obras } = obrasDoMapa(cart(projetos), GEO);
  assert.equal(obras[0].nome, '<img src=x onerror=alert(1)>');
  assert.equal(JSON.stringify({ obras }).replaceAll('<', '\\u003c').includes('<'), false);
});

test('cor da área: só 1 a 6 viram cor; o resto é cinza; "Sem área" tem cinza próprio', () => {
  for (let i = 1; i <= 6; i++) assert.equal(serieDaCor(i, 'x'), `mp-cor-${i}`);
  for (const ruim of [0, 7, 1.5, '1', null, undefined, Number.NaN, -1]) assert.equal(serieDaCor(ruim, 'saude'), 'mp-cor-outros', String(ruim));
  assert.equal(serieDaCor(null, SEM_AREA), 'mp-cor-sem');
  assert.equal(SERIES_COR.length, 8);
  for (const s of SERIES_COR) assert.match(VAR_COR[s], /^var\(--pp-cor-(\d|outros|sem)\)$/);
  assert.equal(glifoDaArea('saude'), 'saude');
  assert.equal(glifoDaArea('parques_e_lazer'), 'lazer');
  assert.equal(glifoDaArea('meio_ambiente'), 'edificacao');
  assert.equal(glifoDaArea('__proto__'), 'edificacao');
  assert.equal(glifoDaArea(SEM_AREA), 'edificacao');
});

test('bolhas: centros iguais nunca se sobrepõem, a ordem da entrada não muda o resultado e alvo livre fica no lugar', () => {
  const alvos: Alvo[] = Array.from({ length: 7 }, (_, i) => ({ id: `regiao:${i}`, x: 100, y: 100, meio: 26 + (i % 3) * 4 }));
  const p1 = posicionarSemSobrepor(alvos);
  assert.equal(p1.size, 7);
  assert.ok(semSobreposicao(alvos, p1));
  const p2 = posicionarSemSobrepor([...alvos].reverse());
  assert.deepEqual([...p2.entries()].sort(), [...p1.entries()].sort());
  const sozinho = posicionarSemSobrepor([{ id: 'a', x: 10, y: 20, meio: 22 }]);
  assert.deepEqual(sozinho.get('a'), { x: 10, y: 20 });
});

test('bolhas: ficam fora dos controles do mapa e ignoram entrada inválida', () => {
  const obstaculos: Obstaculo[] = [{ x: 36, y: 64, meioL: 24, meioA: 52 }, { x: 300, y: 34, meioL: 100, meioA: 22 }];
  const alvos: Alvo[] = [{ id: 'a', x: 36, y: 64, meio: 26 }, { id: 'b', x: 300, y: 34, meio: 30 }, { id: 'c', x: 200, y: 200, meio: 22 }];
  const p = posicionarSemSobrepor(alvos, obstaculos);
  assert.ok(semSobreposicao(alvos, p, obstaculos));
  assert.deepEqual(p.get('c'), { x: 200, y: 200 });
  const ruins = [{ id: 'x', x: Number.NaN, y: 0, meio: 10 }, { id: 'y', x: 0, y: 0, meio: 0 }, { id: 'z', x: 0, y: 0, meio: -5 }] as Alvo[];
  assert.equal(posicionarSemSobrepor(ruins, [{ x: Number.POSITIVE_INFINITY, y: 0, meioL: 1, meioA: 1 }]).size, 0);
});

test('bolhas: 300 marcadores amontoados terminam sem nenhuma sobreposição', () => {
  const alvos: Alvo[] = Array.from({ length: 300 }, (_, i) => ({ id: `obra:${String(i).padStart(3, '0')}`, x: 500 + (i % 10) * 3, y: 400 + Math.floor(i / 10) * 2, meio: 22 }));
  const inicio = Date.now();
  const p = posicionarSemSobrepor(alvos);
  assert.equal(p.size, 300);
  assert.ok(semSobreposicao(alvos, p));
  // Orçamento alto: o teste falhava de forma intermitente quando a CPU era disputada por arquivos de teste em paralelo (revisão E14a, 23/11/2026).
  assert.ok(Date.now() - inicio < 10000, `levou ${Date.now() - inicio} ms`);
});

test('link do mapa completo leva área, macroetapa e região da tela do prefeito', () => {
  assert.equal(urlMapaCompleto({ area: '', etapa: '', regiao: '' }), '/plataforma/gestao/#mapa');
  assert.equal(urlMapaCompleto({ area: 'saude', etapa: 'execucao', regiao: 'Região Norte' }), '/plataforma/gestao/?areas=saude&etapas=execucao&regiao=Regi%C3%A3o+Norte#mapa');
  assert.equal(urlMapaCompleto({ area: SEM_AREA, etapa: '', regiao: '' }), '/plataforma/gestao/?areas=-sem#mapa');
});
