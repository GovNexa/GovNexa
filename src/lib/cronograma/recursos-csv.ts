// CSV de envolvidos e recursos de um cronograma (E20). Só leitura; o BOM é posto pela rota.
import { dataBr, dataHoraBr } from '../datas.ts';
import { celula } from '../log/visoes.ts';
import type { Cronograma } from './tipos.ts';
import { decimalCsv, quantidadeTexto, resumoItens, ROTULO_TIPO_RECURSO, type ItensCronograma } from './recursos.ts';

export const CABECALHO_CSV_RECURSOS = [
  'Fase', 'Tarefa', 'Responsável da tarefa', 'Registro', 'Tipo', 'Nome ou descrição', 'Área', 'Papel', 'Quantidade', 'Unidade',
  'Valor estimado (R$)', 'Valor utilizado (R$)', 'Data de uso', 'Observação', 'Incluído por', 'Incluído em',
] as const;

export function paraCsvRecursos(c: Cronograma, itens: ItensCronograma): string {
  const linhas: string[][] = [[...CABECALHO_CSV_RECURSOS]];
  for (const f of c.fases) {
    for (const e of f.etapas) {
      if (!e.id) continue;
      const resp = e.responsavel ?? e.unidade ?? '';
      for (const x of itens.envolvidos.filter((i) => i.tarefa_id === e.id)) {
        linhas.push([f.nome, e.nome, resp, 'Envolvido', '', x.nome ?? '', x.area ?? '', x.papel ?? '', '', '', '', '', '', x.observacao ?? '', x.criado_por, dataHoraBr(x.criado_em)]);
      }
      for (const x of itens.recursos.filter((i) => i.tarefa_id === e.id)) {
        linhas.push([
          f.nome, e.nome, resp, 'Recurso', ROTULO_TIPO_RECURSO[x.tipo], x.descricao, '', '', quantidadeTexto(x.quantidade_centesimos), x.unidade ?? '',
          decimalCsv(x.valor_estimado_centavos), decimalCsv(x.valor_utilizado_centavos), x.data_uso ? dataBr(x.data_uso) : '', x.observacao ?? '', x.criado_por, dataHoraBr(x.criado_em),
        ]);
      }
    }
  }
  const r = resumoItens(itens);
  linhas.push(['', '', '', 'Total', '', '', '', '', '', '', decimalCsv(r.estimado), decimalCsv(r.utilizado), '', '', '', '']);
  return linhas.map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

export const nomeArquivoCsvRecursos = (id: string, hoje: string): string => `recursos-${id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)}-${hoje}.csv`;
