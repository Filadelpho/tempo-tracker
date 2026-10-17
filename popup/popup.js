const $ = (id) => document.getElementById(id);

// Tudo que o popup lê do storage fica aqui
let estado = {};
let dataResumo = hoje();
let periodoResumo = "dia";
let abaAtual = "hoje";
let abaAnterior = "hoje";
let verTodosSites = false;

const ROTULOS = { produtivo: "Produtivo", neutro: "Neutro", distracao: "Distração", lazer: "Lazer" };
const PROXIMA_CLASSE = { neutro: "produtivo", produtivo: "distracao", distracao: "neutro" };
const PRESETS_FOCO = [15, 25, 50];

const ICONES = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  parar: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  pular: '<svg viewBox="0 0 24 24"><path d="M5 5v14l10-7zM17 5h2v14h-2z"/></svg>'
};

async function carregar() {
  const dados = await chrome.storage.local.get([
    "config", "uso", "porModo", "foco", "sessoes", "diario", "contagens", "pomodoro", "relatorioAvisado", "relatorioVisto", "focos"
  ]);
  const { atual } = await chrome.storage.session.get("atual");
  estado = {
    config: mesclarConfig(dados.config),
    uso: dados.uso || {},
    porModo: dados.porModo || {},
    foco: dados.foco || {},
    sessoes: dados.sessoes || {},
    diario: dados.diario || {},
    contagens: dados.contagens || [],
    pomodoro: lerPomodoro(dados.pomodoro),
    atual: atual || null,
    focos: Array.isArray(dados.focos) ? dados.focos : [],
    relatorioAvisado: dados.relatorioAvisado,
    relatorioVisto: dados.relatorioVisto
  };
  renderizar();
}

// Cada parte desenha separada: se uma der erro, as outras continuam aparecendo
function seguro(nome, desenhar) {
  try {
    desenhar();
  } catch (erro) {
    console.error(`[Tempo Tracker] Erro ao desenhar ${nome}`, erro);
  }
}

function renderizar() {
  seguro("Hoje", renderHoje);
  seguro("Visão geral", renderVisaoGeral);
  seguro("Foco", renderFoco);
  seguro("Metas", renderMetas);
  seguro("Prazos", renderPrazos);
  seguro("Resumo", renderResumo);
  if (typeof renderRelatorio === "function") seguro("Relatório", renderRelatorio);
}

function salvarConfig() {
  return chrome.storage.local.set({ config: estado.config });
}

// Sempre devolve um dia "limpo", mesmo que o que está salvo venha incompleto ou estranho
function getDiario(data) {
  const salvo = estado.diario[data] || {};
  return {
    ...salvo,
    metas: Array.isArray(salvo.metas) ? salvo.metas.filter((m) => m && typeof m.texto === "string") : []
  };
}

function salvarDiario(data, mudar) {
  const dia = getDiario(data);
  mudar(dia);
  estado.diario[data] = dia;
  return chrome.storage.local.set({ diario: estado.diario });
}

// Cria um elemento com classe e texto
function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function barra(fracao, classe = "") {
  const b = el("div", "barra");
  const preenchimento = el("div", classe);
  preenchimento.style.width = `${Math.max(0, Math.min(1, fracao)) * 100}%`;
  b.append(preenchimento);
  return b;
}

