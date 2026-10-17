// Cronômetro flutuante: aparece no canto das páginas enquanto o pomodoro roda.
// Dá pra arrastar, esconder até a próxima fase ou destacar numa janela que fica por cima.
(() => {
  // Já tem um cronômetro vivo nesta página? Então não injeta de novo.
  // (Depois de recarregar a extensão, o antigo fica órfão e é trocado por este.)
  if (window.__tempoTrackerCronometro && window.__tempoTrackerCronometro.vivo()) return;
  document.querySelectorAll("[data-tempo-tracker-cronometro]").forEach((e) => e.remove());
  window.__tempoTrackerCronometro = { vivo: () => Boolean(chrome.runtime && chrome.runtime.id) };

  const MARGEM = 12;

  const estado = {
    pomodoro: lerPomodoro(),
    focoMin: 25,
    ativo: true,
    oculto: null, // chave da fase que a pessoa escondeu
    pos: null // { direita, baixo } em px
  };
  let pip = null; // { janela, crono } quando destacado

  const host = document.createElement("div");
  host.dataset.tempoTrackerCronometro = "";
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; display: none;";
  const sombra = host.attachShadow({ mode: "closed" });

  function comando(acao) {
    chrome.runtime.sendMessage({ tipo: "pomodoro", acao }).catch(() => {});
  }

  // Muda quando a fase muda: esconder vale só até a próxima fase
  function chaveFase() {
    const p = estado.pomodoro;
    return `${p.dia}-${p.fase}-${p.ciclo}-${p.aguardando}`;
  }

  const crono = criarCronometro(sombra, {
    aoComando: comando,
    aoDestacar: destacar,
    aoFechar: () => {
      if (estado.pomodoro.aguardando) comando("dispensar");
      else chrome.storage.local.set({ widgetOculto: chaveFase() });
    }
  });

  function visivel() {
    const p = estado.pomodoro;
    return estado.ativo
      && !pip
      && !document.fullscreenElement
      && (p.fase !== "parado" || p.aguardando)
      && estado.oculto !== chaveFase();
  }

  function render() {
    const mostrar = visivel();
    host.style.display = mostrar ? "block" : "none";
    if (mostrar) crono.atualizar(estado.pomodoro, estado.focoMin);
    if (pip) pip.crono.atualizar(estado.pomodoro, estado.focoMin);
  }

  // ---------- Posição e arrastar ----------

  function aplicarPosicao() {
    if (!estado.pos) return;
    const largura = host.offsetWidth || 260;
    const altura = host.offsetHeight || 60;
    const direita = Math.min(Math.max(MARGEM, estado.pos.direita), innerWidth - largura - MARGEM);
    const baixo = Math.min(Math.max(MARGEM, estado.pos.baixo), innerHeight - altura - MARGEM);
    host.style.right = `${direita}px`;
    host.style.bottom = `${baixo}px`;
  }

  crono.el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const caixa = host.getBoundingClientRect();
    const inicio = { x: e.clientX, y: e.clientY, direita: innerWidth - caixa.right, baixo: innerHeight - caixa.bottom };
    crono.el.setPointerCapture(e.pointerId);
    crono.el.classList.add("arrastando");

    const mover = (ev) => {
      estado.pos = {
        direita: inicio.direita - (ev.clientX - inicio.x),
        baixo: inicio.baixo - (ev.clientY - inicio.y)
      };
      aplicarPosicao();
    };
    const soltar = () => {
      crono.el.classList.remove("arrastando");
      crono.el.removeEventListener("pointermove", mover);
      crono.el.removeEventListener("pointerup", soltar);
      crono.el.removeEventListener("pointercancel", soltar);
      if (estado.pos) chrome.storage.local.set({ widgetPos: estado.pos });
    };
    crono.el.addEventListener("pointermove", mover);
    crono.el.addEventListener("pointerup", soltar);
    crono.el.addEventListener("pointercancel", soltar);
  });

  addEventListener("resize", aplicarPosicao);
  document.addEventListener("fullscreenchange", render);

  // ---------- Janela que fica por cima ----------

  async function destacar() {
    // Picture-in-Picture de documento: fica por cima até de outros programas
    if ("documentPictureInPicture" in window) {
      try {
        const janela = await window.documentPictureInPicture.requestWindow({ width: 320, height: 110 });
        janela.document.title = "Foco";
        janela.document.body.style.margin = "0";
        janela.document.body.style.background = "#0a0a0b";
        const cronoPip = criarCronometro(janela.document.body, { modo: "janela", aoComando: comando });
        pip = { janela, crono: cronoPip };
        janela.addEventListener("pagehide", () => {
          pip = null;
          render();
        });
        render();
        return;
      } catch (erro) {
        console.warn("[Tempo Tracker] Picture-in-Picture indisponível, abrindo mini janela", erro);
      }
    }
    chrome.runtime.sendMessage({ tipo: "janela" }).catch(() => {});
  }

  // ---------- Dados ----------

  function aplicarDados(dados) {
    if ("pomodoro" in dados) estado.pomodoro = lerPomodoro(dados.pomodoro);
    if ("config" in dados) {
      const config = mesclarConfig(dados.config);
      estado.focoMin = config.pomodoro.foco;
      estado.ativo = config.widget !== false;
    }
    if ("widgetOculto" in dados) estado.oculto = dados.widgetOculto;
    if ("widgetPos" in dados) estado.pos = dados.widgetPos;
  }

  chrome.storage.local.get(["pomodoro", "config", "widgetOculto", "widgetPos"]).then((dados) => {
    aplicarDados(dados);
    document.documentElement.append(host);
    host.dataset.montado = "1";
    render();
    aplicarPosicao();
  });

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== "local") return;
    const dados = {};
    for (const chave of ["pomodoro", "config", "widgetOculto", "widgetPos"]) {
      if (chave in mudancas) dados[chave] = mudancas[chave].newValue;
    }
    if (Object.keys(dados).length === 0) return;
    aplicarDados(dados);
    render();
    aplicarPosicao();
  });

  // O tempo corre a cada segundo (só desenha se estiver aparecendo)
  const relogio = setInterval(() => {
    // A extensão foi recarregada ou removida: some da página
    if (!(chrome.runtime && chrome.runtime.id) || (!host.isConnected && host.dataset.montado)) {
      clearInterval(relogio);
      host.remove();
      return;
    }
    if (visivel() || pip) render();
  }, 1000);
})();
