# Convenções do repositório

## Módulos de segurança compartilhados
- `src/lib/seguranca/limite.ts`: limite por pessoa (chave por prefeitura e e-mail).
- `src/lib/seguranca/ler-limitado.ts`: ler a resposta de um serviço externo com teto de bytes.
- `src/lib/navegacao/volta.ts`: volta segura (só telas sob `/plataforma/`, mesma origem).

## Ações de permissão
- `gerenciar_secretarias_compradoras`: hoje só o administrador; cadastra, edita e desativa as secretarias compradoras do PNCP. O cadastro e cada mudança ficam no Histórico da secretaria, com autor e data.
