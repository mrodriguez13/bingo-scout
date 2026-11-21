import { $, conectar, avisar, escapar, proximoPremio, candidatos } from "./efectos.js";

let estado = null;
let conectado = false;
let autenticado = false;
let pin = "";
let giroHasta = 0;
let editandoPremios = false;
try { pin = sessionStorage.getItem("fest-pin") ?? ""; } catch {}

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

const enviar = (cmd) => {
  if (!sala.enviar(cmd)) avisar("Sin conexión. Esperá a que vuelva la señal.", "error");
};

// ---------- Render ----------
const AYUDA_FASE = {
  espera: "La pantalla grande muestra el cartel de bienvenida. Los celulares esperan.",
  inscripcion: "La pantalla muestra el QR. Cada invitado entra, pone su nombre y recibe su número.",
  cerrada: "Nadie más puede anotarse. La pantalla muestra la ruleta: ¡a sortear!",
};

function render(e) {
  const anterior = estado;
  estado = e;
  if (anterior && e.giro && e.giro.id !== anterior.giro?.id) giroHasta = Date.now() + e.giro.duracion;
  if (!e.giro) giroHasta = 0;

  for (const b of document.querySelectorAll("[data-fase]")) b.classList.toggle("activo", b.dataset.fase === e.fase);
  $("ayuda-fase").textContent = AYUDA_FASE[e.fase] ?? "";
  $("cant").textContent = e.participantes.length;

  // Premio a sortear
  const sorteados = new Map(e.ganadores.map((g) => [g.premioIdx, g]));
  const prox = proximoPremio(e);
  const sel = $("sel-premio");
  const elegido = sel.value !== "" && !sorteados.has(Number(sel.value)) ? Number(sel.value) : prox;
  sel.innerHTML = e.premios.map((p, i) => {
    const g = sorteados.get(i);
    return `<option value="${i}" ${g ? "disabled" : ""} ${i === elegido ? "selected" : ""}>${i + 1}. ${escapar(p)}${g ? ` ✓ (${g.numero} · ${escapar(g.nombre)})` : ""}</option>`;
  }).join("");

  const ultimo = e.ganadores.at(-1);
  $("ultimo").hidden = !ultimo;
  if (ultimo) $("ultimo").innerHTML = `Último: <span class="num">${ultimo.numero}</span><strong>${escapar(ultimo.nombre)}</strong> · ${escapar(ultimo.premio)}`;
  $("chk-repetir").checked = e.permitirRepetir;

  // Ganadores
  $("ganadores").innerHTML = e.ganadores.length
    ? e.ganadores.map((g) => `<li><span class="num">${g.numero}</span><span class="nom">${escapar(g.nombre)}<br><span class="pre">${escapar(g.premio)}</span></span></li>`).join("")
    : `<li class="vacia">Todavía no hay ganadores</li>`;

  pintarParticipantes();
  if (!editandoPremios) pintarPremios();
  habilitar();
}

function pintarParticipantes() {
  const q = $("buscar").value.trim().toLowerCase();
  const ganadores = new Set(estado.ganadores.map((g) => g.numero));
  const lista = [...estado.participantes].reverse().filter((p) => !q || p.nombre.toLowerCase().includes(q) || String(p.numero).includes(q));
  $("participantes").innerHTML = lista.length
    ? lista.map((p) => `<li><span class="num">${p.numero}</span><span class="nom">${escapar(p.nombre)}${ganadores.has(p.numero) ? " 🏆" : ""}</span>
        <button class="acc" data-renombrar="${p.numero}" title="Cambiar nombre">✎</button>
        <button class="acc" data-quitar="${p.numero}" title="Quitar">✕</button></li>`).join("")
    : `<li class="vacia">${q ? "Sin resultados" : "Todavía no se anotó nadie"}</li>`;
}

function pintarPremios(lista = estado.premios) {
  $("premios").innerHTML = lista.map((p, i) => `<li><input data-premio="${i}" maxlength="60" value="${escapar(p)}"></li>`).join("");
}

function habilitar() {
  const ok = conectado && autenticado;
  for (const el of document.querySelectorAll("#pantalla-panel button, #pantalla-panel input, #pantalla-panel select")) el.disabled = !ok;
  if (!ok || !estado) return;
  const girando = Date.now() < giroHasta;
  const quedan = candidatos(estado).length;
  const hayPremio = proximoPremio(estado) !== null;
  $("btn-girar").disabled = girando || quedan === 0 || !hayPremio;
  $("btn-deshacer").disabled = estado.ganadores.length === 0;
  // no spoilear al ganador en el panel mientras la ruleta gira
  $("ultimo").hidden = girando || estado.ganadores.length === 0;
  $("ganadores").classList.toggle("ocultar-ultimo", girando);
  $("ayuda-girar").textContent = girando
    ? "🎰 Girando… mirá la pantalla grande"
    : !hayPremio ? "Ya se sortearon todos los premios 🎉"
    : quedan === 0 ? "No hay participantes para sortear"
    : `${quedan} números en la ruleta` + (estado.fase !== "cerrada" ? " · al girar se cierra la inscripción" : "");
}
setInterval(habilitar, 500);

