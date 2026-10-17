// Toca um "plim-plom" curto quando o background pede (fim de foco ou de pausa)
function tocar() {
  const audio = new AudioContext();
  const notas = [880, 1318.5]; // lá e mi, uma depois da outra
  notas.forEach((freq, i) => {
    const inicio = audio.currentTime + i * 0.18;
    const osc = audio.createOscillator();
    const volume = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    volume.gain.setValueAtTime(0, inicio);
    volume.gain.linearRampToValueAtTime(0.25, inicio + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, inicio + 0.6);
    osc.connect(volume).connect(audio.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.65);
  });
  setTimeout(() => audio.close(), 1200);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tipo === "tocar") tocar();
});

if (location.search.includes("tocar")) tocar();
