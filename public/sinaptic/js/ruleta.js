// Ruleta en canvas. El puntero está arriba; el ángulo crece en sentido horario.

const COLORES = ["#21266D", "#333BA8", "#006C76", "#00909E"];
const TAU = Math.PI * 2;

export class Ruleta {
  constructor(canvas) {
    this.canvas = canvas;
    this.items = [];
    this.angulo = 0;
    this.resaltado = -1;
    this.girando = false;
    new ResizeObserver(() => this.dibujar()).observe(canvas);
  }

  setItems(items) {
    this.items = items;
    this.resaltado = -1;
    this.dibujar();
  }

  /** Índice del segmento que queda bajo el puntero para un ángulo dado. */
  indiceEn(angulo) {
    const n = this.items.length;
    if (!n) return -1;
    const a = TAU / n;
    const rel = (((-angulo) % TAU) + TAU) % TAU;
    return Math.floor(rel / a) % n;
  }

  /** Deja la ruleta quieta mostrando un número. */
  mostrar(numero) {
    const i = this.items.findIndex((x) => x.numero === numero);
    if (i < 0) return;
    const a = TAU / this.items.length;
    this.angulo = -(i + 0.5) * a;
    this.resaltado = i;
    this.dibujar();
  }

  /**
   * Gira hasta que `numero` quede bajo el puntero.
   * onTick(velocidadRelativa) se llama cada vez que pasa un segmento; onProgreso(t) en cada cuadro.
   */
  girarHasta(numero, duracion, { onTick, onProgreso } = {}) {
    const n = this.items.length;
    const i = this.items.findIndex((x) => x.numero === numero);
    if (i < 0 || !n) return Promise.resolve();
    const a = TAU / n;
    this.resaltado = -1;
    this.girando = true;

    const inicio = this.angulo;
    // Cae apenas pasado el borde del segmento ganador: genera el clásico “¿llega o no llega?”.
    const dentro = 0.12 + Math.random() * 0.2;
    let destino = -(i + dentro) * a;
    const vueltas = 7 + Math.floor(n / 12);
    while (destino > inicio - vueltas * TAU) destino -= TAU;
    const total = destino - inicio;

    const easing = (t) => 1 - Math.pow(1 - t, 4.2);
    const t0 = performance.now();
    let ultimoSeg = this.indiceEn(inicio);

    return new Promise((resolver) => {
      const paso = (ahora) => {
        const t = Math.min(1, (ahora - t0) / duracion);
        // pequeño amague de “carga” al arrancar
        const amague = t < 0.06 ? Math.sin((t / 0.06) * Math.PI) * 0.08 : 0;
        this.angulo = inicio + total * easing(t) + amague;
        const seg = this.indiceEn(this.angulo);
        if (seg !== ultimoSeg) {
          ultimoSeg = seg;
          onTick?.(1 - t);
        }
        onProgreso?.(t);
        this.dibujar();
        if (t < 1) requestAnimationFrame(paso);
        else {
          this.girando = false;
          this.resaltado = i;
          this.dibujar();
          resolver();
        }
      };
      requestAnimationFrame(paso);
    });
  }

  dibujar() {
    const cv = this.canvas;
    const dpr = devicePixelRatio || 1;
    const lado = Math.min(cv.clientWidth, cv.clientHeight);
    if (!lado) return;
    if (cv.width !== Math.round(lado * dpr)) {
      cv.width = cv.height = Math.round(lado * dpr);
    }
    const c = cv.getContext("2d");
    const S = cv.width;
    const R = S / 2 - S * 0.04;
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);

    // aro exterior con brillo
    c.beginPath();
    c.arc(0, 0, R + S * 0.025, 0, TAU);
    const aro = c.createLinearGradient(-R, -R, R, R);
    aro.addColorStop(0, "#7C82E8");
    aro.addColorStop(0.5, "#00909E");
    aro.addColorStop(1, "#333BA8");
    c.fillStyle = aro;
    c.shadowColor = "rgba(79,209,220,.6)";
    c.shadowBlur = S * 0.05;
    c.fill();
    c.shadowBlur = 0;

    const n = this.items.length;
    if (!n) {
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.fillStyle = "#151948";
      c.fill();
      c.fillStyle = "rgba(255,255,255,.6)";
      c.font = `600 ${S * 0.045}px Ubuntu, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("Esperando participantes…", 0, 0);
      c.restore();
      return;
    }

    const a = TAU / n;
    c.rotate(this.angulo - Math.PI / 2);
    const conNombre = n <= 60;
    const fuenteNum = Math.max(10, Math.min(S * 0.05, (R * a) * 0.5));
    for (let k = 0; k < n; k++) {
      const ini = k * a;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R, ini, ini + a);
      c.closePath();
      let color = COLORES[k % COLORES.length];
      if (n % COLORES.length === 1 && k === n - 1) color = COLORES[2]; // evita dos iguales juntos
      c.fillStyle = k === this.resaltado ? "#4FD1DC" : color;
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.18)";
      c.lineWidth = Math.max(1, S * 0.002);
      c.stroke();

      // texto radial
      c.save();
      c.rotate(ini + a / 2);
      c.textAlign = "right";
      c.textBaseline = "middle";
      const it = this.items[k];
      c.fillStyle = k === this.resaltado ? "#0B0E2E" : "#FFFFFF";
      c.font = `700 ${fuenteNum}px "JetBrains Mono", Ubuntu, monospace`;
      c.fillText(String(it.numero), R - S * 0.02, 0);
      if (conNombre) {
        const anchoNum = c.measureText(String(it.numero)).width;
        c.font = `500 ${fuenteNum * 0.72}px Ubuntu, sans-serif`;
        c.globalAlpha = 0.85;
        const nombre = it.nombre.length > 12 ? it.nombre.slice(0, 11) + "…" : it.nombre;
        c.fillText(nombre, R - S * 0.035 - anchoNum, 0);
        c.globalAlpha = 1;
      }
      c.restore();
    }
    c.restore();

    // centro con el logo-isotipo simplificado
    c.save();
    c.translate(S / 2, S / 2);
    c.beginPath();
    c.arc(0, 0, R * 0.17, 0, TAU);
    const centro = c.createRadialGradient(0, -R * 0.05, R * 0.02, 0, 0, R * 0.17);
    centro.addColorStop(0, "#2B328F");
    centro.addColorStop(1, "#0B0E2E");
    c.fillStyle = centro;
    c.fill();
    c.lineWidth = S * 0.008;
    c.strokeStyle = "#4FD1DC";
    c.stroke();
    c.restore();
  }
}
