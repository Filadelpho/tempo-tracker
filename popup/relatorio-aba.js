// Aba Relatório: como foi a semana (segunda a domingo).
// Usa o estado e os ajudantes do popup.js, que carrega antes deste arquivo.

const REL_CATEGORIAS = [
  { id: "produtivo", nome: "Produtivo" },
  { id: "neutro", nome: "Neutro" },
  { id: "distracao", nome: "Distração" },
  { id: "lazer", nome: "Lazer" }
];
const REL_DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const REL_DIAS_LONGOS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

let semanaRelatorio = null; // Date da segunda-feira mostrada

// ---------- Cálculos ----------

function relJuntar(lista) {
  const soma = {};
  for (const porModo of lista) {
    for (const [modo, sites] of Object.entries(porModo || {})) {
      soma[modo] = soma[modo] || {};
      for (const [site, s] of Object.entries(sites)) soma[modo][site] = (soma[modo][site] || 0) + s;
    }
  }
  return soma;
}

function resumoDaSemana(inicio) {
  const { config } = estado;
  const datas = datasDaSemana(inicio);
  const dias = datas.map((data) => {
    const porModo = porModoCompleto(data);
    return {
      data,
      dia: resumirDia(porModo, config),
      prod: resumirProdutividade(porModo, config),
      sessoes: estado.sessoes[data] || 0,
      diario: getDiario(data)
    };
  });
  const porModo = relJuntar(datas.map(porModoCompleto));
  const total = { produtivo: 0, neutro: 0, distracao: 0, lazer: 0, total: 0 };
  for (const d of dias) for (const k in total) total[k] += d.dia[k];

  return {
    datas,
    dias,
    porModo,
    total,
    prod: resumirProdutividade(porModo, config),
    foco: resumirProdutividade(relJuntar(datas.map((d) => estado.foco[d])), config, { soContados: false }),
    sessoes: dias.reduce((s, d) => s + d.sessoes, 0),
    metas: dias.flatMap((d, i) => d.diario.metas.map((m) => ({ ...m, dia: i }))),
    diasComUso: dias.filter((d) => d.dia.total > 0).length,
    trabalhoFimDeSemana: dias[5].prod.produtivo + dias[6].prod.produtivo
  };
}

// "↑ 12% vs semana anterior"; bomQuandoSobe decide a cor da seta
function relDelta(atual, anterior, { pontos = false, bomQuandoSobe = true } = {}) {
  const caixa = el("span", "delta");
  if (atual === null || anterior === null || anterior === undefined) return caixa;
  let diferenca;
  if (pontos) diferenca = atual - anterior;
  else if (anterior === 0) return caixa;
  else diferenca = Math.round(((atual - anterior) / anterior) * 100);
  if (diferenca === 0) {
    caixa.textContent = "igual à semana anterior";
    return caixa;
  }
  const sobe = diferenca > 0;
  caixa.classList.add(sobe === bomQuandoSobe ? "sobe" : "desce");
  caixa.append(el("span", "seta-delta", sobe ? "↑" : "↓"), `${Math.abs(diferenca)}${pontos ? " pts" : "%"} vs anterior`);
  return caixa;
}

// 16200 -> "4h30" · 2700 -> "45m" (cabe em cima das barras)
function tempoCurto(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  if (h > 0) return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  return `${m}m`;
}

function periodoDa(datas) {
  const ini = lerData(datas[0]);
  const fim = lerData(datas[6]);
  const mes = (d, formato) => d.toLocaleDateString("pt-BR", { month: formato }).replace(".", "");
  if (ini.getMonth() === fim.getMonth()) return `${ini.getDate()} – ${fim.getDate()} de ${mes(fim, "long")}`;
  return `${ini.getDate()} ${mes(ini, "short")} – ${fim.getDate()} ${mes(fim, "short")}`;
}

// ---------- Desenho ----------