function favicon(url) {
  const img = el("img");
  img.src = `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  img.alt = "";
  img.addEventListener("error", () => img.remove());
  return img;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------- Navegação ----------

document.querySelectorAll(".barra-nav [data-aba]").forEach((botao) => {
  botao.addEventListener("click", () => abrirAba(botao.dataset.aba));
});
document.querySelectorAll("[data-ir]").forEach((botao) => {
  botao.addEventListener("click", () => abrirAba(botao.dataset.ir));
});
$("voltar").addEventListener("click", () => abrirAba(abaAnterior));

function abrirAba(nome) {
  if (nome !== abaAtual) abaAnterior = abaAtual === "resumo" ? abaAnterior : abaAtual;
  abaAtual = nome;
  document.querySelectorAll(".barra-nav [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === nome));
  document.querySelectorAll(".aba").forEach((s) => (s.hidden = s.id !== `aba-${nome}`));
  $("conteudo").scrollTop = 0;
  fecharFab();
  if (nome === "resumo") rolarDiaAtivo();
}

$("ajustes").addEventListener("click", () => chrome.runtime.openOptionsPage());

// ---------- Botão + (ações rápidas) ----------

function fecharFab() {
  $("fab-menu").hidden = true;
  $("fab").classList.remove("aberto");
}

$("fab").addEventListener("click", (e) => {
  e.stopPropagation();
  const abrir = $("fab-menu").hidden;
  $("fab-menu").hidden = !abrir;
  $("fab").classList.toggle("aberto", abrir);
});

document.addEventListener("click", (e) => {
  if (!$("fab-menu").hidden && !$("fab-menu").contains(e.target)) fecharFab();
});

$("fab-menu").addEventListener("click", (e) => {
  const botao = e.target.closest("[data-acao]");
  if (!botao) return;
  const acao = botao.dataset.acao;
  fecharFab();
  if (acao === "foco") {
    if (estado.pomodoro.fase === "parado") comando("iniciar");
    abrirAba("foco");
  } else if (acao === "meta") {
    abrirAba("prazos");
    $("meta-input").focus();
  } else if (acao === "prazo") {
    abrirAba("prazos");
    $("contagem-nome").focus();
  }
});

// ---------- Hoje ----------

function fracaoExpediente(agora = new Date()) {
  const { inicio, fim } = estado.config.expediente;
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const ini = minutosDoDia(inicio);
  const fi = minutosDoDia(fim);
  if (fi <= ini) return 0;
  return Math.max(0, Math.min(1, (minutos - ini) / (fi - ini)));
}

function humorMascote(prod, metaBatida, modo, trabalhoNoLazer, lazer) {
  // Dia de descanso: o gatinho relaxa, mas avisa se passou do limite ou se você trabalhou
  if (!modo.contar) {
    if (lazer.limite > 0 && lazer.tempo > lazer.limite) return ["sentado", `Passou do seu limite de lazer (${formatarTempo(lazer.limite)}). Que tal uma pausa da tela? 👀`];
    if (trabalhoNoLazer >= 30 * 60) return ["sentado", `Já trabalhou ${formatarTempo(trabalhoNoLazer)} hoje. Bora descansar? 😌`];
    return ["dormindo", "Dia de descanso. Aproveita! 😌"];
  }
  if (metaBatida) return ["comemorando", "Meta do modo batida! Tô orgulhoso 🎉"];
  if (prod.pct === null) return ["dormindo", "Zzz… navega um pouco que eu acordo."];
  if (prod.pct >= 65) return ["correndo", "Tá voando hoje! Continua assim."];
  if (prod.pct >= 35) return ["sentado", "Indo bem. Que tal uma sessão de foco?"];
  return ["dormindo", "Tô quase dormindo… bora focar um pouco?"];
}

function saudacao() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada!";
  if (h < 12) return "Bom dia!";
  if (h < 18) return "Boa tarde!";
  return "Boa noite!";
}

function renderHoje() {
  const { config } = estado;
  const dia = hoje();
  const modo = getModo(config);
  const porModoHoje = porModoAoVivo();

  $("saudacao").textContent = `${saudacao()} · ${modo.emoji} ${modo.nome}`;
  renderNome();
  renderModos();
  renderOrigemModo(modo);

  // Produtividade do dia inteiro (cada trecho julgado pelo modo em que aconteceu)
  const prod = resumirProdutividade(porModoHoje, config);
  // Meta do modo atual: tempo produtivo só dentro deste modo
  const prodModo = resumirProdutividade({ [modo.id]: porModoHoje[modo.id] || {} }, config, { soContados: false });
  const metaSeg = (modo.metaMin || 0) * 60;
  const metaBatida = metaSeg > 0 && prodModo.produtivo >= metaSeg;

  const diario = getDiario(dia);
  $("stat-sessoes").textContent = String(estado.sessoes[dia] || 0);
  $("stat-metas").textContent = `${diario.metas.filter((m) => m.feita).length}/${diario.metas.length}`;

  // Tempo em sites de trabalho num dia de modo que não conta (ex.: GitHub no sábado)
  const trabalhoNoLazer = modo.contar ? 0 : prod.total;
  const lazer = { tempo: resumirDia(porModoHoje, config).lazer, limite: (modo.limiteMin || 0) * 60 };
  const [humor, fala] = humorMascote(prod, metaBatida, modo, trabalhoNoLazer, lazer);
  $("mascote").className = `mascote ${humor}`;
  $("fala").textContent = fala;

  const exp = modo.contar ? fracaoExpediente() : 0;
  $("exp-texto").textContent = modo.contar
    ? `${Math.round(exp * 100)}% · ${config.expediente.inicio}–${config.expediente.fim}`
    : "Hoje é folga 🌴";
  $("exp-barra").style.width = `${exp * 100}%`;

  const barraMeta = $("meta-barra");
  barraMeta.parentElement.className = "barra verde";
  if (!modo.contar) {
    // Dia de lazer: mostra quanto de lazer já foi (e o limite, se tiver)
    $("meta-rotulo").textContent = "Lazer hoje";
    if (lazer.limite > 0) {
      const passou = lazer.tempo > lazer.limite;
      $("meta-texto").textContent = `${formatarTempo(lazer.tempo)} / ${formatarTempo(lazer.limite)}`;
      barraMeta.style.width = `${Math.min(1, lazer.tempo / lazer.limite) * 100}%`;
      barraMeta.parentElement.className = passou ? "barra vermelha" : "barra roxa";
    } else {
      $("meta-texto").textContent = `${formatarTempo(lazer.tempo)} · sem limite`;
      barraMeta.style.width = "0%";
    }
  } else if (metaSeg > 0) {
    $("meta-rotulo").textContent = `Meta ${modo.nome}`;
    $("meta-texto").textContent = `${formatarTempo(prodModo.produtivo)} / ${formatarTempo(metaSeg)}`;
    $("meta-barra").style.width = `${Math.min(1, prodModo.produtivo / metaSeg) * 100}%`;
  } else {
    $("meta-rotulo").textContent = `Meta ${modo.nome}`;
    $("meta-texto").textContent = `${formatarTempo(prodModo.produtivo)} · sem meta`;
    barraMeta.style.width = "0%";
  }

  renderSites(dia, modo);
  renderFavoritos(modo);
}

// ---------- Nome na saudação ----------

function renderNome() {
  const nome = (estado.config.nome || "").trim();
  $("nome").textContent = nome ? `${nome} 👋` : "Como posso te chamar?";
  $("nome").classList.toggle("sem-nome", !nome);
}

function editarNome() {
  $("nome").hidden = true;
  $("nome-form").hidden = false;
  $("nome-input").value = estado.config.nome || "";
  $("nome-input").focus();
  $("nome-input").select();
}

function terminarNome(salvar) {
  if ($("nome-form").hidden) return;
  if (salvar) {
    estado.config.nome = $("nome-input").value.trim();
    salvarConfig();
  }
  $("nome-form").hidden = true;
  $("nome").hidden = false;
  renderNome();
}

$("nome").addEventListener("click", editarNome);
$("nome-form").addEventListener("submit", (e) => {
  e.preventDefault();
  terminarNome(true);
});
$("nome-input").addEventListener("blur", () => terminarNome(true));
$("nome-input").addEventListener("keydown", (e) => {
  if (e.key === "Escape") terminarNome(false);
});

// ---------- Relatório semanal ----------

// Abre a aba Relatório numa semana (AAAA-MM-DD da segunda-feira)
function abrirRelatorio(semana) {
  if (semana) semanaRelatorio = lerData(semana);
  abrirAba("relatorio");
  renderRelatorio();
}

$("abrir-relatorio").addEventListener("click", () => {
  // Abre na semana que está selecionada no Resumo
  abrirRelatorio(dataLocal(inicioDaSemana(lerData(dataResumo))));
});

// ---------- Visão geral ao vivo ----------

// Dados de hoje + o trecho que ainda não foi gravado (o background grava a cada ~30s)
// Tempo de um dia por modo e site, completo.
// Inclui o que está só no registro geral (uso) e não no registro por modo — por exemplo,
// gravado por uma versão antiga. Esse tempo entra no modo que a agenda daria pro site naquele dia.
function porModoCompleto(dia) {
  const base = structuredClone(estado.porModo[dia] || {});
  const porSite = {};
  for (const sites of Object.values(base)) {
    for (const [dominio, s] of Object.entries(sites)) porSite[dominio] = (porSite[dominio] || 0) + s;
  }
  const quando = lerData(dia);
  quando.setHours(12);
  for (const [chave, s] of Object.entries(estado.uso[dia] || {})) {
    const dominio = chave.replace(/^site:/, "");
    const falta = s - (porSite[dominio] || 0);
    if (falta > 0) {
      const modo = modoDoSite({ ...estado.config, modoManual: null }, dominio, quando).id;
      base[modo] = base[modo] || {};
      base[modo][dominio] = (base[modo][dominio] || 0) + falta;
    }
  }
  return base;
}

function porModoAoVivo() {
  const base = porModoCompleto(hoje());
  const a = estado.atual;
  if (a && a.dominio && a.modo) {
    const segundos = Math.max(0, Math.min(120, Math.floor((Date.now() - a.inicio) / 1000)));
    base[a.modo] = base[a.modo] || {};
    base[a.modo][a.dominio] = (base[a.modo][a.dominio] || 0) + segundos;
  }
  return base;
}

function renderVisaoGeral() {
  if (!estado.config) return;
  const { config } = estado;
  const modo = getModo(config);
  const porModo = porModoAoVivo();
  const dia = resumirDia(porModo, config);
  const prod = resumirProdutividade(porModo, config);

  $("stat-total").textContent = formatarTempo(dia.total);
  // Dia de lazer: em vez de %, mostra quanto você trabalhou
  $("pct-rotulo").textContent = modo.contar ? "Produtivo" : "Trabalho hoje";
  $("pct").textContent = !modo.contar ? formatarTempo(prod.produtivo) : prod.pct === null ? "--" : `${prod.pct}%`;

  // Em dia de lazer (ou se já teve lazer hoje), a coluna do meio mostra o lazer
  const mostrarLazer = !modo.contar || dia.lazer > 0;
  $("vg-meio-rotulo").textContent = mostrarLazer ? "Lazer" : "Neutro";
  $("vg-meio-selo").className = `selo ${mostrarLazer ? "lazer" : "neutro"}`;
  $("vg-meio-selo").textContent = mostrarLazer ? "☾" : "!";
  $("vg-produtivo").textContent = formatarTempo(dia.produtivo);
  $("vg-neutro").textContent = formatarTempo(mostrarLazer ? dia.lazer + dia.neutro : dia.neutro);
  $("vg-distracao").textContent = formatarTempo(dia.distracao);
}

function renderModos() {
  const { config } = estado;
  const atual = modoAtualId(config);
  const caixa = $("modos");
  caixa.replaceChildren();
  for (const modo of config.modos) {
    const b = el("button", modo.id === atual ? "ativo" : "", `${modo.emoji} ${modo.nome}`);
    b.addEventListener("click", () => trocarModo(modo.id));
    caixa.append(b);
  }
}

// Com a agenda ligada, trocar no popup vale só até o fim do dia
function trocarModo(id) {
  const { config } = estado;
  if (config.agenda.automatico) {
    const doDia = config.agenda.dias[new Date().getDay()];
    config.modoManual = id === doDia ? null : { dia: hoje(), modo: id };
  } else {
    config.modoAtivo = id;
  }
  salvarConfig();
}

function renderOrigemModo(modo) {
  const { config } = estado;
  const caixa = $("modo-origem");
  caixa.replaceChildren();
  const diaSemana = DIAS_SEMANA[new Date().getDay()];
  const origem = origemDoModo(config);

  if (origem === "automatico") {
    caixa.append(el("span", "", `🤖 Automático: ${diaSemana} é dia de ${modo.nome}`));
  } else if (origem === "manual") {
    caixa.append(el("span", "", `✋ ${modo.nome} ligado por você hoje`));
    const voltar = el("button", "link", "Voltar à agenda");
    voltar.addEventListener("click", () => {
      config.modoManual = null;
      salvarConfig();
    });
    caixa.append(voltar);
  } else {
    caixa.append(el("span", "", "📌 Modo fixo (agenda desligada nos ajustes)"));
  }
}

// Linha de site no estilo dos cartões: ícone, nome, barra, tempo e etiqueta
function linhaSite({ nome, segundos }, maior, classe, aoClicarEtiqueta, rotulo = ROTULOS[classe]) {
  const li = el("li", "site");

  // Letra como reserva; some quando o ícone do site carrega
  const icone = el("div", "site-icone", nome.charAt(0));
  const img = favicon(`https://${nome}`);
  img.addEventListener("load", () => icone.firstChild.nodeType === Node.TEXT_NODE && icone.firstChild.remove());
  icone.append(img);

  const meio = el("div", "site-meio");
  meio.append(el("div", "site-nome", nome), barra(segundos / maior, classe));

  const fim = el("div", "site-fim");
  const etiqueta = el(aoClicarEtiqueta ? "button" : "span", `status ${classe}`, rotulo);
  if (aoClicarEtiqueta) {
    etiqueta.title = "Clique pra trocar a categoria neste modo";
    etiqueta.addEventListener("click", aoClicarEtiqueta);
  }
  fim.append(el("strong", "", formatarTempo(segundos)), etiqueta);

  li.append(icone, meio, fim);
  return li;
}

