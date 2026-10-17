// Data local no formato AAAA-MM-DD (não usa UTC, pra não virar o dia às 21h no Brasil)
function dataLocal(d) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Fonte Inter sem travar a tela: os scripts rodam antes e, sem internet, fica a fonte do sistema
function carregarFonte() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.append(link);
}

function hoje() {
  return dataLocal(new Date());
}

// "2026-10-17" -> Date à meia-noite local
function lerData(texto) {
  const [a, m, d] = texto.split("-").map(Number);
  return new Date(a, m - 1, d);
}

// 3725 segundos -> "1h 2min"
function formatarTempo(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}min` : `${h}h`;
  if (m > 0) return `${m}min`;
  return `${segundos}s`;
}

// "09:30" -> 570
function minutosDoDia(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ---------- Configuração (modos, metas, pomodoro) ----------

// Faculdade (Cruzeiro do Sul) e documentos
const ESTUDO_SITES = [
  "cruzeirodosul.edu.br", "cruzeirodosulvirtual.com.br", "blackboard.com",
  "docs.google.com", "drive.google.com", "office.com", "onedrive.live.com", "sharepoint.com",
  "notion.so", "scholar.google.com", "wikipedia.org"
];

const CONFIG_PADRAO = {
  versao: 2,
  nome: "", // como o popup te chama na saudação
  modoAtivo: "trabalho",
  modos: [
    {
      id: "trabalho",
      nome: "Trabalho",
      emoji: "💼",
      contar: true,
      metaMin: 240,
      produtivos: ["notion.so", "github.com", "docs.google.com", "mail.google.com", "calendar.google.com", "slack.com", "trello.com", "figma.com", "linkedin.com"],
      distracoes: ["youtube.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "facebook.com", "netflix.com", "reddit.com"],
      favoritos: [
        { titulo: "Gmail", url: "https://mail.google.com" },
        { titulo: "Agenda", url: "https://calendar.google.com" },
        { titulo: "Notion", url: "https://www.notion.so" }
      ]
    },
    {
      id: "estudo",
      nome: "Estudo",
      emoji: "📚",
      contar: true,
      metaMin: 120,
      // Modo opcional: fica fora da agenda e você liga no popup quando for estudar
      produtivos: ESTUDO_SITES,
      distracoes: ["instagram.com", "tiktok.com", "x.com", "twitter.com", "facebook.com", "netflix.com"],
      favoritos: [
        { titulo: "Cruzeiro do Sul", url: "https://www.cruzeirodosulvirtual.com.br" },
        { titulo: "Google Docs", url: "https://docs.google.com" },
        { titulo: "Drive", url: "https://drive.google.com" }
      ]
    },
    {
      id: "lazer",
      nome: "Lazer",
      emoji: "🎮",
      contar: false, // tempo de lazer não pesa na produtividade
      metaMin: 0,
      produtivos: [],
      distracoes: [],
      favoritos: [
        { titulo: "YouTube", url: "https://www.youtube.com" },
        { titulo: "Netflix", url: "https://www.netflix.com" }
      ]
    }
  ],
  expediente: { inicio: "09:00", fim: "18:00" },
  // Modo de cada dia da semana (índice do getDay: 0 = domingo ... 6 = sábado)
  agenda: {
    automatico: true,
    dias: ["lazer", "trabalho", "trabalho", "trabalho", "trabalho", "trabalho", "lazer"],
    trabalhoNoLazer: true // site de trabalho usado num dia de lazer conta como trabalho
  },
  relatorio: "segunda", // relatório semanal: "segunda" (9h, semana anterior), "domingo" (20h) ou "desligado"
  modoManual: null, // { dia, modo }: troca feita no popup, vale só até o fim do dia
  widget: true, // cronômetro flutuante nas páginas
  limiteLazerMin: 0, // limite diário de lazer em minutos (0 = sem limite)
  pomodoro: { foco: 25, pausa: 5, pausaLonga: 15, ciclos: 4 }
};

// ---------- Validação da configuração ----------
// Só campos conhecidos, com o tipo e o tamanho certos. Qualquer outra coisa é descartada
// (proteção contra "mass assignment": nada de campos extras entrando pela config).

const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const inteiro = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const booleano = (v) => (typeof v === "boolean" ? v : undefined);
const lista = (v, max, validar) => (Array.isArray(v) ? v.map(validar).filter((x) => x !== undefined).slice(0, max) : undefined);
const hora = (v) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
const dominio = (v) => {
  const d = texto(v, 100);
  return d && /^[a-z0-9.-]+$/i.test(d) ? d.toLowerCase() : undefined;
};
const linkSeguro = (v) => {
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
};
const semVazios = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function sanitizarModo(m) {
  if (!m || typeof m !== "object") return undefined;
  const id = texto(m.id, 40);
  if (!id) return undefined;
  return {
    id,
    nome: texto(m.nome, 20) || "Sem nome",
    emoji: texto(m.emoji, 8) || "⭐",
    contar: booleano(m.contar) ?? true,
    metaMin: inteiro(m.metaMin, 0, 1440) ?? 0,
    produtivos: lista(m.produtivos, 300, dominio) || [],
    distracoes: lista(m.distracoes, 300, dominio) || [],
    favoritos: lista(m.favoritos, 30, (f) => {
      const url = f && linkSeguro(f.url);
      return url ? { titulo: texto(f.titulo, 40) || new URL(url).hostname, url } : undefined;
    }) || []
  };
}

function sanitizarConfig(s) {
  if (!s || typeof s !== "object") return {};
  const agenda = s.agenda && typeof s.agenda === "object" ? s.agenda : {};
  const pomodoro = s.pomodoro && typeof s.pomodoro === "object" ? s.pomodoro : {};
  const expediente = s.expediente && typeof s.expediente === "object" ? s.expediente : {};
  const manual = s.modoManual;
  const dias = lista(agenda.dias, 7, (d) => texto(d, 40));
  return semVazios({
    versao: inteiro(s.versao, 1, 100),
    nome: texto(s.nome, 30),
    modoAtivo: texto(s.modoAtivo, 40),
    modos: lista(s.modos, 20, sanitizarModo),
    expediente: semVazios({ inicio: hora(expediente.inicio), fim: hora(expediente.fim) }),
    agenda: semVazios({
      automatico: booleano(agenda.automatico),
      dias: dias && dias.length === 7 ? dias : undefined,
      trabalhoNoLazer: booleano(agenda.trabalhoNoLazer)
    }),
    modoManual: manual && typeof manual === "object" && /^\d{4}-\d{2}-\d{2}$/.test(manual.dia) && texto(manual.modo, 40)
      ? { dia: manual.dia, modo: texto(manual.modo, 40) }
      : null,
    widget: booleano(s.widget),
    limiteLazerMin: inteiro(s.limiteLazerMin, 0, 1440),
    relatorio: ["segunda", "domingo", "desligado"].includes(s.relatorio) ? s.relatorio : undefined,
    pomodoro: semVazios({
      foco: inteiro(pomodoro.foco, 1, 180),
      pausa: inteiro(pomodoro.pausa, 1, 60),
      pausaLonga: inteiro(pomodoro.pausaLonga, 1, 90),
      ciclos: inteiro(pomodoro.ciclos, 1, 12)
    })
  });
}

function mesclarConfig(salva = {}) {
  const config = structuredClone(CONFIG_PADRAO);
  salva = sanitizarConfig(migrarConfig(structuredClone(salva || {})));
  return {
    ...config,
    ...salva,
    expediente: { ...config.expediente, ...salva.expediente },
    agenda: { ...config.agenda, ...salva.agenda },
    pomodoro: { ...config.pomodoro, ...salva.pomodoro },
    modos: salva.modos && salva.modos.length ? salva.modos : config.modos
  };
}

// Configs salvas antes da versão 2: o Estudo vira o modo da faculdade e dos documentos
function migrarConfig(salva) {
  if ((salva.versao || 1) >= 2 || !salva.modos) return salva;
  const estudo = salva.modos.find((m) => m.id === "estudo");
  if (estudo) {
    estudo.produtivos = [...new Set([...estudo.produtivos.filter((d) => d !== "youtube.com"), ...ESTUDO_SITES])];
  }
  salva.versao = 2;
  return salva;
}

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return mesclarConfig(config);
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function getModo(config, id = modoAtualId(config)) {
  return config.modos.find((m) => m.id === id) || config.modos[0];
}

// Qual modo vale agora: troca manual de hoje > agenda do dia da semana > modo fixo
function modoAtualId(config, quando = new Date()) {
  const manual = config.modoManual;
  if (manual && manual.dia === dataLocal(quando)) return manual.modo;
  if (config.agenda.automatico) return config.agenda.dias[quando.getDay()] || config.modoAtivo;
  return config.modoAtivo;
}

function origemDoModo(config, quando = new Date()) {
  const manual = config.modoManual;
  if (manual && manual.dia === dataLocal(quando)) return "manual";
  return config.agenda.automatico ? "automatico" : "fixo";
}

// Em qual modo entra o tempo gasto num site.
// Num modo que não conta (lazer), um site produtivo de outro modo puxa o tempo pra lá:
// abrir o GitHub no sábado conta como Trabalho.
function modoDoSite(config, dominio, quando = new Date()) {
  const atual = getModo(config, modoAtualId(config, quando));
  if (!dominio || atual.contar || !config.agenda.trabalhoNoLazer) return atual;
  // Só puxa pra modos que estão na agenda (ex.: Trabalho); Estudo fora da agenda não rouba o YouTube
  const agendados = new Set(config.agenda.dias);
  const candidatos = config.modos.filter((m) => m.contar && agendados.has(m.id) && bate(dominio, m.produtivos));
  if (candidatos.length === 0) return atual;
  const modoDiaUtil = config.agenda.dias[1]; // prefere o modo de segunda-feira
  return candidatos.find((m) => m.id === modoDiaUtil) || candidatos[0];
}

// "m.youtube.com" bate com "youtube.com"
function bate(dominio, lista = []) {
  return lista.some((d) => dominio === d || dominio.endsWith("." + d));
}

function classificar(dominio, modo) {
  if (!modo) return "neutro";
  if (bate(dominio, modo.produtivos)) return "produtivo";
  if (bate(dominio, modo.distracoes)) return "distracao";
  return "neutro";
}

// porModo = { trabalho: { "notion.so": 300 }, estudo: {...} }
// O mesmo site conta diferente dependendo do modo em que você estava.
function resumirProdutividade(porModo = {}, config, { soContados = true } = {}) {
  const r = { produtivo: 0, distracao: 0, neutro: 0, total: 0 };
  for (const [id, sites] of Object.entries(porModo)) {
    const modo = config.modos.find((m) => m.id === id);
    if (soContados && (!modo || !modo.contar)) continue;
    for (const [dominio, segundos] of Object.entries(sites)) {
      r[classificar(dominio, modo)] += segundos;
      r.total += segundos;
    }
  }
  r.pct = r.total ? Math.round((r.produtivo / r.total) * 100) : null;
  return r;
}

// Divide o dia todo: produtivo/neutro/distração nos modos que contam e lazer nos que não contam
function resumirDia(porModo = {}, config) {
  const r = { produtivo: 0, neutro: 0, distracao: 0, lazer: 0, total: 0 };
  for (const [id, sites] of Object.entries(porModo)) {
    const modo = config.modos.find((m) => m.id === id);
    for (const [dominio, segundos] of Object.entries(sites)) {
      if (modo && !modo.contar) r.lazer += segundos;
      else r[classificar(dominio, modo)] += segundos;
      r.total += segundos;
    }
  }
  return r;
}

// Junta { modo: { site: s } } em [{ nome, segundos, modo }] somando por site
function sitesDe(porModo = {}) {
  const soma = {};
  for (const [modo, sites] of Object.entries(porModo)) {
    for (const [dominio, segundos] of Object.entries(sites)) {
      soma[dominio] = soma[dominio] || { nome: dominio, segundos: 0, modos: {} };
      soma[dominio].segundos += segundos;
      soma[dominio].modos[modo] = (soma[dominio].modos[modo] || 0) + segundos;
    }
  }
  return Object.values(soma).sort((a, b) => b.segundos - a.segundos);
}

// ---------- Pomodoro ----------

// aguardando = a pausa acabou e o cronômetro flutuante convida pra próxima sessão
// sessao = id da sessão de foco em andamento (cada foco tem seu próprio registro de sites)
const POMODORO_PARADO = { fase: "parado", fim: null, restante: null, duracao: null, ciclo: 0, longa: false, aguardando: false, dia: null, sessao: null };

function lerPomodoro(salvo) {
  return { ...POMODORO_PARADO, ...salvo };
}

// ---------- Semanas (segunda a domingo) ----------

// Segunda-feira da semana de uma data, à meia-noite
function inicioDaSemana(d) {
  const segunda = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
  return segunda;
}

// As 7 datas (AAAA-MM-DD) da semana que começa nessa segunda
function datasDaSemana(segunda) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(d.getDate() + i);
    return dataLocal(d);
  });
}

// Segunda-feira (AAAA-MM-DD) da última semana cujo relatório já está pronto
// segunda: pronto a partir de segunda 9h  ·  domingo: pronto a partir de domingo 20h
function semanaDoUltimoRelatorio(config, agora = new Date()) {
  const deslocamento = config.relatorio === "domingo" ? 4 : -9; // horas
  const base = new Date(agora.getTime() + deslocamento * 3600000);
  const segunda = inicioDaSemana(base);
  segunda.setDate(segunda.getDate() - 7);
  return dataLocal(segunda);
}
