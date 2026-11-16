/** Marca única do produto em todas as páginas. */
export const MARCA = { nome: 'GovNexa', slogan: 'Inteligência para a gestão pública', nomeCompleto: 'GovNexa — Inteligência para a gestão pública' } as const;
/** Mantém a assinatura para compatibilidade com os chamadores existentes. */
export const nomeDaMarca = (_plataforma: boolean): string => MARCA.nome;
