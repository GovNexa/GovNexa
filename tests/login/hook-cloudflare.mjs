// Resolve 'cloudflare:workers' para um stub local, só para testar rotas Astro no Node.
export async function resolve(especificador, contexto, proximo) {
 if (especificador === 'cloudflare:workers') return { url: new URL('./stub-cloudflare-workers.mjs', import.meta.url).href, shortCircuit: true };
 return proximo(especificador, contexto);
}
