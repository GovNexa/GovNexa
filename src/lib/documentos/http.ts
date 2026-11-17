// Ajudantes HTTP das rotas de documentos.
/** Só aceita pedido feito pela própria página: o cabeçalho Origin precisa ser o mesmo endereço do site. */
export function mesmaOrigem(request: Request): boolean {
  const origem = request.headers.get('origin');
  if (!origem) return false;
  try { return new URL(origem).origin === new URL(request.url).origin; } catch { return false; }
}
