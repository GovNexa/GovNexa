// Mensagens fixas mostradas na página de documentos. O endereço leva só um código (?r=...), nunca texto livre.
import type { Resultado } from './servico.ts';

export const MENSAGENS: Record<string, { texto: string; ok: boolean }> = {
  ok: { texto: 'Documento enviado.', ok: true },
  removido: { texto: 'Documento removido da lista. O arquivo fica guardado para auditoria.', ok: true },
  classificado: { texto: 'Tipo do documento atualizado.', ok: true },
  tipodoc: { texto: 'Tipo de documento inválido ou desativado. Recarregue a página e escolha de novo.', ok: false },
  mudou: { texto: 'O documento mudou enquanto você classificava. Confira e tente de novo.', ok: false },
  permissao: { texto: 'Seu perfil não permite esta ação.', ok: false },
  tamanho: { texto: 'O arquivo passa de 25 MB.', ok: false },
  tipo: { texto: 'Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG, WEBP) ou Office (XLSX, DOCX, PPTX, XLS, DOC).', ok: false },
  conteudo: { texto: 'O conteúdo do arquivo não corresponde ao tipo informado.', ok: false },
  vazio: { texto: 'Escolha um arquivo para enviar.', ok: false },
  duplicado: { texto: 'Este arquivo já foi enviado neste projeto.', ok: false },
  projeto: { texto: 'Projeto ou documento não encontrado.', ok: false },
  origem: { texto: 'Pedido recusado por segurança. Recarregue a página e tente de novo.', ok: false },
  limite: { texto: 'Muitas ações em pouco tempo. Aguarde um pouco e tente de novo.', ok: false },
  indisponivel: { texto: 'Armazenamento de documentos indisponível. Tente mais tarde.', ok: false },
};
export function codigoDe(r: Extract<Resultado, { ok: false }>): string {
  if (/^Tipo de documento/.test(r.erro)) return 'tipodoc';
  if (/^O documento mudou/.test(r.erro)) return 'mudou';
  if (r.status === 403) return 'permissao';
  if (r.status === 404) return 'projeto';
  if (r.status === 409) return 'duplicado';
  if (r.status === 413) return 'tamanho';
  if (r.status === 429) return 'limite';
  if (r.status === 503) return 'indisponivel';
  if (/25 MB/.test(r.erro)) return 'tamanho';
  if (/^Tipo não/.test(r.erro)) return 'tipo';
  if (/conteúdo/.test(r.erro)) return 'conteudo';
  return 'vazio';
}
