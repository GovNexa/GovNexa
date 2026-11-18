// Cadastro de projeto novo (entrega B2). Sem dependência do Astro: recebe o usuário e o repositório.
// Segurança: perfil conferido aqui; o corpo do pedido é reconstruído campo a campo (nada além da lista abaixo chega ao banco),
// com tipo, tamanho e valores permitidos conferidos de novo no servidor; o autor vem da sessão; a prefeitura vem do repositório.
import { normalizarLocalizacao } from '../mapa/servico.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import type { Projeto } from './tipos.ts';

export interface ContextoCadastro { usuario: Usuario; repositorio: RepositorioProjetos }
export type ResultadoCadastro =
  | { ok: true; projeto: { id: string; nome: string; macroetapa: string | null }; pendencias: string[]; avisos: string[] }
  | { ok: false; status: number; erro: string; erros?: string[] };

/** Tamanho máximo do pedido: a localização (até 20 trechos de 200 pontos) é a maior parte. */
export const LIMITE_CORPO_CADASTRO = 327_680;

export const TIPOS = ['OBRA INFRA', 'OBRA CIVIL', 'REFORMA', 'SERVIÇO'] as const;
export const PRIORIDADES = ['Muito Alta', 'Alta', 'Média', 'Baixa'] as const;
export const TIPOS_CONTRATACAO = ['LICITAÇÃO', 'Execução Própria', 'Adesão a Ata', 'Dispensa', 'Termo de compensação'] as const;
export const ORIGENS_RECURSO = ['Municipal', 'Federal', 'Estadual', 'Outro'] as const;
const COMPROMISSOS = ['decidido', 'condicionado', 'ideia'] as const;
const SEI = /^\d{2}\.\d{1,2}\.\d{9}-\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALOR = 1e12;
const MAX_SEI = 10;

const ROTULO_DATAS: [string, string][] = [
  ['pecas_tecnicas', 'Entrega das peças técnicas'], ['planejamento', 'Fim do planejamento'], ['preparatorio', 'Fim do preparatório'],
  ['contratacao', 'Fim da contratação'], ['mobilizacao', 'Fim da mobilização'], ['encerramento', 'Entrega final'],
];

const falha = (status: number, erro: string, erros?: string[]): ResultadoCadastro => (erros ? { ok: false, status, erro, erros } : { ok: false, status, erro });
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function podeCadastrar(c: ContextoCadastro): ResultadoCadastro | { ok: true } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return falha(403, 'Seu perfil não permite cadastrar projetos.');
  if (!c.repositorio.podeGravar) return falha(503, 'Gravação indisponível no momento.');
  return { ok: true };
}

