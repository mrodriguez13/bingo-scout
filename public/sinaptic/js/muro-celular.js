// Muro desde el celular: compartir frases, agradecimientos, anécdotas y fotos, y reaccionar.
import { $, confeti, avisar } from "./efectos.js";
import { activarAudio, audioActivo, tadaa, pop } from "./sonidos.js";

const LIMITES = { frase: 280, gracias: 280, anecdota: 800, foto: 200 };
const AYUDAS = {
  frase: "Una frase, una palabra, algo que te quedó del año…",
  gracias: "¿Qué le querés agradecer?",
  anecdota: "Contá esa anécdota que nadie se olvida…",
  foto: "Escribí algo sobre la foto (opcional)",
};

let token = "";
let nombreActual = () => "";
let enviarWs = () => false;
let tipo = "frase";
let fotoDataUrl = null;
let estado = null;

export function iniciarMuroCelular(opciones) {
  ({ token } = opciones);
  nombreActual = opciones.nombre;
  enviarWs = opciones.enviar;

  $("btn-compartir").addEventListener("click", abrir);
  $("btn-cerrar-hoja").addEventListener("click", cerrar);
  $("hoja").addEventListener("click", (ev) => ev.target === $("hoja") && cerrar());
  for (const b of document.querySelectorAll("[data-tipo]")) b.addEventListener("click", () => elegirTipo(b.dataset.tipo));
  $("post-texto").addEventListener("input", contarLetras);
  $("post-foto").addEventListener("change", elegirFoto);
  $("form-post").addEventListener("submit", publicar);

  for (const b of document.querySelectorAll("[data-emoji]")) {
    b.addEventListener("click", () => {
      enviarWs({ tipo: "reaccion", emoji: b.dataset.emoji });
      navigator.vibrate?.(15);
      b.animate([{ transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 250 });
    });
  }
}

export function actualizarMuroCelular(e) {
  estado = e;
  const abierto = e.muroAbierto;
  $("btn-compartir").hidden = !abierto;
  $("espera-muro").hidden = !abierto;
  $("reacciones").hidden = e.modo !== "muro";
  $("reacciones").style.paddingBottom = abierto ? "" : "max(14px, env(safe-area-inset-bottom))";
  document.body.classList.toggle("con-acciones", abierto || e.modo === "muro");
  if (!abierto && !$("hoja").hidden) {
    cerrar();
    avisar("El muro se cerró por ahora", "error");
  }
}

function abrir() {
  activarAudio();
  const nombre = nombreActual();
  $("post-nombre").hidden = !!nombre;
  if (!nombre) {
    try { $("post-nombre").value = localStorage.getItem("fest-nombre") ?? ""; } catch {}
  }
  $("error-post").textContent = "";
  $("hoja").hidden = false;
  elegirTipo(tipo);
}

function cerrar() {
  $("hoja").hidden = true;
}

function elegirTipo(t) {
  tipo = t;
  for (const b of document.querySelectorAll("[data-tipo]")) b.classList.toggle("activo", b.dataset.tipo === t);
  $("post-para").hidden = t !== "gracias";
  $("foto-zona").hidden = t !== "foto";
  const ta = $("post-texto");
  ta.placeholder = AYUDAS[t];
  ta.maxLength = LIMITES[t];
  ta.rows = t === "anecdota" ? 7 : t === "foto" ? 2 : 4;
  contarLetras();
}

function contarLetras() {
  const n = $("post-texto").value.length;
  $("contador-letras").textContent = `${n} / ${LIMITES[tipo]}`;
}

async function elegirFoto() {
  const archivo = $("post-foto").files?.[0];
  if (!archivo) return;
  $("foto-texto").textContent = "Procesando…";
  try {
    fotoDataUrl = await comprimir(archivo);
    $("foto-preview").src = fotoDataUrl;
    $("foto-preview").hidden = false;
    $("foto-texto").hidden = true;
  } catch {
    fotoDataUrl = null;
    $("foto-texto").textContent = "No se pudo leer la foto. Probá con otra.";
  }
}

/** Achica la foto a 1280 px de lado como máximo y la pasa a JPEG. */
async function comprimir(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const escala = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let datos = c.toDataURL("image/jpeg", 0.82);
    if (datos.length > 1_800_000) datos = c.toDataURL("image/jpeg", 0.6);
    return datos;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function publicar(ev) {
  ev.preventDefault();
  const err = $("error-post");
  err.textContent = "";
  const nombre = nombreActual() || $("post-nombre").value.replace(/\s+/g, " ").trim();
  const texto = $("post-texto").value.trim();
  if (nombre.length < 2) return (err.textContent = "Poné tu nombre");
  if (tipo === "foto" && !fotoDataUrl) return (err.textContent = "Elegí una foto");
  if (tipo !== "foto" && texto.length < 2) return (err.textContent = "Escribí algo para compartir");
  try { localStorage.setItem("fest-nombre", nombre); } catch {}

  const btn = $("btn-publicar");
  btn.disabled = true;
  btn.textContent = "Publicando…";
  try {
    const r = await fetch("/sinaptic/api/publicar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, nombre, tipo, texto, para: $("post-para").value, foto: tipo === "foto" ? fotoDataUrl : undefined }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || "No se pudo publicar");
    // listo: limpiar y festejar
    $("post-texto").value = "";
    $("post-para").value = "";
    $("post-foto").value = "";
    fotoDataUrl = null;
    $("foto-preview").hidden = true;
    $("foto-texto").hidden = false;
    $("foto-texto").textContent = "📷 Tocá para elegir o sacar una foto";
    cerrar();
    avisar(estado?.modo === "muro" ? "¡Publicado! 💜 Mirá la pantalla" : "¡Publicado! 💜 Sale en el muro de la pantalla");
    if (audioActivo()) tadaa();
    navigator.vibrate?.([60, 30, 90]);
    confeti(120, { x: 0.5, y: 0.6 });
  } catch (e) {
    err.textContent = e.message === "Failed to fetch" ? "Sin conexión. Probá de nuevo." : e.message;
    if (audioActivo()) pop();
  } finally {
    btn.disabled = false;
    btn.textContent = "Publicar en pantalla 🚀";
  }
}
