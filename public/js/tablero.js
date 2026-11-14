import { ConexionSala, FLOR_DE_LIS } from "./conexion.js";

const $ = (id) => document.getElementById(id);
$("flor").innerHTML = FLOR_DE_LIS;

const grilla = $("grilla");
let celdas = [];
let anterior = null; // estado previo para detectar números nuevos

function armarGrilla(max) {
  grilla.style.setProperty("--filas", Math.ceil(max / 10));
  grilla.innerHTML = "";
  celdas = [];
  for (let n = 0; n < max; n++) {
    const d = document.createElement("div");
    d.className = "insignia";
    d.textContent = n;
    grilla.appendChild(d);
    celdas.push(d);
  }
}

function render(e) {
  if (!anterior || anterior.maxNumero !== e.maxNumero) armarGrilla(e.maxNumero);

  $("nombre-grupo").textContent = e.nombreGrupo;
  document.title = `${e.nombreGrupo} · Bingo`;
  $("contador").textContent = `${e.salidos.length} / ${e.maxNumero}`;

  const salidos = new Set(e.salidos);
  const ultimo = e.salidos.at(-1);
  const antesSalidos = new Set(anterior?.salidos ?? []);

  for (let n = 0; n < e.maxNumero; n++) {
    const c = celdas[n];
    const salio = salidos.has(n);
    c.classList.toggle("salio", salio);
    c.classList.toggle("ultimo", n === ultimo);
    if (salio && anterior && !antesSalidos.has(n)) {
      c.classList.remove("recien");
      void c.offsetWidth;
      c.classList.add("recien");
    }
  }

  // Número grande
  const el = $("ultimo");
  const ultimoAntes = anterior?.salidos.at(-1);
  if (ultimo === undefined) {
    el.textContent = "¡Siempre listos!";
    el.classList.add("vacio");
  } else {
    el.textContent = ultimo;
    el.classList.remove("vacio");
    if (ultimo !== ultimoAntes) {
      el.classList.remove("entra");
      void el.offsetWidth;
      el.classList.add("entra");
    }
  }

  // Historial (los 5 anteriores al último)
  const hist = e.salidos.slice(-6, -1).reverse();
  $("etiqueta-hist").hidden = hist.length === 0;
  $("historial").innerHTML = hist.map((n) => `<div class="insignia salio">${n}</div>`).join("");

  // Cantar el número nuevo
  if (anterior && ultimo !== undefined && ultimo !== ultimoAntes && !antesSalidos.has(ultimo)) cantar(ultimo);
  if (anterior && anterior.salidos.length > 0 && e.salidos.length === 0) avisar("Tablero reiniciado · ¡Siempre listos!");

  anterior = e;
}

// ---------- Voz ----------
let vozActiva = false;
try { vozActiva = localStorage.getItem("bingo-voz") === "1"; } catch {}
const btnVoz = $("btn-voz");
function pintarVoz() {
  btnVoz.textContent = vozActiva ? "🔊 Voz" : "🔇 Voz";
  btnVoz.setAttribute("aria-pressed", String(vozActiva));
}
pintarVoz();
btnVoz.addEventListener("click", () => {
  vozActiva = !vozActiva;
  try { localStorage.setItem("bingo-voz", vozActiva ? "1" : "0"); } catch {}
  pintarVoz();
  if (vozActiva) hablar("Voz activada");
});
function hablar(texto) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-AR";
  const voz = speechSynthesis.getVoices().find((v) => v.lang?.startsWith("es"));
  if (voz) u.voice = voz;
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function cantar(n) {
  if (vozActiva) hablar(`¡${n}!`);
}

// ---------- Pantalla completa y mantener encendida ----------
$("btn-pantalla").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
  pedirWakeLock();
});
let wakeLock = null;
async function pedirWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && pedirWakeLock());
document.addEventListener("click", pedirWakeLock, { once: true });
pedirWakeLock();

// ---------- Avisos ----------
let tAviso;
function avisar(txt) {
  const a = $("aviso");
  a.textContent = txt;
  a.className = "aviso visible";
  clearTimeout(tAviso);
  tAviso = setTimeout(() => (a.className = "aviso"), 3000);
}

// ---------- Conexión ----------
new ConexionSala({
  rol: "tablero",
  onEstado: render,
  onConectado: (ok) => {
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "En vivo" : "Reconectando…";
  },
});
