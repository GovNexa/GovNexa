#!/usr/bin/env bash
# Gera o PDF do manual do usuário com Pandoc + XeLaTeX (MiKTeX): capa institucional, logo do GovNexa, sumário e numeração de páginas.
# Uso (na raiz do repositório, no Git Bash): bash docs/manual/pdf/construir-pdf.sh [arquivo-de-origem.md] [arquivo-de-saida.pdf]
# Requisitos (Windows, instalados pelo winget): Pandoc (JohnMacFarlane.Pandoc) e MiKTeX (MiKTeX.MiKTeX); Node para gerar o logo (npm ci).
set -euo pipefail

export PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Pandoc:/c/Users/$USERNAME/AppData/Local/Programs/MiKTeX/miktex/bin/x64"
ORIGEM="${1:-docs/manual-usuario.md}"
SAIDA="${2:-docs/manual/pdf/manual-usuario.pdf}"
PASTA="docs/manual/pdf"
CONSTRUCAO="$PASTA/.construcao"

command -v pandoc >/dev/null || { echo "Pandoc não encontrado. Instale: winget install JohnMacFarlane.Pandoc"; exit 1; }
command -v xelatex >/dev/null || { echo "XeLaTeX não encontrado. Instale: winget install MiKTeX.MiKTeX"; exit 1; }

mkdir -p "$CONSTRUCAO"
[ -f "$PASTA/assets/logo-govnexa.png" ] || node "$PASTA/gerar-logos.mjs"

DATA_GERACAO="$(date +%d/%m/%Y)"
DATA_CONTEUDO="$(grep -o -m1 -E '[0-9]{2}/[0-9]{2}/[0-9]{4}' "$ORIGEM" || echo "$DATA_GERACAO")"
printf '%s\n' \
  "\\newcommand{\\tituloManual}{Manual do usuário}" \
  "\\newcommand{\\subtituloManual}{Bloco Captação}" \
  "\\newcommand{\\lemaManual}{Como buscar, acompanhar e não perder recursos federais}" \
  "\\newcommand{\\nomeCabecalho}{Manual do usuário}" \
  "\\newcommand{\\notaDatas}{Documento gerado em $DATA_GERACAO\\ \\textbullet\\ conteúdo atualizado em $DATA_CONTEUDO\\ (versão provisória)}" > "$CONSTRUCAO/vars.tex"

# Texto de entrada: tira o título H1 (ele vai na capa) e abre a numeração arábica depois do sumário.
{
  printf '%s\n' '```{=latex}' '\clearpage\pagenumbering{arabic}' '```' ''
  tail -n +2 "$ORIGEM"
} > "$CONSTRUCAO/manual.md"

cp "$PASTA/cabecalho.tex" "$PASTA/capa.tex" "$PASTA/codigo-quebravel.lua" "$CONSTRUCAO/"
rm -rf "$CONSTRUCAO/assets" && cp -r "$PASTA/assets" "$CONSTRUCAO/assets"

( cd "$CONSTRUCAO" && pandoc manual.md -o manual.pdf \
    --from=markdown+smart --pdf-engine=xelatex \
    --toc --toc-depth=2 --shift-heading-level-by=-1 \
    -V lang=pt-BR -V mainfont="Segoe UI" -V monofont="Consolas" -V fontsize=11pt \
    -V geometry:a4paper -V geometry:margin=2.3cm \
    -V colorlinks=true -V linkcolor=gxazul -V urlcolor=gxlaranja -V toccolor=gxazul \
    -V toc-title="Sumário" -V title-meta="Manual do usuário: bloco Captação (GovNexa)" -V author-meta="GovNexa" \
    --lua-filter=codigo-quebravel.lua --include-in-header=vars.tex --include-in-header=cabecalho.tex --include-before-body=capa.tex )

cp "$CONSTRUCAO/manual.pdf" "$SAIDA"
echo "PDF gerado: $SAIDA"
