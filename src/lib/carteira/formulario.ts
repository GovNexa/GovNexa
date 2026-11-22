import type { Area } from './area.ts';
import { ORIGENS_RECURSO, PRIORIDADES, TIPOS, TIPOS_CONTRATACAO } from './cadastro.ts';

export type CampoFormulario = {
  id: string;
  rotulo: string;
  tipo: 'texto' | 'select' | 'numero' | 'data' | 'area' | 'reais' | 'marca';
  obrigatorio?: boolean;
  opcoes?: string[];
  opcoesRotuladas?: { valor: string; nome: string }[];
  vazio?: string;
  outro?: boolean;
  lista?: string[];
  dica?: string;
  largo?: boolean;
};

const SIM_NAO = ['Sim', 'Não'];
export function blocosProjeto(l: { orgaos: string[]; regioes: string[]; origensValor: string[]; detalhamentos: string[]; areas: Area[] }): { titulo: string; dica?: string; campos: CampoFormulario[] }[] {
  return [
    {
      titulo: '1. Identificação',
      campos: [
        { id: 'nome', rotulo: 'Nome do projeto', tipo: 'texto', obrigatorio: true, largo: true },
        { id: 'orgao', rotulo: 'Órgão', tipo: 'select', obrigatorio: true, opcoes: l.orgaos, vazio: 'Escolha o órgão', outro: true },
        { id: 'area', rotulo: 'Área', tipo: 'select', opcoesRotuladas: l.areas.map((a) => ({ valor: a.codigo, nome: a.nome })), vazio: 'Não informada', dica: 'Saúde, educação, drenagem e outras. Se houver sugestão pelo órgão, ela aparece aqui embaixo.' },
        { id: 'responsavel', rotulo: 'Responsável', tipo: 'texto' },
        { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [...TIPOS], vazio: 'Não informado' },
        { id: 'detalhamento', rotulo: 'Detalhamento', tipo: 'texto', lista: l.detalhamentos, dica: 'Ex.: edificação, ponte, corredor. Você pode escolher um já usado ou digitar.' },
        { id: 'regiao', rotulo: 'Região', tipo: 'select', opcoes: l.regioes, vazio: 'Não informada' },
        { id: 'bairro', rotulo: 'Bairro', tipo: 'texto' },
        { id: 'sei', rotulo: 'Processo SEI', tipo: 'texto', dica: 'Pode haver mais de um, separados por vírgula. Formato: 00.0.000000000-0' },
        { id: 'observacao', rotulo: 'Observação', tipo: 'area', largo: true },
      ],
    },
    {
      titulo: '3. Valores',
      campos: [
        { id: 'valor_obra', rotulo: 'Valor estimado da obra (R$)', tipo: 'reais', dica: 'Ex.: 1.500.000,00' },
        { id: 'valor_projeto', rotulo: 'Valor do projeto (R$)', tipo: 'reais', dica: 'Ex.: 80.000,00' },
        { id: 'origem_valor', rotulo: 'Origem do valor', tipo: 'select', opcoes: l.origensValor, vazio: 'Não informada', outro: true },
        { id: 'tem_projeto', rotulo: 'Tem projeto?', tipo: 'select', opcoes: ['Sim', 'Não', 'Não sei'], vazio: 'Não informado' },
      ],
    },
    {
      titulo: '4. Recurso',
      campos: [
        { id: 'recurso_origem', rotulo: 'Origem do recurso', tipo: 'select', opcoes: [...ORIGENS_RECURSO], vazio: 'Não informada' },
        { id: 'fonte_programa', rotulo: 'Fonte ou programa', tipo: 'texto' },
        { id: 'unidade_financiadora', rotulo: 'Unidade financiadora', tipo: 'texto' },
        { id: 'termo', rotulo: 'Termo de compromisso', tipo: 'select', opcoes: SIM_NAO, vazio: 'Não informado' },
        { id: 'numero_termo', rotulo: 'Número do termo', tipo: 'texto' },
      ],
    },
    {
      titulo: '5. Prioridade e contratação',
      campos: [
        { id: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: [...PRIORIDADES], vazio: 'Não informada' },
        { id: 'prioritario', rotulo: 'Projeto prioritário', tipo: 'marca', dica: 'Marque para o projeto aparecer no filtro "só prioritários".' },
        { id: 'tipo_contratacao', rotulo: 'Tipo de contratação', tipo: 'select', opcoes: [...TIPOS_CONTRATACAO], vazio: 'Não informado' },
        { id: 'orgao_contratacao', rotulo: 'Órgão da contratação', tipo: 'texto' },
      ],
    },
    {
      titulo: '6. Datas previstas',
      dica: 'Datas em ordem; o sistema avisa se estiverem fora de ordem.',
      campos: [
        { id: 'd_pecas', rotulo: 'Entrega das peças técnicas', tipo: 'data' },
        { id: 'd_planejamento', rotulo: 'Fim do planejamento', tipo: 'data' },
        { id: 'd_preparatorio', rotulo: 'Fim do preparatório', tipo: 'data' },
        { id: 'd_contratacao', rotulo: 'Fim da contratação', tipo: 'data' },
        { id: 'd_mobilizacao', rotulo: 'Fim da mobilização', tipo: 'data' },
        { id: 'd_dias', rotulo: 'Dias de execução', tipo: 'numero' },
        { id: 'd_entrega', rotulo: 'Entrega final', tipo: 'data' },
      ],
    },
  ];
}

export const COMPROMISSOS_FORM = [
  { valor: 'decidido', nome: 'Decidido', texto: 'O projeto será executado, com ou sem recurso externo.' },
  { valor: 'condicionado', nome: 'Condicionado', texto: 'Só será executado se vier recurso externo.' },
  { valor: 'ideia', nome: 'Ideia', texto: 'Demanda ainda não avaliada.' },
];

export function lerReais(texto: string): number | null | 'invalido' {
  const bruto = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!bruto) return null;
  const n = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(bruto) ? Number(bruto.replace(/\./g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 'invalido';
}

export function formatarReais(n: number | null | undefined): string {
  return n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
