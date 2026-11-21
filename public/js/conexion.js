// Conexión en tiempo real con la sala (WebSocket con reconexión automática).
export class ConexionSala {
  /**
   * @param {{ rol: string, ruta?: string, onEstado: (e) => void, onMensaje?: (m) => void, onConectado?: (ok: boolean) => void }} opts
   */
  constructor({ rol, ruta = "/ws", onEstado, onMensaje, onConectado }) {
    this.rol = rol;
    this.ruta = ruta;
    this.onEstado = onEstado;
    this.onMensaje = onMensaje ?? (() => {});
    this.onConectado = onConectado ?? (() => {});
    this.espera = 500;
    this.ws = null;
    this.ping = null;
    this.conectar();
    // Al volver a la pestaña (celular bloqueado, etc.) reconectar enseguida.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && (!this.ws || this.ws.readyState > 1)) {
        this.espera = 500;
        this.conectar();
      }
    });
  }

  conectar() {
    clearTimeout(this.reintento);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}${this.ruta}?rol=${this.rol}`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.espera = 500;
      this.onConectado(true);
      clearInterval(this.ping);
      this.ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
    });

    ws.addEventListener("message", (ev) => {
      if (ev.data === "pong") return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.tipo === "estado") this.onEstado(msg.estado);
      else this.onMensaje(msg);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      clearInterval(this.ping);
      this.onConectado(false);
      this.reintento = setTimeout(() => this.conectar(), this.espera);
      this.espera = Math.min(this.espera * 2, 8000);
    });
  }

  enviar(obj) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }
}

// Flor de lis (SVG simplificado, genérico)
export const FLOR_DE_LIS = `
<svg viewBox="0 0 100 120" aria-hidden="true" class="flor">
  <path fill="currentColor" d="M50 4c-7 11-12 22-12 35 0 10 4 18 8 26h8c4-8 8-16 8-26 0-13-5-24-12-35z"/>
  <path fill="currentColor" d="M36 64c-6-14-16-22-26-22-6 0-9 4-9 9 0 9 9 14 18 14-6-3-9-7-9-11 0-3 2-5 5-5 7 0 13 7 17 15h4zM64 64c6-14 16-22 26-22 6 0 9 4 9 9 0 9-9 14-18 14 6-3 9-7 9-11 0-3-2-5-5-5-7 0-13 7-17 15h-4z"/>
  <rect x="26" y="66" width="48" height="8" rx="4" fill="currentColor"/>
  <path fill="currentColor" d="M44 76h12l-2 16c4 6 10 10 16 10-2 6-8 10-14 10-4 0-6-2-6-2s-2 2-6 2c-6 0-12-4-14-10 6 0 12-4 16-10z"/>
</svg>`;
