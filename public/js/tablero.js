import { ConexionSala, FLOR_DE_LIS } from "./conexion.js";

const $ = (id) => document.getElementById(id);
$("flor").innerHTML = FLOR_DE_LIS;

const grilla = $("grilla");
let celdas = [];
let anterior = null; // estado previo para detectar números nuevos

function armarGrilla(max) {
  grilla.style.setProperty("--filas", Math.ceil(max / 10));
  grilla.innerHTML = "";
  celdas = [null];
  for (let n = 1; n <= max; n++) {
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

  for (let n = 1; n <= e.maxNumero; n++) {
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
// Preferencias guardadas en este equipo
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let vozElegida = leer("bingo-voz-uri"); // voiceURI elegida a mano (null = automática)
let decirCifras = leer("bingo-cifras") === "1";

const haySintesis = "speechSynthesis" in window;
const selVoz = $("sel-voz");

/** Voces en español, de la más argentina a la menos. */
function vocesEnEspanol() {
  if (!haySintesis) return [];
  const puntaje = (v) => {
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    let p = l === "es-ar" ? 100 : /^es-(419|uy|py|cl|us|mx|co|pe|ve)/.test(l) ? 60 : l === "es-es" ? 20 : 40;
    if (/natural|online|neural/i.test(v.name)) p += 10; // voces de mejor calidad (Edge)
    return p;
  };
  return speechSynthesis.getVoices()
    .filter((v) => (v.lang || "").toLowerCase().startsWith("es"))
    .sort((a, b) => puntaje(b) - puntaje(a) || a.name.localeCompare(b.name));
}

function vozActual() {
  const voces = vocesEnEspanol();
  return voces.find((v) => v.voiceURI === vozElegida) ?? voces[0] ?? null;
}

function llenarVoces() {
  const voces = vocesEnEspanol();
  const actual = vozActual();
  selVoz.innerHTML = "";
  for (const v of voces) {
    const o = document.createElement("option");
    o.value = v.voiceURI;
    o.textContent = `${v.name.replace(/^Microsoft\s+/, "").replace(/\s*Online\s*\(Natural\)/, " (natural)")} · ${v.lang}`;
    o.selected = v === actual;
    selVoz.appendChild(o);
  }
  selVoz.disabled = voces.length === 0;
  const hayArgentina = voces.some((v) => /^es[-_]ar$/i.test(v.lang));
  $("nota-voz").textContent = !haySintesis
    ? "Este navegador no puede hablar."
    : voces.length === 0
      ? "No hay voces en español en este equipo."
      : hayArgentina
        ? ""
        : "No hay voz argentina en este equipo. Abrí el tablero en Microsoft Edge para tener a Elena o Tomás.";
}

if (haySintesis) {
  llenarVoces();
  speechSynthesis.addEventListener?.("voiceschanged", llenarVoces);
}
selVoz.addEventListener("change", () => {
  vozElegida = selVoz.value;
  guardar("bingo-voz-uri", vozElegida);
  hablar("¡Siempre listos!");
});
$("chk-cifras").checked = decirCifras;
$("chk-cifras").addEventListener("change", (ev) => {
  decirCifras = ev.target.checked;
  guardar("bingo-cifras", decirCifras ? "1" : "0");
});
$("btn-probar-voz").addEventListener("click", () => hablar(textoNumero(47)));

// Mostrar / ocultar el panel de voz
const panelVoz = $("panel-voz");
const btnAjustes = $("btn-ajustes-voz");
function abrirPanelVoz(si) {
  panelVoz.hidden = !si;
  btnAjustes.setAttribute("aria-expanded", String(si));
  if (si) llenarVoces();
}
btnAjustes.addEventListener("click", (ev) => { ev.stopPropagation(); abrirPanelVoz(panelVoz.hidden); });
panelVoz.addEventListener("click", (ev) => ev.stopPropagation());
document.addEventListener("click", () => abrirPanelVoz(false));
document.addEventListener("keydown", (ev) => ev.key === "Escape" && abrirPanelVoz(false));

function hablar(texto) {
  if (!haySintesis) return;
  const u = new SpeechSynthesisUtterance(texto);
  const voz = vozActual();
  if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = "es-AR";
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/** "¡47!" o, con cifras, "¡47! … cuatro, siete". */
function textoNumero(n) {
  if (!decirCifras || n < 10) return `¡${n}!`;
  return `¡${n}! … ${String(n).split("").join(", ")}`;
}

function cantar(n, forzar = false) {
  if (vozActiva || forzar) hablar(textoNumero(n));
}

// Repetir el último número (también lo puede pedir el panel del celular)
function repetir(desdeElPanel) {
  const n = anterior?.salidos.at(-1);
  if (n === undefined) return avisar("Todavía no salió ningún número");
  // Desde el tablero se canta aunque la voz esté apagada; desde el celular, solo si está prendida.
  cantar(n, !desdeElPanel);
  const el = $("ultimo");
  el.classList.remove("entra");
  void el.offsetWidth;
  el.classList.add("entra");
  if (desdeElPanel && !vozActiva) avisar(`Repetir: ¡${n}! (activá la voz para escucharlo)`);
}
$("btn-repetir").addEventListener("click", () => repetir(false));

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
  onMensaje: (m) => { if (m.tipo === "repetir") repetir(true); },
  onConectado: (ok) => {
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "En vivo" : "Reconectando…";
  },
});