function renderSites(dia, modo) {
  const itens = Object.entries(estado.uso[dia] || {})
    .map(([chave, segundos]) => ({ nome: chave.replace(/^site:/, ""), segundos }))
    .sort((a, b) => b.segundos - a.segundos);

  $("vazio").hidden = itens.length > 0;
  $("ver-todos").hidden = itens.length <= 5;
  $("ver-todos").textContent = verTodosSites ? "Ver menos" : "Ver todos";

  const lista = $("lista");
  lista.replaceChildren();
  if (itens.length === 0) return;

  const maior = itens[0].segundos;
  for (const item of itens.slice(0, verTodosSites ? 25 : 5)) {
    const modoSite = modoDoSite(estado.config, item.nome);
    if (!modoSite.contar) {
      // Dia de lazer: o site não pesa na produtividade
      lista.append(linhaSite(item, maior, "lazer"));
    } else if (modoSite.id !== modo.id) {
      // Site de trabalho usado no lazer: o tempo conta pro outro modo
      lista.append(linhaSite(item, maior, "produtivo", null, `Conta como ${modoSite.nome}`));
    } else {
      const classe = classificar(item.nome, modo);
      lista.append(linhaSite(item, maior, classe, () => reclassificar(item.nome, modo, classe)));
    }
  }
}