// ---------- Acciones ----------
for (const b of document.querySelectorAll("[data-fase]")) {
  b.addEventListener("click", () => {
    if (b.dataset.fase === estado?.fase) return;
    if (b.dataset.fase === "espera" && estado.participantes.length && !confirm("¿Volver a la espera? Los números ya asignados se mantienen.")) return;
    enviar({ tipo: "fase", fase: b.dataset.fase });
  });
}

$("btn-girar").addEventListener("click", () => {
  const idx = Number($("sel-premio").value);
  if (Number.isNaN(idx)) return;
  enviar({ tipo: "sortear", premioIdx: idx });
  giroHasta = Date.now() + 2000; // evita doble toque hasta que llegue el estado
  habilitar();
  navigator.vibrate?.(40);
});

$("btn-deshacer").addEventListener("click", () => {
  const u = estado?.ganadores.at(-1);
  if (!u) return;
  if (confirm(`¿Deshacer el ganador ${u.numero} · ${u.nombre} (${u.premio})?\nEl premio vuelve a quedar disponible.`)) enviar({ tipo: "deshacerGanador" });
});

$("chk-repetir").addEventListener("change", (ev) => enviar({ tipo: "permitirRepetir", permitir: ev.target.checked }));

$("form-agregar").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const nombre = $("input-agregar").value.trim();
  if (nombre.length < 2) return avisar("Poné un nombre", "error");
  enviar({ tipo: "agregar", nombre });
  $("input-agregar").value = "";
  avisar(`${nombre} agregado con número nuevo`);
});

$("buscar").addEventListener("input", () => estado && pintarParticipantes());

$("participantes").addEventListener("click", (ev) => {
  const q = ev.target.closest("[data-quitar]");
  const r = ev.target.closest("[data-renombrar]");
  if (q) {
    const n = Number(q.dataset.quitar);
    const p = estado.participantes.find((x) => x.numero === n);
    if (p && confirm(`¿Quitar a ${p.nombre} (${n})? Su número queda libre.`)) enviar({ tipo: "quitar", numero: n });
  } else if (r) {
    const n = Number(r.dataset.renombrar);
    const p = estado.participantes.find((x) => x.numero === n);
    const nombre = p && prompt(`Nuevo nombre para el ${n}:`, p.nombre);
    if (nombre && nombre.trim().length >= 2) enviar({ tipo: "renombrar", numero: n, nombre: nombre.trim() });
  }
});

// Premios
const leerPremios = () => [...document.querySelectorAll("[data-premio]")].map((i) => i.value);
$("premios").addEventListener("input", () => (editandoPremios = true));
$("btn-mas-premio").addEventListener("click", () => {
  editandoPremios = true;
  const lista = leerPremios();
  lista.push(`Premio ${lista.length + 1}`);
  pintarPremios(lista);
  document.querySelector(`[data-premio="${lista.length - 1}"]`)?.select();
});
$("form-premios").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enviar({ tipo: "premios", premios: leerPremios() });
  editandoPremios = false;
  avisar("Premios guardados 🎁");
});

$("btn-reiniciar").addEventListener("click", () => {
  if (!confirm("¿Reiniciar TODO? Se borran participantes, números y ganadores.")) return;
  if (!confirm("¿Seguro, seguro? Esto no se puede deshacer.")) return;
  enviar({ tipo: "reiniciar" });
});

// ---------- Conexión ----------
const sala = conectar("admin", {
  onEstado: render,
  onMensaje: (m) => {
    if (m.tipo === "auth") {
      autenticado = m.ok;
      if (m.ok) {
        try { sessionStorage.setItem("fest-pin", pin); } catch {}
        mostrarPanel(true);
      } else {
        try { sessionStorage.removeItem("fest-pin"); } catch {}
        mostrarPanel(false);
        $("error-pin").textContent = m.mensaje ?? "PIN incorrecto";
      }
      habilitar();
    } else if (m.tipo === "error") {
      avisar(m.mensaje, "error");
      giroHasta = 0;
      habilitar();
    }
  },
  onConectado: (ok) => {
    conectado = ok;
    const c = $("conexion");
    c.classList.toggle("ok", ok);
    c.textContent = ok ? "en vivo" : "reconectando…";
    if (ok && pin) sala.enviar({ tipo: "auth", pin });
    if (!ok) autenticado = false;
    habilitar();
  },
});
