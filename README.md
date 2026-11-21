# 🏕️ Bingo Scout

Bingo en tiempo real para el grupo scout:

- **Tablero** (`/`): pensado para proyectar en una TV. Muestra todos los números, marca los que salieron, el último en grande y los 5 anteriores.
- **Panel del dirigente** (`/admin`): para usar desde el celular, protegido con PIN. Sirve para marcar números, borrar uno marcado por error, deshacer el último, reiniciar, elegir bingo de **70 o 90** y poner el nombre del grupo.

Cada cambio del panel llega al instante a todos los tableros abiertos (WebSockets).

## Arquitectura (100% gratis en Cloudflare)

```
📱 /admin ──WebSocket──►  Worker  ──►  Durable Object "Sala"  ──WebSocket──►  📺 /
                          (sirve /public)   (guarda el estado en SQLite
                                             y lo envía a todos)
```

- `public/`: frontend estático (HTML + CSS + JS, sin build).
- `src/worker.ts`: Worker + Durable Object `Sala` (una sola sala).
- El estado sobrevive a recargas y reinicios. Si se corta el Wi-Fi, las pantallas se reconectan solas y reciben el tablero completo.

## Probar en tu compu

```bash
npm install
npm run dev
```

- Tablero: http://localhost:8787
- Admin: http://localhost:8787/admin (PIN de desarrollo: `1234`, definido en `.dev.vars`)

## Publicar en Cloudflare (plan gratuito)

1. Creá una cuenta gratis en https://dash.cloudflare.com
2. Iniciá sesión desde la terminal:
   ```bash
   npx wrangler login
   ```
3. Definí el PIN del administrador (queda guardado como secreto, no en el código):
   ```bash
   npx wrangler secret put ADMIN_PIN
   ```
4. Publicá:
   ```bash
   npm run deploy
   ```
5. Wrangler te muestra la URL, por ejemplo `https://bingo-scout.<tu-cuenta>.workers.dev`.
   - TV: esa URL
   - Celular: esa URL + `/admin`

> Tip: también podés conectar el repo de GitHub en *Workers & Pages → Create → Import a repository* para que se publique solo con cada push. El secreto `ADMIN_PIN` se carga en *Settings → Variables and Secrets*.

## Uso en el evento

1. En la TV, abrí el tablero y tocá **⛶** (pantalla completa). La pantalla no se apaga mientras esté abierto.
2. Activá **🔊 Voz** si querés que el tablero cante cada número.
3. En el celular, entrá a `/admin`, poné el PIN y elegí 70 o 90 en *Ajustes*.
4. Marcá los números tocándolos en la grilla o escribiéndolos. Para borrar uno, tocalo de nuevo.

## Notas

- Usá un PIN de 6 dígitos o más. Cada conexión tiene 5 intentos.
- Cambiar entre 70 y 90 arranca una partida nueva.
- Colores y tipografías: variables en `public/css/scout.css` (`--bosque`, `--caqui`, `--madera`, `--mostaza`…).

## Sinaptic Fest (`/sinaptic`)

Sorteo para la fiesta de fin de año de Sinaptic, en el mismo sitio y con su propia sala:

- **`/sinaptic`** — pantalla grande: bienvenida, QR + muro de inscriptos en vivo, ruleta del sorteo con música, redoble, confeti y voz. Tocar *Arrancar el show* para habilitar el sonido.
- **`/sinaptic/jugar`** — celular de cada invitado: pone su nombre, gira el tragamonedas y recibe un número friki único con su frase.
- **`/sinaptic/admin`** — control con el mismo PIN del bingo: abrir/cerrar inscripción, sortear cada premio, deshacer, editar premios, agregar o quitar participantes.

- **Premio al mejor compañero/a** — desde el control, el botón *Premio* cambia la pantalla grande a los nominados y *¡Revelar ganador/a!* lanza el show: terminal, reflector que salta entre nombres, eliminación con efecto glitch (orden al azar, no se muestran votos) y la revelación con los motivos como "logros desbloqueados". Nominados, ganador/a, título y motivos se editan desde el control; el resultado sale de la encuesta, la animación es puro show.

Los números y frases están en `src/frases.ts`. El ganador se elige en el servidor con `crypto.getRandomValues()`.
