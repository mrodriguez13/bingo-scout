import { $, conectar, formatos, confeti, avisar, escapar, proximoPremio, candidatos } from "./efectos.js";
import { Ruleta } from "./ruleta.js";
import { activarAudio, silenciar, Musica, tick, ding, whoosh, redoble, fanfarria, teclado, anunciar } from "./sonidos.js";

let estado = null;
let arrancado = false;
let silencio = false;
let girandoId = null;   // giro que se está animando
let tRevelacion;
const musica = new Musica();
const ruleta = new Ruleta($("ruleta"));
const URL_JUGAR = `${location.origin}/sinaptic/jugar`;

// ---------- Arranque (habilita audio) ----------
$("btn-arrancar").addEventListener("click", () => {
  activarAudio();
  arrancado = true;
  $("arranque").hidden = true;
  ajustarMusica();
  pedirWakeLock();
});
$("btn-sonido").addEventListener("click", () => {
  silencio = !silencio;
  silenciar(silencio);
  $("btn-sonido").textContent = silencio ? "🔇" : "🔊";
});
$("btn-pantalla").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

function ajustarMusica() {
  if (!arrancado || girandoId !== null) return;
  if (estado?.fase === "espera" || estado?.fase === "inscripcion") musica.iniciar("lobby");
  else musica.detener();
}

// ---------- Render ----------
function render(e) {
  const anterior = estado;
  estado = e;
  for (const f of ["espera", "inscripcion", "sorteo"]) {
    $(`f-${f}`).hidden = (e.fase === "cerrada" ? "sorteo" : e.fase) !== f;
  }
  $("contador").hidden = e.participantes.length === 0;
  $("contador").textContent = `${e.participantes.length} participantes`;

  if (e.fase === "inscripcion") {
    dibujarQR();
    pintarMuro(anterior);
    if (anterior && anterior.fase !== "inscripcion") intro();
  }
  if (e.fase === "cerrada") pintarSorteo(anterior);
  if (anterior && anterior.fase !== e.fase) {
    $("revelacion").hidden = true;
    ajustarMusica();
  }
}

