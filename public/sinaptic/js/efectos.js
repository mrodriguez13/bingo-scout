// Utilidades visuales compartidas: confeti, formato friki y conexión.
import { ConexionSala } from "/js/conexion.js";

export const $ = (id) => document.getElementById(id);

/** Conexión a la sala del Sinaptic Fest. */
export function conectar(rol, opciones) {
  return new ConexionSala({ rol, ruta: "/sinaptic/ws", ...opciones });
}

/** 42 → { bin: "0b101010", hex: "0x2A" } */
export function formatos(n) {
  return { bin: "0b" + n.toString(2), hex: "0x" + n.toString(16).toUpperCase() };
}

export const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Confeti con los colores de Sinaptic ----------
const COLORES = ["#333BA8", "#00909E", "#7C82E8", "#4FD1DC", "#FFFFFF", "#B9BCF5"];
let lienzo = null;
let particulas = [];
let animando = false;

export function confeti(cantidad = 220, origen = null) {
  if (!lienzo) {
    lienzo = document.createElement("canvas");
    lienzo.className = "confeti";
    Object.assign(lienzo.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "50" });
    document.body.appendChild(lienzo);
  }
  const W = (lienzo.width = innerWidth * devicePixelRatio);
  const H = (lienzo.height = innerHeight * devicePixelRatio);
  const ox = origen?.x ?? 0.5;
  const oy = origen?.y ?? 0.35;
  for (let i = 0; i < cantidad; i++) {
    const ang = Math.random() * Math.PI * 2;
    const vel = (6 + Math.random() * 14) * devicePixelRatio;
    particulas.push({
      x: W * ox, y: H * oy,
      vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 8 * devicePixelRatio,
      w: (6 + Math.random() * 8) * devicePixelRatio, h: (3 + Math.random() * 5) * devicePixelRatio,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORES[(Math.random() * COLORES.length) | 0], vida: 0,
    });
  }
  if (!animando) requestAnimationFrame(cuadro);
}

function cuadro() {
  animando = true;
  const c = lienzo.getContext("2d");
  c.clearRect(0, 0, lienzo.width, lienzo.height);
  const g = 0.35 * devicePixelRatio;
  particulas = particulas.filter((p) => p.y < lienzo.height + 40 && p.vida < 420);
  for (const p of particulas) {
    p.vida++;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + g;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.cos(p.vida * 0.15));
    c.fillStyle = p.color;
    c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
  }
  if (particulas.length) requestAnimationFrame(cuadro);
  else { animando = false; c.clearRect(0, 0, lienzo.width, lienzo.height); }
}

// ---------- Aviso tipo toast ----------
let tAviso;
export function avisar(txt, tipo = "") {
  let a = $("aviso");
  if (!a) {
    a = document.createElement("div");
    a.id = "aviso";
    a.className = "aviso";
    document.body.appendChild(a);
  }
  a.textContent = txt;
  a.className = `aviso visible ${tipo}`;
  clearTimeout(tAviso);
  tAviso = setTimeout(() => (a.className = "aviso"), 3500);
}

/** Próximo premio sin ganador (o null). */
export function proximoPremio(e) {
  const sorteados = new Set(e.ganadores.map((g) => g.premioIdx));
  const idx = e.premios.findIndex((_, i) => !sorteados.has(i));
  return idx === -1 ? null : idx;
}

/** Participantes que pueden ganar el próximo premio. */
export function candidatos(e) {
  const ya = new Set(e.ganadores.map((g) => g.numero));
  return e.participantes.filter((p) => e.permitirRepetir || !ya.has(p.numero));
}
