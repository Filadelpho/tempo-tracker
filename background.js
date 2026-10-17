importScripts("utils.js");

// Só as partes confiáveis da extensão (popup, ajustes, background) leem o armazenamento.
// O script que roda dentro dos sites não enxerga o histórico: recebe só o estado do cronômetro.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(console.error);

const ALARME = "tick";
const ALARME_POMODORO = "pomodoro";
const ALARME_RELATORIO = "relatorio";
const LIMITE_SEGUNDOS = 120; // segurança: nunca soma mais que isso de uma vez
const ATRASO_MAXIMO = 10 * 60000; // fase que terminou há mais que isso não conta

chrome.idle.setDetectionInterval(60); // 60s sem mexer = inativa

chrome.alarms.get(ALARME, (alarme) => {
  if (!alarme) chrome.alarms.create(ALARME, { periodInMinutes: 0.5 });
});
chrome.alarms.get(ALARME_RELATORIO, (alarme) => {
  if (!alarme) chrome.alarms.create(ALARME_RELATORIO, { delayInMinutes: 1, periodInMinutes: 30 });
});

function getDominio(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Descobre a aba e o site em uso agora (ou null se não está usando o Chrome)
async function getAbaAtual() {
  const estado = await chrome.idle.queryState(60);
  if (estado !== "active") return null;

  const janela = await chrome.windows.getLastFocused();
  if (!janela.focused) return null;

  const [aba] = await chrome.tabs.query({ active: true, windowId: janela.id });
  const dominio = aba && aba.url ? getDominio(aba.url) : null;
  return dominio ? { abaId: aba.id, dominio } : null;
}

// somar(obj, ["2026-10-17", "trabalho", "notion.so"], 30)
function somar(obj, caminho, valor) {
  let o = obj;
  for (const chave of caminho.slice(0, -1)) o = o[chave] = o[chave] || {};
  const ultima = caminho[caminho.length - 1];
  o[ultima] = (o[ultima] || 0) + valor;
}

async function somarTempo(fatia, segundos) {
  const dia = hoje();
  const dados = await chrome.storage.local.get(["uso", "porModo", "foco", "focos"]);
  const uso = dados.uso || {};
  const porModo = dados.porModo || {};
  const foco = dados.foco || {};
  const focos = dados.focos || [];

  somar(uso, [dia, `site:${fatia.dominio}`], segundos);
  somar(porModo, [dia, fatia.modo, fatia.dominio], segundos);
  if (fatia.foco) somar(foco, [dia, fatia.modo, fatia.dominio], segundos);

  // Sites da sessão de foco em que o trecho aconteceu
  const sessao = fatia.sessao && focos.find((s) => s.id === fatia.sessao);
  if (sessao) somar(sessao.sites, [fatia.modo, fatia.dominio], segundos);

  await chrome.storage.local.set({ uso, porModo, foco, ...(sessao ? { focos } : {}) });
}

// ---------- Registro de cada sessão de foco ----------
// focos = [{ id, dia, inicio, fim, planejado, status: "andamento" | "concluida" | "interrompida", sites: { modo: { site: s } } }]
const LIMITE_SESSOES = 300;

async function mudarSessoes(mudar) {
  const { focos = [] } = await chrome.storage.local.get("focos");
  mudar(focos);
  await chrome.storage.local.set({ focos: focos.slice(-LIMITE_SESSOES) });
}

function encerrarSessao(focos, id, status) {
  const sessao = focos.find((s) => s.id === id);
  if (sessao && sessao.status === "andamento") {
    sessao.status = status;
    sessao.fim = Date.now();
  }
}

// Fecha o trecho anterior e abre um novo.
// Cada trecho guarda o modo e se era sessão de foco no momento em que começou.
async function tick() {
  const agora = Date.now();
  const { atual } = await chrome.storage.session.get("atual");

  if (atual && atual.dominio) {
    const segundos = Math.min(
      Math.round((agora - atual.inicio) / 1000),
      LIMITE_SEGUNDOS
    );
    if (segundos > 0) await somarTempo(atual, segundos);
  }

  const aba = await getAbaAtual();
  const dominio = aba ? aba.dominio : null;
  const config = await getConfig();
  const pomodoro = await getPomodoro();
  const emFoco = pomodoro.fase === "foco" && Boolean(pomodoro.fim); // foco pausado não conta

  await chrome.storage.session.set({
    atual: { dominio, inicio: agora, modo: modoDoSite(config, dominio).id, foco: emFoco, sessao: emFoco ? pomodoro.sessao : null }
  });
  await atualizarBadge(pomodoro);
  await verificarDistracao(config, pomodoro, aba);
}

// ---------- Aviso de distração ----------
// Site de distração (no modo atual) + foco rodando ou horário de expediente = aviso na página,
// depois de alguns segundos de tolerância. Uma vez por visita: só volta a avisar se a página
// recarregar, se você trocar de site ou quando acabar a liberação de 5 minutos.

const LIBERAR_MIN = 5;
let alertaAgendado = null; // { chave: "abaId|dominio", timer }

function motivoDoAlerta(config, pomodoro, dominio) {
  if (!dominio) return null;
  const modo = getModo(config);
  if (classificar(dominio, modo) !== "distracao") return null;
  if (config.alertas.foco && pomodoro.fase === "foco" && pomodoro.fim) return "foco";
  if (config.alertas.expediente && modo.contar && !foraDoHorario(config)) return "expediente";
  return null;
}

async function estaLiberado(dominio) {
  const { liberados = {} } = await chrome.storage.session.get("liberados");
  return (liberados[dominio] || 0) > Date.now();
}

async function verificarDistracao(config, pomodoro, aba) {
  const chave = aba ? `${aba.abaId}|${aba.dominio}` : null;
  if (alertaAgendado && alertaAgendado.chave === chave) return; // já agendado ou já avisado nesta visita
  if (alertaAgendado) clearTimeout(alertaAgendado.timer);
  alertaAgendado = null;
  if (!chave || !motivoDoAlerta(config, pomodoro, aba.dominio) || (await estaLiberado(aba.dominio))) return;
  const espera = config.alertas.toleranciaSeg * 1000;
  alertaAgendado = { chave, timer: setTimeout(() => dispararAlerta(aba).catch(console.error), espera) };
}

async function dispararAlerta(aba) {
  const config = await getConfig();
  const pomodoro = await getPomodoro();
  const agora = await getAbaAtual();
  // Mudou de aba/site durante a tolerância, ou a situação mudou: não avisa
  const mesma = agora && agora.abaId === aba.abaId && agora.dominio === aba.dominio;
  const motivo = mesma && motivoDoAlerta(config, pomodoro, aba.dominio);
  if (!motivo || (await estaLiberado(aba.dominio))) {
    alertaAgendado = null;
    return;
  }
  const aviso = {
    tipo: "alerta-distracao",
    dominio: aba.dominio,
    modo: getModo(config).nome,
    motivo,
    minutos: pomodoro.fim ? Math.ceil((pomodoro.fim - Date.now()) / 60000) : 0,
    fimExpediente: config.expediente.fim
  };
  try {
    await chrome.tabs.sendMessage(aba.abaId, aviso);
  } catch {
    // Página onde a extensão não roda: vira notificação do sistema
    chrome.notifications.create("distracao", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: motivo === "foco" ? "Ei, você está em foco!" : "Ei, ainda é horário de trabalho!",
      message: `${aba.dominio} é distração no modo ${aviso.modo}.`,
      priority: 1
    });
  }
}

