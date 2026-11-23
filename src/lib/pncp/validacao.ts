// Esquema dos campos do PNCP que o GovNexa usa (E14a). Tudo o que vem do PNCP passa por aqui antes de ir ao banco.
// Funções puras; nunca lançam. Campo opcional inválido vira null; campo obrigatório inválido recusa a resposta inteira.
import { classificarObra, centavosPncp, dataPncp, mascararCpf, normalizarCnpj, textoPncp, MAX_RESULTADOS_ITEM, TAMANHO_PAGINA_ITENS, type ClasseObra } from './regras.ts';

export interface CompraPncp {
  situacaoId: number; situacaoNome: string | null; existeResultado: boolean; srp: boolean;
  modalidadeId: number | null; modalidadeNome: string | null; amparoCodigo: number | null; amparoNome: string | null;
  codigoIbge: string | null; obra: ClasseObra; numeroCompra: string | null; processo: string | null; objeto: string | null;
  valorEstimado: number | null; valorHomologado: number | null;
  dataPublicacao: string | null; dataAbertura: string | null; dataEncerramento: string | null; dataAtualizacaoGlobal: string | null;
}
export interface ItemPncp {
  numeroItem: number; descricao: string | null; materialServico: 'M' | 'S' | null; categoriaId: number | null; categoriaNome: string | null;
  criterioNome: string | null; situacaoId: number; situacaoNome: string | null; temResultado: boolean; valorTotal: number | null;
}
export interface ResultadoPncp {
  numeroItem: number; sequencialResultado: number; tipoPessoa: 'PJ' | 'PF' | 'PE' | null; fornecedorNi: string | null; fornecedorNome: string | null;
  ordemClassificacao: number | null; situacaoId: number | null; situacaoNome: string | null; valorHomologado: number | null;
  dataResultado: string | null; motivoCancelamento: string | null;
}
export interface TrioPncp { cnpj: string; ano: number; sequencial: number }

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const inteiro = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;

export function lerCompra(json: unknown, esperado: TrioPncp): CompraPncp | null {
  if (!ehObjeto(json)) return null;
  const orgao = ehObjeto(json.orgaoEntidade) ? json.orgaoEntidade : null;
  if (!orgao || normalizarCnpj(orgao.cnpj) !== esperado.cnpj) return null;
  if (json.anoCompra !== esperado.ano || json.sequencialCompra !== esperado.sequencial) return null;
  const situacaoId = inteiro(json.situacaoCompraId, 1, 99);
  if (situacaoId === null) return null;
  const amparo = ehObjeto(json.amparoLegal) ? json.amparoLegal : {};
  const modalidadeId = inteiro(json.modalidadeId, 1, 99);
  const amparoCodigo = inteiro(amparo.codigo, 1, 99999);
  const objeto = mascararCpf(textoPncp(json.objetoCompra, 2000));
  const unidade = ehObjeto(json.unidadeOrgao) ? json.unidadeOrgao : {};
  return {
    situacaoId,
    situacaoNome: textoPncp(json.situacaoCompraNome, 80),
    existeResultado: json.existeResultado === true,
    srp: json.srp === true,
    modalidadeId,
    modalidadeNome: textoPncp(json.modalidadeNome, 80),
    amparoCodigo,
    amparoNome: textoPncp(amparo.nome, 200),
    codigoIbge: typeof unidade.codigoIbge === 'string' && /^[0-9]{7}$/.test(unidade.codigoIbge) ? unidade.codigoIbge : null,
    obra: classificarObra({ modalidadeId, amparoCodigo, objeto }),
    numeroCompra: textoPncp(json.numeroCompra, 60),
    processo: textoPncp(json.processo, 120),
    objeto,
    valorEstimado: centavosPncp(json.valorTotalEstimado),
    valorHomologado: centavosPncp(json.valorTotalHomologado),
    dataPublicacao: dataPncp(json.dataPublicacaoPncp),
    dataAbertura: dataPncp(json.dataAberturaProposta),
    dataEncerramento: dataPncp(json.dataEncerramentoProposta),
    dataAtualizacaoGlobal: dataPncp(json.dataAtualizacaoGlobal),
  };
}

export function lerItens(json: unknown): ItemPncp[] | null {
  if (!Array.isArray(json) || json.length > TAMANHO_PAGINA_ITENS) return null;
  const vistos = new Set<number>();
  const itens: ItemPncp[] = [];
  for (const x of json) {
    if (!ehObjeto(x)) return null;
    const numeroItem = inteiro(x.numeroItem, 1, 99999);
    const situacaoId = inteiro(x.situacaoCompraItem, 1, 99);
    if (numeroItem === null || situacaoId === null || vistos.has(numeroItem)) return null;
    vistos.add(numeroItem);
    itens.push({
      numeroItem,
      descricao: mascararCpf(textoPncp(x.descricao, 300)),
      materialServico: x.materialOuServico === 'M' || x.materialOuServico === 'S' ? x.materialOuServico : null,
      categoriaId: inteiro(x.itemCategoriaId, 1, 999),
      categoriaNome: textoPncp(x.itemCategoriaNome, 80),
      criterioNome: textoPncp(x.criterioJulgamentoNome, 80),
      situacaoId,
      situacaoNome: textoPncp(x.situacaoCompraItemNome, 80),
      temResultado: x.temResultado === true,
      valorTotal: centavosPncp(x.valorTotal),
    });
  }
  return itens;
}

/** O excedente acima de MAX_RESULTADOS_ITEM é descartado (quem chama marca "incompleto"). O NI de pessoa física ou estrangeiro NUNCA sai daqui. */
export function lerResultados(json: unknown, numeroItem: number, numeroControle: string): ResultadoPncp[] | null {
  if (!Array.isArray(json)) return null;
  const vistos = new Set<number>();
  const lista: ResultadoPncp[] = [];
  for (const x of json.slice(0, MAX_RESULTADOS_ITEM)) {
    if (!ehObjeto(x)) return null;
    const sequencialResultado = inteiro(x.sequencialResultado, 1, 999);
    if (sequencialResultado === null || x.numeroItem !== numeroItem || vistos.has(sequencialResultado)) return null;
    vistos.add(sequencialResultado);
    if (x.numeroControlePNCPCompra !== undefined && x.numeroControlePNCPCompra !== null && x.numeroControlePNCPCompra !== numeroControle) return null;
    const tipoPessoa = x.tipoPessoa === 'PJ' || x.tipoPessoa === 'PF' || x.tipoPessoa === 'PE' ? x.tipoPessoa : null;
    lista.push({
      numeroItem,
      sequencialResultado,
      tipoPessoa,
      fornecedorNi: tipoPessoa === 'PJ' ? normalizarCnpj(x.niFornecedor) : null,
      fornecedorNome: mascararCpf(textoPncp(x.nomeRazaoSocialFornecedor, 200)),
      ordemClassificacao: inteiro(x.ordemClassificacaoSrp, 1, 999),
      situacaoId: inteiro(x.situacaoCompraItemResultadoId, 1, 99),
      situacaoNome: textoPncp(x.situacaoCompraItemResultadoNome, 80),
      valorHomologado: centavosPncp(x.valorTotalHomologado),
      dataResultado: dataPncp(x.dataResultado, true),
      motivoCancelamento: mascararCpf(textoPncp(x.motivoCancelamento, 300)),
    });
  }
  return lista;
}
