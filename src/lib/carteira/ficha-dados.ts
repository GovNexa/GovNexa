// Dados da ficha única do projeto (E6). Função pura: recebe tudo pronto e devolve textos. Sem leitura de arquivo nem relógio global.
import type { Cronograma } from '../cronograma/tipos.ts';
import { tempoNaMao } from '../cronograma/responsaveis.ts';
import { etapasDoCronograma, resumoCronograma } from '../cronograma/visoes.ts';
import { dataBr, hojeEmBrasilia } from '../datas.ts';
import { AREAS_PADRAO, areaDoProjeto, type Area } from './area.ts';
import { dataEntrega } from './filtros.ts';
import { nomeMacroetapa } from './macroetapas.ts';
import type { Projeto } from './tipos.ts';
import { valorProjeto } from './visoes.ts';
export interface LinhaFicha { rotulo: string; valor: string }
export interface EntradaFicha {
  projeto: Projeto; areas?: readonly Area[]; areasAtivas?: readonly Area[]; cronogramas?: readonly Cronograma[];
  fonte: { ficticio: boolean; arquivo: string; importado_em: string }; localizacao: string; hoje?: string;
}
export interface FichaProjeto {
  topo: (LinhaFicha & { chave: string })[]; observacao: string | null; prioritario: boolean;
  cadastro: LinhaFicha[]; recurso: LinhaFicha[]; entrega: LinhaFicha[]; sei: string[];
  cronogramas: { id: string; titulo: string; linhas: LinhaFicha[] }[];
  outrosCronogramas: { id: string; titulo: string }[]; // E13: quando há cronograma editado na tela, os demais do projeto ficam só como link
  governanca: { origem: string[]; responsavel: LinhaFicha[]; atencao: string[]; acompanhamento: LinhaFicha[]; sei: string; dependencias: string[] };
}
/** Rótulos que NÃO podem aparecer na ficha (áudios 19 a 21). Conferidos no teste. */
export const ROTULOS_FORA_DA_FICHA = ['Situação', 'Tipo de contratação', 'Órgão da contratação', 'Situação do recurso', 'Tipo do recurso', 'Valores por ano'];
const SEM = 'Não informado';
const SEM_A = 'Não informada';
const txt = (v: string | null | undefined, vazio = SEM): string => (v && v.trim() ? v.trim() : vazio);
const dinheiro = (n: number | null | undefined, vazio = SEM): string =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : vazio;
const dia = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? dataBr(iso) : 'Sem data');
const simNao = (v: boolean | null | undefined): string => (v === true ? 'Sim' : v === false ? 'Não' : SEM);
const COMPROMISSO: Record<string, string> = { decidido: 'Executa com ou sem recurso externo', condicionado: 'Só executa se vier recurso externo', ideia: 'Ideia ainda não avaliada' };
export function montarFicha(e: EntradaFicha): FichaProjeto {
  const p = e.projeto;
  const areas = e.areas ?? (e.fonte.ficticio ? AREAS_PADRAO : []);
  const area = areaDoProjeto(p, areas, e.areasAtivas ?? areas);
  const areaTexto = area ? (area.sugerida ? `${SEM_A} (sugestão pelo órgão: ${area.nome})` : area.nome) : SEM_A;
  const entrega = dataEntrega(p);
  const entregaTexto = entrega ? dataBr(entrega) : 'Sem data';
  const valor = dinheiro(valorProjeto(p));
  const r = p.recurso;
  const v = p.valores;
  const d = p.datas;
  const fonteCaptacao = [r.fonte_programa, r.origem].map((x) => (x ?? '').trim()).find(Boolean);
  const sei = (p.sei ?? []).filter((x) => x.trim());
  const hoje = e.hoje ?? hojeEmBrasilia();
  // E13: o cronograma editado na tela vence; com mais de um, o de atualização mais recente; os demais viram só link.
  const doProjeto = (e.cronogramas ?? []).filter((c) => c.projeto_id === p.id);
  const daTela = doProjeto.filter((c) => c.editado_na_tela === true || c.origem_registro === 'tela');
  const escolhido = [...daTela].sort((a, b) => (b.atualizado_em ?? '').localeCompare(a.atualizado_em ?? '') || b.id.localeCompare(a.id))[0];
  const principais = escolhido ? [escolhido] : doProjeto;
  const outros = escolhido ? doProjeto.filter((c) => c !== escolhido) : [];
  const o = p.operacional;
  const atencao = [...(p.pendencias ?? []).filter((x) => x.trim()), ...(o?.providencias?.trim() ? [`Providências: ${o.providencias.trim()}`] : [])];
  const dependencias = [
    ...(p.compromisso === 'condicionado' ? ['Depende de recurso externo para ser executado.'] : []),
    ...(p.tem_projeto === false ? ['Ainda não tem projeto técnico.'] : []),
    ...(r.termo_compromisso === false && (v.em_captacao ?? 0) > 0 ? ['Valor em captação sem termo de compromisso assinado.'] : []),
  ];
  return {
    topo: [
      { chave: 'orgao', rotulo: 'Órgão', valor: txt(p.orgao) }, { chave: 'area', rotulo: 'Área', valor: areaTexto },
      { chave: 'valor', rotulo: 'Valor total', valor }, { chave: 'macroetapa', rotulo: 'Macroetapa', valor: nomeMacroetapa(p.macroetapa) },
      { chave: 'entrega', rotulo: 'Entrega prevista', valor: entregaTexto }, { chave: 'localizacao', rotulo: 'Localização', valor: e.localizacao },
    ],
    observacao: p.observacao?.trim() ? p.observacao.trim() : null,
    prioritario: p.prioritario === true,
    cadastro: [
      { rotulo: 'Órgão', valor: txt(p.orgao) }, { rotulo: 'Área', valor: areaTexto }, { rotulo: 'Responsável', valor: txt(p.responsavel) },
      { rotulo: 'Tipo', valor: txt(p.tipo) }, { rotulo: 'Detalhamento', valor: txt(p.detalhamento) }, { rotulo: 'Região', valor: txt(p.regiao, SEM_A) },
      { rotulo: 'Bairro', valor: txt(p.bairro) }, { rotulo: 'Prioridade', valor: txt(p.prioridade, SEM_A) },
      { rotulo: 'Prioritário', valor: p.prioritario === true ? 'Sim' : 'Não' },
      { rotulo: 'Compromisso', valor: p.compromisso ? COMPROMISSO[p.compromisso] ?? SEM : SEM },
      { rotulo: 'Tem projeto', valor: simNao(p.tem_projeto) }, { rotulo: 'Status do projeto', valor: txt(p.status_projeto) },
    ],
    recurso: [
      { rotulo: 'Valor total', valor }, { rotulo: 'Fonte de captação', valor: fonteCaptacao ?? SEM_A },
      { rotulo: 'Contrapartida', valor: dinheiro(v.contrapartida, SEM_A) },
    ],
    entrega: [
      { rotulo: 'Chegada da demanda', valor: dia(d.inicio) }, { rotulo: 'Peças técnicas', valor: dia(d.pecas_tecnicas) },
      { rotulo: 'Planejamento', valor: dia(d.planejamento) }, { rotulo: 'Preparatório', valor: dia(d.preparatorio) },
      { rotulo: 'Contratação', valor: dia(d.contratacao) }, { rotulo: 'Mobilização', valor: dia(d.mobilizacao) },
      { rotulo: 'Dias de obra', valor: typeof d.execucao_dias === 'number' ? `${d.execucao_dias} ${d.execucao_dias === 1 ? 'dia' : 'dias'}` : 'Sem prazo' },
      { rotulo: 'Encerramento (entrega prevista)', valor: entregaTexto },
    ],
    sei,
    cronogramas: principais.map((c) => {
      const s = resumoCronograma(c, hoje);
      const alertas = etapasDoCronograma(c).filter((x) => tempoNaMao(x, hoje).alerta !== null).length;
      return { id: c.id, titulo: txt(c.titulo, 'Cronograma detalhado'), linhas: [
        { rotulo: 'Fase atual', valor: txt(s.faseAtual) },
        { rotulo: 'Realizado × previsto até hoje', valor: `${Math.round(s.realizadoPct)}% × ${Math.round(s.previstoPct)}%` },
        { rotulo: 'Etapas atrasadas', valor: String(s.atrasadas) }, { rotulo: 'Entrega prevista no cronograma', valor: dia(s.entregaPrevista) },
        { rotulo: 'Tarefas com alerta de tempo', valor: String(alertas) },
      ] };
    }),
    outrosCronogramas: outros.map((c) => ({ id: c.id, titulo: txt(c.titulo, 'Cronograma detalhado') })),
    governanca: {
      origem: [`Planilha: aba ${txt(p.origem?.aba)}, linha ${p.origem?.linha ?? '—'}`, `Arquivo: ${txt(e.fonte.arquivo)}`,
        `Importado em: ${e.fonte.importado_em ? dataBr(e.fonte.importado_em) : SEM}`, ...(e.fonte.ficticio ? ['Dados fictícios de exemplo'] : [])],
      responsavel: [{ rotulo: 'Responsável pela atualização', valor: txt(p.atualizacao?.responsavel) }, { rotulo: 'Atualizado em', valor: dia(p.atualizacao?.data) }],
      atencao: atencao.length ? atencao : ['Nenhum ponto de atenção registrado.'],
      acompanhamento: o ? [{ rotulo: 'Reunião', valor: txt(o.reuniao, SEM_A) }, { rotulo: 'Previsão de entrega', valor: txt(o.previsao_entrega, SEM_A) }] : [],
      sei: sei.length ? sei.join(', ') : 'Nenhum processo vinculado.',
      dependencias: dependencias.length ? dependencias : ['Nenhuma dependência registrada.'],
    },
  };
}
