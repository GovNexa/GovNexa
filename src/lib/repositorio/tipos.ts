// Contrato do repositório de dados: as telas e a API falam só com esta interface (JSON hoje, PostgreSQL depois).
import type { Evento, RegistroHistorico } from '../carteira/movimentacao.ts';
import type { Projeto } from '../carteira/tipos.ts';
import type { Cronograma } from '../cronograma/tipos.ts';
import type { RegistroLog } from '../log/tipos.ts';

export type ResultadoAplicacao =
  | { ok: true; historico: RegistroHistorico[] }
  | { ok: false; erro: string; faltando?: string[] };

export type ResultadoCriacaoProjeto =
  | { ok: true; projeto: Projeto; historico: RegistroHistorico[] }
  | { ok: false; erro: string; faltando?: string[] };

export interface RepositorioProjetos {
  podeGravar: boolean;
  /** Prefeitura de que este repositório lê e grava (chave do cache; preenchida por `repositorioDoUsuario`). */
  prefeituraId?: number;
  /** Ausente apenas nos adaptadores legados. */
  listarGeoBairros?(): Promise<import('../mapa/geo.ts').GeoBairros>;
  listarProjetos(): Promise<Projeto[]>;
  obterProjeto(id: string): Promise<Projeto | null>;
  historico(projetoId: string): Promise<RegistroHistorico[]>;
  /** Todos os registros do histórico de alterações (inclui importações), mais recentes primeiro. */
  listarHistorico(): Promise<RegistroLog[]>;
  aplicar(e: Evento): Promise<ResultadoAplicacao>;
  /** Cadastra um projeto novo na macroetapa 00 (grava só com o banco configurado). */
  criarProjeto(dados: Partial<Projeto> & { nome: string; orgao: string }, autor: string): Promise<ResultadoCriacaoProjeto>;
  listarCronogramas(): Promise<Cronograma[]>;
  /**
   * Grava a localização e o evento de histórico juntos (só no D1). `decidir` recebe a localização que está no banco e devolve
   * o novo valor com a frase do histórico, ou null se nada muda. A gravação só vale se o projeto não mudou desde essa leitura.
   * 'inexistente' = projeto não é desta prefeitura; 'igual' = nada a gravar; 'conflito' = outra pessoa alterou o projeto no meio.
   */
  definirLocalizacao?(
    projetoId: string,
    decidir: (atual: unknown) => { valor: import('../mapa/tipos.ts').Localizacao; descricao: string } | null,
    autor: string,
  ): Promise<'ok' | 'igual' | 'inexistente' | 'conflito'>;
  /** Documentos de projeto (só no D1; ausente nos demais repositórios). */
  documentos?: import('../documentos/repositorio.ts').RepositorioDocumentos;
}
