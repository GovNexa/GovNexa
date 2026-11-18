type ItemDetalhe = string | number;

interface LinkDetalhe {
  rotulo?: string;
  url?: string;
}

interface SecaoDetalhe {
  titulo?: string;
  texto?: string;
  itens?: ItemDetalhe[];
}

interface DetalheRegistro {
  titulo?: string;
  secoes?: SecaoDetalhe[];
  links?: LinkDetalhe[];
  link?: LinkDetalhe;
}

interface LinhaDetalhe {
  rotulo: string;
  valor: string;
  rotulada: boolean;
}

const normalizar = (valor: string) =>
  valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function separarItem(item: ItemDetalhe, aceitarRotuloLongo = false): LinhaDetalhe {
  const texto = String(item);
  const separador = texto.indexOf(': ');
  const rotulo = separador < 0 ? '' : texto.slice(0, separador).trim();
  return rotulo.length > 0 && (aceitarRotuloLongo || rotulo.length <= 28)
    ? { rotulo, valor: texto.slice(separador + 2), rotulada: true }
    : { rotulo: 'Informação', valor: texto, rotulada: false };
}

function estaVazio(valor: string) {
  const normalizado = normalizar(valor.trim());
  return normalizado === '' || normalizado === '—' || normalizado === '-' || normalizado === 'nao informado';
}

function tomSituacao(valor: string): string {
  const texto = normalizar(valor);
  if (/vermelho|vencid|critico/.test(texto)) return 'vermelho';
  if (/amarelo|atencao/.test(texto)) return 'ambar';
  if (/verde|no prazo|regular/.test(texto)) return 'verde';
  return 'neutro';
}

function extrairData(valor: string): Date | null {
  const correspondencia = valor.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!correspondencia) return null;
  const [, diaTexto, mesTexto, anoTexto] = correspondencia;
  const dia = Number(diaTexto);
  const mes = Number(mesTexto);
  const ano = Number(anoTexto);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia ? data : null;
}

function criar<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function criarDefinicoes(linhas: LinhaDetalhe[]): HTMLDListElement {
  const lista = criar('dl', 'rd-definitions');
  for (const linha of linhas) {
    const grupo = criar('div', 'rd-definition');
    grupo.append(criar('dt', '', linha.rotulo), criar('dd', '', linha.valor));
    lista.append(grupo);
  }
  return lista;
}

function criarLista(linhas: LinhaDetalhe[]): HTMLUListElement {
  const lista = criar('ul', 'rd-list');
  for (const linha of linhas) lista.append(criar('li', '', linha.valor));
  return lista;
}

function criarHistorico(itens: ItemDetalhe[]): HTMLUListElement {
  const entradas = itens.map((item) => {
    const texto = String(item);
    const partes = texto.match(/^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) · (.+?)(?: · por (.+))?$/);
    const data = partes ? extrairData(partes[1].slice(0, 10)) : null;
    const hora = partes ? partes[1].slice(11) : '';
    return {
      texto,
      dataTexto: partes?.[1] ?? '',
      mudanca: partes?.[2] ?? '',
      autor: partes?.[3] ?? '',
      instante: data ? data.getTime() + (Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))) * 60_000 : null,
    };
  });
  entradas.sort((a, b) => {
    if (a.instante === null) return b.instante === null ? 0 : 1;
    if (b.instante === null) return -1;
    return b.instante - a.instante;
  });

  const lista = criar('ul', 'rd-history');
  for (const entrada of entradas) {
    const item = criar('li', 'rd-history-item');
    if (entrada.instante === null) {
      item.textContent = entrada.texto;
    } else {
      const time = criar('time', 'rd-history-date', entrada.dataTexto);
      const [dia, mes, ano] = entrada.dataTexto.slice(0, 10).split('/');
      time.dateTime = `${ano}-${mes}-${dia}T${entrada.dataTexto.slice(11)}:00`;
      item.append(time, criar('strong', 'rd-history-change', entrada.mudanca));
      if (entrada.autor) item.append(criar('span', 'rd-history-author', `por ${entrada.autor}`));
    }
    lista.append(item);
  }
  return lista;
}

