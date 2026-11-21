import { DurableObject } from "cloudflare:workers";
import { NUMEROS_FRIKI, fraseDe } from "./frases";

/** Sinaptic Fest: inscripción con número friki + sorteo con ruleta. */

export interface EnvFiesta {
  ADMIN_PIN?: string;
}

type Fase = "espera" | "inscripcion" | "cerrada";

interface Participante {
  numero: number;
  nombre: string;
  frase: string;
}

interface Ganador extends Participante {
  premio: string;
  premioIdx: number;
}

interface Giro {
  id: number;
  numero: number;
  premioIdx: number;
  candidatos: number[];
  duracion: number; // ms
}

/** Premio al mejor compañero/a: el resultado viene de la encuesta; la animación es puro show. */
interface PremioCompa {
  nominados: string[];
  ganadora: string;
  titulo: string;
  motivos: string[];
}

/** Muro: frases, agradecimientos, anécdotas y fotos que comparte la gente. */
type TipoPost = "frase" | "gracias" | "anecdota" | "foto";
export interface Post {
  id: number;
  tipo: TipoPost;
  autor: string;
  texto: string;
  para: string;      // destinatario de un agradecimiento ("" si no aplica)
  foto: boolean;     // tiene foto en /sinaptic/api/foto/<id>
  creado: string;    // ISO
  oculto: boolean;
}

interface MuroCtl {
  pausa: boolean;
  saltar: number;                              // se incrementa para pasar al siguiente
  destacar: { id: number; n: number } | null;  // n cambia en cada pedido
}

type Modo = "sorteo" | "companero" | "muro" | "resumen";
const MODOS: Modo[] = ["sorteo", "companero", "muro", "resumen"];

const LIMITES: Record<TipoPost, number> = { frase: 280, gracias: 280, anecdota: 800, foto: 200 };
const MAX_FOTO = 1_500_000; // bytes
const ESPERA_ENTRE_POSTS = 6000; // ms por celular
const EMOJIS = ["❤️", "😂", "👏", "🔥", "🙌", "😮"];

export interface EstadoFiesta {
  modo: Modo; // qué muestra la pantalla grande
  muroAbierto: boolean;
  muroCtl: MuroCtl;
  compa: PremioCompa;
  revelacion: number | null;    // id del último show de revelación (null = mostrar nominados)
  fase: Fase;
  participantes: Participante[];
  premios: string[];
  ganadores: Ganador[];
  permitirRepetir: boolean;
  giro: Giro | null;
  version: number;
}

type Comando =
  | { tipo: "hola"; token: string }
  | { tipo: "unirme"; token: string; nombre: string }
  | { tipo: "auth"; pin: string }
  | { tipo: "fase"; fase: Fase }
  | { tipo: "premios"; premios: string[] }
  | { tipo: "agregar"; nombre: string }
  | { tipo: "quitar"; numero: number }
  | { tipo: "renombrar"; numero: number; nombre: string }
  | { tipo: "sortear"; premioIdx: number }
  | { tipo: "deshacerGanador" }
  | { tipo: "permitirRepetir"; permitir: boolean }
  | { tipo: "reiniciar" }
  | { tipo: "modo"; modo: Modo }
  | { tipo: "reaccion"; emoji: string }
  | { tipo: "muroAbierto"; abierto: boolean }
  | { tipo: "muroPausa"; pausa: boolean }
  | { tipo: "muroSaltar" }
  | { tipo: "muroDestacar"; id: number }
  | { tipo: "postOcultar"; id: number; oculto: boolean }
  | { tipo: "postBorrar"; id: number }
  | { tipo: "muroVaciar" }
  | { tipo: "compa"; nominados: string[]; ganadora: string; titulo: string; motivos: string[] }
  | { tipo: "revelarCompa" }
  | { tipo: "prepararCompa" };

type Rol = "pantalla" | "jugador" | "admin";
interface Adjunto {
  rol: Rol;
  autenticado: boolean;
  intentos: number;
}

const CANT_PREMIOS = 10;
const DURACION_GIRO = 13000;
const MAX_INTENTOS_PIN = 5;
const NOMBRES_PROHIBIDOS = /^(admin|root|sudo|administrador|null|undefined|test|ganador)$/i;

const COMPA_INICIAL: PremioCompa = {
  nominados: ["Sofía", "Belen", "Carina", "Eva", "Luciana", "Gonzalo", "Ciro", "Juani", "Leonel", "Luca", "Mauri"],
  ganadora: "Sofía",
  titulo: "Mejor Compañera Sinaptic 2026",
  motivos: [
    "💡 Comparte conocimiento y hace crecer al equipo",
    "🤝 Siempre está dispuesta a brindar ayuda",
    "🚀 Tiene un compromiso excepcional",
  ],
};

