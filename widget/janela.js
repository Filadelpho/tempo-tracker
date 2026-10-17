// Mini janela separada com o cronômetro (quando o Picture-in-Picture não está disponível)
let pomodoro = lerPomodoro();
let focoMin = 25;

const crono = criarCronometro(document.body, {
  modo: "janela",
  aoComando: (acao) => chrome.runtime.sendMessage({ tipo: "pomodoro", acao })
});

function render() {
  crono.atualizar(pomodoro, focoMin);
  const seg = Math.ceil(((pomodoro.fim ? pomodoro.fim - Date.now() : pomodoro.restante) || 0) / 1000);
  document.title = pomodoro.fase === "parado"
    ? "Foco · Tempo Tracker"
    : `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")} · ${pomodoro.fase === "foco" ? "Foco" : "Pausa"}`;
}

async function carregar() {
  const dados = await chrome.storage.local.get(["pomodoro", "config"]);
  pomodoro = lerPomodoro(dados.pomodoro);
  focoMin = mesclarConfig(dados.config).pomodoro.foco;
  render();
}

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && (mudancas.pomodoro || mudancas.config)) carregar();
});

setInterval(render, 1000);
carregar();
carregarFonte();
