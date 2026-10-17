// Aviso de distração: aparece no meio da página quando você abre um site de distração
// durante o foco ou no horário de expediente. Quem decide é o background; este script
// só recebe o necessário (site, modo e motivo) e mostra o aviso.
(() => {
  if (window.__tempoTrackerAlerta && window.__tempoTrackerAlerta.vivo()) return;
  document.querySelectorAll("[data-tempo-tracker-alerta]").forEach((e) => e.remove());
  window.__tempoTrackerAlerta = { vivo: () => Boolean(chrome.runtime && chrome.runtime.id) };

  const CSS = `
    .fundo {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(10, 10, 11, 0.55);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      font: 500 14px/1.45 "Inter", -apple-system, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      color: #f4f4f5;
      -webkit-font-smoothing: antialiased;
      animation: aparecer 0.2s ease-out;
    }
    .cartao {
      width: min(420px, 100%);
      padding: 26px 24px 20px;
      border-radius: 24px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      text-align: center;
      animation: subir 0.25s ease-out;
    }
    .gato { width: 84px; height: 84px; margin: 0 auto 6px; display: block; animation: balancar 0.6s ease-in-out 2; }
    .gato .pele { fill: #fbbf24; }
    .gato .traco { fill: none; stroke: #111114; stroke-width: 1.8; stroke-linecap: round; }
    .gato .olho { fill: #111114; }
    h1 { margin: 4px 0 6px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    p { margin: 0; color: #a1a1aa; }
    p strong { color: #f4f4f5; }
    .extra { margin-top: 6px; font-size: 13px; }
    .botoes { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; }
    button {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      padding: 12px 16px;
      border-radius: 999px;
      text-align: center;
      font-weight: 600;
      cursor: pointer;
      background: #2c2c31;
      color: #f4f4f5;
      transition: background 0.15s, transform 0.1s;
    }
    button:hover { background: #38383e; }
    button:active { transform: scale(0.98); }
    button:focus-visible { outline: 2px solid #4d8bff; outline-offset: 2px; }
    button.principal { background: linear-gradient(155deg, #1f5eff, #4d8bff); box-shadow: 0 6px 18px rgba(37, 99, 255, 0.4); }
    button.leve { background: transparent; color: #a1a1aa; font-weight: 500; padding: 8px; }
    button.leve:hover { color: #f4f4f5; }
    @keyframes aparecer { from { opacity: 0; } }
    @keyframes subir { from { opacity: 0; transform: translateY(12px) scale(0.97); } }
    @keyframes balancar { 50% { transform: rotate(-8deg); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  const GATO = `
    <svg class="gato" viewBox="0 0 80 80" aria-hidden="true">
      <path class="pele" d="M22 32 L24 12 L36 24 Z" />
      <path class="pele" d="M58 32 L56 12 L44 24 Z" />
      <circle class="pele" cx="40" cy="42" r="24" />
      <path class="traco" d="M28 36 l7 3" />
      <path class="traco" d="M52 36 l-7 3" />
      <circle class="olho" cx="32" cy="43" r="3" />
      <circle class="olho" cx="48" cy="43" r="3" />
      <path class="traco" d="M34 55 q6 -5 12 0" />
    </svg>`;

  let host = null;

  function fechar() {
    if (host) host.remove();
    host = null;
  }

  function mandar(msg) {
    return chrome.runtime.sendMessage(msg).catch(() => {});
  }

  function mostrar({ dominio, modo, motivo, minutos, fimExpediente }) {
    fechar();
    // Pausa vídeos e áudios da página enquanto o aviso estiver na tela
    document.querySelectorAll("video, audio").forEach((m) => { try { m.pause(); } catch {} });

    host = document.createElement("div");
    host.dataset.tempoTrackerAlerta = motivo;
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const sombra = host.attachShadow({ mode: "closed" });

    const titulo = motivo === "foco" ? "Ei, você está em foco!" : "Ei, ainda é horário de trabalho!";
    const extra = motivo === "foco"
      ? (minutos > 0 ? `Faltam ${minutos} min para a pausa.` : "A pausa já está chegando.")
      : `O expediente vai até ${fimExpediente}.`;

    sombra.innerHTML = `
      <style>${CSS}</style>
      <div class="fundo" role="alertdialog" aria-modal="true" aria-labelledby="titulo">
        <div class="cartao">
          ${GATO}
          <h1 id="titulo"></h1>
          <p class="texto"></p>
          <p class="extra"></p>
          <div class="botoes">
            <button class="principal" data-acao="voltar">Voltar ao foco</button>
            <button data-acao="liberar">Só 5 minutos</button>
            <button class="leve" data-acao="nao-distracao">Este site não é distração</button>
          </div>
        </div>
      </div>`;
    sombra.getElementById("titulo").textContent = titulo;
    sombra.querySelector('[data-acao="voltar"]').textContent = motivo === "foco" ? "Voltar ao foco" : "Voltar ao trabalho";
    const texto = sombra.querySelector(".texto");
    texto.append(Object.assign(document.createElement("strong"), { textContent: dominio }), ` é distração no modo ${modo}.`);
    sombra.querySelector(".extra").textContent = extra;

    sombra.querySelector('[data-acao="voltar"]').addEventListener("click", () => {
      fechar();
      // Volta pra página anterior; se a aba foi aberta direto aqui, fecha
      if (history.length > 1) history.back();
      else mandar({ tipo: "alerta-fechar-aba" });
    });
    sombra.querySelector('[data-acao="liberar"]').addEventListener("click", () => {
      fechar();
      mandar({ tipo: "alerta-liberar", dominio });
    });
    sombra.querySelector('[data-acao="nao-distracao"]').addEventListener("click", () => {
      fechar();
      mandar({ tipo: "alerta-nao-distracao", dominio });
    });

    // O aviso segura o teclado: rolar ou digitar na página só depois de escolher
    host.addEventListener("keydown", (e) => e.stopPropagation(), true);
    document.documentElement.append(host);
    sombra.querySelector('[data-acao="voltar"]').focus();
  }

  chrome.runtime.onMessage.addListener((msg, remetente) => {
    if (remetente.id !== chrome.runtime.id || !msg) return;
    if (msg.tipo === "alerta-distracao") mostrar(msg);
    if (msg.tipo === "alerta-fechar") fechar();
  });
})();