// ---------- QR y muro ----------
let qrListo = false;
function dibujarQR() {
  if (qrListo || !window.QRCode) return;
  qrListo = true;
  $("url").textContent = URL_JUGAR.replace(/^https?:\/\//, "");
  new QRCode($("qr"), { text: URL_JUGAR, width: 512, height: 512, colorDark: "#0B0E2E", colorLight: "#FFFFFF", correctLevel: QRCode.CorrectLevel.M });
}

function pintarMuro(anterior) {
  const antes = new Set(anterior?.participantes.map((p) => p.numero) ?? []);
  const nuevos = anterior ? estado.participantes.filter((p) => !antes.has(p.numero)) : [];
  $("cant-nodos").textContent = estado.participantes.length;
  const muro = $("muro");
  if (estado.participantes.length === 0) {
    muro.innerHTML = `<p class="vacio mono">&gt; esperando el primer valiente…<span class="cursor">▋</span></p>`;
    return;
  }
  // los más nuevos primero
  muro.innerHTML = [...estado.participantes].reverse().map((p) => {
    const nuevo = nuevos.some((n) => n.numero === p.numero);
    return `<span class="chip${nuevo ? " nuevo" : ""}"><span class="num">${p.numero}</span>${escapar(p.nombre)}</span>`;
  }).join("");
  if (nuevos.length) {
    if (arrancado) ding();
    const n = nuevos.at(-1);
    avisar(nuevos.length > 1 ? `🟣 ${nuevos.length} nuevos nodos conectados` : `🟣 ${n.nombre} se unió con el ${n.numero}`);
  }
}

// ---------- Sorteo ----------
function pintarSorteo(anterior) {
  const e = estado;
  const giro = e.giro;
  const giroNuevo = giro && anterior && giro.id !== anterior.giro?.id;

  if (giroNuevo) return girar(giro);
  if (girandoId !== null) return; // no tocar nada mientras gira

  pintarGanadores();
  if (giro && !anterior) {
    // se cargó la página con un sorteo ya hecho: mostrar el resultado quieto
    ruleta.setItems(itemsDe(giro.candidatos));
    ruleta.mostrar(giro.numero);
    $("ruleta-centro").textContent = giro.numero;
  } else if (!ruleta.girando) {
    const idx = proximoPremio(e);
    $("premio-actual").innerHTML = idx === null
      ? "¡Se sortearon todos los premios! 🎉"
      : `<span class="de">PREMIO ${idx + 1} DE ${e.premios.length}</span>${escapar(e.premios[idx])}`;
    const lista = candidatos(e);
    const mismaLista = ruleta.items.length === lista.length && ruleta.items.every((x, i) => x.numero === lista[i].numero);
    if (!mismaLista || giro === null) {
      ruleta.setItems(lista);
      $("ruleta-centro").textContent = "?";
    }
  }
}

function itemsDe(numeros) {
  return numeros.map((n) => estado.participantes.find((p) => p.numero === n) ?? { numero: n, nombre: "?" });
}

function pintarGanadores() {
  const lista = estado.ganadores.filter((g) => !(girandoId !== null && estado.giro?.id === girandoId && g.numero === estado.giro.numero && g.premioIdx === estado.giro.premioIdx));
  const sorteados = new Set(lista.map((g) => g.premioIdx));
  const filas = lista.map((g) => `<li><span class="num">${g.numero}</span><span class="nom">${escapar(g.nombre)}</span><span class="pre">${escapar(g.premio)}</span></li>`);
  const pendientes = estado.premios.map((p, i) => [p, i]).filter(([, i]) => !sorteados.has(i))
    .map(([p]) => `<li class="pendiente"><span class="num">—</span><span class="nom">?</span><span class="pre">${escapar(p)}</span></li>`);
  $("ganadores").innerHTML = filas.concat(pendientes).join("");
}

const MENSAJES_GIRO = [
  "Corriendo los tests…", "Haciendo merge a main…", "Esperando aprobación del PR…", "Reiniciando el router…",
  "Consultando a Stack Overflow…", "Limpiando la caché de la suerte…", "Compilando suerte.exe…",
  "git push --force (no se hace en casa)…", "Escalando a soporte nivel 2…", "Desplegando a producción un viernes…",
];

async function girar(giro) {
  clearTimeout(tRevelacion);
  $("revelacion").hidden = true;
  girandoId = giro.id;
  pintarGanadores();
  ruleta.setItems(itemsDe(giro.candidatos));
  $("premio-actual").innerHTML = `<span class="de">PREMIO ${giro.premioIdx + 1} DE ${estado.premios.length}</span>${escapar(estado.premios[giro.premioIdx] ?? "")}`;
  $("ruleta-centro").textContent = "?";
  $("ruleta-marco").classList.add("girando");

  musica.detener(0.2);
  if (arrancado) {
    whoosh();
    musica.iniciar("suspenso");
  }
  let iMsg = 0;
  const linea = $("linea-sorteo");
  linea.textContent = `> ${MENSAJES_GIRO[(Math.random() * MENSAJES_GIRO.length) | 0]}`;
  const tMsg = setInterval(() => { linea.textContent = `> ${MENSAJES_GIRO[(iMsg++ * 7 + 3) % MENSAJES_GIRO.length]}`; }, 1500);
  let redobleListo = false;
  let ultimoTick = 0;

  await ruleta.girarHasta(giro.numero, giro.duracion, {
    onTick: (vel) => {
      const ahora = performance.now();
      if (arrancado && ahora - ultimoTick > 35) { tick(0.7 + vel * 0.6); ultimoTick = ahora; }
    },
    onProgreso: (t) => {
      musica.intensidad = Math.min(1, t * 1.15);
      if (arrancado && !redobleListo && t > 0.72) {
        redobleListo = true;
        musica.detener(1.2);
        redoble((giro.duracion * 0.28) / 1000);
      }
    },
  });

  clearInterval(tMsg);
  $("ruleta-marco").classList.remove("girando");
  musica.detener(0.1);
  girandoId = null;

  // ¿Lo deshicieron mientras giraba?
  if (estado.giro?.id !== giro.id) return pintarSorteo(null);

  const g = estado.ganadores.find((x) => x.numero === giro.numero && x.premioIdx === giro.premioIdx) ??
    { ...itemsDe([giro.numero])[0], premio: estado.premios[giro.premioIdx] };
  $("ruleta-centro").textContent = g.numero;
  linea.textContent = `> ¡Tenemos ganador! exit 0 ✔`;
  revelar(g);
  pintarGanadores();
}

function revelar(g) {
  $("rev-premio").textContent = `🏆 ${g.premio}`;
  $("rev-numero").textContent = g.numero;
  $("rev-nombre").textContent = g.nombre;
  const f = formatos(g.numero);
  $("rev-formatos").innerHTML = `<span>${f.bin}</span><span>${f.hex}</span>`;
  $("rev-frase").textContent = g.frase ? `“${g.frase}”` : "";
  const r = $("revelacion");
  r.hidden = false;
  // reiniciar animaciones
  for (const el of r.querySelectorAll("*")) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
  if (arrancado) {
    fanfarria();
    setTimeout(() => anunciar(`¡Ganó el número ${g.numero}! ¡Felicitaciones, ${g.nombre}!`), 1500);
  }
  confeti(320, { x: 0.5, y: 0.3 });
  setTimeout(() => confeti(160, { x: 0.15, y: 0.6 }), 600);
  setTimeout(() => confeti(160, { x: 0.85, y: 0.6 }), 1000);
  tRevelacion = setTimeout(() => (r.hidden = true), 25000);
}
$("revelacion").addEventListener("click", () => ($("revelacion").hidden = true));

// ---------- Intro tipo terminal ----------
async function intro() {
  const el = $("intro");
  const pre = $("intro-texto");
  el.hidden = false;
  pre.innerHTML = "";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const escribir = async (html, vel = 28) => {
    const tmp = document.createElement("span");
    pre.appendChild(tmp);
    const texto = html.replace(/<[^>]+>/g, "");
    for (let i = 1; i <= texto.length; i++) {
      tmp.textContent = texto.slice(0, i);
      if (arrancado && i % 2 === 0) teclado();
      await espera(vel);
    }
    tmp.innerHTML = html;
    pre.appendChild(document.createTextNode("\n"));
  };
  await escribir(`<span class="lav">$</span> sudo ./sinaptic-fest --modo=fiesta`);
  await espera(300);
  await escribir(`[sudo] contraseña para sinaptic: ********`, 22);
  await espera(250);
  await escribir(`<span class="ok">✔</span> Cargando frases friki…`, 14);
  await escribir(`<span class="ok">✔</span> Calibrando la ruleta…`, 14);
  await escribir(`<span class="ok">✔</span> Compilando suerte.exe… 99%… 99%… 99%… 100%`, 18);
  await escribir(`<span class="ok">✔</span> Inscripción ABIERTA 🚀`, 20);
  await espera(1100);
  el.hidden = true;
}

// ---------- Mensajes de espera ----------
const ESPERAS = [
  "calentando los servidores…", "afinando la ruleta…", "inflando globos (en la nube)…",
  "cargando frases friki…", "buscando la pizza en el backlog…", "esperando que llegue todo el equipo…",
];
(async function maquinaDeEscribir() {
  const el = $("espera-linea");
  for (let i = 0; ; i++) {
    const t = ESPERAS[i % ESPERAS.length];
    for (let k = 1; k <= t.length; k++) { el.textContent = t.slice(0, k); await new Promise((r) => setTimeout(r, 45)); }
    await new Promise((r) => setTimeout(r, 2200));
    for (let k = t.length; k >= 0; k--) { el.textContent = t.slice(0, k); await new Promise((r) => setTimeout(r, 18)); }
  }
})();

// ---------- Easter egg: código Konami ----------
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let iKonami = 0;
addEventListener("keydown", (ev) => {
  iKonami = ev.key === KONAMI[iKonami] ? iKonami + 1 : ev.key === KONAMI[0] ? 1 : 0;
  if (iKonami === KONAMI.length) {
    iKonami = 0;
    const on = document.body.classList.toggle("arcoiris");
    avisar(on ? "🌈 Modo arcoíris desbloqueado. +30 de carisma." : "Modo arcoíris desactivado");
    if (on) confeti(200);
  }
});

// ---------- Mantener la pantalla encendida ----------
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

// ---------- Conexión ----------
conectar("pantalla", {
  onEstado: render,
  onConectado: (ok) => {
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "en vivo" : "reconectando…";
  },
});

