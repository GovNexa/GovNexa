// Espera o servidor local responder antes de subir os demais servidores dos testes de tela.
// Arquivo separado para funcionar igual no Mac, no Linux e no Windows (o cmd.exe não aceita aspas simples em `node -e`).
const porta = Number(process.argv[2]);
const limiteMs = Number(process.argv[3] || 170000);
if (!Number.isInteger(porta) || porta <= 0) {
  console.error('Uso: node scripts/esperar-servidor.mjs <porta> [limite_em_ms]');
  process.exit(2);
}
const fim = Date.now() + limiteMs;
while (true) {
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/entrar/`);
    if (r.ok) break;
  } catch {}
  if (Date.now() > fim) {
    console.error('Servidor local indisponível.');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
