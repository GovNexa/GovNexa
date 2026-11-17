// Regras puras dos documentos de projeto (etapa 3.4): tipos aceitos, tamanho, nome e conferência do conteúdo.
// Decisão do dono (16/11/2026): PDF, imagens e planilhas/documentos do Office, até 25 MB.
export const LIMITE_BYTES = 25 * 1024 * 1024;
export const LIMITE_NOME = 120;

type Assinatura = (b: Uint8Array) => boolean;
const comeca = (b: Uint8Array, bytes: number[], desde = 0) => bytes.every((v, i) => b[desde + i] === v);
const ZIP: Assinatura = (b) => comeca(b, [0x50, 0x4b, 0x03, 0x04]);
const OLE: Assinatura = (b) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Extensão → tipo MIME guardado e como conferir o conteúdo (a extensão e o conteúdo precisam concordar). */
export const TIPOS: Record<string, { mime: string; confere: Assinatura }> = {
  pdf: { mime: 'application/pdf', confere: (b) => comeca(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  png: { mime: 'image/png', confere: (b) => comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: 'image/jpeg', confere: (b) => comeca(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', confere: (b) => comeca(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: 'image/webp', confere: (b) => comeca(b, [0x52, 0x49, 0x46, 0x46]) && comeca(b, [0x57, 0x45, 0x42, 0x50], 8) },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', confere: ZIP },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', confere: ZIP },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', confere: ZIP },
  xls: { mime: 'application/vnd.ms-excel', confere: OLE },
  doc: { mime: 'application/msword', confere: OLE },
};
export const EXTENSOES_ACEITAS = Object.keys(TIPOS);

export function extensaoDe(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome);
  return m ? m[1].toLowerCase() : '';
}

/** Nome para exibição e para o cabeçalho de download: sem caminho, sem caracteres de controle ou de cabeçalho. */
export function nomeSeguro(bruto: string): string {
  let n = String(bruto ?? '').split(/[\\/]/).pop() ?? '';
  n = n.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069"<>:|?*]/g, '').replace(/^\.+/, '').trim();
  if (n.length > LIMITE_NOME) {
    const ext = extensaoDe(n);
    n = n.slice(0, LIMITE_NOME - (ext ? ext.length + 1 : 0)).trimEnd() + (ext ? `.${ext}` : '');
  }
  return n;
}

export type ResultadoValidacao = { ok: true; nome: string; mime: string } | { ok: false; erro: string };
/** `bytes` basta ser o começo do arquivo (a assinatura); `tamanho` é o tamanho total. */
export function validarArquivo(nomeBruto: string, bytes: Uint8Array, tamanho: number = bytes.byteLength): ResultadoValidacao {
  const nome = nomeSeguro(nomeBruto);
  if (!nome) return { ok: false, erro: 'Informe um arquivo com nome.' };
  if (tamanho === 0) return { ok: false, erro: 'O arquivo está vazio.' };
  if (tamanho > LIMITE_BYTES) return { ok: false, erro: 'O arquivo passa de 25 MB.' };
  const tipo = TIPOS[extensaoDe(nome)];
  if (!tipo) return { ok: false, erro: `Tipo não aceito. Envie ${EXTENSOES_ACEITAS.join(', ')}.` };
  if (!tipo.confere(bytes)) return { ok: false, erro: 'O conteúdo não corresponde ao tipo do arquivo.' };
  return { ok: true, nome, mime: tipo.mime };
}

export const ID_PROJETO = /^[A-Za-z0-9._-]{1,40}$/;
export const ID_DOCUMENTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hex = (h: Uint8Array) => [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
/** SHA-256 sem guardar uma segunda cópia do arquivo na memória (no Workers usa DigestStream; em testes, o digest comum). */
export async function sha256Hex(arquivo: Blob | Uint8Array): Promise<string> {
  const DS = (crypto as unknown as { DigestStream?: new (alg: string) => WritableStream & { digest: Promise<ArrayBuffer> } }).DigestStream;
  if (DS && arquivo instanceof Blob) {
    const ds = new DS('SHA-256');
    await arquivo.stream().pipeTo(ds);
    return hex(new Uint8Array(await ds.digest));
  }
  const bytes = arquivo instanceof Blob ? new Uint8Array(await arquivo.arrayBuffer()) : arquivo;
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)));
}

/** Cabeçalho de download: nome ASCII de reserva + nome UTF-8 (RFC 5987). */
export function cabecalhoDownload(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"%;]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}