function criarLinhaDoTempo(
  secao: SecaoDetalhe,
  tom: string,
  hoje: Date,
): { elemento: HTMLElement; linhasSemData: LinhaDetalhe[]; faltantes: string[] } {
  const elemento = criar('ol', 'rd-timeline');
  const linhasSemData: LinhaDetalhe[] = [];
  const faltantes: string[] = [];
  const entradas: { linha: LinhaDetalhe; data: Date }[] = [];

  for (const item of secao.itens ?? []) {
    const linha = separarItem(item, true);
    if (estaVazio(linha.valor)) {
      faltantes.push(linha.rotulo);
      continue;
    }
    const data = extrairData(linha.valor);
    if (data) entradas.push({ linha, data });
    else linhasSemData.push(linha);
  }

  entradas.sort((a, b) => a.data.getTime() - b.data.getTime());
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  let marcadorInserido = false;
  const inserirHoje = () => {
    const ponto = criar('li', 'rd-timeline-today', 'Hoje');
    ponto.setAttribute('aria-label', 'Hoje');
    elemento.append(ponto);
    marcadorInserido = true;
  };

  for (let indice = 0; indice < entradas.length; indice += 1) {
    const entrada = entradas[indice];
    if (!marcadorInserido && entrada.data.getTime() >= inicioHoje) inserirHoje();
    const item = criar('li', 'rd-timeline-item');
    const data = criar('time', 'rd-timeline-date', entrada.linha.valor);
    data.dateTime = `${entrada.data.getFullYear()}-${String(entrada.data.getMonth() + 1).padStart(2, '0')}-${String(entrada.data.getDate()).padStart(2, '0')}`;
    item.append(criar('span', 'rd-timeline-label', entrada.linha.rotulo), data);
    if (entrada.data.getTime() < inicioHoje && tom === 'vermelho') item.classList.add('is-past-red');
    else if (entrada.data.getTime() > inicioHoje && !entradas.slice(0, indice).some((anterior) => anterior.data.getTime() > inicioHoje)) {
      item.classList.add('is-next');
    }
    elemento.append(item);
  }
  if (!marcadorInserido) inserirHoje();
  return { elemento, linhasSemData, faltantes };
}

