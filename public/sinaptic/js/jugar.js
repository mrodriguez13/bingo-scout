import { $, conectar, formatos, confeti, avisar } from "./efectos.js";
import { activarAudio, audioActivo, tick, tadaa, error as sonidoError } from "./sonidos.js";
import { iniciarMuroCelular, actualizarMuroCelular } from "./muro-celular.js";

// ---------- Identidad del celular ----------
let token = null;
try { token = localStorage.getItem("fest-token"); } catch {}
if (!token) {
  token = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, "");
  try { localStorage.setItem("fest-token", token); } catch {}
}

let estado = null;
let yo = null;            // { numero, nombre, frase } o null
let sabemosQuienSoy = false;
let animando = false;     // tragamonedas en curso
let giroVisto = null;     // id del último giro conocido
let giroEnCurso = null;   // giro que se está mostrando (suspenso)
let resolverUnirme = null;

// ---------- Pantallas ----------
const PANTALLAS = ["s-espera", "s-form", "s-girando", "s-numero", "s-cerrada"];
function mostrar(id) {
  for (const p of PANTALLAS) $(p).hidden = p !== id;
}

function render() {
  if (!estado || !sabemosQuienSoy || animando) return;
  if (yo) {
    pintarNumero();
    mostrar("s-numero");
  } else if (estado.fase === "inscripcion") mostrar("s-form");
  else if (estado.fase === "espera") mostrar("s-espera");
  else mostrar("s-cerrada");
  pintarBanner();
}

function pintarNumero(revelar = false) {
  $("mi-nombre").textContent = yo.nombre;
  const num = $("mi-numero");
  num.textContent = yo.numero;
  num.classList.toggle("revelar", revelar);
  const f = formatos(yo.numero);
  $("mi-formatos").innerHTML = `<span>${f.bin}</span><span>${f.hex}</span>`;
  $("mi-frase").textContent = `“${yo.frase}”`;
}

function pintarBanner() {
  const b = $("banner");
  if (!yo || !estado) return (b.hidden = true);
  if (giroEnCurso) {
    b.hidden = false;
    b.className = "banner girando";
    b.innerHTML = `🎰 Girando la ruleta por<br>${esc(estado.premios[giroEnCurso.premioIdx] ?? "un premio")}…`;
    return;
  }
  const mios = estado.ganadores.filter((g) => g.numero === yo.numero);
  if (mios.length) {
    b.hidden = false;
    b.className = "banner gane";
    b.innerHTML = `🏆 ¡GANASTE!<span class="chico">${mios.map((g) => esc(g.premio)).join(" + ")}</span>`;
    return;
  }
  const ultimo = estado.ganadores.at(-1);
  if (ultimo) {
    b.hidden = false;
    b.className = "banner";
    b.innerHTML = `Último ganador: <span class="mono">${ultimo.numero}</span> · ${esc(ultimo.nombre)}<span class="chico">${esc(ultimo.premio)} · ¡seguí participando! 🤞</span>`;
  } else b.hidden = true;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Formulario ----------
$("form-nombre").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  activarAudio();
  const nombre = $("nombre").value.replace(/\s+/g, " ").trim();
  $("error-form").textContent = "";
  if (nombre.length < 2) return fallar("Poné tu nombre (al menos 2 letras)");
  if (/^(admin|root|sudo)$/i.test(nombre)) return fallar("Buen intento 😏 Poné tu nombre de verdad");
  if (!sala.enviar({ tipo: "unirme", token, nombre })) return fallar("Sin conexión. Esperá un toque y probá de nuevo.");

  const respuesta = new Promise((r) => (resolverUnirme = r));
  animando = true;
  mostrar("s-girando");
  const resultado = await tragamonedas(respuesta);
  animando = false;
  if (!resultado) {
    render();
    return fallar(ultimoError || "No se pudo asignar el número. Probá de nuevo.");
  }
  yo = resultado;
  pintarNumero(true);
  mostrar("s-numero");
  pintarBanner();
  if (audioActivo()) tadaa();
  navigator.vibrate?.([80, 40, 140]);
  confeti(160, { x: 0.5, y: 0.4 });
});