// Fila: evita que dois eventos seguidos contem o mesmo tempo duas vezes
let fila = Promise.resolve();
function enfileirar(tarefa) {
  fila = fila.then(tarefa).catch(console.error);
  return fila;
}
function agendarTick() {
  return enfileirar(tick);
}

// ---------- Pomodoro ----------

async function getPomodoro() {
  const { pomodoro } = await chrome.storage.local.get("pomodoro");
  return lerPomodoro(pomodoro);
}

async function setPomodoro(p) {
  await chrome.storage.local.set({ pomodoro: p });
  if (p.fim) chrome.alarms.create(ALARME_POMODORO, { when: p.fim });
  else await chrome.alarms.clear(ALARME_POMODORO);
  await atualizarBadge(p);
}

async function comandoPomodoro(acao) {
  const config = await getConfig();
  const p = await getPomodoro();
  const agora = Date.now();

  if (acao === "iniciar") {
    const duracao = config.pomodoro.foco * 60000;
    const dia = hoje();
    const ciclo = p.dia === dia ? p.ciclo : 0; // os ciclos recomeçam a cada dia
    const sessao = agora;
    await mudarSessoes((focos) => {
      if (p.fase === "foco" && p.sessao) encerrarSessao(focos, p.sessao, "interrompida");
      focos.push({ id: sessao, dia, inicio: agora, fim: null, planejado: duracao, status: "andamento", sites: {} });
    });
    await setPomodoro({ ...p, fase: "foco", fim: agora + duracao, restante: null, duracao, longa: false, aguardando: false, ciclo, dia, sessao });
  } else if (acao === "pausar" && p.fim) {
    await setPomodoro({ ...p, restante: p.fim - agora, fim: null });
  } else if (acao === "retomar" && p.restante) {
    await setPomodoro({ ...p, fim: agora + p.restante, restante: null });
  } else if (acao === "parar") {
    if (p.fase === "foco" && p.sessao) await mudarSessoes((focos) => encerrarSessao(focos, p.sessao, "interrompida"));
    await setPomodoro({ ...POMODORO_PARADO, ciclo: p.ciclo, dia: p.dia });
  } else if (acao === "dispensar") {
    await setPomodoro({ ...p, aguardando: false });
  }
}

