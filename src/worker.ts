import { DurableObject } from "cloudflare:workers";

export interface Env {
  SALA: DurableObjectNamespace<Sala>;
  ADMIN_PIN?: string;
}

/** Tamaños de bingo permitidos. */
const TAMANIOS = [70, 90] as const;
type Tamanio = (typeof TAMANIOS)[number];

export interface Estado {
  maxNumero: Tamanio;
  salidos: number[]; // en orden de salida; el último es el número actual
  nombreGrupo: string;
  version: number;
  actualizado: string;
}

type Comando =
  | { tipo: "auth"; pin: string }
  | { tipo: "marcar"; numero: number }
  | { tipo: "desmarcar"; numero: number }
  | { tipo: "deshacer" }
  | { tipo: "reiniciar" }
  | { tipo: "configurar"; maxNumero?: number; nombreGrupo?: string };

interface Adjunto {
  rol: "tablero" | "admin";
  autenticado: boolean;
  intentos: number;
}

const ESTADO_INICIAL: Estado = {
  maxNumero: 90,
  salidos: [],
  nombreGrupo: "Nuestra Señora del Rosario de Pompeya",
  version: 0,
  actualizado: new Date(0).toISOString(),
};

const MAX_INTENTOS_PIN = 5;

/** Una única sala de bingo. Guarda el estado y lo reparte a todos los conectados. */
export class Sala extends DurableObject<Env> {
  private estado: Estado = ESTADO_INICIAL;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Responder los "ping" sin despertar al objeto (ahorra cuota del plan gratuito).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.estado = (await ctx.storage.get<Estado>("estado")) ?? { ...ESTADO_INICIAL };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/estado") {
      return Response.json(this.estado, { headers: { "cache-control": "no-store" } });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Se esperaba un WebSocket", { status: 426 });
    }

    const rol: Adjunto["rol"] = url.searchParams.get("rol") === "admin" ? "admin" : "tablero";
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    this.ctx.acceptWebSocket(servidor, [rol]);
    servidor.serializeAttachment({ rol, autenticado: false, intentos: 0 } satisfies Adjunto);
    servidor.send(JSON.stringify({ tipo: "estado", estado: this.estado }));

    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer): Promise<void> {
    if (typeof mensaje !== "string") return;

    let cmd: Comando;
    try {
      cmd = JSON.parse(mensaje);
    } catch {
      return this.error(ws, "Mensaje inválido");
    }

    const adj = ws.deserializeAttachment() as Adjunto;

    if (cmd.tipo === "auth") {
      if (adj.rol !== "admin") return this.error(ws, "No permitido");
      if (pinCorrecto(String(cmd.pin ?? ""), this.env.ADMIN_PIN)) {
        adj.autenticado = true;
        adj.intentos = 0;
        ws.serializeAttachment(adj);
        ws.send(JSON.stringify({ tipo: "auth", ok: true }));
      } else {
        adj.intentos += 1;
        ws.serializeAttachment(adj);
        ws.send(JSON.stringify({ tipo: "auth", ok: false, mensaje: "PIN incorrecto" }));
        if (adj.intentos >= MAX_INTENTOS_PIN) ws.close(4003, "Demasiados intentos");
      }
      return;
    }

    if (adj.rol !== "admin" || !adj.autenticado) {
      return this.error(ws, "Necesitás ingresar el PIN de administrador");
    }

    const e = this.estado;
    let salidos = e.salidos;
    let { maxNumero, nombreGrupo } = e;

    switch (cmd.tipo) {
      case "marcar": {
        const n = Number(cmd.numero);
        if (!Number.isInteger(n) || n < 0 || n >= maxNumero) {
          return this.error(ws, `El número debe estar entre 0 y ${maxNumero - 1}`);
        }
        if (salidos.includes(n)) return this.error(ws, `El ${n} ya salió`);
        salidos = [...salidos, n];
        break;
      }
      case "desmarcar": {
        const n = Number(cmd.numero);
        if (!salidos.includes(n)) return this.error(ws, `El ${n} no estaba marcado`);
        salidos = salidos.filter((x) => x !== n);
        break;
      }
      case "deshacer":
        if (salidos.length === 0) return this.error(ws, "No hay números para deshacer");
        salidos = salidos.slice(0, -1);
        break;
      case "reiniciar":
        salidos = [];
        break;
      case "configurar": {
        if (cmd.maxNumero !== undefined && cmd.maxNumero !== maxNumero) {
          if (!TAMANIOS.includes(cmd.maxNumero as Tamanio)) {
            return this.error(ws, `Tamaño inválido. Opciones: ${TAMANIOS.join(" o ")}`);
          }
          maxNumero = cmd.maxNumero as Tamanio;
          salidos = []; // cambiar el tamaño arranca una partida nueva
        }
        if (cmd.nombreGrupo !== undefined) {
          nombreGrupo = String(cmd.nombreGrupo).trim().slice(0, 60) || ESTADO_INICIAL.nombreGrupo;
        }
        break;
      }
      default:
        return this.error(ws, "Comando desconocido");
    }

    this.estado = {
      maxNumero,
      salidos,
      nombreGrupo,
      version: e.version + 1,
      actualizado: new Date().toISOString(),
    };
    await this.ctx.storage.put("estado", this.estado);
    this.difundir();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "cerrado");
    } catch {
      /* ya estaba cerrado */
    }
  }

  private difundir() {
    const msg = JSON.stringify({ tipo: "estado", estado: this.estado });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* conexión caída: se limpia sola */
      }
    }
  }

  private error(ws: WebSocket, mensaje: string) {
    ws.send(JSON.stringify({ tipo: "error", mensaje }));
  }
}

/** Comparación de PIN en tiempo constante. */
function pinCorrecto(recibido: string, esperado: string | undefined): boolean {
  if (!esperado) return false;
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/ws" || pathname === "/api/estado") {
      const sala = env.SALA.get(env.SALA.idFromName("principal"));
      return sala.fetch(request);
    }
    return new Response("No encontrado", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