$("ver-todos").addEventListener("click", () => {
  verTodosSites = !verTodosSites;
  renderSites(hoje(), getModo(estado.config));
});

// neutro -> produtivo -> distração -> neutro, só no modo atual
function reclassificar(dominio, modo, atual) {
  const proxima = PROXIMA_CLASSE[atual];
  const tirar = (lista) => lista.filter((d) => !(dominio === d || dominio.endsWith("." + d)));
  modo.produtivos = tirar(modo.produtivos);
  modo.distracoes = tirar(modo.distracoes);
  if (proxima === "produtivo") modo.produtivos.push(dominio);
  if (proxima === "distracao") modo.distracoes.push(dominio);
  salvarConfig();
}

function renderFavoritos(modo) {
  $("fav-titulo").textContent = `Favoritos · ${modo.nome}`;
  const lista = $("favoritos");
  lista.replaceChildren();
  for (const fav of modo.favoritos || []) {
    const li = el("li");
    const a = el("a", "chip");
    a.href = fav.url;
    a.title = fav.url;
    a.append(favicon(fav.url), el("span", "", fav.titulo));
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: fav.url });
    });
    li.append(a);
    lista.append(li);
  }
}

$("fav-add").addEventListener("click", async () => {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !/^https?:/.test(aba.url || "")) return;
  const modo = getModo(estado.config);
  modo.favoritos = modo.favoritos || [];
  if (modo.favoritos.some((f) => f.url === aba.url)) return;
  const titulo = (aba.title || new URL(aba.url).hostname).slice(0, 24);
  modo.favoritos.push({ titulo, url: aba.url });
  salvarConfig();
});

// ---------- Foco (Pomodoro) ----------

const CIRCUNFERENCIA = 2 * Math.PI * 52;
let chaveBotoes = "";

