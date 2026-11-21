// Premio al mejor compañero/a: nominados, reflector, eliminación glitch y logros.
// El resultado viene de la encuesta; la animación es puro show.
import { $, confeti, escapar } from "./efectos.js";
import { tick, glitch, logro, redoble, fanfarria, teclado, anunciar } from "./sonidos.js";

const TITULO_PREVIO = "¿Quién es el/la mejor compañero/a 2026?";
const PARES = [["#333BA8", "#00909E"], ["#7C82E8", "#333BA8"], ["#00909E", "#4FD1DC"], ["#2B328F", "#7C82E8"], ["#006C76", "#333BA8"]];

let showActual = 0;   // id del show en curso (para cancelarlo)
let configPintada = "";
let ctx = null;       // { conSonido: () => bool, musica }

export function iniciarCompa(opciones) {
  ctx = opciones;
}

const inicial = (n) => n.trim().charAt(0).toUpperCase();
const colores = (i) => `--c1:${PARES[i % PARES.length][0]};--c2:${PARES[i % PARES.length][1]}`;

function pintarNominados(compa) {
  $("nominados").innerHTML = compa.nominados.map((n, i) =>
    `<div class="nominado" data-nombre="${escapar(n)}" style="animation-delay:${i * 60}ms">
       <div class="avatar" style="${colores(i)}">${escapar(inicial(n))}</div>
       <div class="nom">${escapar(n)}</div>
     </div>`).join("");
}

function pintarFinal(compa, conLogros) {
  const i = Math.max(0, compa.nominados.indexOf(compa.ganadora));
  const av = $("final-avatar");
  av.textContent = inicial(compa.ganadora);
  av.setAttribute("style", colores(i));
  $("final-nombre").textContent = compa.ganadora;
  $("final-titulo").textContent = compa.titulo;
  $("logros").innerHTML = conLogros ? compa.motivos.map(htmlLogro).join("") : "";
  $("compa-final").hidden = false;
}

function htmlLogro(m) {
  // separa el emoji inicial (si lo hay) del texto
  const match = m.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
  const ico = match ? match[1] : "⭐";
  const txt = match ? match[2] : m;
  return `<li class="logro"><span class="ico">${ico}</span><span class="txt"><small>Logro desbloqueado</small><span>${escapar(txt)}</span></span></li>`;
}

/** Pinta la vista según el estado; arranca el show si hay una revelación nueva. */
export function pintarCompa(e, anterior) {
  const compa = e.compa;
  const firma = JSON.stringify(compa);
  const revNueva = e.revelacion !== null && anterior !== null && e.revelacion !== anterior?.revelacion;

  if (revNueva) return show(compa);

  if (e.revelacion === null) {
    // estado previo: nominados quietos
    if (showActual || configPintada !== firma || !$("compa-final").hidden || anterior?.revelacion !== null) {
      cancelar();
      $("compa-final").hidden = true;
      $("compa-terminal").hidden = true;
      $("compa-sub").textContent = "premio especial";
      $("compa-titulo").textContent = TITULO_PREVIO;
      $("compa-linea").innerHTML = "&nbsp;";
      pintarNominados(compa);
      configPintada = firma;
    }
  } else if (!showActual && (anterior === null || configPintada !== firma)) {
    // se cargó la página con el premio ya revelado: mostrar el final quieto
    $("compa-titulo").textContent = compa.titulo;
    pintarNominados(compa);
    for (const el of document.querySelectorAll(".nominado")) {
      el.classList.toggle("ganadora", el.dataset.nombre === compa.ganadora);
      el.classList.toggle("fuera", el.dataset.nombre !== compa.ganadora);
    }
    pintarFinal(compa, true);
    configPintada = firma;
  }
}

function cancelar() {
  showActual = 0;
  ctx?.musica.detener(0.3);
}

class Cancelado extends Error {}

