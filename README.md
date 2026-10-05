# La Pata de la Familia

Juego de La Pata (variante familiar de la canasta) en el navegador, para jugar en familia desde cualquier teléfono o computadora. Puedes armar mesas multijugador en tiempo real o practicar contra la compu en tres niveles de dificultad.

Está hecho con HTML, CSS y JavaScript en módulos, sin dependencias ni paso de compilación, y las partidas en línea se sincronizan con Firebase. Tiene la misma arquitectura y estilo que [Dominó de la Familia](https://github.com/gcarrerap/myDomino) (ver [Arquitectura](#arquitectura)).

## Características

- **Multijugador en tiempo real:** creas una mesa, los demás se unen desde *Mesas abiertas* y todos ven la partida al instante.
- **Práctica contra la compu:** juegas solo contra bots, sin necesidad de otros jugadores ni de internet.
- **La compu en mesas en línea:** los asientos libres se pueden llenar con la compu (con su nivel). A la compu la mueve el teléfono de quien está sentado en el asiento más bajo; si ese teléfono no está, el de alguien más.
- **Tres niveles de bot:** Básico, Intermedio y Avanzado. Solo usan información legítima: su mano, la mesa, el pozo y lo que cada quien levantó del pozo a la vista de todos. Nunca ven cartas ajenas ni sus propios montones sin abrir.
- **Consejo:** muestra qué haría cada nivel en tu lugar, paso a paso y por qué, y puedes hacer el primer paso con un toque.
- **Registro:** de cada jugador ves cuántas cartas tiene, en qué montón va, lo que levantó del pozo y todavía tiene, y lo que ha descartado.
- **Tu bajada:** mientras tu equipo no se baja, vas apartando patas y el juego te dice cuántos puntos llevas contra el mínimo de la ronda. Con lo apartado también puedes levantar el pozo.
- **Llamadas de voz y video:** en una mesa en línea, toca el teléfono verde para hablar con los demás mientras juegan. A quien esté en la mesa le suena "Fulano te llama" y entra con un toque, con voz o con video. Puedes silenciar el micrófono, prender o apagar la cámara, apagar el sonido de la llamada, escoger altavoz o auricular (en iPhone), cambiar entre tres vistas (solo el juego, el juego con los videos chiquitos, o solo los videos) y colapsar los botones para que no tapen el juego. Un borde verde marca quién está hablando. Va directo entre teléfonos (WebRTC), sin servidor de por medio.
- **Limpieza automática, versión más reciente, cuenta con Google opcional, sin scroll y tema claro u oscuro,** igual que en el dominó.

## Reglas

El reglamento completo está en el issue [#1](../../issues/1). En corto:

| | |
|---|---|
| Material | 6 barajas con jokers (324 cartas) |
| Jugadores | 2, 3 o 4; con 4, individual o en parejas cruzadas |
| Reparto | 3 montones de 11 por jugador (se juega uno a la vez) y 5 cartas de muestra en el pozo |
| Turno | Robar 2 del mazo, o las 5 de arriba del pozo con un par igual al tope; bajar o agregar; descartar 1 |
| Patas | 3 o más iguales; se cierran con 7. Los 2 y los jokers son comodines, nunca más comodines que naturales. Una limpia cerrada ya no se ensucia |
| Tapones | 3 negro en el pozo: no se levanta y nunca se baja. 3 rojo: se levanta con un par de 3 rojos y solo va en su pata especial |
| Bajarse | 60, 90, 120 y 150 puntos en las rondas 1 a 4. Joker 50; As y 2, 20; 8 a K, 10; 3 a 7, 5. Si tu pareja ya se bajó, no hace falta |
| Irse | 5 limpias y 5 sucias en el equipo, los 3 montones vacíos y descartar la última carta (+500) |
| Puntos | Limpia 500, sucia 300 (las de más solo para quien se fue). Especiales: 3 rojos +5000, jokers +3000, siete 2 +2000, 2 y jokers +1500; incompletas restan lo mismo. Cada 3 rojo guardado −500 |
| Partida | 4 rondas; gana el equipo con más puntos |

### Reglas por confirmar

Estas quedaron como opciones en [`src/engine/config.js`](src/engine/config.js) (`RULES`), con el valor que se usa hoy:

- `baseCountsForAll: true`: el equipo que no se fue cobra sus primeras 5 limpias y 5 sucias; las de más solo cuentan para quien se fue.
- `red3FromHand: true`: la pata de 3 rojos se puede empezar bajándolos de la mano (no solo levantando el pozo).
- En individual, cada jugador necesita sus propias 5 limpias y 5 sucias.
- La ronda 1 la empieza el asiento 1, la ronda 2 el asiento 2, y así; el turno pasa al siguiente asiento.
- Si el último descarte te deja sin cartas y te queda montón, lo abres al momento.
- Regla agregada: si se acaba el mazo se revuelve el pozo, y si ni así alcanzan las 2 cartas para robar, la ronda se acaba sin que nadie se vaya (si no, con un pozo de una carta se podría robar y descartar para siempre).

## Cómo jugarlo

### Opción 1: GitHub Pages (recomendada)

1. En el repo, ve a **Settings → Pages**.
2. En *Source*, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En uno o dos minutos el juego estará en `https://<usuario>.github.io/myPata/`.

### Opción 2: localmente

Sírvelo con cualquier servidor estático. Abrirlo con doble clic (`file://`) no funciona: el juego usa módulos ES y los navegadores no los cargan desde archivos locales.

```bash
# desde la carpeta del repo
python3 -m http.server 8000
# abre http://localhost:8000
```

### Publicar una versión nueva

Cada vez que publiques un cambio del juego, **cambia el número en `src/version.js`** (por ejemplo, de `2026-10-04.1` a `2026-10-04.2`). Así, quien tenga el juego abierto verá "Hay una versión nueva · Actualizar".

## Firebase

El repo trae la configuración del proyecto `dominomx`, el mismo del dominó. Las colecciones de La Pata llevan el prefijo `pata_` (`pata_mesas` y `pata_rondas`), así que no chocan con las del dominó.

**Antes de jugar en línea hay que publicar las reglas:** copia [`firestore.rules`](firestore.rules) en **Firestore → Reglas** y publícalas. Incluyen las colecciones del dominó, así que el dominó sigue funcionando igual. Si el juego se publica en otro dominio que el dominó, agrégalo en **Authentication → Settings → Authorized domains**.

Para usar un proyecto propio, sigue los pasos de "Usar tu propio proyecto de Firebase" del [README del dominó](https://github.com/gcarrerap/myDomino#usar-tu-propio-proyecto-de-firebase) y pon su configuración en `src/config.js`.

Cada ronda terminada se graba en `pata_rondas` (no se ve en el juego). Se descargan con `scripts/export-partidas.mjs`.

## Llamadas de voz y video

Funcionan con el mismo Firebase, sin pasos extra, **después de publicar las nuevas [`firestore.rules`](firestore.rules)** (agregan `pata_llamadas`). Necesitan HTTPS (GitHub Pages ya lo da) y que cada quien dé permiso de micrófono (y de cámara si la prende).

**Recomendado: servidor TURN.** Sin él, la llamada funciona en la mayoría de las redes, pero en algunas (datos móviles, redes de oficina) puede conectar sin que se oiga nada. Cloudflare TURN tiene 1,000 GB al mes gratis:

1. En Cloudflare: **Realtime → TURN Server → Create**. Anota el *Turn Token ID* y el *API Token*.
2. **Workers & Pages → Create → Worker**, pega [`scripts/turn-worker.js`](scripts/turn-worker.js) y despliégalo.
3. En el Worker, **Settings → Variables and Secrets**: `TURN_KEY_ID` (texto), `TURN_KEY_API_TOKEN` (secreto) y `ALLOWED_ORIGINS` = `https://gcarrerap.github.io`.
4. Pon la dirección del Worker en `window.TURN_URL` en [`src/config.js`](src/config.js) y cambia `src/version.js`.

Límites: con el juego cerrado o el teléfono bloqueado no suena (ver [#3](../../issues/3)), y en iPhone Safari corta cámara y micrófono si cambias de app.

## Stack

- HTML, CSS y JavaScript (módulos ES nativos), sin frameworks ni proceso de compilación
- WebRTC del navegador para las llamadas (STUN de Google; TURN de Cloudflare opcional)
- Firebase 10.12 (SDK *compat*, cargado del CDN después de dibujar la página): App, Authentication (anónimo y Google) y Cloud Firestore
- Tipografías: Alfa Slab One y Nunito Sans (Google Fonts)

## Arquitectura

Igual que el dominó: módulos ES nativos, **sin paso de compilación**, con dependencias en una sola dirección:

```
ui/  →  app/  →  ai/  →  engine/
          ↘ services/ (Firebase, localStorage)
```

- **`engine/`** sabe las reglas: recibe la mesa y una acción y devuelve una mesa nueva.
- **`ai/`** decide y explica jugadas con lo que un jugador puede saber.
- **`services/`** es lo único que habla con Firebase y `localStorage`.
- **`app/`** guarda el estado de la app y lo cambia con acciones.
- **`ui/`** solo dibuja y convierte toques en acciones.

El detalle (forma del estado, decisiones y diferencias con el dominó) está en [DESIGN.md](DESIGN.md).

```
myPata/
├── index.html          # esqueleto de la página: carga los estilos, la configuración y src/main.js
├── sw.js               # service worker: siempre la versión más reciente; práctica sin internet
├── firestore.rules     # reglas de Firestore (La Pata y el dominó)
├── styles/             # reset, tokens (colores y tema), base, lobby, mesa
├── src/
│   ├── main.js         # arranque
│   ├── version.js      # versión publicada (cámbiala en cada publicación)
│   ├── config.js       # configuración de Firebase
│   ├── engine/         # reglas de La Pata (funciones puras)
│   │   ├── cards.js       # notación de cartas, color, valor para el mínimo, 6 barajas, revolver
│   │   ├── config.js      # RULES: modos, mínimos, valores, bonos y reglas por confirmar
│   │   ├── table.js       # mesa nueva, reparto (3 montones + muestra), turnos, registro
│   │   ├── melds.js       # patas: validar, limpia/sucia, cerrada, especiales, agregar
│   │   ├── opening.js     # mínimo para bajarse
│   │   ├── moves.js       # apply: robar, levantar el pozo, bajar, agregar, cambiar de montón, descartar
│   │   ├── scoring.js     # fin de ronda, irse, 3 rojos, especiales, fin de partida
│   │   ├── timing.js      # tiempo por turno y jugada automática
│   │   ├── record.js      # grabación y reproducción de rondas
│   │   └── index.js       # API del motor
│   ├── ai/             # la compu y el consejo (funciones puras)
│   │   ├── tune.js        # niveles y parámetros
│   │   ├── view.js        # lo que un asiento puede ver de la mesa
│   │   ├── deduce.js      # lo que se sabe de cada quien (lo que levantó del pozo)
│   │   ├── heuristics.js  # primera bajada, descarte, probabilidad de que el siguiente levante
│   │   ├── bots.js        # la siguiente acción de cada nivel, con su motivo
│   │   ├── advice.js      # consejo: qué haría cada nivel en tu lugar
│   │   ├── worker.js      # la IA en un hilo aparte
│   │   └── index.js
│   ├── services/       # firebase.js, tables-repo.js, recordings.js, prefs.js, updates.js, call-signaling.js
│   ├── app/            # store.js, actions.js, bots.js, clock.js, ai-client.js, cleanup.js, updates.js, recorder.js, recording.js,
│   │                   # call-session.js y call.js (llamadas de voz y video)
│   └── ui/
│       ├── render.js, dom.js, labels.js, clock.js
│       ├── svg/           # card.js (cartas) y meld.js (patas en la mesa)
│       ├── screens/       # lobby.js, seats.js, table.js (incluye tu mano)
│       └── components/    # sheet.js, result.js, advice.js, tracker.js, rules.js, update-bar.js, call-bar.js
├── scripts/export-partidas.mjs  # descarga las rondas grabadas (no es parte del juego)
├── scripts/turn-worker.js       # Cloudflare Worker con credenciales de TURN para las llamadas (no es parte del juego)
├── tests/              # node:test, sin dependencias
├── package.json        # solo para correr las pruebas
├── DESIGN.md
└── README.md
```

### Pruebas

Corren con Node (18 o más nuevo), sin instalar nada:

```bash
npm test
```

- **Motor:** cartas y valores, reparto, patas (limpias, sucias, especiales, tapones), robar y revolver el pozo, levantar el pozo (3 negro, 3 rojo, comodín, sin haberse bajado), el mínimo por ronda, cambio de montón, irse, la puntuación completa, partidas completas en los 4 modos sin perder ni duplicar cartas, y la grabación (una ronda grabada se reproduce igual).
- **IA:** los tres niveles solo proponen jugadas válidas, la primera bajada, el descarte, el consejo y una prueba de que **la compu no hace trampa**: si se revuelven las cartas que un jugador no puede ver, su jugada y el consejo no cambian. También que el avanzado le gana al básico.
- **Llamadas:** con un WebRTC de mentira, dos y tres teléfonos se conectan todos con todos, micrófono, cámara, colgar y volver a entrar, permiso negado, el timbre y los servidores ICE.
- **Servicios, app, limpieza y versiones:** con un Firebase de mentira en memoria: mesas, transacciones, sesión, tu turno completo (apartar la bajada, levantar, agregar, descartar), la compu, el reloj, el consejo, la IA en un hilo aparte, una mesa en línea de principio a fin y la grabación.
