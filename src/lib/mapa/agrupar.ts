import type { PontoGeo } from './tipos.ts';

export type NivelAgrupamento = 'regiao' | 'bairro';

export interface ObraAgrupavel {
  id: string;
  regiao: string | null;
  bairro: string | null;
  /** Série de cor da área (ex.: 'mp-cor-1'; ver cores-area.ts). Sem farol desde a E4. */
  serie: string;
  pontos: PontoGeo[];
}

export interface AgrupamentoMapa {
  id: string;
  nivel: NivelAgrupamento;
  nome: string;
  ids: string[];
  total: number;
  centro: PontoGeo | null;
  /** Quantas obras de cada série de cor (área), na ordem em que aparecem. */
  series: Record<string, number>;
}

const centroDosPontos = (pontos: PontoGeo[]): PontoGeo | null => pontos.length
  ? {
      lat: pontos.reduce((soma, ponto) => soma + ponto.lat, 0) / pontos.length,
      lng: pontos.reduce((soma, ponto) => soma + ponto.lng, 0) / pontos.length,
    }
  : null;

function agrupar(obras: ObraAgrupavel[], nivel: NivelAgrupamento): AgrupamentoMapa[] {
  const grupos = new Map<string, { nome: string; obras: ObraAgrupavel[] }>();
  const propriedade = nivel === 'regiao' ? 'regiao' : 'bairro';
  const ausente = nivel === 'regiao' ? 'Região não informada' : 'Bairro não informado';

  for (const obra of obras) {
    const nome = obra[propriedade]?.trim() || ausente;
    const id = `${nivel}:${nome.toLocaleLowerCase('pt-BR')}`;
    const grupo = grupos.get(id);
    if (grupo) grupo.obras.push(obra);
    else grupos.set(id, { nome, obras: [obra] });
  }

  return [...grupos].map(([id, grupo]) => {
    const pontos = grupo.obras
      .map((obra) => centroDosPontos(obra.pontos))
      .filter((ponto): ponto is PontoGeo => ponto !== null);
    const series = new Map<string, number>();
    for (const obra of grupo.obras) series.set(obra.serie, (series.get(obra.serie) ?? 0) + 1);
    return {
      id,
      nivel,
      nome: grupo.nome,
      ids: grupo.obras.map((obra) => obra.id),
      total: grupo.obras.length,
      centro: centroDosPontos(pontos),
      series: Object.fromEntries(series),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const agruparPorRegiao = (obras: ObraAgrupavel[]): AgrupamentoMapa[] => agrupar(obras, 'regiao');
export const agruparPorBairro = (obras: ObraAgrupavel[]): AgrupamentoMapa[] => agrupar(obras, 'bairro');