function renderRelatorio() {
  if (!estado.config) return;
  if (!semanaRelatorio) {
    // Relatório avisado e ainda não visto? Mostra ele. Senão, a semana atual.
    const novo = estado.relatorioAvisado && estado.relatorioAvisado !== estado.relatorioVisto;
    semanaRelatorio = novo ? lerData(estado.relatorioAvisado) : inicioDaSemana(new Date());
  }

  const semana = resumoDaSemana(semanaRelatorio);
  const inicioAnterior = new Date(semanaRelatorio);
  inicioAnterior.setDate(inicioAnterior.getDate() - 7);
  const anterior = resumoDaSemana(inicioAnterior);
  const segundaAtual = inicioDaSemana(new Date());

  $("rel-periodo").textContent = periodoDa(semana.datas);
  $("rel-rotulo").textContent = semanaRelatorio.getTime() === segundaAtual.getTime() ? "Semana em andamento" : "Relatório da semana";
  $("rel-proxima").disabled = semanaRelatorio >= segundaAtual;

  relHero(semana, anterior);
  relStats(semana, anterior);
  relGrafico(semana);
  relTabela(semana);
  relDestaques(semana);
  relSites(semana);
  relMetas(semana);
  relMarcarVisto();
}

function relHero(semana, anterior) {
  const pct = semana.prod.pct;
  const nome = (estado.config.nome || "").trim();
  let frase, emoji;
  if (semana.total.total === 0) [frase, emoji] = ["Ainda não tem nada registrado nessa semana.", "😴"];
  else if (pct === null) [frase, emoji] = ["Semana só de descanso. Também faz parte!", "🌴"];
  else if (pct >= 65) [frase, emoji] = ["semana excelente! O foco rendeu de verdade.", "🎉"];
  else if (pct >= 35) [frase, emoji] = ["semana equilibrada. Dá pra puxar mais foco.", "🙂"];
  else [frase, emoji] = ["semana difícil. Bora começar a próxima com foco?", "💪"];
  if (/^[a-z]/.test(frase)) frase = nome ? `${nome}, ${frase}` : frase.charAt(0).toUpperCase() + frase.slice(1);

  $("rel-frase").textContent = frase;
  $("rel-emoji").textContent = emoji;
  $("rel-pct").textContent = pct === null ? "--" : `${pct}%`;
  const delta = relDelta(pct, anterior.prod.pct, { pontos: true });
  delta.id = "rel-delta";
  $("rel-delta").replaceWith(delta);
}

function relStats(semana, anterior) {
  const media = semana.diasComUso ? semana.total.total / semana.diasComUso : 0;
  const metasFeitas = semana.metas.filter((m) => m.feita).length;
  const cards = [
    ["⏱️", "No navegador", formatarTempo(semana.total.total), relDelta(semana.total.total, anterior.total.total, { bomQuandoSobe: false })],
    ["💼", "Produtivo", formatarTempo(semana.total.produtivo), relDelta(semana.total.produtivo, anterior.total.produtivo)],
    ["😵", "Distrações", formatarTempo(semana.total.distracao), relDelta(semana.total.distracao, anterior.total.distracao, { bomQuandoSobe: false })],
    ["🎮", "Lazer", formatarTempo(semana.total.lazer), el("span", "delta")],
    ["🍅", "Sessões de foco", String(semana.sessoes), el("span", "delta", semana.foco.total ? `${formatarTempo(semana.foco.total)} em foco` : "")],
    ["📝", "Metas", `${metasFeitas}/${semana.metas.length}`, el("span", "delta", "cumpridas")],
    ["🌴", "Trabalho no fds", formatarTempo(semana.trabalhoFimDeSemana), el("span", "delta", "sábado e domingo")],
    ["📅", "Média por dia", formatarTempo(Math.round(media)), el("span", "delta", `${semana.diasComUso} ${semana.diasComUso === 1 ? "dia" : "dias"} com uso`)]
  ];
  const caixa = $("rel-stats");
  caixa.replaceChildren();
  for (const [icone, rotulo, valor, extra] of cards) {
    const c = el("div", "rel-stat");
    const topo = el("div", "rel-stat-topo");
    topo.append(el("span", "", icone), el("small", "", rotulo));
    c.append(topo, el("strong", "", valor), extra);
    caixa.append(c);
  }
}

// O menor passo de grade que deixa no máximo 3 linhas
function relPasso(maximo) {
  for (const minutos of [15, 30, 60, 120, 180, 240, 360, 480]) {
    if (maximo / (minutos * 60) <= 3) return minutos * 60;
  }
  return 720 * 60;
}

