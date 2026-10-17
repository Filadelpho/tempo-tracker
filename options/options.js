const $ = (id) => document.getElementById(id);

let config;

function linhas(texto) {
  return texto.split("\n").map((l) => l.trim()).filter(Boolean);
}

function dominios(texto) {
  return [...new Set(linhas(texto).map(limparDominio))];
}

// Aceita "https://www.youtube.com/watch?v=..." e guarda só "youtube.com"
function limparDominio(texto) {
  try {
    const url = texto.includes("://") ? new URL(texto) : new URL(`https://${texto}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return texto.toLowerCase();
  }
}

function lerFavoritos(texto) {
  return linhas(texto)
    .map((l) => {
      const [titulo, ...resto] = l.split("|");
      let url = (resto.length ? resto.join("|") : titulo).trim();
      if (!/^https?:\/\//.test(url)) url = `https://${url}`;
      try {
        return { titulo: (resto.length ? titulo : new URL(url).hostname).trim(), url };
      } catch {
        return null; // linha que não é um link válido
      }
    })
    .filter((f) => f && f.titulo);
}

function adicionarModo(modo) {
  const no = $("modelo-modo").content.firstElementChild.cloneNode(true);
  no.dataset.id = modo.id;
  no.querySelector(".emoji").value = modo.emoji || "";
  no.querySelector(".nome").value = modo.nome;
  no.querySelector(".contar").checked = modo.contar !== false;
  no.querySelector(".meta").value = modo.metaMin || 0;
  no.querySelector(".produtivos").value = (modo.produtivos || []).join("\n");
  no.querySelector(".distracoes").value = (modo.distracoes || []).join("\n");
  no.querySelector(".favoritos").value = (modo.favoritos || []).map((f) => `${f.titulo} | ${f.url}`).join("\n");
  no.querySelector(".apagar").addEventListener("click", () => {
    if (document.querySelectorAll(".modo").length === 1) return alert("Precisa ter pelo menos um modo.");
    if (confirm(`Apagar o modo "${modo.nome}"?`)) {
      no.remove();
      renderAgenda();
    }
  });
  $("modos").append(no);
}

// Segunda primeiro; o índice é o do getDay (0 = domingo)
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Modos como estão na tela agora (nome pode ter sido editado e ainda não salvo)
function modosNaTela() {
  return [...document.querySelectorAll(".modo")].map((no) => ({
    id: no.dataset.id,
    nome: no.querySelector(".nome").value.trim() || "Sem nome",
    emoji: no.querySelector(".emoji").value.trim()
  }));
}

function renderAgenda(dias) {
  const atuais = dias || [...document.querySelectorAll("#agenda-dias select")].reduce((acc, s) => {
    acc[s.dataset.dia] = s.value;
    return acc;
  }, []);
  const modos = modosNaTela();
  const caixa = $("agenda-dias");
  caixa.replaceChildren();
  for (const dia of ORDEM_DIAS) {
    const label = document.createElement("label");
    if (dia === 0 || dia === 6) label.className = "fim-de-semana";
    label.append(NOMES_DIAS[dia]);
    const select = document.createElement("select");
    select.dataset.dia = dia;
    for (const modo of modos) {
      const opcao = document.createElement("option");
      opcao.value = modo.id;
      opcao.textContent = `${modo.emoji} ${modo.nome}`;
      select.append(opcao);
    }
    select.value = modos.some((m) => m.id === atuais[dia]) ? atuais[dia] : modos[0].id;
    select.disabled = !$("agenda-auto").checked;
    label.append(select);
    caixa.append(label);
  }
}

$("agenda-auto").addEventListener("change", () => renderAgenda());
$("modos").addEventListener("input", (e) => {
  if (e.target.matches(".nome, .emoji")) renderAgenda();
});

async function carregar() {
  config = await getConfig();
  $("modos").replaceChildren();
  config.modos.forEach(adicionarModo);
  $("agenda-auto").checked = config.agenda.automatico;
  $("trabalho-no-lazer").checked = config.agenda.trabalhoNoLazer;
  renderAgenda(config.agenda.dias);
  $("nome").value = config.nome || "";
  $("exp-inicio").value = config.expediente.inicio;
  $("exp-fim").value = config.expediente.fim;
  $("relatorio").value = config.relatorio;
  $("pom-foco").value = config.pomodoro.foco;
  $("pom-pausa").value = config.pomodoro.pausa;
  $("pom-longa").value = config.pomodoro.pausaLonga;
  $("pom-ciclos").value = config.pomodoro.ciclos;
}

function numero(id, padrao) {
  const n = parseInt($(id).value, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

async function salvar() {
  const modos = [...document.querySelectorAll(".modo")].map((no) => ({
    id: no.dataset.id,
    emoji: no.querySelector(".emoji").value.trim() || "⭐",
    nome: no.querySelector(".nome").value.trim() || "Sem nome",
    contar: no.querySelector(".contar").checked,
    metaMin: Math.max(0, parseInt(no.querySelector(".meta").value, 10) || 0),
    produtivos: dominios(no.querySelector(".produtivos").value),
    distracoes: dominios(no.querySelector(".distracoes").value),
    favoritos: lerFavoritos(no.querySelector(".favoritos").value)
  }));

  const novo = {
    ...config,
    modos,
    modoAtivo: modos.some((m) => m.id === config.modoAtivo) ? config.modoAtivo : modos[0].id,
    agenda: {
      automatico: $("agenda-auto").checked,
      trabalhoNoLazer: $("trabalho-no-lazer").checked,
      dias: [0, 1, 2, 3, 4, 5, 6].map((dia) => {
        const valor = document.querySelector(`#agenda-dias select[data-dia="${dia}"]`).value;
        return modos.some((m) => m.id === valor) ? valor : modos[0].id;
      })
    },
    nome: $("nome").value.trim(),
    expediente: { inicio: $("exp-inicio").value || "09:00", fim: $("exp-fim").value || "18:00" },
    relatorio: $("relatorio").value,
    pomodoro: {
      foco: numero("pom-foco", 25),
      pausa: numero("pom-pausa", 5),
      pausaLonga: numero("pom-longa", 15),
      ciclos: numero("pom-ciclos", 4)
    }
  };

  await chrome.storage.local.set({ config: novo });
  config = novo;
  $("status").textContent = "Salvo ✓";
  setTimeout(() => ($("status").textContent = ""), 2000);
}

$("novo-modo").addEventListener("click", () => {
  adicionarModo({ id: `modo-${Date.now()}`, nome: "Novo modo", emoji: "⭐", contar: true, metaMin: 60 });
  renderAgenda();
});
$("salvar").addEventListener("click", salvar);

carregar();
carregarFonte();