function comando(acao) {
  chrome.runtime.sendMessage({ tipo: "pomodoro", acao });
}

function renderFoco() {
  renderRelogio();
  renderPresets();
  renderFocoStats();
}

$("widget-ativo").addEventListener("change", (e) => {
  estado.config.widget = e.target.checked;
  salvarConfig();
});

$("abrir-janela").addEventListener("click", () => {
  chrome.runtime.sendMessage({ tipo: "janela" });
});

function renderPresets() {
  $("widget-ativo").checked = estado.config.widget !== false;
  const cfg = estado.config.pomodoro;
  const parado = estado.pomodoro.fase === "parado";
  $("foco-config").textContent = `${cfg.foco} min de foco · ${cfg.pausa} min de pausa`;

  const caixa = $("presets");
  caixa.replaceChildren();
  for (const minutos of PRESETS_FOCO) {
    const b = el("button", cfg.foco === minutos ? "ativo" : "", `${minutos} min`);
    b.disabled = !parado;
    b.title = parado ? "Duração do foco" : "Pare a sessão pra trocar a duração";
    b.addEventListener("click", () => {
      estado.config.pomodoro.foco = minutos;
      salvarConfig();
    });
    caixa.append(b);
  }
}

function renderRelogio() {
  const p = estado.pomodoro;
  const cfg = estado.config && estado.config.pomodoro;
  if (!p || !cfg) return;

  const pausado = p.fase !== "parado" && !p.fim;
  const duracao = p.duracao || cfg.foco * 60000;
  let restante = cfg.foco * 60000;
  if (p.fim) restante = Math.max(0, p.fim - Date.now());
  else if (p.restante) restante = p.restante;

  const seg = Math.ceil(restante / 1000);
  $("relogio").textContent = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;
  $("foco-restante").textContent = p.fase === "parado" ? "" : `${Math.ceil(seg / 60)}min`;

  const feito = p.fase === "parado" ? 0 : 1 - restante / duracao;
  $("anel-progresso").style.strokeDashoffset = CIRCUNFERENCIA * (1 - feito);
  document.querySelector(".anel").classList.toggle("pausa", p.fase === "pausa");

  $("fase").textContent = {
    parado: "Pronta pra focar",
    foco: pausado ? "Foco pausado" : "Sessão de foco",
    pausa: pausado ? "Pausa pausada" : p.longa ? "Pausa longa" : "Pausa"
  }[p.fase];

  const ciclos = $("ciclos");
  ciclos.replaceChildren();
  const noCiclo = p.ciclo % cfg.ciclos;
  const cheios = p.fase === "pausa" && noCiclo === 0 ? cfg.ciclos : noCiclo;
  for (let i = 0; i < cfg.ciclos; i++) ciclos.append(el("span", i < cheios ? "feito" : ""));

  // Só recria os botões quando o estado muda (senão o clique se perde a cada segundo)
  const chave = `${p.fase}-${pausado}-${cfg.foco}`;
  if (chave === chaveBotoes) return;
  chaveBotoes = chave;

  const botoes = $("botoes-foco");
  botoes.replaceChildren();
  const botao = (icone, texto, acao, classe = "") => {
    const b = el("button", classe);
    b.innerHTML = ICONES[icone];
    b.append(texto);
    b.addEventListener("click", () => comando(acao));
    botoes.append(b);
  };

  if (p.fase === "parado") botao("play", `Iniciar foco`, "iniciar");
  else if (pausado) { botao("play", "Retomar", "retomar"); botao("parar", "Parar", "parar", "secundario"); }
  else if (p.fase === "foco") { botao("pausa", "Pausar", "pausar"); botao("parar", "Parar", "parar", "secundario"); }
  else { botao("pular", "Pular pausa", "iniciar"); botao("parar", "Parar", "parar", "secundario"); }
}

function renderFocoStats() {
  const dia = hoje();
  const sessoes = estado.sessoes[dia] || 0;
  const focoHoje = estado.foco[dia] || {};
  const prod = resumirProdutividade(focoHoje, estado.config, { soContados: false });

  $("foco-sessoes").textContent = String(sessoes);
  $("foco-tempo").textContent = formatarTempo(prod.total);
  $("foco-pct").textContent = prod.pct === null ? "--" : `${prod.pct}%`;

  renderSitesSessao();
}

// ---------- Sites de cada sessão de foco ----------

let sessaoEscolhida = null; // id escolhido nos chips (null = automática)
let ultimaSessaoVista = null;

function sessoesDeHoje() {
  const dia = hoje();
  return estado.focos.filter((s) => s.dia === dia);
}

// Sessão mostrada: a escolhida; senão a que está rodando; senão a última do dia
function sessaoMostrada() {
  const sessoes = sessoesDeHoje();
  const rodando = estado.pomodoro.sessao;
  // Começou uma sessão nova: volta a seguir ela automaticamente
  if (rodando && rodando !== ultimaSessaoVista) {
    ultimaSessaoVista = rodando;
    sessaoEscolhida = null;
  }
  return sessoes.find((s) => s.id === sessaoEscolhida)
    || sessoes.find((s) => s.id === rodando && s.status === "andamento")
    || sessoes[sessoes.length - 1]
    || null;
}

