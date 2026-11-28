-- Filtro do Pandoc: deixa o código em linha (caminhos de arquivo e nomes de função) quebrar a linha em qualquer ponto,
-- para não passar da margem direita no PDF. Não mexe nos títulos (o sumário não aceita esse comando).
traverse = 'topdown'

local mapa = {
  ['\\'] = '\\textbackslash{}', ['{'] = '\\{', ['}'] = '\\}', ['$'] = '\\$', ['&'] = '\\&',
  ['#'] = '\\#', ['_'] = '\\_', ['%'] = '\\%', ['^'] = '\\textasciicircum{}', ['~'] = '\\textasciitilde{}',
}

function Header(el)
  return el, false
end

function Code(el)
  if FORMAT:match('latex') then
    local texto = el.text:gsub('[\\{}$&#_%%%^~]', mapa)
    return pandoc.RawInline('latex', '\\texttt{\\seqsplit{' .. texto .. '}}')
  end
end
