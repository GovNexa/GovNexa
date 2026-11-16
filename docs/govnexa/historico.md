# GovNexa — Histórico adaptado

A versão integral do histórico é privada e fica fora do repositório público. Este resumo reúne regras do dono e lições técnicas para continuidade.

## Regras do dono

| Data | Regra |
| --- | --- |
| 15/11/2026 | O GovNexa começa pelo módulo Projetos; módulos independentes se integram pela referência ao projeto. Sem IA no MVP. Goiânia é piloto de produto para várias prefeituras. |
| 15/11/2026 | Projeto nasce no cadastro e pode avançar ou voltar por qualquer tela, sempre pela mesma regra e com histórico. |
| 15/11/2026 | Interface simples, responsiva e sem rolagem horizontal; toda mudança de fluxo atualiza o mapa Fluxo do sistema. |
| 15/11/2026 | A Lei 14.133 define o teto; metas internas podem ser menores e prazos-piso não podem ser reduzidos. |
| 16/11/2026 | Dependências de etapas seguem a ordem e as datas até validação do fluxo com o cliente. |
| 16/11/2026 | README atualizado em toda entrega; documentar situação, funcionalidades, decisões e próximos passos. |
| 16/11/2026 | Hospedagem Cloudflare + GitHub; Worker com site público e plataforma. O domínio é govnexa.com.br e a marca GovNexa aparece em todo o produto. |
| 16/11/2026 | Cloudflare D1: um banco por prefeitura e um central para prefeituras, usuários e importações; PostgreSQL/Supabase somente como plano B. |
| 16/11/2026 | Cloudflare Access com código por e-mail e cadastro ativo no banco central; perfis admin, gestor, editor e leitura. Todos são admin durante a construção. Tela de usuários sincronizada com grupo do Access; sem login próprio. |
| 16/11/2026 | Dados reais nunca entram no repositório público. Carteira real no D1; planilhas no repositório privado, importadas por rotina do GitHub com aviso de código repetido. O código 450 foi alterado para 506. |

## Lições técnicas

| Situação | Lição |
| --- | --- |
| Navegação entre serviços | Workers não aceita `fetch` com `redirect: 'error'`; tratar redirecionamentos conforme a resposta do serviço. |
| Carga de CPU | O plano grátis do Workers pode exceder 10 ms de CPU nas telas da plataforma (Error 1102); usar Workers Paid. |
| Rotas locais | `wrangler dev` precisa de `--infer-origin-from-routes=false` quando há rotas de domínio configuradas. |
| Consultas D1 | D1 limita padrões GLOB/LIKE a 50 bytes; validar o tamanho e dividir ou restringir a busca. |
| Leitura do SEI | O navegador não lê diretamente outro site por CORS; a leitura automática precisa ocorrer no servidor. Nunca contornar captcha. |
| Datas | Datas e faróis devem ser recalculados no navegador no fuso de Brasília. |
| Dados do navegador | Validar forma, tamanho e datas ao ler arquivos ou dados do navegador; mostrar conteúdo como texto. |
| Arquivos CRLF | Scripts de edição precisam aceitar finais de linha CRLF. |
| Verificação do site | Conferir localmente as rotas e recursos gerados após mudanças no build. |