function relGrafico(semana) {
  const legenda = $("rel-legenda");
  legenda.replaceChildren();
  for (const cat of REL_CATEGORIAS) {
    const li = el("li");
    li.append(el("i", `rel-${cat.id}`), cat.nome);
    legenda.append(li);
  }

  const grafico = $("rel-grafico");
  grafico.replaceChildren();
  const ALTURA = 150; // área das barras, em px
  const maior = Math.max(...semana.dias.map((d) => d.dia.total), 0);
  const passo = relPasso(maior || 3600);
  const topo = Math.max(1, Math.ceil(maior / passo)) * passo;

  for (let v = 0; v <= topo; v += passo) {
    const linha = el("div", "rel-grade");
    linha.style.top = `${18 + (1 - v / topo) * ALTURA}px`;
    linha.append(el("span", "", v === 0 ? "0" : tempoCurto(v)));
    grafico.append(linha);
  }

  const colunas = el("div", "rel-colunas");
  const hojeTexto = hoje();
  semana.dias.forEach((d, i) => {
    const coluna = el("div", d.data === hojeTexto ? "rel-coluna hoje" : "rel-coluna");
    coluna.tabIndex = 0;
    coluna.setAttribute("aria-label", `${REL_DIAS_LONGOS[i]}: ${formatarTempo(d.dia.total)}`);
    coluna.append(el("span", "rel-total", d.dia.total ? tempoCurto(d.dia.total) : ""));

    const pilha = el("div", "rel-pilha");
    for (const cat of REL_CATEGORIAS) {
      const s = d.dia[cat.id];
      if (!s) continue;
      const seg = el("div", `rel-${cat.id}`);
      seg.style.height = `${Math.max(2, (s / topo) * ALTURA)}px`;
      pilha.append(seg);
    }
    coluna.append(pilha, el("span", "rel-dia", REL_DIAS_CURTOS[i]));

    coluna.addEventListener("mousemove", (e) => relDica(d, i, e.clientX, e.clientY));
    coluna.addEventListener("focus", () => {
      const caixa = coluna.getBoundingClientRect();
      relDica(d, i, caixa.left + caixa.width / 2, caixa.top + 30);
    });
    coluna.addEventListener("mouseleave", relEsconderDica);
    coluna.addEventListener("blur", relEsconderDica);
    colunas.append(coluna);
  });
  grafico.append(colunas);
}

function relDica(d, i, x, y) {
  const dica = $("rel-dica");
  dica.replaceChildren(el("strong", "", `${REL_DIAS_LONGOS[i]} · ${formatarTempo(d.dia.total)}`));
  for (const cat of REL_CATEGORIAS) {
    if (!d.dia[cat.id]) continue;
    const linha = el("div", "rel-dica-linha");
    linha.append(el("i", `rel-${cat.id}`), el("span", "", cat.nome), el("span", "", formatarTempo(d.dia[cat.id])));
    dica.append(linha);
  }
  if (d.dia.total === 0) dica.append(el("div", "suave", "Sem uso nesse dia"));
  if (d.sessoes) dica.append(el("div", "suave", `🍅 ${d.sessoes} ${d.sessoes === 1 ? "sessão" : "sessões"} de foco`));
  dica.hidden = false;
  dica.style.left = `${Math.max(8, Math.min(x - dica.offsetWidth / 2, innerWidth - dica.offsetWidth - 8))}px`;
  dica.style.top = `${Math.max(8, y - dica.offsetHeight - 14)}px`;
}

function relEsconderDica() {
  $("rel-dica").hidden = true;
}

function relTabela(semana) {
  const tabela = $("rel-tabela");
  tabela.replaceChildren();
  const cabeca = el("tr");
  for (const t of ["Dia", "Prod.", "Neutro", "Distr.", "Lazer", "Total"]) cabeca.append(el("th", "", t));
  tabela.append(cabeca);
  semana.dias.forEach((d, i) => {
    const tr = el("tr");
    tr.append(el("td", "", REL_DIAS_CURTOS[i]));
    for (const cat of REL_CATEGORIAS) tr.append(el("td", "", d.dia[cat.id] ? tempoCurto(d.dia[cat.id]) : "—"));
    tr.append(el("td", "", d.dia.total ? tempoCurto(d.dia.total) : "—"));
    tabela.append(tr);
  });
}

$("rel-ver-tabela").addEventListener("click", () => {
  const mostrarTabela = $("rel-tabela-caixa").hidden;
  $("rel-tabela-caixa").hidden = !mostrarTabela;
  $("rel-grafico").hidden = mostrarTabela;
  $("rel-legenda").hidden = mostrarTabela;
  $("rel-ver-tabela").textContent = mostrarTabela ? "Ver gráfico" : "Ver tabela";
});