// Sites da sessão + o trecho que ainda não foi gravado (se for dela)
function sitesDaSessaoAoVivo(sessao) {
  const sites = structuredClone(sessao.sites || {});
  const a = estado.atual;
  if (sessao.status === "andamento" && a && a.dominio && a.sessao === sessao.id) {
    const segundos = Math.max(0, Math.min(120, Math.floor((Date.now() - a.inicio) / 1000)));
    sites[a.modo] = sites[a.modo] || {};
    sites[a.modo][a.dominio] = (sites[a.modo][a.dominio] || 0) + segundos;
  }
  return sites;
}

function horaDe(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderSitesSessao() {
  const sessoes = sessoesDeHoje();
  const sessao = sessaoMostrada();

  const chips = $("sessoes-chips");
  chips.replaceChildren();
  chips.hidden = sessoes.length === 0;
  sessoes.forEach((s, i) => {
    const icone = { andamento: "●", concluida: "✓", interrompida: "✕" }[s.status] || "";
    const b = el("button", `chip sessao-chip ${s.status}${sessao && s.id === sessao.id ? " ativo" : ""}`);
    b.append(el("span", "sessao-icone", icone), `${i + 1}ª · ${horaDe(s.inicio)}`);
    b.title = { andamento: "Em andamento", concluida: "Concluída", interrompida: "Interrompida" }[s.status];
    b.addEventListener("click", () => {
      sessaoEscolhida = s.id;
      renderSitesSessao();
    });
    chips.append(b);
  });
  const ativo = chips.querySelector(".ativo");
  if (ativo) ativo.scrollIntoView({ block: "nearest", inline: "nearest" });

  const lista = $("foco-sites");
  lista.replaceChildren();
  if (!sessao) {
    $("foco-frase").textContent = "Inicie uma sessão e eu mostro os sites que você usou nela.";
    return;
  }

  const sites = sitesDaSessaoAoVivo(sessao);
  const prod = resumirProdutividade(sites, estado.config, { soContados: false });
  const numero = sessoes.indexOf(sessao) + 1;
  let frase = {
    andamento: `${numero}ª sessão em andamento · ${formatarTempo(prod.total)} no navegador até agora`,
    concluida: `${numero}ª sessão concluída às ${horaDe(sessao.fim)} · ${formatarTempo(prod.total)} no navegador`,
    interrompida: `${numero}ª sessão parada às ${horaDe(sessao.fim)} · ${formatarTempo(prod.total)} no navegador`
  }[sessao.status];
  if (prod.pct !== null) frase += ` · ${prod.pct}% em sites produtivos`;
  $("foco-frase").textContent = frase;

  if (prod.total === 0) {
    lista.append(el("li", "vazio", sessao.status === "andamento"
      ? "Ainda sem sites nesta sessão. Navegue que eles aparecem aqui."
      : "Nenhum site usado nesta sessão."));
    return;
  }
  listarSites(lista, sites, 8);
}

// Lista de sites com etiqueta pela classificação no modo em que foram usados
function listarSites(lista, porModo, limite) {
  const sites = sitesDe(porModo).slice(0, limite);
  if (sites.length === 0) return;
  const maior = sites[0].segundos;
  for (const site of sites) {
    // Classificação do modo onde o site foi mais usado
    const [modoId] = Object.entries(site.modos).sort((a, b) => b[1] - a[1])[0];
    const modo = getModo(estado.config, modoId);
    const classe = modo.contar ? classificar(site.nome, modo) : "lazer";
    lista.append(linhaSite(site, maior, classe));
  }
}

// ---------- Metas do dia (post-it) ----------

function renderMetas() {
  const dia = getDiario(hoje());
  const lista = $("metas");
  lista.replaceChildren();

  const feitas = dia.metas.filter((m) => m.feita).length;
  $("metas-contagem").textContent = dia.metas.length
    ? `${feitas} de ${dia.metas.length} feitas`
    : "Anote o que precisa sair hoje";

  dia.metas.forEach((meta, i) => {
    const li = el("li", meta.feita ? "feita" : "");
    const label = el("label");
    const check = el("input");
    check.type = "checkbox";
    check.checked = meta.feita;
    check.addEventListener("change", () => salvarDiario(hoje(), (d) => (d.metas[i].feita = check.checked)));
    label.append(check, el("span", "", meta.texto));

    const apagar = el("button", "apagar", "×");
    apagar.title = "Remover";
    apagar.addEventListener("click", () => salvarDiario(hoje(), (d) => d.metas.splice(i, 1)));

    li.append(label, apagar);
    lista.append(li);
  });
}

$("meta-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = $("meta-input").value.trim();
  if (!texto) return;
  $("meta-input").value = "";
  salvarDiario(hoje(), (d) => d.metas.push({ texto, feita: false }));
});


// ---------- Prazos: progresso e contagem regressiva ----------

