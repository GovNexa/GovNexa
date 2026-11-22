// Edição parcial do projeto. A prefeitura e o autor vêm da sessão.
import { ID_PROJETO } from '../documentos/regras.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { areasDaPrefeitura } from './area.ts';
import { normalizarCadastro, texto } from './cadastro.ts';

export interface ContextoEdicao { usuario: Usuario; repositorio: RepositorioProjetos }
export type ResultadoEdicaoProjeto =
  | { ok: true; mudou: boolean; avisos: string[] }
  | { ok: false; status: number; erro: string; erros?: string[] };

export const LIMITE_CORPO_EDICAO = 65_536;

const CHAVES_EDICAO = [
  'nome', 'orgao', 'responsavel', 'tipo', 'detalhamento', 'regiao', 'bairro', 'sei', 'observacao', 'compromisso',
  'origem_valor', 'tem_projeto', 'prioridade', 'tipo_contratacao', 'orgao_contratacao', 'valor_obra', 'valor_projeto',
  'recurso_origem', 'fonte_programa', 'unidade_financiadora', 'termo', 'numero_termo', 'area', 'prioritario',
] as const;
const DATAS_EDICAO = ['pecas_tecnicas', 'planejamento', 'preparatorio', 'contratacao', 'mobilizacao', 'execucao_dias', 'encerramento'] as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const falha = (status: number, erro: string, erros?: string[]): ResultadoEdicaoProjeto =>
  erros ? { ok: false, status, erro, erros } : { ok: false, status, erro };

export function podeEditarProjeto(c: ContextoEdicao): ResultadoEdicaoProjeto | { ok: true } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return falha(403, 'Seu perfil não permite alterar projetos.');
  if (!c.repositorio.podeGravar || !c.repositorio.editarProjeto) return falha(503, 'Gravação indisponível no momento.');
  return { ok: true };
}

export function normalizarEdicao(bruto: unknown):
  | { ok: true; revisao: number; motivo: string | null; campos: Record<string, unknown>; avisos: string[] }
  | { ok: false; erros: string[] } {
  if (!ehObjeto(bruto) || !ehObjeto(bruto.campos)) return { ok: false, erros: ['Edição inválida.'] };
  const { revisao, campos: enviados } = bruto;
  if (typeof revisao !== 'number' || !Number.isSafeInteger(revisao) || revisao < 0) {
    return { ok: false, erros: ['Versão do projeto ausente: recarregue a página e tente de novo.'] };
  }

  const presentes = CHAVES_EDICAO.filter((chave) => Object.hasOwn(enviados, chave));
  const datasEnviadas = Object.hasOwn(enviados, 'datas') && ehObjeto(enviados.datas) ? enviados.datas : {};
  const datasPresentes = DATAS_EDICAO.filter((chave) => Object.hasOwn(datasEnviadas, chave));
  // Os marcadores satisfazem a validação do cadastro e só retornam chaves que chegaram na edição.
  const entrada: Record<string, unknown> = { nome: 'x', orgao: 'x' };
  for (const chave of presentes) entrada[chave] = enviados[chave];
  if (datasPresentes.length) entrada.datas = Object.fromEntries(datasPresentes.map((chave) => [chave, datasEnviadas[chave]]));

  const n = normalizarCadastro(entrada);
  if (!n.ok) return n;
  const especiais = {
    valor_obra: ['valores.obra', n.dados.valores?.obra],
    valor_projeto: ['valores.projeto', n.dados.valores?.projeto],
    recurso_origem: ['recurso.origem', n.dados.recurso?.origem],
    fonte_programa: ['recurso.fonte_programa', n.dados.recurso?.fonte_programa],
    unidade_financiadora: ['recurso.unidade_financiadora', n.dados.recurso?.unidade_financiadora],
    termo: ['recurso.termo_compromisso', n.dados.recurso?.termo_compromisso],
    numero_termo: ['recurso.numero_termo', n.dados.recurso?.numero_termo],
  } as const;
  const campos: Record<string, unknown> = {};
  for (const chave of presentes) {
    if (chave in especiais) {
      const [caminho, valor] = especiais[chave as keyof typeof especiais];
      campos[caminho] = valor;
    } else {
      campos[chave] = n.dados[chave as keyof typeof n.dados];
    }
  }
  for (const chave of datasPresentes) campos['datas.' + chave] = n.dados.datas?.[chave];
  return { ok: true, revisao, motivo: texto(bruto.motivo, 500, true), campos, avisos: datasPresentes.length ? n.avisos : [] };
}

export async function editarProjeto(c: ContextoEdicao, projetoId: string, bruto: unknown): Promise<ResultadoEdicaoProjeto> {
  const pode = podeEditarProjeto(c);
  if (!pode.ok) return pode;
  if (!ID_PROJETO.test(projetoId)) return falha(404, 'Projeto não encontrado.');
  const n = normalizarEdicao(bruto);
  if (!n.ok) return falha(400, 'Edição inválida.', n.erros);
  if (n.campos.area != null && !(await areasDaPrefeitura(c.repositorio)).some((a) => a.codigo === n.campos.area)) {
    return falha(400, 'Edição inválida.', ['Área: valor não permitido.']);
  }
  const r = await c.repositorio.editarProjeto!(projetoId, n.revisao, n.campos, n.motivo, c.usuario.email);
  if (!r.ok) {
    if (r.codigo === 'inexistente') return falha(404, 'Projeto não encontrado.');
    if (r.codigo === 'conflito') {
      return falha(409, 'O projeto foi alterado por outra pessoa enquanto você editava. Recarregue a página e tente de novo.');
    }
    return falha(400, 'Edição inválida.', [r.erro]);
  }
  return { ok: true, mudou: r.mudou, avisos: n.avisos };
}