function relDestaques(semana) {
  const itens = [];
  const comIndice = semana.dias.map((d, i) => ({ ...d, i }));
  // Melhor dia = o que teve mais tempo produtivo
  const melhor = comIndice.reduce((a, b) => (b.prod.produtivo > a.prod.produtivo ? b : a));
  if (melhor.prod.produtivo >= 30 * 60) {
    itens.push(["🏆", `Melhor dia: ${REL_DIAS_LONGOS[melhor.i]}`, `${formatarTempo(melhor.prod.produtivo)} produtivos · ${melhor.prod.pct}% do dia`]);
  }
  if (semana.sessoes) {
    itens.push(["🍅", `${semana.sessoes} ${semana.sessoes === 1 ? "sessão" : "sessões"} de foco`,
      `${formatarTempo(semana.foco.total)} em foco${semana.foco.pct !== null ? ` · ${semana.foco.pct}% produtivo` : ""}`]);
  }
  const distraido = comIndice.reduce((a, b) => (b.dia.distracao > a.dia.distracao ? b : a));
  if (distraido.dia.distracao > 0) {
    itens.push(["😵", `Mais distração: ${REL_DIAS_LONGOS[distraido.i]}`, `${formatarTempo(distraido.dia.distracao)} em distrações`]);
  }
  if (semana.trabalhoFimDeSemana >= 15 * 60) {
    itens.push(["💼", `${formatarTempo(semana.trabalhoFimDeSemana)} de trabalho no fim de semana`, "Lembre de descansar também!"]);
  } else if (semana.dias[5].dia.lazer + semana.dias[6].dia.lazer > 0) {
    itens.push(["🌴", "Fim de semana de descanso", "Quase nada de trabalho no sábado e domingo."]);
  }

  const lista = $("rel-destaques");
  lista.replaceChildren();
  if (itens.length === 0) lista.append(el("li", "suave", "Sem destaques ainda."));
  for (const [icone, titulo, detalhe] of itens) {
    const li = el("li");
    const texto = el("div");
    texto.append(el("strong", "", titulo), el("small", "", detalhe));
    li.append(el("span", "rel-icone", icone), texto);
    lista.append(li);
  }
}

function relSites(semana) {
  const lista = $("rel-sites");
  lista.replaceChildren();
  if (Object.keys(semana.porModo).length) listarSites(lista, semana.porModo, 6);
  else lista.append(el("li", "vazio", "Sem dados de sites nessa semana."));
}

function relMetas(semana) {
  const lista = $("rel-metas");
  lista.replaceChildren();
  const feitas = semana.metas.filter((m) => m.feita).length;
  $("rel-metas-contagem").textContent = semana.metas.length ? `${feitas} de ${semana.metas.length}` : "";
  if (semana.metas.length === 0) {
    lista.append(el("li", "suave", "Nenhuma meta anotada nessa semana."));
    return;
  }
  for (const m of semana.metas) {
    const li = el("li");
    li.append(
      el("span", `marca ${m.feita ? "ok" : "nao"}`, m.feita ? "✓" : "×"),
      el("span", "", m.texto),
      el("span", "rel-meta-dia", REL_DIAS_CURTOS[m.dia])
    );
    lista.append(li);
  }
}

// Abriu (de fato) a aba no relatório que foi avisado: o banner do Hoje some
function relMarcarVisto() {
  const chave = dataLocal(semanaRelatorio);
  if (abaAtual === "relatorio" && estado.relatorioAvisado === chave && estado.relatorioVisto !== chave) {
    estado.relatorioVisto = chave;
    chrome.storage.local.set({ relatorioVisto: chave });
  }
}

function relIrPara(semanas) {
  semanaRelatorio.setDate(semanaRelatorio.getDate() + semanas * 7);
  renderRelatorio();
  $("conteudo").scrollTop = 0;
}

$("rel-anterior").addEventListener("click", () => relIrPara(-1));
$("rel-proxima").addEventListener("click", () => relIrPara(1));
document.querySelector('.barra-nav [data-aba="relatorio"]').addEventListener("click", renderRelatorio);

// A notificação do relatório pede pra abrir direto na aba Relatório.
// Fica aqui (e não no popup.js) porque precisa de tudo deste arquivo já carregado.
chrome.storage.local.get("abrirAba").then(({ abrirAba: pedido }) => {
  if (!pedido) return;
  chrome.storage.local.remove("abrirAba");
  if (pedido.aba === "relatorio") abrirRelatorio(pedido.semana);
});
