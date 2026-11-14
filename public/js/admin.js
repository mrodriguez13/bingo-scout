import { ConexionSala, FLOR_DE_LIS } from "./conexion.js";

const $ = (id) => document.getElementById(id);
$("flor").innerHTML = FLOR_DE_LIS;
$("flor-ingreso").innerHTML = FLOR_DE_LIS;

let estado = null;
let conectado = false;
let autenticado = false;
let pin = "";
try { pin = sessionStorage.getItem("bingo-pin") ?? ""; } catch {}

// ---------- Ingreso ----------
$("form-pin").addEventListener("submit", (ev) => {
  ev.preventDefault();
  pin = $("pin").value.trim();
  $("error-pin").textContent = "";
  if (!sala.enviar({ tipo: "auth", pin })) $("error-pin").textContent = "Sin conexión, reintentando…";
});

function mostrarPanel(si) {
  $("pantalla-ingreso").hidden = si;
  $("pantalla-panel").hidden = !si;
}

// ---------- Render ----------
const grilla = $("grilla");
let botones = [];

function armarGrilla(max) {
  grilla.innerHTML = "";
  botones = [null];
  for (let n = 1; n <= max; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "insignia";
    b.textContent = n;
    b.addEventListener("click", () => tocarNumero(n));
    grilla.appendChild(b);
    botones.push(b);
  }
  $("numero").max = max;
}

function render(e) {
  const cambioTamanio = !estado || estado.maxNumero !== e.maxNumero;
  estado = e;
  if (cambioTamanio) armarGrilla(e.maxNumero);

  $("nombre-grupo").textContent = e.nombreGrupo;
  if (document.activeElement !== $("input-nombre")) $("input-nombre").value = e.nombreGrupo;

  const ultimo = e.salidos.at(-1);
  $("ultimo").textContent = ultimo ?? "–";
  $("contador").textContent = `${e.salidos.length} de ${e.maxNumero} salieron`;

  const salidos = new Set(e.salidos);
  for (let n = 1; n <= e.maxNumero; n++) {
    botones[n].classList.toggle("salio", salidos.has(n));
    botones[n].classList.toggle("ultimo", n === ultimo);
    botones[n].setAttribute("aria-pressed", String(salidos.has(n)));
  }
  for (const b of document.querySelectorAll("[data-max]")) {
    b.classList.toggle("activo", Number(b.dataset.max) === e.maxNumero);
  }
  habilitar();
}

function habilitar() {
  const ok = conectado && autenticado;
  for (const el of document.querySelectorAll("#pantalla-panel button, #pantalla-panel input")) el.disabled = !ok;
  if (ok && estado) {
    $("btn-deshacer").disabled = estado.salidos.length === 0;
    $("btn-repetir").disabled = estado.salidos.length === 0;
  }
}

// ---------- Acciones ----------
function enviar(cmd) {
  if (!sala.enviar(cmd)) avisar("Sin conexión. Esperá a que vuelva la señal.", true);
}

async function tocarNumero(n) {
  if (!estado) return;
  if (estado.salidos.includes(n)) {
    if (await confirmar(`¿Borrar el ${n}?`, `El ${n} se va a desmarcar del tablero.`, "Borrar")) {
      enviar({ tipo: "desmarcar", numero: n });
    }
  } else {
    enviar({ tipo: "marcar", numero: n });
    if (navigator.vibrate) navigator.vibrate(30);
  }
}

$("form-numero").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = Number($("numero").value);
  if (!n) return;
  if (estado?.salidos.includes(n)) {
    avisar(`El ${n} ya había salido`, true);
  } else {
    enviar({ tipo: "marcar", numero: n });
  }
  $("numero").value = "";
  $("numero").focus();
});

$("btn-deshacer").addEventListener("click", async () => {
  const u = estado?.salidos.at(-1);
  if (u === undefined) return;
  if (await confirmar(`¿Deshacer el ${u}?`, "Se quita el último número que salió.", "Deshacer")) {
    enviar({ tipo: "deshacer" });
  }
});

$("btn-repetir").addEventListener("click", () => {
  enviar({ tipo: "repetir" });
  avisar("Repitiendo en el tablero");
});

$("btn-reiniciar").addEventListener("click", async () => {
  if (await confirmar("¿Reiniciar el tablero?", "Se borran todos los números marcados. Esto no se puede deshacer.", "Reiniciar")) {
    enviar({ tipo: "reiniciar" });
  }
});

$("form-nombre").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enviar({ tipo: "configurar", nombreGrupo: $("input-nombre").value });
  $("input-nombre").blur();
  avisar("Nombre guardado");
});

for (const b of document.querySelectorAll("[data-max]")) {
  b.addEventListener("click", async () => {
    const max = Number(b.dataset.max);
    if (!estado || max === estado.maxNumero) return;
    const msg = estado.salidos.length
      ? `Pasar a bingo de 1 a ${max} reinicia la partida y borra los ${estado.salidos.length} números marcados.`
      : `El tablero pasa a tener números del 1 al ${max}.`;
    if (await confirmar(`¿Bingo de ${max}?`, msg, "Cambiar")) enviar({ tipo: "configurar", maxNumero: max });
  });
}

// ---------- Diálogo de confirmación ----------
function confirmar(titulo, texto, si = "Sí") {
  const d = $("dialogo");
  $("dialogo-titulo").textContent = titulo;
  $("dialogo-texto").textContent = texto;
  $("dialogo-si").textContent = si;
  d.returnValue = "";
  d.showModal();
  return new Promise((res) => d.addEventListener("close", () => res(d.returnValue === "si"), { once: true }));
}

// ---------- Avisos ----------
let tAviso;
function avisar(txt, error = false) {
  const a = $("aviso");
  a.textContent = txt;
  a.className = "aviso visible" + (error ? " error" : "");
  clearTimeout(tAviso);
  tAviso = setTimeout(() => (a.className = "aviso"), 2600);
}

// ---------- Conexión ----------
const sala = new ConexionSala({
  rol: "admin",
  onEstado: render,
  onConectado: (ok) => {
    conectado = ok;
    autenticado = false;
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "En vivo" : "Sin señal…";
    if (ok && pin) sala.enviar({ tipo: "auth", pin }); // reingreso automático tras reconectar
    habilitar();
  },
  onMensaje: (m) => {
    if (m.tipo === "auth") {
      autenticado = m.ok;
      if (m.ok) {
        try { sessionStorage.setItem("bingo-pin", pin); } catch {}
        mostrarPanel(true);
      } else {
        try { sessionStorage.removeItem("bingo-pin"); } catch {}
        pin = "";
        mostrarPanel(false);
        $("error-pin").textContent = m.mensaje ?? "PIN incorrecto";
        $("pin").select();
      }
      habilitar();
    } else if (m.tipo === "error") {
      avisar(m.mensaje, true);
    }
  },
});