function construirPainel(
  registro: HTMLTableRowElement,
  dialogo: HTMLDialogElement,
  referencia: { elemento: HTMLElement | null },
) {
  const valoresOriginais = JSON.parse(registro.dataset.values ?? '[]') as ItemDetalhe[];
  const tabela = registro.closest('table');
  const cabecalhos = [...(tabela?.querySelectorAll('thead th') ?? [])]
    .map((cabecalho) => cabecalho.textContent?.replace(' ↕', '').trim() ?? '')
    .filter((rotulo) => !/^(detalhes|a[çc][aã]o)$/i.test(rotulo));
  const detalhe = registro.dataset.detalhe
    ? JSON.parse(registro.dataset.detalhe) as DetalheRegistro
    : null;
  const celulas = [...registro.querySelectorAll<HTMLTableCellElement>(':scope > td:not(.td-acao)')];
  const valores: ItemDetalhe[] = detalhe
    ? valoresOriginais
    : celulas.map((celula) => celula.textContent?.trim() ?? '');
  const codigoFallback = !detalhe && /^(id|c[oó]digo|ata|processo|conv[eê]nio)$/i.test(cabecalhos[0] ?? '')
    ? String(valores[0] ?? '').trim()
    : '';
  const tituloOriginal = detalhe?.titulo?.trim()
    || String(valores[codigoFallback ? 1 : 0] ?? 'Detalhes do registro');
  const separadorTitulo = tituloOriginal.indexOf(' · ');
  const codigo = separadorTitulo > 0
    ? tituloOriginal.slice(0, separadorTitulo).trim()
    : codigoFallback;
  const titulo = separadorTitulo > 0 ? tituloOriginal.slice(separadorTitulo + 3).trim() : tituloOriginal;
  const secoes = detalhe?.secoes ?? [];
  const linhasPorSecao = secoes.map((secao) => ({
    secao,
    linhas: (secao.itens ?? []).map((item) => separarItem(item)),
  }));
  const situacao = linhasPorSecao
    .flatMap(({ linhas }) => linhas)
    .find((linha) => normalizar(linha.rotulo.trim()) === 'situacao' && !estaVazio(linha.valor));

  dialogo.querySelector<HTMLElement>('#record-code')!.textContent = codigo;
  dialogo.querySelector<HTMLElement>('#record-code')!.hidden = !codigo;
  const tituloElemento = dialogo.querySelector<HTMLElement>('#record-title')!;
  tituloElemento.textContent = titulo || 'Detalhes do registro';
  const selo = dialogo.querySelector<HTMLElement>('[data-record-status]')!;
  selo.hidden = !situacao;
  selo.textContent = situacao?.valor ?? '';
  selo.className = `rd-status${situacao ? ` is-${tomSituacao(situacao.valor)}` : ''}`;

  const corpo = dialogo.querySelector<HTMLElement>('#record-body')!;
  corpo.replaceChildren();
  const faltantes: string[] = [];

  if (detalhe) {
    const todasAsLinhas = linhasPorSecao.flatMap(({ linhas }) => linhas);
    const valorProjeto = todasAsLinhas.find((linha) => {
      const rotulo = normalizar(linha.rotulo.trim());
      return rotulo.startsWith('valor do projeto') || ['valor', 'valor total'].includes(rotulo);
    });
    const macroetapa = todasAsLinhas.find((linha) => normalizar(linha.rotulo.trim()) === 'macroetapa');
    const entrega = todasAsLinhas.find((linha) => ['entrega prevista', 'entrega'].includes(normalizar(linha.rotulo.trim())));
    const prioridade = todasAsLinhas.find((linha) => normalizar(linha.rotulo.trim()) === 'prioridade');
    const destaques = [valorProjeto, macroetapa, entrega, prioridade].filter(
      (linha): linha is LinhaDetalhe => Boolean(linha && !estaVazio(linha.valor)),
    );
    if (destaques.length) {
      const faixa = criar('section', 'rd-highlights');
      faixa.setAttribute('aria-label', 'Números-chave');
      for (const linha of destaques) {
        const cartao = criar('article', 'rd-highlight');
        cartao.append(criar('span', 'rd-highlight-label', linha.rotulo), criar('strong', 'rd-highlight-value', linha.valor));
        faixa.append(cartao);
      }
      corpo.append(faixa);
    }

    const hoje = new Date();
    for (const { secao, linhas } of linhasPorSecao) {
      const bloco = criar('section', 'rd-section');
      const tituloSecao = secao.titulo?.trim() || 'Dados';
      bloco.append(criar('h3', 'rd-section-title', tituloSecao));
      if (secao.texto?.trim()) bloco.append(criar('p', 'rd-section-text', secao.texto));

      const naoVazias = linhas.filter((linha) => {
        if (estaVazio(linha.valor)) {
          faltantes.push(linha.rotulo);
          return false;
        }
        return true;
      });
      const valoresComData = linhas.filter((linha) => !estaVazio(linha.valor));
      const somenteDatas = valoresComData.length > 0 && valoresComData.every((linha) => extrairData(linha.valor));
      if (normalizar(tituloSecao) === 'historico') {
        if (naoVazias.length) bloco.append(criarHistorico(naoVazias.map((linha) => linha.valor)));
      } else if (normalizar(tituloSecao) === 'datas previstas' || somenteDatas) {
        const linhaDoTempo = criarLinhaDoTempo(secao, situacao ? tomSituacao(situacao.valor) : 'neutro', hoje);
        bloco.append(linhaDoTempo.elemento);
        faltantes.push(...linhaDoTempo.faltantes);
        if (linhaDoTempo.linhasSemData.length) {
          const informacoes = criarDefinicoes(linhaDoTempo.linhasSemData);
          informacoes.classList.add('rd-timeline-details');
          bloco.append(informacoes);
        }
      } else if (naoVazias.length) {
        const rotuladas = naoVazias.filter((linha) => linha.rotulada);
        const semRotulo = naoVazias.filter((linha) => !linha.rotulada);
        if (rotuladas.length) bloco.append(criarDefinicoes(rotuladas));
        if (semRotulo.length) bloco.append(criarLista(semRotulo));
      }
      corpo.append(bloco);
    }
  } else {
    const bloco = criar('section', 'rd-section');
    bloco.append(criar('h3', 'rd-section-title', 'Dados'));
    const linhas: LinhaDetalhe[] = valores.map((valor, indice) => ({
      rotulo: cabecalhos[indice] || `Coluna ${indice + 1}`,
      valor: String(valor),
      rotulada: true,
    }));
    const preenchidas = linhas.filter((linha) => {
      if (estaVazio(linha.valor)) {
        faltantes.push(linha.rotulo);
        return false;
      }
      return true;
    });
    if (preenchidas.length) bloco.append(criarDefinicoes(preenchidas));
    corpo.append(bloco);
  }

  const unicosFaltantes = [...new Set(faltantes)];
  if (unicosFaltantes.length) {
    corpo.append(criar('p', 'rd-missing', `Sem informação: ${unicosFaltantes.join(', ')}`));
  }

  const acoes = dialogo.querySelector<HTMLElement>('[data-record-actions]')!;
  acoes.replaceChildren();
  const links: LinkDetalhe[] = [...(detalhe?.links ?? []), ...(detalhe?.link ? [detalhe.link] : [])];
  if (/^P-\d+$/.test(codigo)) {
    links.push(
      { rotulo: 'Abrir ficha completa', url: `/plataforma/projeto/${codigo}/` },
      { rotulo: 'Documentos', url: `/plataforma/documentos-projeto/projeto/${codigo}/` },
    );
  }
  const validos = links.filter((link): link is LinkDetalhe & { url: string; rotulo: string } => {
    const url = String(link.url ?? '');
    return Boolean(link.rotulo?.trim())
      && (url.startsWith('https://') || /^\/plataforma\/[a-z0-9/_-]*(\?[a-z0-9=&_.-]*)?$/i.test(url));
  });
  const unicos = validos.filter((link, indice) => validos.findIndex((outro) => outro.url === link.url) === indice);
  const ordenarAcao = (link: LinkDetalhe & { url: string; rotulo: string }) => {
    if (link.url === `/plataforma/projeto/${codigo}/` || /abrir ficha completa|p[aá]gina do projeto/i.test(link.rotulo)) return 0;
    if (/cronograma/i.test(link.url) || /cronograma/i.test(link.rotulo)) return 1;
    if (/documentos/i.test(link.url) || /documentos/i.test(link.rotulo)) return 2;
    if (/localizacao/i.test(link.url) || /localiza[cç][aã]o/i.test(link.rotulo)) return 3;
    if (/historico|log/i.test(link.url) || /hist[oó]rico/i.test(link.rotulo)) return 4;
    return 5;
  };
  const ordenadas = unicos
    .map((link, indice) => ({ link, indice, ordem: ordenarAcao(link) }))
    .sort((a, b) => a.ordem - b.ordem || a.indice - b.indice);
  for (const { link, ordem } of ordenadas) {
    const rotulo = ordem === 1 ? 'Cronograma' : ordem === 4 ? 'Histórico' : ordem === 0 ? 'Ficha completa' : ordem === 3 ? 'Localização' : link.rotulo;
    const ancora = criar('a', ordem === 0 ? 'rd-action rd-action-primary' : 'rd-action', rotulo);
    ancora.href = link.url;
    // Nome acessível começa pelo texto visível e completa o sentido do rótulo curto.
    ancora.setAttribute('aria-label', ordem === 0 ? 'Ficha completa do projeto' : ordem === 3 ? 'Localização e fotos' : ordem === 1 || ordem === 4 ? `${rotulo}: ${link.rotulo}` : rotulo);
    if (link.url.startsWith('https://')) {
      ancora.target = '_blank';
      ancora.rel = 'noopener noreferrer';
    }
    acoes.append(ancora);
  }
  acoes.hidden = ordenadas.length === 0;
  dialogo.querySelector<HTMLElement>('#record-content')!.scrollTop = 0;
  referencia.elemento = registro.querySelector<HTMLElement>('[data-detail]');
}

