// Dados do mapa das obras: lê a geocodificação por bairro e monta a lista de obras com localização.
// E4: cada obra leva a ÁREA (a mesma da tela do prefeito, E3: gravada ou sugerida pelo órgão), a cor da área e a
// macroetapa da E3. Saíram o farol, o prazo da etapa e o tipo de obra: o mapa não mostra situação de prazo.
import geoExemplo from '../../../data/exemplo/carteira/geo-bairros.json' with { type: 'json' };
import { contextoDados } from '../repositorio/contexto.ts';
import { AREAS_PADRAO, type Area } from '../carteira/area.ts';
import { dataEntrega } from '../carteira/filtros.ts';
import type { Carteira, Projeto } from '../carteira/tipos.ts';
import { valorProjeto } from '../carteira/visoes.ts';
import { areaEfetiva, coresDasAreas, etapaDe, type IdEtapa } from '../gestao/prioritarios.ts';
import { espalharSobrepostos, localizarProjeto, type GeoBairros } from './geo.ts';
import type { Localizacao, PrecisaoLocal } from './tipos.ts';

export function carregarGeoBairros(): GeoBairros {
  const geo = contextoDados.getStore()?.geoBairros;
  return geo && Object.keys(geo.bairros).length ? geo : geoExemplo as GeoBairros;
}

/** Leitura tolerante à ausência do banco/tabela, compartilhada pelo cache do contexto. */
export async function lerGeoBairrosDoRepositorio(repo?: Pick<import('../repositorio/tipos.ts').RepositorioProjetos, 'listarGeoBairros'>): Promise<GeoBairros> {
  try {
    const geo = await repo?.listarGeoBairros?.();
    return geo && Object.keys(geo.bairros).length ? geo : geoExemplo as GeoBairros;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!/no such table/i.test(mensagem)) console.error('[mapa] bairros indisponíveis:', mensagem);
    return geoExemplo as GeoBairros;
  }
}

export interface ObraBasica {
  id: string;
  nome: string;
  orgao: string | null;
  /** Código da área (catálogo da E1) ou '-sem' (SEM_AREA da E3). Vale a sugerida pelo órgão, como na tela do prefeito. */
  area: string;
  areaNome: string;
  /** Cor da área de 1 a 6 (mesma da E3, calculada na carteira inteira) ou null (cinza: outras áreas e "Sem área"). */
  cor: number | null;
  /** Macroetapa agrupada como na tela do prefeito (E3): execução, contratação, preparatório, planejamento, estruturação, concluída, sem. */
  etapa: IdEtapa;
  valor: number | null;
  /** Executado ÷ total (0 a 100) só se coerente (mesma regra do painel); senão null. */
  percentual: number | null;
  /** Entrega prevista (ISO), pela mesma regra da Carteira (E2), ou null. */
  entrega: string | null;
  foto: string | null;
  bairro: string | null;
  regiao: string | null;
}
export interface ObraMapa extends ObraBasica {
  precisao: PrecisaoLocal;
  localizacao: Localizacao;
}

/** Catálogo de áreas da prefeitura e cores já calculadas (a tela do prefeito passa as dela para o mapa não repintar). */
export interface OpcoesMapa { areas?: readonly Area[]; cores?: ReadonlyMap<string, number> }

function basica(p: Projeto, areas: readonly Area[], cores: ReadonlyMap<string, number>): ObraBasica {
  const valor = valorProjeto(p);
  const executado = p.valores.executado;
  const fotos = p.fotos ?? [];
  const capa = fotos.find((x) => x.capa) ?? fotos[0];
  const area = areaEfetiva(p, areas);
  return {
    id: p.id,
    nome: p.nome,
    orgao: p.orgao,
    area: area.codigo,
    areaNome: area.nome,
    cor: cores.get(area.codigo) ?? null,
    etapa: etapaDe(p),
    valor,
    percentual: valor !== null && valor > 0 && executado !== null && executado <= valor ? (executado / valor) * 100 : null,
    entrega: dataEntrega(p),
    foto: capa ? capa.url : null,
    bairro: p.bairro,
    regiao: p.regiao?.trim() || null,
  };
}

const preparar = (carteira: Carteira, opcoes: OpcoesMapa): { areas: readonly Area[]; cores: ReadonlyMap<string, number> } => {
  const areas = opcoes.areas ?? AREAS_PADRAO;
  return { areas, cores: opcoes.cores ?? coresDasAreas(carteira.projetos, areas) };
};

/** `_hoje` ficou por compatibilidade com quem já chama (o farol saiu do mapa na E4). */
export function obrasDoMapa(carteira: Carteira, geo: GeoBairros, _hoje?: string, opcoes: OpcoesMapa = {}): { obras: ObraMapa[]; semLocal: number } {
  const { areas, cores } = preparar(carteira, opcoes);
  const obras: ObraMapa[] = [];
  let semLocal = 0;
  for (const p of carteira.projetos) {
    const loc = localizarProjeto(p, geo);
    if (!loc) { semLocal++; continue; }
    obras.push({ ...basica(p, areas, cores), precisao: loc.precisao, localizacao: loc.localizacao });
  }
  const pontosBairro = obras
    .filter((o) => o.precisao === 'bairro' && o.localizacao.tipo === 'ponto')
    .map((o) => ({ id: o.id, ponto: (o.localizacao as Extract<Localizacao, { tipo: 'ponto' }>).ponto }));
  const espalhados = espalharSobrepostos(pontosBairro);
  for (const o of obras) {
    const novo = espalhados.get(o.id);
    if (novo && o.localizacao.tipo === 'ponto') o.localizacao = { ...o.localizacao, ponto: novo };
  }
  return { obras, semLocal };
}

/** Dados mínimos dos projetos sem localização (o mapa os mostra se houver localização simulada na sessão). */
export function obrasSemLocal(carteira: Carteira, geo: GeoBairros, _hoje?: string, opcoes: OpcoesMapa = {}): ObraBasica[] {
  const { areas, cores } = preparar(carteira, opcoes);
  return carteira.projetos.filter((p) => !localizarProjeto(p, geo)).map((p) => basica(p, areas, cores));
}
