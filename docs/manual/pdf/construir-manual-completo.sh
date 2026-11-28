#!/usr/bin/env bash
# Gera o PDF do MANUAL FUNCIONAL COMPLETO (capítulos de docs/manual/*.md) com Pandoc + XeLaTeX (MiKTeX):
# capa institucional, logo do GovNexa, sumário, numeração de páginas e diagramas Mermaid desenhados como imagem.
# Uso (na raiz do repositório, no Git Bash): bash docs/manual/pdf/construir-manual-completo.sh [saida.pdf]
# Requisitos: Pandoc e MiKTeX (winget), Node (npm ci) e o mermaid-cli em D:\GovNexa-tools\mermaid (ver renderizar-mermaid.py).
set -euo pipefail

export PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Pandoc:/c/Users/$USERNAME/AppData/Local/Programs/MiKTeX/miktex/bin/x64"
SAIDA="${1:-docs/manual/pdf/manual-funcional-govnexa.pdf}"
PASTA="docs/manual/pdf"
CONSTRUCAO="$PASTA/.construcao-completo"
CAPITULOS="00-visao-geral 01-modulos 02-processos 03-perfis 04-dependencias 05-glossario 99-pendencias-tecnicas"

command -v pandoc >/dev/null || { echo "Pandoc não encontrado. Instale: winget install JohnMacFarlane.Pandoc"; exit 1; }
command -v xelatex >/dev/null || { echo "XeLaTeX não encontrado. Instale: winget install MiKTeX.MiKTeX"; exit 1; }

rm -rf "$CONSTRUCAO" && mkdir -p "$CONSTRUCAO"
[ -f "$PASTA/assets/logo-govnexa.png" ] || node "$PASTA/gerar-logos.mjs"

DATA_GERACAO="$(date +%d/%m/%Y)"
printf '%s\n' \
  "\\newcommand{\\tituloManual}{Manual funcional}" \
  "\\newcommand{\\subtituloManual}{Plataforma GovNexa}" \
  "\\newcommand{\\lemaManual}{Como o sistema funciona, processo a processo, para gestores públicos}" \
  "\\newcommand{\\nomeCabecalho}{Manual funcional}" \
  "\\newcommand{\\notaDatas}{Documento gerado em $DATA_GERACAO\\ \\textbullet\\ descreve o sistema em produção nessa data}" \
  "\\newcommand{\\sectionbreak}{\\clearpage}" > "$CONSTRUCAO/vars.tex"

# Junta os capítulos na ordem; cada um começa depois de uma linha em branco; a numeração arábica abre depois do sumário.
{
  printf '%s\n' '```{=latex}' '\clearpage\pagenumbering{arabic}' '```' ''
  for c in $CAPITULOS; do
    [ -f "docs/manual/$c.md" ] || { echo "Falta o capítulo docs/manual/$c.md" >&2; exit 1; }
    cat "docs/manual/$c.md"; printf '\n\n'
  done
} > "$CONSTRUCAO/completo.md"

cp "$PASTA/cabecalho.tex" "$PASTA/capa.tex" "$PASTA/codigo-quebravel.lua" "$CONSTRUCAO/"
cp -r "$PASTA/assets" "$CONSTRUCAO/assets"

python -X utf8 "$PASTA/renderizar-mermaid.py" "$CONSTRUCAO/completo.md" "$CONSTRUCAO/manual.md" "$PASTA/diagramas"

( cd "$CONSTRUCAO" && pandoc manual.md -o manual.pdf \
    --from=markdown+smart --pdf-engine=xelatex \
    --toc --toc-depth=2 \
    -V lang=pt-BR -V mainfont="Segoe UI" -V monofont="Consolas" -V fontsize=11pt \
    -V geometry:a4paper -V geometry:margin=2.2cm \
    -V colorlinks=true -V linkcolor=gxazul -V urlcolor=gxlaranja -V toccolor=gxazul \
    -V toc-title="Sumário" -V title-meta="Manual funcional do GovNexa" -V author-meta="GovNexa" \
    --lua-filter=codigo-quebravel.lua --include-in-header=vars.tex --include-in-header=cabecalho.tex --include-before-body=capa.tex )

cp "$CONSTRUCAO/manual.pdf" "$SAIDA"
echo "PDF gerado: $SAIDA"