async function fimDeFase() {
  const config = await getConfig();
  const p = await getPomodoro();
  const agora = Date.now();

  // Alarme velho (fase já mudou ou foi pausada)
  if (!p.fim) return;
  if (p.fim > agora + 1000) {
    chrome.alarms.create(ALARME_POMODORO, { when: p.fim });
    return;
  }

  // O Chrome ficou fechado (ou o PC dormiu) bem depois do fim: encerra sem contar nem avisar
  if (agora - p.fim > ATRASO_MAXIMO) {
    if (p.fase === "foco" && p.sessao) await mudarSessoes((focos) => encerrarSessao(focos, p.sessao, "interrompida"));
    await setPomodoro({ ...POMODORO_PARADO, ciclo: p.ciclo, dia: p.dia });
    return;
  }

  if (p.fase === "foco") {
    const dia = hoje();
    if (p.sessao) await mudarSessoes((focos) => encerrarSessao(focos, p.sessao, "concluida"));
    const { sessoes = {} } = await chrome.storage.local.get("sessoes");
    sessoes[dia] = (sessoes[dia] || 0) + 1;
    await chrome.storage.local.set({ sessoes });

    const ciclo = p.ciclo + 1;
    const longa = ciclo % config.pomodoro.ciclos === 0;
    const minutos = longa ? config.pomodoro.pausaLonga : config.pomodoro.pausa;
    const duracao = minutos * 60000;
    await setPomodoro({ ...p, fase: "pausa", fim: agora + duracao, restante: null, duracao, ciclo, longa });

    notificar(
      "Sessão de foco concluída! 🎉",
      `Já são ${sessoes[dia]} hoje. Pausa ${longa ? "longa " : ""}de ${minutos} min: levanta, bebe uma água.`
    );
  } else if (p.fase === "pausa") {
    await setPomodoro({ ...POMODORO_PARADO, ciclo: p.ciclo, dia: p.dia, aguardando: true });
    notificar("A pausa acabou", "Bora pra próxima sessão de foco?", [{ title: "Iniciar foco" }]);
  }
}

function notificar(titulo, mensagem, botoes) {
  tocarAviso();
  chrome.notifications.create("pomodoro", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: titulo,
    message: mensagem,
    priority: 2,
    ...(botoes ? { buttons: botoes } : {})
  });
}

// Som de aviso: o service worker não toca áudio, então usa um documento offscreen
async function tocarAviso() {
  try {
    // Documento novo já toca ao abrir; se já existe, só pede de novo
    if (await chrome.offscreen.hasDocument()) {
      await chrome.runtime.sendMessage({ tipo: "tocar" });
    } else {
      await chrome.offscreen.createDocument({
        url: "offscreen/som.html?tocar=1",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Tocar o aviso de fim de sessão do pomodoro"
      });
    }
  } catch (erro) {
    console.warn("Não deu pra tocar o aviso", erro);
  }
}