const estadoInicial = (premios?: string[], compa?: PremioCompa): EstadoFiesta => ({
  modo: "sorteo",
  muroAbierto: false,
  muroCtl: { pausa: false, saltar: 0, destacar: null },
  compa: compa ?? COMPA_INICIAL,
  revelacion: null,
  fase: "espera",
  participantes: [],
  premios: premios ?? Array.from({ length: CANT_PREMIOS }, (_, i) => `Premio ${i + 1}`),
  ganadores: [],
  permitirRepetir: false,
  giro: null,
  version: 0,
});

/** Entero al azar en [0, n) sin sesgo, con el generador criptográfico. */
function azar(n: number): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limite);
  return buf[0] % n;
}

function limpiarNombre(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
}

export class Fiesta extends DurableObject<EnvFiesta> {
  private estado: EstadoFiesta = estadoInicial();
  private tokens: Record<string, number> = {}; // token del celular → número (privado)
  private giroHasta = 0;
  private posts: Post[] = [];
  private ultimoPost = new Map<string, number>(); // token → momento del último post
  private ultimaReaccion = new WeakMap<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: EnvFiesta) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      // completar campos nuevos si el estado guardado es de una versión anterior
      this.estado = { ...estadoInicial(), ...((await ctx.storage.get<EstadoFiesta>("estado")) ?? {}) };
      this.tokens = (await ctx.storage.get<Record<string, number>>("tokens")) ?? {};
      this.posts = (await ctx.storage.get<Post[]>("posts")) ?? [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/api/estado")) {
      return Response.json(this.estado, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname.endsWith("/api/publicar") && request.method === "POST") return this.publicar(request);
    const foto = url.pathname.match(/\/api\/foto\/(\d+)$/);
    if (foto) return this.servirFoto(Number(foto[1]));
    if (url.pathname.endsWith("/api/muro.json")) return this.exportar(request, url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Se esperaba un WebSocket", { status: 426 });
    }
    const pedido = url.searchParams.get("rol");
    const rol: Rol = pedido === "admin" || pedido === "pantalla" ? pedido : "jugador";
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    this.ctx.acceptWebSocket(servidor, [rol]);
    servidor.serializeAttachment({ rol, autenticado: false, intentos: 0 } satisfies Adjunto);
    servidor.send(JSON.stringify({ tipo: "estado", estado: this.estado }));
    if (rol === "pantalla") servidor.send(JSON.stringify({ tipo: "posts", posts: this.visibles() }));
    if (rol === "admin") servidor.send(JSON.stringify({ tipo: "posts", posts: this.posts }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // ---------- Muro ----------
  private visibles() {
    return this.posts.filter((p) => !p.oculto);
  }

  private async guardarPosts() {
    await this.ctx.storage.put("posts", this.posts);
    const pantalla = JSON.stringify({ tipo: "posts", posts: this.visibles() });
    const admin = JSON.stringify({ tipo: "posts", posts: this.posts });
    for (const ws of this.ctx.getWebSockets("pantalla")) try { ws.send(pantalla); } catch {}
    for (const ws of this.ctx.getWebSockets("admin")) try { ws.send(admin); } catch {}
  }

  private async publicar(request: Request): Promise<Response> {
    const responder = (status: number, cuerpo: object) => Response.json(cuerpo, { status });
    if (Number(request.headers.get("content-length") ?? 0) > 3_000_000) return responder(413, { error: "La foto es muy pesada" });
    if (!this.estado.muroAbierto) return responder(403, { error: "El muro está cerrado por ahora" });
    let b: { token?: string; nombre?: string; tipo?: string; texto?: string; para?: string; foto?: string };
    try {
      b = await request.json();
    } catch {
      return responder(400, { error: "Datos inválidos" });
    }
    const token = String(b.token ?? "");
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(token)) return responder(400, { error: "Token inválido" });
    const tipo = b.tipo as TipoPost;
    if (!(tipo in LIMITES)) return responder(400, { error: "Tipo inválido" });
    const autor = limpiarNombre(b.nombre);
    if (autor.length < 2) return responder(400, { error: "Poné tu nombre" });
    if (NOMBRES_PROHIBIDOS.test(autor)) return responder(400, { error: "Buen intento 😏 Poné tu nombre de verdad" });
    const texto = String(b.texto ?? "").replace(/\r/g, "").trim().slice(0, LIMITES[tipo]);
    const para = tipo === "gracias" ? limpiarNombre(b.para) : "";
    if (tipo !== "foto" && texto.length < 2) return responder(400, { error: "Escribí algo para compartir" });

    let datos: Uint8Array | null = null;
    let mime = "image/jpeg";
    if (tipo === "foto") {
      const m = String(b.foto ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return responder(400, { error: "Elegí una foto" });
      mime = m[1];
      const bin = atob(m[2]);
      if (bin.length > MAX_FOTO) return responder(413, { error: "La foto es muy pesada" });
      datos = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }

    const ahora = Date.now();
    if (ahora - (this.ultimoPost.get(token) ?? 0) < ESPERA_ENTRE_POSTS) {
      return responder(429, { error: "Esperá unos segundos antes de compartir otra cosa" });
    }
    this.ultimoPost.set(token, ahora);

    const id = ((await this.ctx.storage.get<number>("postSeq")) ?? 0) + 1;
    await this.ctx.storage.put("postSeq", id);
    if (datos) await this.ctx.storage.put(`foto:${id}`, { mime, datos });
    const post: Post = { id, tipo, autor, texto, para, foto: !!datos, creado: new Date(ahora).toISOString(), oculto: false };
    this.posts.push(post);
    await this.guardarPosts();
    return responder(200, { ok: true, id });
  }

  private async servirFoto(id: number): Promise<Response> {
    const post = this.posts.find((p) => p.id === id);
    if (!post || post.oculto || !post.foto) return new Response("No encontrada", { status: 404 });
    const f = await this.ctx.storage.get<{ mime: string; datos: Uint8Array }>(`foto:${id}`);
    if (!f) return new Response("No encontrada", { status: 404 });
    return new Response(f.datos, { headers: { "content-type": f.mime, "cache-control": "public, max-age=86400" } });
  }

  /** Exporta todo el muro como JSON (requiere el PIN en la cabecera x-pin). */
  private exportar(request: Request, url: URL): Response {
    if (!pinCorrecto(request.headers.get("x-pin") ?? "", this.env.ADMIN_PIN)) {
      return Response.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    const posts = this.posts.map((p) => ({
      ...p,
      foto: p.foto ? `${url.origin}/sinaptic/api/foto/${p.id}` : null,
    }));
    return Response.json(
      { evento: "Sinaptic Fest 2026", exportado: new Date().toISOString(), total: posts.length, posts },
      { headers: { "content-disposition": 'attachment; filename="sinaptic-fest-muro.json"', "cache-control": "no-store" } },
    );
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

    // ---------- Reacciones (no se guardan: solo vuelan por la pantalla) ----------
    if (cmd.tipo === "reaccion") {
      if (this.estado.modo !== "muro" || !EMOJIS.includes(cmd.emoji)) return;
      const ahora = Date.now();
      if (ahora - (this.ultimaReaccion.get(ws) ?? 0) < 250) return;
      this.ultimaReaccion.set(ws, ahora);
      const msg = JSON.stringify({ tipo: "reaccion", emoji: cmd.emoji });
      for (const p of this.ctx.getWebSockets("pantalla")) try { p.send(msg); } catch {}
      return;
    }

    // ---------- Jugadores ----------
    if (cmd.tipo === "hola" || cmd.tipo === "unirme") {
      const token = String(cmd.token ?? "");
      if (!/^[a-zA-Z0-9-]{16,64}$/.test(token)) return this.error(ws, "Token inválido");
      const yaTiene = this.tokens[token];
      const participante = (n: number | undefined) =>
        n === undefined ? null : this.estado.participantes.find((p) => p.numero === n) ?? null;

      if (cmd.tipo === "hola" || yaTiene !== undefined) {
        return this.enviar(ws, { tipo: "yo", participante: participante(yaTiene) });
      }
      if (this.estado.fase !== "inscripcion") {
        return this.error(ws, "La inscripción no está abierta");
      }
      const nombre = limpiarNombre(cmd.nombre);
      if (nombre.length < 2) return this.error(ws, "Poné tu nombre (al menos 2 letras)");
      if (NOMBRES_PROHIBIDOS.test(nombre)) return this.error(ws, "Buen intento 😏 Poné tu nombre de verdad");

      const p = this.nuevoParticipante(nombre);
      this.tokens[token] = p.numero;
      await this.ctx.storage.put("tokens", this.tokens);
      await this.guardarYDifundir({ participantes: [...this.estado.participantes, p] });
      return this.enviar(ws, { tipo: "yo", participante: p });
    }

    // ---------- Administración ----------
    if (cmd.tipo === "auth") {
      if (adj.rol !== "admin") return this.error(ws, "No permitido");
      if (pinCorrecto(String(cmd.pin ?? ""), this.env.ADMIN_PIN)) {
        adj.autenticado = true;
        adj.intentos = 0;
        ws.serializeAttachment(adj);
        return this.enviar(ws, { tipo: "auth", ok: true });
      }
      adj.intentos += 1;
      ws.serializeAttachment(adj);
      this.enviar(ws, { tipo: "auth", ok: false, mensaje: "PIN incorrecto" });
      if (adj.intentos >= MAX_INTENTOS_PIN) ws.close(4003, "Demasiados intentos");
      return;
    }
    if (adj.rol !== "admin" || !adj.autenticado) {
      return this.error(ws, "Necesitás ingresar el PIN de administrador");
    }

    const e = this.estado;
    switch (cmd.tipo) {
      case "fase":
        if (!["espera", "inscripcion", "cerrada"].includes(cmd.fase)) return this.error(ws, "Fase inválida");
        return this.guardarYDifundir({ fase: cmd.fase });

      case "premios": {
        if (!Array.isArray(cmd.premios)) return this.error(ws, "Premios inválidos");
        const premios = cmd.premios.slice(0, 30).map((p, i) => String(p ?? "").trim().slice(0, 60) || `Premio ${i + 1}`);
        if (premios.length === 0) return this.error(ws, "Tiene que haber al menos un premio");
        return this.guardarYDifundir({ premios });
      }

      case "agregar": {
        const nombre = limpiarNombre(cmd.nombre);
        if (nombre.length < 2) return this.error(ws, "Poné un nombre (al menos 2 letras)");
        const p = this.nuevoParticipante(nombre);
        return this.guardarYDifundir({ participantes: [...e.participantes, p] });
      }

      case "quitar": {
        const n = Number(cmd.numero);
        if (!e.participantes.some((p) => p.numero === n)) return this.error(ws, `El ${n} no está anotado`);
        for (const [t, num] of Object.entries(this.tokens)) if (num === n) delete this.tokens[t];
        await this.ctx.storage.put("tokens", this.tokens);
        return this.guardarYDifundir({ participantes: e.participantes.filter((p) => p.numero !== n) });
      }

      case "renombrar": {
        const n = Number(cmd.numero);
        const nombre = limpiarNombre(cmd.nombre);
        if (nombre.length < 2) return this.error(ws, "Poné un nombre (al menos 2 letras)");
        return this.guardarYDifundir({
          participantes: e.participantes.map((p) => (p.numero === n ? { ...p, nombre } : p)),
          ganadores: e.ganadores.map((g) => (g.numero === n ? { ...g, nombre } : g)),
        });
      }

      case "sortear": {
        if (Date.now() < this.giroHasta) return this.error(ws, "La ruleta todavía está girando");
        const idx = Number(cmd.premioIdx);
        if (!Number.isInteger(idx) || idx < 0 || idx >= e.premios.length) return this.error(ws, "Premio inválido");
        if (e.ganadores.some((g) => g.premioIdx === idx)) {
          return this.error(ws, "Ese premio ya se sorteó. Deshacé el último ganador si querés repetirlo.");
        }
        const yaGanaron = new Set(e.ganadores.map((g) => g.numero));
        const candidatos = e.participantes
          .filter((p) => e.permitirRepetir || !yaGanaron.has(p.numero))
          .map((p) => p.numero);
        if (candidatos.length === 0) return this.error(ws, "No quedan participantes para sortear");

        const numero = candidatos[azar(candidatos.length)];
        const p = e.participantes.find((x) => x.numero === numero)!;
        const giro: Giro = { id: (e.giro?.id ?? 0) + 1, numero, premioIdx: idx, candidatos, duracion: DURACION_GIRO };
        this.giroHasta = Date.now() + DURACION_GIRO;
        return this.guardarYDifundir({
          fase: "cerrada",
          giro,
          ganadores: [...e.ganadores, { ...p, premio: e.premios[idx], premioIdx: idx }],
        });
      }

      case "deshacerGanador":
        if (e.ganadores.length === 0) return this.error(ws, "No hay ganadores para deshacer");
        this.giroHasta = 0;
        return this.guardarYDifundir({ ganadores: e.ganadores.slice(0, -1), giro: null });

      case "permitirRepetir":
        return this.guardarYDifundir({ permitirRepetir: Boolean(cmd.permitir) });

      case "reiniciar":
        this.tokens = {};
        this.giroHasta = 0;
        await this.ctx.storage.put("tokens", this.tokens);
        return this.guardarYDifundir({ ...estadoInicial(e.premios, e.compa) });

      // ---------- Mejor compañero/a ----------
      case "modo":
        if (!MODOS.includes(cmd.modo)) return this.error(ws, "Modo inválido");
        return this.guardarYDifundir({ modo: cmd.modo });

      // ---------- Muro ----------
      case "muroAbierto":
        return this.guardarYDifundir({ muroAbierto: Boolean(cmd.abierto) });

      case "muroPausa":
        return this.guardarYDifundir({ muroCtl: { ...e.muroCtl, pausa: Boolean(cmd.pausa) } });

      case "muroSaltar":
        return this.guardarYDifundir({ muroCtl: { ...e.muroCtl, saltar: e.muroCtl.saltar + 1 } });

      case "muroDestacar": {
        const id = Number(cmd.id);
        if (!this.posts.some((p) => p.id === id && !p.oculto)) return this.error(ws, "Ese post no está visible");
        return this.guardarYDifundir({ modo: "muro", muroCtl: { ...e.muroCtl, destacar: { id, n: (e.muroCtl.destacar?.n ?? 0) + 1 } } });
      }

      case "postOcultar": {
        const id = Number(cmd.id);
        const p = this.posts.find((x) => x.id === id);
        if (!p) return this.error(ws, "No existe ese post");
        p.oculto = Boolean(cmd.oculto);
        return this.guardarPosts();
      }

      case "postBorrar": {
        const id = Number(cmd.id);
        if (!this.posts.some((x) => x.id === id)) return this.error(ws, "No existe ese post");
        this.posts = this.posts.filter((x) => x.id !== id);
        await this.ctx.storage.delete(`foto:${id}`);
        return this.guardarPosts();
      }

      case "muroVaciar": {
        const claves = this.posts.filter((p) => p.foto).map((p) => `foto:${p.id}`);
        for (let i = 0; i < claves.length; i += 128) await this.ctx.storage.delete(claves.slice(i, i + 128)); // máx. 128 por llamada
        this.posts = [];
        return this.guardarPosts();
      }

      case "compa": {
        const nominados = [...new Set((Array.isArray(cmd.nominados) ? cmd.nominados : []).map(limpiarNombre).filter((n) => n.length >= 2))].slice(0, 30);
        const ganadora = limpiarNombre(cmd.ganadora);
        if (ganadora.length < 2) return this.error(ws, "Elegí quién gana");
        if (!nominados.includes(ganadora)) nominados.unshift(ganadora);
        if (nominados.length < 2) return this.error(ws, "Tiene que haber al menos 2 nominados");
        const titulo = String(cmd.titulo ?? "").trim().slice(0, 60) || COMPA_INICIAL.titulo;
        const motivos = (Array.isArray(cmd.motivos) ? cmd.motivos : []).map((m) => String(m ?? "").trim().slice(0, 100)).filter(Boolean).slice(0, 6);
        return this.guardarYDifundir({ compa: { nominados, ganadora, titulo, motivos } });
      }

      case "revelarCompa":
        return this.guardarYDifundir({ modo: "companero", revelacion: (e.revelacion ?? 0) + 1 });

      case "prepararCompa":
        return this.guardarYDifundir({ modo: "companero", revelacion: null });

      default:
        return this.error(ws, "Comando desconocido");
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "cerrado");
    } catch {
      /* ya estaba cerrado */
    }
  }

  /** Asigna un número friki libre (o uno al azar si se agotaron). */
  private nuevoParticipante(nombre: string): Participante {
    const usados = new Set(this.estado.participantes.map((p) => p.numero));
    const libres = NUMEROS_FRIKI.filter((n) => !usados.has(n));
    let numero: number;
    if (libres.length > 0) {
      numero = libres[azar(libres.length)];
    } else {
      do numero = 100 + azar(9900);
      while (usados.has(numero));
    }
    return { numero, nombre, frase: fraseDe(numero) };
  }

  private async guardarYDifundir(cambios: Partial<EstadoFiesta>) {
    this.estado = { ...this.estado, ...cambios, version: this.estado.version + 1 };
    await this.ctx.storage.put("estado", this.estado);
    const msg = JSON.stringify({ tipo: "estado", estado: this.estado });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* conexión caída */
      }
    }
  }

  private enviar(ws: WebSocket, obj: object) {
    ws.send(JSON.stringify(obj));
  }

  private error(ws: WebSocket, mensaje: string) {
    this.enviar(ws, { tipo: "error", mensaje });
  }
}

/** Comparación de PIN en tiempo constante. */
export function pinCorrecto(recibido: string, esperado: string | undefined): boolean {
  if (!esperado) return false;
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