async function show(compa) {
  const id = ++showActual + Math.random();
  showActual = id;
  const vivo = () => { if (showActual !== id) throw new Cancelado(); };
  const espera = async (ms) => { await new Promise((r) => setTimeout(r, ms)); vivo(); };
  const sonido = () => ctx?.conSonido();
  const linea = $("compa-linea");

  try {
    $("compa-final").hidden = true;
    $("compa-sub").textContent = "premio especial";
    $("compa-titulo").textContent = TITULO_PREVIO;
    pintarNominados(compa);
    configPintada = JSON.stringify(compa);
    ctx?.musica.detener(0.2);

    // ---- Acto 1: procesando la encuesta ----
    const term = $("compa-terminal");
    const pre = $("compa-terminal-texto");
    term.hidden = false;
    pre.innerHTML = "";
    const escribir = async (html, vel = 22) => {
      const span = document.createElement("span");
      pre.appendChild(span);
      const texto = html.replace(/<[^>]+>/g, "");
      for (let i = 1; i <= texto.length; i++) {
        span.textContent = texto.slice(0, i);
        if (sonido() && i % 2 === 0) teclado();
        await espera(vel);
      }
      span.innerHTML = html;
      pre.appendChild(document.createTextNode("\n"));
    };
    await escribir(`<span class="lav">$</span> ./mejor-compa --encuesta=sinaptic-2026`);
    await espera(250);
    await escribir(`<span class="ok">✔</span> Cargando votos…`, 16);
    await escribir(`<span class="ok">✔</span> Entrenando el modelo de compañerismo…`, 16);
    await escribir(`<span class="ok">✔</span> Descartando sobornos 🍕…`, 16);
    await escribir(`<span class="ok">✔</span> Resultado listo · 99,9% de confianza`, 18);
    await espera(900);
    term.hidden = true;

    // ---- Acto 2: los nominados + reflector ----
    $("compa-sub").textContent = "y los nominados son…";
    if (sonido()) ctx.musica.iniciar("suspenso");
    ctx.musica.intensidad = 0.2;
    const tarjetas = [...document.querySelectorAll(".nominado")];
    const vivas = new Set(tarjetas);
    let foco = null;
    const mover = (el) => {
      foco?.classList.remove("foco");
      foco = el;
      el.classList.add("foco");
      if (sonido()) tick(0.9);
    };
    const alAzar = () => {
      const opciones = [...vivas].filter((t) => t !== foco);
      return opciones[(Math.random() * opciones.length) | 0] ?? foco;
    };
    let saltoMs = 230;
    let saltando = true;
    (async () => {
      try {
        while (saltando) { mover(alAzar()); await espera(saltoMs); }
      } catch {}
    })();
    linea.textContent = "> analizando compañerismo…";
    await espera(3800);

    // ---- Acto 3: eliminación con glitch ----
    const ganadora = tarjetas.find((t) => t.dataset.nombre === compa.ganadora) ?? tarjetas[0];
    const perdedores = tarjetas.filter((t) => t !== ganadora).sort(() => Math.random() - 0.5);
    const FRASES = ["> descartando…", "> recalculando…", "> filtrando por buena onda…", "> chequeando mates compartidos…", "> midiendo ayuda en Teams…", "> contando PRs revisados…"];
    for (let k = 0; k < perdedores.length - 1; k++) {
      await espera(Math.max(700, 1700 - k * 140));
      const t = perdedores[k];
      t.classList.add("glitch", "fuera");
      t.classList.remove("foco");
      vivas.delete(t);
      if (sonido()) glitch();
      linea.textContent = FRASES[k % FRASES.length];
      ctx.musica.intensidad = Math.min(1, 0.25 + (k / perdedores.length) * 0.75);
      saltoMs = Math.max(120, 230 - k * 12);
    }

    // las dos últimas: el reflector va y viene cada vez más lento
    saltando = false;
    await espera(300);
    $("compa-sub").textContent = "quedan dos…";
    linea.textContent = "> decisión final…";
    ctx.musica.detener(1.5);
    const ultimo = perdedores.at(-1);
    if (sonido()) redoble(4.2);
    const pasos = [380, 440, 520, 610, 720, 850, 1000];
    for (let k = 0; k < pasos.length; k++) {
      mover(k % 2 === 0 ? ultimo : ganadora);
      await espera(pasos[k]);
    }
    mover(ultimo);
    await espera(650);
    ultimo.classList.add("glitch", "fuera");
    ultimo.classList.remove("foco");
    if (sonido()) glitch();

    // ---- Acto 4: revelación ----
    await espera(450);
    ganadora.classList.remove("foco");
    ganadora.classList.add("ganadora");
    $("compa-titulo").textContent = compa.titulo;
    linea.textContent = "> ¡tenemos ganadora! exit 0 ✔";
    await espera(1300);
    pintarFinal(compa, false);
    if (sonido()) {
      fanfarria();
      setTimeout(() => anunciar(`¡El premio a ${compa.titulo} es para… ${compa.ganadora}!`), 1700);
    }
    confeti(320, { x: 0.5, y: 0.3 });
    await espera(700);
    confeti(160, { x: 0.15, y: 0.6 });
    confeti(160, { x: 0.85, y: 0.6 });

    // logros desbloqueados, de a uno
    await espera(3800);
    for (const m of compa.motivos) {
      $("logros").insertAdjacentHTML("beforeend", htmlLogro(m));
      if (sonido()) logro();
      confeti(50, { x: 0.5, y: 0.75 });
      await espera(1900);
    }
    showActual = 0;
  } catch (err) {
    if (!(err instanceof Cancelado)) throw err;
  }
}