// Mini janela separada com o cronômetro (alternativa ao Picture-in-Picture)
async function abrirJanela() {
  const { janelaId } = await chrome.storage.session.get("janelaId");
  if (janelaId) {
    try {
      await chrome.windows.update(janelaId, { focused: true });
      return;
    } catch {}
  }
  const janela = await chrome.windows.create({
    url: "widget/janela.html",
    type: "popup",
    width: 320,
    height: 150,
    focused: true
  });
  await chrome.storage.session.set({ janelaId: janela.id });
}

// ---------- Relatório semanal ----------

// Confere (a cada 30 min) se o relatório da semana ficou pronto e avisa uma vez só
async function verificarRelatorio() {
  const config = await getConfig();
  if (config.relatorio === "desligado") return;
  const semana = semanaDoUltimoRelatorio(config);
  const { relatorioAvisado, porModo = {} } = await chrome.storage.local.get(["relatorioAvisado", "porModo"]);
  if (relatorioAvisado === semana) return;

  await chrome.storage.local.set({ relatorioAvisado: semana });
  // Semana sem nada registrado (ex.: extensão recém-instalada): não avisa
  const datas = datasDaSemana(lerData(semana));
  if (!datas.some((d) => porModo[d] && Object.keys(porModo[d]).length)) return;

  const soma = {};
  for (const d of datas) {
    for (const [modo, sites] of Object.entries(porModo[d] || {})) {
      soma[modo] = soma[modo] || {};
      for (const [site, s] of Object.entries(sites)) soma[modo][site] = (soma[modo][site] || 0) + s;
    }
  }
  const resumo = resumirProdutividade(soma, config);
  tocarAviso();
  chrome.notifications.create("relatorio", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "📊 Seu relatório da semana está pronto",
    message: resumo.pct === null
      ? "Veja como foi a sua semana."
      : `Você ficou ${resumo.pct}% do tempo em sites produtivos. Veja os detalhes.`,
    priority: 1,
    buttons: [{ title: "Abrir relatório" }]
  });
}

// Abre o popup direto na aba Relatório. Se o Chrome não deixar abrir agora,
// o pedido fica guardado e vale na próxima vez que você abrir o popup.
async function abrirRelatorio(semana) {
  await chrome.storage.local.set({ abrirAba: { aba: "relatorio", semana } });
  try {
    await chrome.action.openPopup();
  } catch (erro) {
    console.warn("Não deu pra abrir o popup agora", erro);
  }
}

async function atualizarBadge(p) {
  let texto = "";
  let cor = "#ef4444";
  if (p.fase !== "parado") {
    if (p.fim) texto = `${Math.max(1, Math.ceil((p.fim - Date.now()) / 60000))}m`;
    else texto = "||";
    cor = p.fase === "foco" ? "#ef4444" : "#10b981";
  }
  await chrome.action.setBadgeText({ text: texto });
  await chrome.action.setBadgeBackgroundColor({ color: cor });
}

// ---------- Eventos ----------

chrome.tabs.onActivated.addListener(agendarTick);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) agendarTick();
  // Página terminou de carregar (inclusive recarregada): confere a distração na hora,
  // e avisa de novo se já tinha avisado nessa aba
  if (info.status === "complete") {
    if (alertaAgendado && alertaAgendado.chave.startsWith(`${tabId}|`)) {
      clearTimeout(alertaAgendado.timer);
      alertaAgendado = null;
    }
    agendarTick();
  }
});
chrome.windows.onFocusChanged.addListener(agendarTick);
chrome.idle.onStateChanged.addListener(agendarTick);
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME) agendarTick();
  if (alarme.name === ALARME_POMODORO) enfileirar(fimDeFase);
  if (alarme.name === ALARME_RELATORIO) verificarRelatorio().catch(console.error);
});

// Mudou o modo ou o pomodoro: fecha o trecho atual (com o estado antigo) e abre outro
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && (mudancas.config || mudancas.pomodoro)) agendarTick();
});

// O popup manda os comandos do pomodoro pra cá, porque ele fecha a qualquer momento
// ---------- Cronômetro flutuante: só o mínimo vai pras páginas ----------

const CHAVES_DO_WIDGET = ["pomodoro", "config", "widgetOculto", "widgetPos"];

async function estadoDoWidget() {
  const dados = await chrome.storage.local.get(CHAVES_DO_WIDGET);
  const config = mesclarConfig(dados.config);
  return {
    pomodoro: lerPomodoro(dados.pomodoro),
    focoMin: config.pomodoro.foco,
    ativo: config.widget !== false,
    oculto: typeof dados.widgetOculto === "string" ? dados.widgetOculto : null,
    pos: dados.widgetPos || null
  };
}