export function iniciarPainelDetalhes() {
  const inicializar = () => {
    const dialogo = document.querySelector<HTMLDialogElement>('#record-dialog');
    if (!dialogo || dialogo.dataset.initialized) return;
    dialogo.dataset.initialized = 'true';
    const anterior = dialogo.querySelector<HTMLButtonElement>('[data-record-prev]')!;
    const proximo = dialogo.querySelector<HTMLButtonElement>('[data-record-next]')!;
    const referencia = { elemento: null as HTMLElement | null };
    let linhas: HTMLTableRowElement[] = [];
    let indice = -1;
    let focoOriginal: HTMLElement | null = null;
    let fechamentoTimer = 0;
    let inicioToque: { x: number; pointerId: number } | null = null;

    const atualizarNavegacao = () => {
      anterior.disabled = indice <= 0;
      proximo.disabled = indice < 0 || indice >= linhas.length - 1;
    };
    const mostrarRegistro = (novoIndice: number) => {
      indice = novoIndice;
      construirPainel(linhas[indice], dialogo, referencia);
      atualizarNavegacao();
    };
    const fechar = () => {
      if (!dialogo.open || dialogo.classList.contains('is-closing')) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dialogo.close();
        return;
      }
      dialogo.classList.add('is-closing');
      const finalizar = () => {
        window.clearTimeout(fechamentoTimer);
        dialogo.removeEventListener('animationend', aoTerminar);
        dialogo.close();
      };
      const aoTerminar = (evento: AnimationEvent) => {
        if (evento.target === dialogo && evento.animationName === 'rd-slide-out') finalizar();
      };
      dialogo.addEventListener('animationend', aoTerminar);
      fechamentoTimer = window.setTimeout(finalizar, 240);
    };

    document.addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      if (alvo.closest('[data-record-close]')) {
        fechar();
        return;
      }
      const botaoDetalhes = alvo.closest<HTMLElement>('[data-detail]');
      if (!botaoDetalhes) return;
      const registro = botaoDetalhes.closest<HTMLTableRowElement>('[data-row]');
      const tabela = registro?.closest('table');
      if (!registro || !tabela) return;
      linhas = [...tabela.querySelectorAll<HTMLTableRowElement>('tbody [data-row]')]
        .filter((linha) => !linha.hidden && linha.getClientRects().length > 0);
      indice = linhas.indexOf(registro);
      if (indice < 0) return;
      focoOriginal = botaoDetalhes;
      mostrarRegistro(indice);
      dialogo.showModal();
      dialogo.querySelector<HTMLElement>('#record-title')!.focus({ preventScroll: true });
    });

    anterior.addEventListener('click', () => {
      if (indice > 0) mostrarRegistro(indice - 1);
    });
    proximo.addEventListener('click', () => {
      if (indice < linhas.length - 1) mostrarRegistro(indice + 1);
    });
    dialogo.addEventListener('cancel', (evento) => {
      evento.preventDefault();
      fechar();
    });
    dialogo.addEventListener('close', () => {
      window.clearTimeout(fechamentoTimer);
      dialogo.classList.remove('is-closing');
      inicioToque = null;
      if (focoOriginal?.isConnected) focoOriginal.focus();
    });
    dialogo.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowLeft' && indice > 0) {
        evento.preventDefault();
        mostrarRegistro(indice - 1);
      } else if (evento.key === 'ArrowRight' && indice < linhas.length - 1) {
        evento.preventDefault();
        mostrarRegistro(indice + 1);
      }
    });
    dialogo.addEventListener('pointerdown', (evento) => {
      if (evento.pointerType === 'touch') inicioToque = { x: evento.clientX, pointerId: evento.pointerId };
    });
    dialogo.addEventListener('pointerup', (evento) => {
      if (inicioToque?.pointerId === evento.pointerId && evento.clientX - inicioToque.x > 80) fechar();
      inicioToque = null;
    });
    dialogo.addEventListener('pointercancel', () => {
      inicioToque = null;
    });
  };

  document.addEventListener('astro:page-load', inicializar);
  if (document.readyState !== 'loading') inicializar();
}
