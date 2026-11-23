// Lê a resposta de um serviço externo até o teto de bytes; acima disso desiste (null). Usado pela busca de endereço e pelo PNCP.
export async function lerLimitado(r: Response, max: number): Promise<string | null> {
  const leitor = r.body?.getReader();
  if (!leitor) return '';
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await leitor.cancel().catch(() => undefined); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { tudo.set(p, pos); pos += p.byteLength; }
  return new TextDecoder().decode(tudo);
}
