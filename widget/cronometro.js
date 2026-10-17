// Mini cronômetro do pomodoro. O mesmo desenho é usado em três lugares:
// flutuando nas páginas, no Picture-in-Picture (fica por cima de tudo) e na mini janela.

const CRONOMETRO_CSS = `
.crono {
  --verde: #22c55e;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 7px;
  background: rgba(20, 20, 23, 0.94);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 999px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.3);
  color: #f4f4f5;
  font: 500 13px/1.2 "Inter", -apple-system, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  letter-spacing: -0.01em;
  user-select: none;
  cursor: grab;
  -webkit-font-smoothing: antialiased;
  animation: crono-entrar 0.25s ease-out;
}
.crono * { box-sizing: border-box; }
.crono.arrastando { cursor: grabbing; }

.anel { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
.anel svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
.anel circle { fill: none; stroke-width: 4; }
.trilho { stroke: #2c2c31; }
.prog { stroke: url(#crono-grad); stroke-linecap: round; stroke-dasharray: 119.38; transition: stroke-dashoffset 0.9s linear; }
.pausa .prog { stroke: var(--verde); }
.emoji { position: absolute; inset: 0; display: grid; place-items: center; font-size: 18px; }

.info { display: flex; flex-direction: column; min-width: 66px; }
.fase { font-size: 11px; color: #8e8e96; white-space: nowrap; }
.tempo { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.pausado .tempo { color: #8e8e96; }
.foco:not(.pausado) .fase::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #ef4444; vertical-align: 1px; animation: crono-piscar 1.4s infinite; }

.acoes { display: flex; gap: 6px; align-items: center; }
.acoes button {
  all: unset;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: #2c2c31;
  color: #f4f4f5;
  transition: background 0.15s, transform 0.1s;
}
.acoes button:hover { background: #38383e; }
.acoes button:active { transform: scale(0.92); }
.acoes button.principal { background: linear-gradient(155deg, #1f5eff, #4d8bff); box-shadow: 0 4px 12px rgba(37, 99, 255, 0.45); }
.acoes button.leve { background: transparent; width: 22px; color: #8e8e96; }
.acoes button.leve:hover { background: transparent; color: #f4f4f5; }
.acoes svg { width: 14px; height: 14px; fill: currentColor; display: block; }
.acoes .leve svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
[hidden] { display: none !important; }

/* Picture-in-Picture e mini janela: ocupa a janela toda */
html:has(.crono.janela), body:has(.crono.janela) { margin: 0; overflow: hidden; background: #0a0a0b; }
.crono.janela {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: #0a0a0b;
  justify-content: center;
  gap: 14px;
  padding: 12px;
  cursor: default;
  animation: none;
}
.janela .anel { width: 64px; height: 64px; }
.janela .emoji { font-size: 24px; }
.janela .info { min-width: 92px; }
.janela .fase { font-size: 12px; }
.janela .tempo { font-size: 32px; }
.janela .acoes button { width: 38px; height: 38px; }

@keyframes crono-entrar { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
@keyframes crono-piscar { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .crono, .crono * { animation: none !important; } }
`;

const CRONOMETRO_ICONES = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  pular: '<svg viewBox="0 0 24 24"><path d="M5 5v14l10-7zM17 5h2v14h-2z"/></svg>',
  parar: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  destacar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="11" width="7" height="7" rx="1"/></svg>',
  fechar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

// raiz: shadow root, body do PiP ou body da mini janela
// modo: "flutuante" ou "janela"
function criarCronometro(raiz, { modo = "flutuante", aoComando, aoDestacar, aoFechar }) {
  raiz.innerHTML = `
    <style>${CRONOMETRO_CSS}</style>
    <div class="crono ${modo}">
      <div class="anel">
        <svg viewBox="0 0 44 44">
          <defs>
            <linearGradient id="crono-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#4d8bff" />
              <stop offset="1" stop-color="#1f5eff" />
            </linearGradient>
          </defs>
          <circle class="trilho" cx="22" cy="22" r="19" />
          <circle class="prog" cx="22" cy="22" r="19" />
        </svg>
        <span class="emoji">🍅</span>
      </div>
      <div class="info">
        <small class="fase">Foco</small>
        <strong class="tempo">25:00</strong>
      </div>
      <div class="acoes">
        <button class="principal" data-papel="principal"></button>
        <button data-papel="parar" title="Parar">${CRONOMETRO_ICONES.parar}</button>
        <button class="leve" data-papel="destacar" title="Janela flutuante (fica por cima)">${CRONOMETRO_ICONES.destacar}</button>
        <button class="leve" data-papel="fechar" title="Esconder até a próxima fase">${CRONOMETRO_ICONES.fechar}</button>
      </div>
    </div>`;

  const achar = (seletor) => raiz.querySelector(seletor);
  const el = achar(".crono");
  const botoes = {
    principal: achar('[data-papel="principal"]'),
    parar: achar('[data-papel="parar"]'),
    destacar: achar('[data-papel="destacar"]'),
    fechar: achar('[data-papel="fechar"]')
  };
  const CIRCUNFERENCIA = 2 * Math.PI * 19;
  let acaoPrincipal = "iniciar";
  let iconeAtual = "";

  botoes.principal.addEventListener("click", () => aoComando(acaoPrincipal));
  botoes.parar.addEventListener("click", () => aoComando("parar"));
  if (aoDestacar) botoes.destacar.addEventListener("click", aoDestacar);
  else botoes.destacar.remove();
  if (aoFechar) botoes.fechar.addEventListener("click", aoFechar);
  else botoes.fechar.remove();

  // Clicar num botão não pode começar a arrastar
  for (const b of Object.values(botoes)) b.addEventListener("pointerdown", (e) => e.stopPropagation());

  function atualizar(p, focoMin) {
    const pausado = p.fase !== "parado" && !p.fim;
    const duracao = p.duracao || focoMin * 60000;
    let restante = focoMin * 60000;
    if (p.fim) restante = Math.max(0, p.fim - Date.now());
    else if (p.restante) restante = p.restante;

    const seg = Math.ceil(restante / 1000);
    achar(".tempo").textContent = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

    achar(".fase").textContent = {
      parado: p.aguardando ? "Pausa acabou · bora?" : "Pronta pra focar",
      foco: pausado ? "Foco pausado" : "Foco",
      pausa: pausado ? "Pausa pausada" : p.longa ? "Pausa longa" : "Pausa"
    }[p.fase];
    achar(".emoji").textContent = { parado: "🚀", foco: "🍅", pausa: "☕" }[p.fase];

    el.classList.remove("parado", "foco", "pausa", "pausado");
    el.classList.add(p.fase);
    if (pausado) el.classList.add("pausado");

    const feito = p.fase === "parado" ? 0 : 1 - restante / duracao;
    achar(".prog").style.strokeDashoffset = CIRCUNFERENCIA * (1 - feito);

    let icone, titulo;
    if (p.fase === "parado") [acaoPrincipal, icone, titulo] = ["iniciar", "play", "Iniciar foco"];
    else if (pausado) [acaoPrincipal, icone, titulo] = ["retomar", "play", "Retomar"];
    else if (p.fase === "foco") [acaoPrincipal, icone, titulo] = ["pausar", "pausa", "Pausar"];
    else [acaoPrincipal, icone, titulo] = ["iniciar", "pular", "Pular pausa"];
    if (icone !== iconeAtual) {
      botoes.principal.innerHTML = CRONOMETRO_ICONES[icone];
      iconeAtual = icone;
    }
    botoes.principal.title = titulo;
    botoes.parar.hidden = p.fase === "parado";
  }

  return { el, atualizar };
}
