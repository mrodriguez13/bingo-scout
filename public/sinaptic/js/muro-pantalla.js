// Muro en la pantalla grande: carrusel de posts, reacciones flotantes y resumen final.
import { $, escapar, avisar } from "./efectos.js";
import { ding } from "./sonidos.js";

const TIPOS = {
  frase: { ico: "💬", nombre: "Frase" },
  gracias: { ico: "🙏", nombre: "Agradecimiento" },
  anecdota: { ico: "📖", nombre: "Anécdota" },
  foto: { ico: "📸", nombre: "Foto" },
};
const PARES = [["#333BA8", "#00909E"], ["#7C82E8", "#333BA8"], ["#00909E", "#4FD1DC"], ["#2B328F", "#7C82E8"], ["#006C76", "#333BA8"]];

let posts = [];
let conocidos = null;    // ids ya vistos (null = todavía no llegó la primera lista)
let cola = [];           // posts nuevos que salen antes que la rotación
let actual = null;       // post en pantalla
let timer = null;
let activo = false;      // la vista muro está visible
let ctl = { pausa: false, saltar: 0, destacar: null };
let conSonido = () => false;
let qrListo = false;

export function iniciarMuro(opciones) {
  conSonido = opciones.conSonido;
}

// ---------- Datos ----------
export function recibirPosts(lista) {
  const nuevos = conocidos ? lista.filter((p) => !conocidos.has(p.id)) : [];
  posts = lista;
  conocidos = new Set(lista.map((p) => p.id));
  for (const p of nuevos) {
    cola.push(p.id);
    if (activo) {
      avisar(`🔔 Nuevo de ${p.autor}`);
      if (conSonido()) ding();
    }
  }
  cola = cola.filter((id) => posts.some((p) => p.id === id));
  $("muro-total").textContent = posts.length;
  if (activo) {
    // si sacaron el post que se está mostrando, o no había nada, avanzar
    if (!actual || !posts.some((p) => p.id === actual.id)) siguiente();
  }
  pintarResumen();
}

/** Aplica los controles del admin (pausa, saltar, destacar). */
export function controlMuro(nuevo) {
  const antes = ctl;
  ctl = nuevo;
  $("muro-pausa").hidden = !ctl.pausa;
  if (!activo) return;
  if (ctl.destacar && ctl.destacar.n !== antes.destacar?.n) {
    cola = cola.filter((id) => id !== ctl.destacar.id);
    cola.unshift(ctl.destacar.id);
    return siguiente();
  }
  if (ctl.saltar !== antes.saltar) return siguiente();
  if (ctl.pausa !== antes.pausa) ctl.pausa ? pausar() : programar(duracion(actual));
}

export function mostrarMuro(si) {
  if (si === activo) return;
  activo = si;
  if (si) {
    dibujarQRMini();
    siguiente();
  } else {
    clearTimeout(timer);
    actual = null;
  }
}

// ---------- Carrusel ----------
function duracion(p) {
  if (!p) return 6000;
  const n = p.texto.length;
  if (p.tipo === "anecdota") return Math.min(25000, Math.max(9000, 4000 + n * 55));
  if (p.tipo === "foto") return 9000 + n * 40;
  return Math.min(14000, Math.max(7000, 4000 + n * 60));
}

function proximo() {
  while (cola.length) {
    const id = cola.shift();
    const p = posts.find((x) => x.id === id);
    if (p) return { post: p, nuevo: true };
  }
  if (!posts.length) return null;
  const i = actual ? posts.findIndex((x) => x.id === actual.id) : -1;
  return { post: posts[(i + 1) % posts.length], nuevo: false };
}

function siguiente() {
  clearTimeout(timer);
  const escena = $("muro-escena");
  const prox = proximo();
  if (!prox) {
    actual = null;
    escena.innerHTML = `<div class="muro-vacio"><div style="font-size:3em">💜</div><h2>El muro está esperando</h2><p>Escaneá el QR y compartí una frase, un agradecimiento, una anécdota o una foto.</p></div>`;
    $("muro-barra").style.width = "0";
    return;
  }
  const viejo = escena.querySelector(".post");
  const mostrar = () => {
    actual = prox.post;
    escena.innerHTML = htmlPost(prox.post, prox.nuevo);
    precargar();
    if (!ctl.pausa) programar(duracion(prox.post));
    else pausar();
  };
  if (viejo) {
    viejo.classList.add("sale");
    setTimeout(mostrar, 420);
  } else mostrar();
}

function programar(ms) {
  clearTimeout(timer);
  const barra = $("muro-barra");
  barra.style.transition = "none";
  barra.style.width = "0";
  void barra.offsetWidth;
  barra.style.transition = `width ${ms}ms linear`;
  barra.style.width = "100%";
  timer = setTimeout(siguiente, ms);
}

function pausar() {
  clearTimeout(timer);
  const barra = $("muro-barra");
  const ancho = getComputedStyle(barra).width;
  barra.style.transition = "none";
  barra.style.width = ancho;
}

function precargar() {
  const p = proximoSinConsumir();
  if (p?.foto) new Image().src = `/sinaptic/api/foto/${p.id}`;
}
function proximoSinConsumir() {
  const id = cola[0];
  if (id) return posts.find((x) => x.id === id);
  const i = actual ? posts.findIndex((x) => x.id === actual.id) : -1;
  return posts[(i + 1) % posts.length];
}