function fallar(msg) {
  $("error-form").textContent = msg;
  if (audioActivo()) sonidoError();
  navigator.vibrate?.(120);
}

// ---------- Tragamonedas ----------
const FALSOS = [7, 13, 42, 64, 99, 127, 200, 256, 404, 418, 500, 777, 1024, 1337, 2048, 8080, 9000, 31337];
const LINEAS = ["> generando entropía…", "> consultando al oráculo…", "> compilando suerte.exe…", "> resolviendo dependencias de la fortuna…", "> casi…"];
let ultimoError = "";

async function tragamonedas(respuesta) {
  const rodillo = $("rodillo");
  const mostrarNum = (n) => {
    rodillo.innerHTML = `<div>${n}</div>`;
    rodillo.animate([{ transform: "translateY(-40%)", opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 90, easing: "ease-out" });
    if (audioActivo()) tick(0.8 + Math.random() * 0.4);
  };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let resultado;
  let listo = false;
  respuesta.then((r) => { resultado = r; listo = true; });
  const t0 = performance.now();
  let linea = 0;
  while (!listo || performance.now() - t0 < 2400) {
    mostrarNum(FALSOS[(Math.random() * FALSOS.length) | 0]);
    if ((performance.now() - t0) / 600 > linea) $("girando-linea").textContent = LINEAS[Math.min(linea++, LINEAS.length - 1)];
    await espera(55);
    if (performance.now() - t0 > 12000) break; // sin respuesta del servidor
  }
  if (!resultado) return null;
  for (const d of [80, 100, 130, 170, 220, 290, 380]) {
    mostrarNum(FALSOS[(Math.random() * FALSOS.length) | 0]);
    navigator.vibrate?.(8);
    await espera(d);
  }
  mostrarNum(resultado.numero);
  await espera(500);
  return resultado;
}

// ---------- Mensajes de espera ----------
const ESPERAS = ["esperando señal del servidor", "haciendo ping a la suerte", "calentando los transistores", "cargando frases friki", "sincronizando relojes atómicos"];
let iEspera = 0;
setInterval(() => { $("espera-linea").textContent = ESPERAS[++iEspera % ESPERAS.length]; }, 2800);

// ---------- Conexión ----------
function alEstado(e) {
  const primero = estado === null;
  estado = e;
  actualizarMuroCelular(e);
  // ¿Me borraron?
  if (yo && !e.participantes.some((p) => p.numero === yo.numero)) yo = null;
  else if (yo) yo = e.participantes.find((p) => p.numero === yo.numero);

  // Giro nuevo de la ruleta
  const id = e.giro?.id ?? null;
  if (!primero && id !== null && id !== giroVisto) {
    const giro = e.giro;
    giroEnCurso = giro;
    setTimeout(() => {
      if (giroEnCurso !== giro) return;
      giroEnCurso = null;
      pintarBanner();
      if (yo && giro.numero === yo.numero) {
        confeti(260);
        if (audioActivo()) tadaa();
        navigator.vibrate?.([200, 80, 200, 80, 400]);
      }
    }, giro.duracion + 400);
  }
  if (id === null) giroEnCurso = null;
  giroVisto = id;
  render();
}

const sala = conectar("jugador", {
  onEstado: alEstado,
  onMensaje: (m) => {
    if (m.tipo === "yo") {
      sabemosQuienSoy = true;
      if (resolverUnirme) {
        resolverUnirme(m.participante);
        resolverUnirme = null;
      } else {
        yo = m.participante;
        render();
      }
    } else if (m.tipo === "error") {
      if (resolverUnirme) {
        ultimoError = m.mensaje;
        resolverUnirme(null);
        resolverUnirme = null;
      } else avisar(m.mensaje, "error");
    }
  },
  onConectado: (ok) => {
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "en vivo" : "reconectando…";
    if (ok) sala.enviar({ tipo: "hola", token });
  },
});

iniciarMuroCelular({
  token,
  nombre: () => yo?.nombre ?? "",
  enviar: (cmd) => sala.enviar(cmd),
});