function renderPrazos() {
  const agora = new Date();
  renderContagens(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

// Quanto mais perto da data, mais forte a mensagem e a cor
function urgenciaDoPrazo(dias) {
  if (dias < 0) return { status: "Atrasado", classe: "atrasado" };
  if (dias === 0) return { status: "É hoje!", classe: "hoje" };
  if (dias === 1) return { status: "Amanhã!", classe: "amanha" };
  if (dias <= 3) return { status: "Reta final", classe: "reta-final" };
  if (dias <= 7) return { status: "Esta semana", classe: "semana" };
  if (dias <= 14) return { status: "Em breve", classe: "breve" };
  if (dias <= 30) return { status: "Dá tempo", classe: "da-tempo" };
  return { status: "Com folga", classe: "folga" };
}

function renderContagens(meiaNoite) {
  const lista = $("contagens");
  lista.replaceChildren();
  $("contagens-vazio").hidden = estado.contagens.length > 0;

  const futuras = estado.contagens.filter((c) => lerData(c.data) >= meiaNoite).length;
  $("prazos-total").textContent = `📅 ${futuras} ${futuras === 1 ? "pendente" : "pendentes"}`;

  const ordenadas = [...estado.contagens].sort((a, b) => a.data.localeCompare(b.data));
  for (const c of ordenadas) {
    const dias = Math.round((lerData(c.data) - meiaNoite) / 86400000);
    const li = el("li", "prazo");

    const topo = el("div", "prazo-topo");
    const info = el("div");
    const data = lerData(c.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const semana = capitalizar(lerData(c.data).toLocaleDateString("pt-BR", { weekday: "long" }).split("-")[0]);
    info.append(el("div", "prazo-nome", c.nome), el("div", "prazo-data", `${data} • ${semana}`));

    const lado = el("div", "prazo-dias");
    const { status, classe } = urgenciaDoPrazo(dias);
    li.classList.add(`prazo-${classe}`);
    const numero = dias < 0 ? `${-dias}d` : dias === 0 ? "Hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`;
    lado.append(el("strong", "", numero), el("span", "status", status));
    topo.append(info, lado);

    const rodape = el("div", "prazo-rodape");
    const texto = dias > 0
      ? `Faltam ${dias} ${dias === 1 ? "dia" : "dias"}`
      : dias === 0 ? "É hoje!" : `Passou há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
    const apagar = el("button", "apagar", "Remover");
    apagar.addEventListener("click", () => {
      estado.contagens = estado.contagens.filter((x) => x.id !== c.id);
      chrome.storage.local.set({ contagens: estado.contagens });
    });
    rodape.append(el("span", "", texto), apagar);

    li.append(topo, rodape);
    lista.append(li);
  }
}

$("contagem-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const nome = $("contagem-nome").value.trim();
  const data = $("contagem-data").value;
  if (!nome || !data) return;
  estado.contagens.push({ id: Date.now(), nome, data });
  chrome.storage.local.set({ contagens: estado.contagens });
  $("contagem-nome").value = "";
  $("contagem-data").value = "";
});

// ---------- Resumo (meses, dias e período) ----------

document.querySelectorAll("#resumo-periodo button").forEach((b) => {
  b.addEventListener("click", () => {
    periodoResumo = b.dataset.periodo;
    renderResumo();
  });
});

// Datas que entram no período escolhido (nunca depois de hoje)
function datasDoPeriodo(data, periodo) {
  const base = lerData(data);
  const limite = hoje();
  const datas = [];
  if (periodo === "dia") return [data];
  if (periodo === "semana") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      datas.push(dataLocal(d));
    }
  } else {
    const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= fim; i++) datas.push(dataLocal(new Date(base.getFullYear(), base.getMonth(), i)));
  }
  return datas.filter((d) => d <= limite);
}

// Soma vários { modo: { site: s } } num só
function juntarPorModo(lista) {
  const soma = {};
  for (const porModo of lista) {
    for (const [modo, sites] of Object.entries(porModo || {})) {
      soma[modo] = soma[modo] || {};
      for (const [site, s] of Object.entries(sites)) soma[modo][site] = (soma[modo][site] || 0) + s;
    }
  }
  return soma;
}

function resumoDo(datas) {
  const { config } = estado;
  const total = datas.reduce((s, d) => s + Object.values(estado.uso[d] || {}).reduce((a, b) => a + b, 0), 0);
  const porModo = juntarPorModo(datas.map(porModoCompleto));
  const foco = juntarPorModo(datas.map((d) => estado.foco[d]));
  const diarios = datas.map(getDiario);
  return {
    total,
    porModo,
    prod: resumirProdutividade(porModo, config),
    focoProd: resumirProdutividade(foco, config, { soContados: false }),
    sessoes: datas.reduce((s, d) => s + (estado.sessoes[d] || 0), 0),
    lazer: resumirDia(porModo, config).lazer,
    metas: diarios.flatMap((d) => d.metas)
  };
}

function renderResumo() {
  const datas = datasDoPeriodo(dataResumo, periodoResumo);
  const r = resumoDo(datas);
  const metasFeitas = r.metas.filter((m) => m.feita).length;

  document.querySelectorAll("#resumo-periodo button").forEach((b) => b.classList.toggle("ativo", b.dataset.periodo === periodoResumo));
  $("resumo-total").textContent = `⏱ Total: ${formatarTempo(r.total)}`;

  renderMeses();
  renderDias();

  const cards = [
    [formatarTempo(r.total), "no navegador"],
    [r.prod.pct === null ? "--" : `${r.prod.pct}%`, `produtivo · ${formatarTempo(r.prod.produtivo)}`],
    [String(r.sessoes), (r.sessoes === 1 ? "sessão de foco" : "sessões de foco") + (r.focoProd.pct !== null ? ` · ${r.focoProd.pct}%` : "")],
    [formatarTempo(r.prod.distracao), "em distrações"],
    [`${metasFeitas}/${r.metas.length}`, "metas cumpridas"],
    [formatarTempo(r.lazer), "em lazer"]
  ];

  const grade = $("resumo-grade");
  grade.replaceChildren();
  for (const [valor, rotulo] of cards) {
    const c = el("div");
    c.append(el("strong", "", valor), el("small", "", rotulo));
    grade.append(c);
  }

  $("resumo-frase").textContent = fraseResumo(r, metasFeitas);

  $("resumo-metas-titulo").textContent = periodoResumo === "dia" ? "Metas do dia" : "Metas do período";
  const metas = $("resumo-metas");
  metas.replaceChildren();
  if (r.metas.length === 0) metas.append(el("li", "suave", "Nenhuma meta anotada."));
  for (const m of r.metas.slice(0, 8)) {
    const li = el("li");
    li.append(el("span", `marca ${m.feita ? "ok" : "nao"}`, m.feita ? "✓" : "×"), el("span", "", m.texto));
    metas.append(li);
  }
  if (r.metas.length > 8) metas.append(el("li", "suave", `+ ${r.metas.length - 8} metas`));

  const sites = $("resumo-sites");
  sites.replaceChildren();
  if (Object.keys(r.porModo).length) listarSites(sites, r.porModo, 5);
  else sites.append(el("li", "vazio", "Sem dados de sites nesse período."));
}

function renderMeses() {
  const caixa = $("resumo-meses");
  const rolagem = caixa.scrollLeft;
  caixa.replaceChildren();
  const agora = new Date();
  const selecionada = lerData(dataResumo);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const ativo = m.getMonth() === selecionada.getMonth() && m.getFullYear() === selecionada.getFullYear();
    const b = el("button", ativo ? "ativo" : "", capitalizar(m.toLocaleDateString("pt-BR", { month: "long" })));
    b.addEventListener("click", () => {
      const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      dataResumo = i === 0 ? hoje() : dataLocal(ultimo);
      renderResumo();
      rolarDiaAtivo();
    });
    caixa.append(b);
  }
  caixa.scrollLeft = rolagem;
}

function renderDias() {
  const caixa = $("resumo-dias");
  const rolagem = caixa.scrollLeft;
  caixa.replaceChildren();
  const base = lerData(dataResumo);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const limite = hoje();

  for (let i = 1; i <= ultimo; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), i);
    const data = dataLocal(d);
    if (data > limite) break;

    const b = el("button", data === dataResumo ? "ativo" : "");
    const semana = capitalizar(d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""));
    b.append(el("strong", "", String(i)), el("small", "", semana));

    // Bolinha: produtividade do dia
    const prod = resumirProdutividade(porModoCompleto(data), estado.config);
    const pontos = el("span", "pontos");
    const corProd = prod.pct === null ? "" : prod.pct >= 65 ? "produtivo" : prod.pct >= 35 ? "neutro" : "distracao";
    pontos.append(el("i", corProd));
    b.append(pontos);

    b.addEventListener("click", () => {
      dataResumo = data;
      renderResumo();
    });
    caixa.append(b);
  }
  caixa.scrollLeft = rolagem;
}

// Centraliza o mês e o dia escolhidos (só funciona com a tela visível)
function rolarDiaAtivo() {
  for (const id of ["resumo-meses", "resumo-dias"]) {
    const caixa = $(id);
    const ativo = caixa.querySelector(".ativo");
    if (ativo) caixa.scrollLeft = ativo.offsetLeft - caixa.offsetLeft - caixa.clientWidth / 2 + ativo.clientWidth / 2;
  }
}

function fraseResumo(r, metasFeitas) {
  if (r.total === 0 && r.metas.length === 0) {
    return dataResumo === hoje() && periodoResumo === "dia" ? "O dia está só começando." : "Nada registrado nesse período.";
  }
  const partes = [`passou ${formatarTempo(r.total)} no navegador`];
  if (r.sessoes) partes.push(`fez ${r.sessoes} ${r.sessoes === 1 ? "sessão" : "sessões"} de foco`);
  if (r.metas.length) partes.push(`cumpriu ${metasFeitas} de ${r.metas.length} metas`);
  const ultima = partes.pop();
  let frase = `Você ${partes.length ? partes.join(", ") + " e " : ""}${ultima}.`;
  if (r.prod.pct !== null) {
    if (r.prod.pct >= 65) frase += " Muito produtivo!";
    else if (r.prod.pct >= 35) frase += " Equilibrado.";
    else frase += " Dá pra focar mais.";
  }
  return frase;
}

// ---------- Início ----------

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" || (area === "session" && mudancas.atual)) carregar();
});

setInterval(() => {
  seguro("relógio", renderRelogio);
  seguro("Visão geral", renderVisaoGeral);
  if (abaAtual === "foco") seguro("Sites do foco", renderSitesSessao);
}, 1000);

// Sempre abre na aba principal, com tudo carregado
abrirAba("hoje");

// Pede pro background gravar o trecho atual agora, pra abrir com os números em dia
chrome.runtime.sendMessage({ tipo: "tick" }).catch(() => {});

carregar();
carregarFonte();