// Avisa as abas abertas quando o cronômetro muda
async function avisarAbas() {
  const estado = await estadoDoWidget();
  const abas = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const aba of abas) chrome.tabs.sendMessage(aba.id, { tipo: "widget-estado", estado }).catch(() => {});
}

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && CHAVES_DO_WIDGET.some((k) => k in mudancas)) avisarAbas().catch(console.error);
});

// ---------- Mensagens: só da própria extensão e só comandos conhecidos ----------

const ACOES_POMODORO = ["iniciar", "pausar", "retomar", "parar", "dispensar"];
const numeroEntre = (v, min, max) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (remetente.id !== chrome.runtime.id || !msg || typeof msg.tipo !== "string") return;
  const responderDepois = (promessa) => {
    promessa.then((r) => responder(r ?? true), () => responder(false));
    return true;
  };

  switch (msg.tipo) {
    case "pomodoro":
      if (!ACOES_POMODORO.includes(msg.acao)) return;
      return responderDepois(enfileirar(() => comandoPomodoro(msg.acao)));
    case "tick":
      return responderDepois(agendarTick());
    case "janela":
      return responderDepois(abrirJanela());
    case "widget-estado":
      return responderDepois(estadoDoWidget());
    case "widget-ocultar":
      if (typeof msg.chave !== "string" || msg.chave.length > 100) return;
      return responderDepois(chrome.storage.local.set({ widgetOculto: msg.chave }));
    case "alerta-liberar":
    case "alerta-nao-distracao": {
      // Só vale para o site da própria aba que mandou
      const dominioDaAba = remetente.tab && remetente.tab.url ? getDominio(remetente.tab.url) : null;
      if (!dominioDaAba || msg.dominio !== dominioDaAba) return;
      alertaAgendado = null;
      if (msg.tipo === "alerta-liberar") {
        return responderDepois(chrome.storage.session.get("liberados").then(({ liberados = {} }) => {
          liberados[dominioDaAba] = Date.now() + LIBERAR_MIN * 60000;
          return chrome.storage.session.set({ liberados });
        }));
      }
      return responderDepois(getConfig().then((config) => {
        const modo = getModo(config);
        modo.distracoes = modo.distracoes.filter((d) => !(dominioDaAba === d || dominioDaAba.endsWith("." + d)));
        return chrome.storage.local.set({ config });
      }));
    }
    case "alerta-fechar-aba":
      if (!remetente.tab) return;
      return responderDepois(chrome.tabs.remove(remetente.tab.id));
    case "widget-posicao": {
      const direita = numeroEntre(msg.direita, 0, 10000);
      const baixo = numeroEntre(msg.baixo, 0, 10000);
      if (direita === null || baixo === null) return;
      return responderDepois(chrome.storage.local.set({ widgetPos: { direita, baixo } }));
    }
  }
});

chrome.notifications.onButtonClicked.addListener(async (id) => {
  if (id === "pomodoro") enfileirar(() => comandoPomodoro("iniciar"));
  if (id === "relatorio") abrirRelatorio((await chrome.storage.local.get("relatorioAvisado")).relatorioAvisado);
  chrome.notifications.clear(id);
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === "relatorio") abrirRelatorio((await chrome.storage.local.get("relatorioAvisado")).relatorioAvisado);
  chrome.notifications.clear(id);
});

// Abas que já estavam abertas não recebem o cronômetro flutuante sozinhas: injeta nelas
chrome.runtime.onInstalled.addListener(async () => {
  const [script] = chrome.runtime.getManifest().content_scripts || [];
  if (!script) return;
  const abas = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const aba of abas) {
    chrome.scripting.executeScript({ target: { tabId: aba.id }, files: script.js }).catch(() => {});
  }
});

// Se o Chrome fechou no meio de uma fase, garante que o alarme existe
chrome.alarms.get(ALARME_POMODORO, async (alarme) => {
  const p = await getPomodoro();
  if (!alarme && p.fim) chrome.alarms.create(ALARME_POMODORO, { when: Math.max(p.fim, Date.now() + 1000) });
});

agendarTick();