/** Texto curto: sem caracteres de controle (a observação mantém quebras de linha); vazio vira null. */
function texto(v: unknown, max: number, quebras = false): string | null {
  if (typeof v !== 'string') return null;
  const limpo = v.replace(quebras ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim();
  return limpo ? limpo.slice(0, max).trim() : null;
}

/** Valida e reconstrói os dados do cadastro. Devolve só os campos conhecidos ou a lista de erros em português simples. */
export function normalizarCadastro(bruto: unknown): { ok: true; dados: Partial<Projeto> & { nome: string; orgao: string }; avisos: string[] } | { ok: false; erros: string[] } {
  if (!ehObjeto(bruto)) return { ok: false, erros: ['Cadastro inválido.'] };
  const erros: string[] = [];
  const avisos: string[] = [];
  const dentro = <T extends string>(v: unknown, lista: readonly T[], rotulo: string): T | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return v as T;
    erros.push(`${rotulo}: valor não permitido.`);
    return null;
  };
  const booleano = (v: unknown, rotulo: string): boolean | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v;
    erros.push(`${rotulo}: valor inválido.`);
    return null;
  };
  const reais = (v: unknown, rotulo: string): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_VALOR) return Math.round(v * 100) / 100;
    erros.push(`${rotulo}: digite um valor em reais maior ou igual a zero.`);
    return null;
  };

  const nome = texto(bruto.nome, 200);
  const orgao = texto(bruto.orgao, 60);
  if (!nome) erros.push('Informe o nome do projeto.');
  if (!orgao) erros.push('Escolha o órgão ou digite a sigla.');

  let sei: string[] = [];
  if (bruto.sei !== undefined && bruto.sei !== null) {
    if (!Array.isArray(bruto.sei) || bruto.sei.length > MAX_SEI) erros.push(`Processo SEI: informe até ${MAX_SEI} números.`);
    else {
      sei = bruto.sei.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
      const ruins = sei.filter((x) => !SEI.test(x));
      if (ruins.length) erros.push(`Processo SEI fora do formato 00.0.000000000-0: ${ruins.slice(0, 3).join(', ')}.`);
    }
  }

  const compromisso = bruto.compromisso === undefined || bruto.compromisso === null || bruto.compromisso === '' ? 'ideia' : dentro(bruto.compromisso, COMPROMISSOS, 'Compromisso') ?? 'ideia';
  const tipo = dentro(bruto.tipo, TIPOS, 'Tipo');
  const prioridade = dentro(bruto.prioridade, PRIORIDADES, 'Prioridade');
  const tipoContratacao = dentro(bruto.tipo_contratacao, TIPOS_CONTRATACAO, 'Tipo de contratação');
  const origemRecurso = dentro(bruto.recurso_origem, ORIGENS_RECURSO, 'Origem do recurso');
  const temProjeto = booleano(bruto.tem_projeto, 'Tem projeto?');
  const termo = booleano(bruto.termo, 'Termo de compromisso');
  const valorObra = reais(bruto.valor_obra, 'Valor estimado da obra');
  const valorProjeto = reais(bruto.valor_projeto, 'Valor do projeto');

  const datasBrutas = ehObjeto(bruto.datas) ? bruto.datas : {};
  const datas: Record<string, string | null> = {};
  let anterior: [string, string] | null = null;
  for (const [chave, rotulo] of ROTULO_DATAS) {
    const v = datasBrutas[chave];
    if (v === undefined || v === null || v === '') { datas[chave] = null; continue; }
    if (typeof v !== 'string' || !DATA.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
      erros.push(`${rotulo}: data inválida.`);
      datas[chave] = null;
      continue;
    }
    datas[chave] = v;
    if (anterior && v < anterior[0]) avisos.push(`Datas fora de ordem: ${rotulo} (${v.split('-').reverse().join('/')}) é anterior a ${anterior[1]} (${anterior[0].split('-').reverse().join('/')}).`);
    else anterior = [v, rotulo];
  }
  let dias: number | null = null;
  if (datasBrutas.execucao_dias !== undefined && datasBrutas.execucao_dias !== null) {
    if (typeof datasBrutas.execucao_dias === 'number' && Number.isInteger(datasBrutas.execucao_dias) && datasBrutas.execucao_dias >= 0 && datasBrutas.execucao_dias <= 36500) dias = datasBrutas.execucao_dias;
    else erros.push('Dias de execução: digite um número inteiro entre 0 e 36500.');
  }

  let localizacao: Projeto['localizacao'] = null;
  if (bruto.localizacao !== undefined && bruto.localizacao !== null) {
    const n = normalizarLocalizacao(bruto.localizacao);
    if (n.ok) localizacao = n.valor;
    else for (const e of n.erros) erros.push(`Localização: ${e}`);
  }

  if (erros.length > 0 || !nome || !orgao) return { ok: false, erros };
  return {
    ok: true,
    avisos,
    dados: {
      nome, orgao,
      responsavel: texto(bruto.responsavel, 120), tipo, detalhamento: texto(bruto.detalhamento, 120),
      regiao: texto(bruto.regiao, 80), bairro: texto(bruto.bairro, 120), sei,
      observacao: texto(bruto.observacao, 2000, true), compromisso, origem_valor: texto(bruto.origem_valor, 120),
      tem_projeto: temProjeto, prioridade, tipo_contratacao: tipoContratacao, orgao_contratacao: texto(bruto.orgao_contratacao, 120),
      valores: { projeto: valorProjeto, obra: valorObra, executado: null, em_captacao: null, captado: null, contrapartida: null, custeio_municipio: null, total: null, com_solicitacao_financeira: null },
      recurso: {
        origem: origemRecurso, tipo: null, situacao: null, fonte_programa: texto(bruto.fonte_programa, 120),
        unidade_financiadora: texto(bruto.unidade_financiadora, 120), sugestao_financiar: null, termo_compromisso: termo, numero_termo: texto(bruto.numero_termo, 60),
      },
      datas: { inicio: null, pecas_tecnicas: datas.pecas_tecnicas, planejamento: datas.planejamento, preparatorio: datas.preparatorio, contratacao: datas.contratacao, mobilizacao: datas.mobilizacao, execucao_dias: dias, encerramento: datas.encerramento },
      localizacao,
    },
  };
}

export async function cadastrarProjeto(c: ContextoCadastro, bruto: unknown): Promise<ResultadoCadastro> {
  const pode = podeCadastrar(c);
  if (!pode.ok) return pode;
  const n = normalizarCadastro(bruto);
  if (!n.ok) return falha(400, 'Cadastro inválido.', n.erros);
  // Regras de negócio (macroetapa 00, pendências, histórico "criado") são as da função única do sistema, aplicadas no repositório.
  const r = await c.repositorio.criarProjeto(n.dados as Parameters<RepositorioProjetos['criarProjeto']>[0], c.usuario.email);
  if (!r.ok) {
    if (/Grava..o indispon/.test(r.erro)) return falha(503, 'Gravação indisponível no momento.');
    if (/Muitos cadastros/.test(r.erro)) return falha(409, r.erro);
    return falha(400, r.erro, r.faltando);
  }
  const p = r.projeto;
  return { ok: true, projeto: { id: p.id, nome: p.nome, macroetapa: p.macroetapa }, pendencias: [...p.pendencias], avisos: n.avisos };
}

