"""Troca os blocos ```mermaid de um .md por imagens PNG (para o Pandoc/LaTeX), usando o mermaid-cli e o navegador Edge.

Uso: python -X utf8 renderizar-mermaid.py entrada.md saida.md pasta-das-imagens
Variáveis de ambiente (opcionais): GOVNEXA_MMDC = caminho do mmdc; GOVNEXA_PUPPETEER = caminho do puppeteer.json.
Cada diagrama vira um arquivo com o hash do conteúdo (só redesenha o que mudou). Se um diagrama falhar, o bloco vira
uma nota "[diagrama não gerado]" e o erro é listado no fim, sem parar o PDF.
"""
import hashlib
import io
import os
import re
import subprocess
import sys

entrada, saida, pasta = sys.argv[1:4]
mmdc = os.environ.get('GOVNEXA_MMDC', r'D:\GovNexa-tools\mermaid\node_modules\.bin\mmdc.cmd')
cfg = os.environ.get('GOVNEXA_PUPPETEER', r'D:\GovNexa-tools\mermaid\puppeteer.json')
os.makedirs(pasta, exist_ok=True)

texto = io.open(entrada, encoding='utf-8').read()
padrao = re.compile(r'```mermaid[ \t]*\r?\n(.*?)\r?\n```', re.S)
falhas = []

def trocar(m):
    codigo = m.group(1).strip() + '\n'
    h = hashlib.sha1(codigo.encode('utf-8')).hexdigest()[:12]
    png = os.path.join(pasta, f'd-{h}.png')
    if not os.path.exists(png):
        mmd = os.path.join(pasta, f'd-{h}.mmd')
        io.open(mmd, 'w', encoding='utf-8', newline='\n').write(codigo)
        r = subprocess.run([mmdc, '-i', mmd, '-o', png, '-p', cfg, '-s', '2', '-b', 'white'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
        if not os.path.exists(png):
            falhas.append((h, (r.stderr or r.stdout)[-300:]))
            return '\n*[diagrama não gerado]*\n'
    rel = os.path.relpath(png, os.path.dirname(os.path.abspath(saida))).replace('\\', '/')
    return f'\n![]({rel})\n'

novo = padrao.sub(trocar, texto)
io.open(saida, 'w', encoding='utf-8', newline='\n').write(novo)
total = len(padrao.findall(texto))
print(f'diagramas: {total}, falhas: {len(falhas)}')
for h, e in falhas:
    print('  FALHA', h, e.replace('\n', ' ')[:200])
