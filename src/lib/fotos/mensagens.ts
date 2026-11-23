// Mensagens fixas da aba Fotos. O endereço leva só um código (?rf=...), nunca texto livre.
import { hrefFicha, voltaSegura, VOLTA_PADRAO } from '../carteira/ficha.ts';
import { ID_PROJETO } from '../documentos/regras.ts';

export type CodigoFoto =
  | 'enviada' | 'removida' | 'permissao' | 'projeto' | 'naoencontrada' | 'tamanho' | 'tipo' | 'conteudo' | 'vazio'
  | 'legenda' | 'data' | 'duplicada' | 'limite' | 'cheio' | 'origem' | 'indisponivel';

export const MENSAGENS_FOTOS: Record<CodigoFoto, { texto: string; ok: boolean }> = {
  enviada: { texto: 'Foto enviada e registrada no Histórico.', ok: true },
  removida: { texto: 'Foto removida da ficha e registrada no Histórico. O arquivo fica guardado para auditoria.', ok: true },
  permissao: { texto: 'Seu perfil não permite enviar nem remover fotos.', ok: false },
  projeto: { texto: 'Projeto não encontrado.', ok: false },
  naoencontrada: { texto: 'Foto não encontrada.', ok: false },
  tamanho: { texto: 'A foto passa de 10 MB.', ok: false },
  tipo: { texto: 'Tipo de arquivo não aceito. Envie uma foto JPG, PNG ou WEBP.', ok: false },
  conteudo: { texto: 'O conteúdo do arquivo não corresponde a uma foto JPG, PNG ou WEBP.', ok: false },
  vazio: { texto: 'Escolha uma foto para enviar.', ok: false },
  legenda: { texto: 'A legenda passa de 200 caracteres.', ok: false },
  data: { texto: 'Informe a data da foto (de 01/01/2000 até hoje).', ok: false },
  duplicada: { texto: 'Esta foto já foi enviada neste projeto.', ok: false },
  limite: { texto: 'Muitos envios em pouco tempo. Aguarde um pouco e tente de novo.', ok: false },
  cheio: { texto: 'Este projeto chegou ao limite de 200 fotos. Remova alguma antes de enviar outra.', ok: false },
  origem: { texto: 'Pedido recusado por segurança. Recarregue a página e tente de novo.', ok: false },
  indisponivel: { texto: 'Armazenamento de fotos indisponível. Tente mais tarde.', ok: false },
};

/** Mensagem pelo código do endereço; código fora da lista (inclusive nomes como "constructor") = nenhuma. */
export function mensagemFoto(codigo: string | null | undefined): { texto: string; ok: boolean } | null {
  return codigo && Object.hasOwn(MENSAGENS_FOTOS, codigo) ? MENSAGENS_FOTOS[codigo as CodigoFoto] : null;
}

/** Volta para a aba Fotos da ficha, mantendo o "voltar" só se for uma tela permitida. Projeto inválido = Carteira. */
export function destinoFotos(projeto: string | null, volta: string | null, origem: string, codigo: CodigoFoto): string {
  if (!projeto || !ID_PROJETO.test(projeto)) return VOLTA_PADRAO;
  return `${hrefFicha(projeto, voltaSegura(volta, origem), 'fotos')}&rf=${codigo}`;
}
