// Sonidos y música generados con Web Audio: sin archivos, sin derechos de autor, funcionan offline.

let ctx = null;
let master = null;
let silenciado = false;

/** Crea/reanuda el contexto de audio. Llamar desde un toque o clic del usuario. */
export function activarAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = silenciado ? 0 : 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export const audioActivo = () => !!ctx && ctx.state === "running";

export function silenciar(si) {
  silenciado = si;
  if (master) master.gain.setTargetAtTime(si ? 0 : 0.7, ctx.currentTime, 0.05);
}

const midi = (m) => 440 * 2 ** ((m - 69) / 12);

function tono({ f, t = 0, dur = 0.15, tipo = "sine", vol = 0.25, f2 = null, ataque = 0.005, filtro = null, destino = null }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let nodo = o;
  if (filtro) {
    const fl = ctx.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = filtro;
    o.connect(fl);
    nodo = fl;
  }
  nodo.connect(g);
  g.connect(destino ?? master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let bufferRuido = null;
function ruido({ t = 0, dur = 0.08, vol = 0.2, pasaAltos = 1000, destino = null }) {
  if (!ctx) return;
  if (!bufferRuido) {
    bufferRuido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = bufferRuido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = bufferRuido;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = "highpass";
  fl.frequency.value = pasaAltos;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl).connect(g).connect(destino ?? master);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.02);
}

// ---------- Efectos ----------
export const tick = (agudo = 1) => tono({ f: 1800 * agudo, dur: 0.025, tipo: "square", vol: 0.08, filtro: 4000 });
export const ding = () => {
  tono({ f: midi(84), dur: 0.35, vol: 0.18 });
  tono({ f: midi(91), t: 0.09, dur: 0.5, vol: 0.15 });
};
export const pop = () => tono({ f: 300, f2: 900, dur: 0.12, vol: 0.2, tipo: "triangle" });
export const error = () => tono({ f: 160, dur: 0.25, tipo: "sawtooth", vol: 0.12, filtro: 800 });
export const whoosh = () => {
  ruido({ dur: 0.5, vol: 0.12, pasaAltos: 600 });
  tono({ f: 200, f2: 1200, dur: 0.45, vol: 0.06, tipo: "sine" });
};
export function teclado(n = 1) {
  for (let i = 0; i < n; i++) ruido({ t: i * 0.06, dur: 0.02, vol: 0.06, pasaAltos: 3000 });
}

/** Redoble de tambor que acelera y crece durante `dur` segundos. */
export function redoble(dur = 3) {
  if (!ctx) return;
  let t = 0;
  while (t < dur) {
    const p = t / dur;
    ruido({ t, dur: 0.05, vol: 0.05 + 0.25 * p, pasaAltos: 1500 });
    tono({ f: 180, f2: 90, t, dur: 0.05, vol: 0.04 + 0.12 * p, tipo: "triangle" });
    t += 0.07 - 0.04 * p;
  }
}

/** Platillo + fanfarria triunfal. */
export function fanfarria() {
  if (!ctx) return;
  ruido({ dur: 1.6, vol: 0.35, pasaAltos: 5000 });
  const trompeta = (m, t, dur, vol = 0.12) => {
    tono({ f: midi(m), t, dur, tipo: "sawtooth", vol, filtro: 2600, ataque: 0.02 });
    tono({ f: midi(m) * 1.004, t, dur, tipo: "sawtooth", vol: vol * 0.6, filtro: 2200, ataque: 0.02 });
  };
  // ta-ta-ta-taaa
  [[67, 0, 0.14], [67, 0.16, 0.14], [67, 0.32, 0.14], [72, 0.48, 0.9]].forEach(([m, t, d]) => trompeta(m, t, d));
  [[76, 1.3, 0.2], [74, 1.5, 0.2], [76, 1.7, 0.2], [79, 1.9, 1.4]].forEach(([m, t, d]) => trompeta(m, t, d));
  [60, 64, 67, 72].forEach((m) => tono({ f: midi(m), t: 1.9, dur: 1.6, tipo: "triangle", vol: 0.08 }));
  tono({ f: midi(36), t: 1.9, dur: 1.6, tipo: "sine", vol: 0.2 });
}

/** “Tadaa” corto para el celular cuando aparece tu número. */
export function tadaa() {
  [72, 76, 79, 84].forEach((m, i) => tono({ f: midi(m), t: i * 0.08, dur: 0.5, tipo: "triangle", vol: 0.15 }));
  ruido({ t: 0.32, dur: 0.6, vol: 0.12, pasaAltos: 6000 });
}

// ---------- Música en loop ----------
/**
 * Música generativa. Modos:
 *  - "lobby": tranqui, mientras la gente se anota.
 *  - "suspenso": pulso en menor que se acelera con `intensidad` (0..1).
 */
export class Musica {
  constructor() {
    this.modo = null;
    this.intensidad = 0;
    this.paso = 0;
    this.proxima = 0;
    this.timer = null;
    this.bus = null;
  }

  iniciar(modo) {
    if (!activarAudio()) return;
    if (this.modo === modo) return;
    this.detener(0.3);
    this.modo = modo;
    this.paso = 0;
    this.intensidad = 0;
    this.bus = ctx.createGain();
    this.bus.gain.value = modo === "lobby" ? 0.5 : 0.8;
    this.bus.connect(master);
    this.proxima = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.programar(), 25);
  }

  detener(fundido = 0.6) {
    clearInterval(this.timer);
    this.timer = null;
    if (this.bus && ctx) {
      const b = this.bus;
      b.gain.setTargetAtTime(0, ctx.currentTime, fundido / 3);
      setTimeout(() => b.disconnect(), fundido * 1000 + 200);
    }
    this.bus = null;
    this.modo = null;
  }

  programar() {
    if (!ctx || !this.bus) return;
    while (this.proxima < ctx.currentTime + 0.12) {
      const bpm = this.modo === "lobby" ? 104 : 96 + 90 * this.intensidad;
      const dur16 = 60 / bpm / 4;
      const t = this.proxima - ctx.currentTime;
      if (this.modo === "lobby") this.pasoLobby(t, dur16);
      else this.pasoSuspenso(t, dur16);
      this.paso++;
      this.proxima += dur16;
    }
  }

  pasoLobby(t, d) {
    const destino = this.bus;
    const acordes = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]]; // Cmaj7 Am7 Fmaj7 G7
    const compas = Math.floor(this.paso / 16) % 4;
    const s = this.paso % 16;
    const ac = acordes[compas];
    const arpegio = [0, 1, 2, 3, 2, 1, 2, 3];
    if (s % 2 === 0) tono({ f: midi(ac[arpegio[(s / 2) % 8]] + 12), t, dur: d * 3, tipo: "triangle", vol: 0.05, destino });
    if (s === 0 || s === 10) tono({ f: midi(ac[0] - 24), t, dur: d * 6, tipo: "sine", vol: 0.16, destino });
    if (s === 0) ac.forEach((m) => tono({ f: midi(m), t, dur: d * 14, tipo: "sine", vol: 0.025, ataque: 0.3, destino }));
    if (s % 4 === 2) ruido({ t, dur: 0.03, vol: 0.025, pasaAltos: 7000, destino });
  }

  pasoSuspenso(t, d) {
    const destino = this.bus;
    const i = this.intensidad;
    const s = this.paso % 16;
    const compas = Math.floor(this.paso / 16) % 4;
    const raiz = [45, 45, 41, 40][compas]; // La, La, Fa, Mi
    // bajo pulsante en corcheas
    if (s % 2 === 0) tono({ f: midi(raiz - 12), t, dur: d * 1.8, tipo: "sawtooth", vol: 0.1, filtro: 400 + 900 * i, destino });
    // latido (bombo) en negras
    if (s % 4 === 0) tono({ f: 110, f2: 40, t, dur: 0.18, tipo: "sine", vol: 0.35, destino });
    // arpegio agudo cuando sube la tensión
    if (i > 0.25) {
      const arp = [0, 3, 7, 12, 7, 3, 7, 10];
      tono({ f: midi(raiz + 24 + arp[s % 8]), t, dur: d * 0.9, tipo: "square", vol: 0.025 + 0.03 * i, filtro: 2500, destino });
    }
    // platillo en contratiempo
    if (i > 0.55 && s % 2 === 1) ruido({ t, dur: 0.04, vol: 0.03 + 0.05 * i, pasaAltos: 8000, destino });
    // cuerda tensa
    if (s === 0) tono({ f: midi(raiz + 12), t, dur: d * 16, tipo: "sawtooth", vol: 0.03 + 0.04 * i, filtro: 1200, ataque: 0.4, destino });
  }
}

// ---------- Voz ----------
export function anunciar(texto) {
  if (!("speechSynthesis" in window) || silenciado) return;
  const voces = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
  const voz = voces.find((v) => /es[-_]ar/i.test(v.lang)) ?? voces.find((v) => /natural|online/i.test(v.name)) ?? voces[0];
  const u = new SpeechSynthesisUtterance(texto);
  if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = "es-AR";
  u.rate = 0.95;
  u.pitch = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
