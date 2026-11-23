// Monta o relatório de inconsistências da requisição atual (tela e CSV usam a mesma função).
// Dados só da prefeitura da sessão: carteira e mapa de bairros vêm do contexto montado pelo middleware; áreas, do repositório.
import { AREAS_PADRAO, areasDaPrefeitura, type Area } from '../carteira/area.ts';
import { carregarCarteira } from '../carteira/carga.ts';
import type { Carteira } from '../carteira/tipos.ts';
import { carregarGeoBairros } from '../mapa/obras.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { hojeEmBrasilia } from '../whatsapp/farol.ts';
import { filtrosDaUrl, montarRelatorio, opcoesRelatorio, type FiltrosRelatorio, type OpcoesRelatorio, type RelatorioInconsistencias } from './inconsistencias.ts';

export interface TelaInconsistencias {
  hoje: string;
  carteira: Carteira;
  opcoes: OpcoesRelatorio;
  filtros: FiltrosRelatorio;
  orgaoInvalido: boolean;
  regraInvalida: boolean;
  relatorio: RelatorioInconsistencias;
}

export async function relatorioDaRequisicao(repositorio: RepositorioProjetos | undefined, busca: URLSearchParams): Promise<TelaInconsistencias> {
  const carteira = carregarCarteira();
  let areas: Area[] = [...AREAS_PADRAO];
  try {
    if (repositorio) areas = await areasDaPrefeitura(repositorio);
  } catch {
    areas = [...AREAS_PADRAO];
  }
  const hoje = hojeEmBrasilia();
  const opcoes = opcoesRelatorio(carteira);
  const f = filtrosDaUrl(busca, opcoes);
  const filtros: FiltrosRelatorio = { orgao: f.orgao, regra: f.regra };
  const relatorio = montarRelatorio(carteira, { hoje, geo: carregarGeoBairros(), areas }, filtros);
  return { hoje, carteira, opcoes, filtros, orgaoInvalido: f.orgaoInvalido, regraInvalida: f.regraInvalida, relatorio };
}