// ---------- HTML ----------
const slug = (n) => n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z0-9]+/g, "-");
function avatar(nombre) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [c1, c2] = PARES[h % PARES.length];
  return `<div class="avatar" style="--c1:${c1};--c2:${c2}">${escapar(nombre.trim().charAt(0).toUpperCase())}<img src="/sinaptic/img/equipo/${slug(nombre)}.webp" alt="" onerror="this.remove()"></div>`;
}

function hace(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

const largo = (t, corto, largoDesde) => (t.length <= corto ? "t-corto" : t.length >= largoDesde ? "t-largo" : "");

function htmlPost(p, nuevo) {
  const t = TIPOS[p.tipo];
  const cabecera = `<div class="post-tipo"><span>${t.ico} ${t.nombre}</span>${nuevo ? '<span class="badge-nuevo">nuevo</span>' : ""}</div>`;
  const autor = `<footer class="post-autor">${avatar(p.autor)}<div><strong>${escapar(p.autor)}</strong><span>${hace(p.creado)}</span></div></footer>`;
  let cuerpo = "";
  if (p.tipo === "foto") {
    cuerpo = `<img class="foto" src="/sinaptic/api/foto/${p.id}" alt="">${p.texto ? `<p class="post-texto">${escapar(p.texto)}</p>` : ""}`;
  } else if (p.tipo === "gracias") {
    cuerpo = `${p.para ? `<div class="post-para">Gracias, ${escapar(p.para)} 💜</div>` : ""}<p class="post-texto ${largo(p.texto, 50, 180)}">${escapar(p.texto)}</p>`;
  } else if (p.tipo === "anecdota") {
    cuerpo = `<p class="post-texto ${largo(p.texto, 0, 500)}">${escapar(p.texto)}</p>`;
  } else {
    cuerpo = `<p class="post-texto ${largo(p.texto, 40, 180)}">“${escapar(p.texto)}”</p>`;
  }
  return `<article class="post post-${p.tipo}${nuevo ? " nuevo" : ""}">${cabecera}${cuerpo}${autor}</article>`;
}

function dibujarQRMini() {
  if (qrListo || !window.QRCode) return;
  qrListo = true;
  const url = `${location.origin}/sinaptic/jugar`;
  $("url-mini").textContent = url.replace(/^https?:\/\//, "");
  new QRCode($("qr-mini"), { text: url, width: 256, height: 256, colorDark: "#0B0E2E", colorLight: "#FFFFFF", correctLevel: QRCode.CorrectLevel.M });
}

// ---------- Reacciones ----------
let flotando = 0;
export function reaccion(emoji) {
  if (flotando > 60) return;
  const el = document.createElement("span");
  el.className = "flota";
  el.textContent = emoji;
  el.style.left = `${8 + Math.random() * 84}%`;
  el.style.setProperty("--dx", `${(Math.random() - 0.5) * 12}vw`);
  el.style.fontSize = `${2 + Math.random() * 1.6}em`;
  $("reacciones-capa").appendChild(el);
  flotando++;
  setTimeout(() => { el.remove(); flotando--; }, 4300);
}

// ---------- Resumen ----------
let resumenActivo = false;
let desplazamiento = 0;
let ultimoCuadro = 0;

export function mostrarResumen(si) {
  if (si === resumenActivo) return;
  resumenActivo = si;
  if (si) {
    pintarResumen();
    ultimoCuadro = performance.now();
    requestAnimationFrame(desplazar);
  }
}

function pintarResumen() {
  if (!resumenActivo) return;
  const personas = new Set(posts.map((p) => p.autor.toLowerCase())).size;
  const cuenta = (t) => posts.filter((p) => p.tipo === t).length;
  $("resumen-cifras").innerHTML = [
    [posts.length, "recuerdos"], [cuenta("foto"), "fotos"], [cuenta("frase"), "frases"],
    [cuenta("gracias"), "agradecimientos"], [cuenta("anecdota"), "anécdotas"], [personas, "personas"],
  ].map(([n, t]) => `<span><strong>${n}</strong> ${t}</span>`).join("");
  $("mosaico").innerHTML = posts.length
    ? posts.map((p) => {
        const t = TIPOS[p.tipo];
        const img = p.foto ? `<img src="/sinaptic/api/foto/${p.id}" alt="" loading="lazy">` : "";
        const para = p.tipo === "gracias" && p.para ? `Gracias, ${escapar(p.para)}: ` : "";
        const texto = p.texto ? `<p>${para}${escapar(p.texto)}</p>` : "";
        return `<div class="teja t-${p.tipo}">${img}<div class="ico">${t.ico} ${t.nombre}</div>${texto}<div class="de">— ${escapar(p.autor)}</div></div>`;
      }).join("")
    : `<div class="muro-vacio"><h2>Todavía no hay recuerdos</h2></div>`;
}

function desplazar(ahora) {
  if (!resumenActivo) return;
  const dt = Math.min(100, ahora - ultimoCuadro);
  ultimoCuadro = ahora;
  const m = $("mosaico");
  const alto = m.scrollHeight - m.parentElement.clientHeight;
  if (alto > 0) {
    desplazamiento += dt * 0.03; // ~30 px por segundo
    if (desplazamiento > alto + 120) desplazamiento = -60; // vuelve a empezar
    m.style.transform = `translateY(${-Math.max(0, Math.min(alto, desplazamiento))}px)`;
  } else m.style.transform = "none";
  requestAnimationFrame(desplazar);
}
