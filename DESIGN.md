# Diseño de La Pata de la Familia

La Pata usa la misma arquitectura que [myDomino](https://github.com/gcarrerap/myDomino/blob/main/DESIGN.md): módulos ES nativos sin compilación, publicados tal cual en GitHub Pages, con el motor y la IA como funciones puras y Firebase solo para sincronizar mesas. Este documento explica en qué se parece y en qué cambia.

Issue: #1

## 1. Principios (los mismos del dominó)

1. **Sin compilación.** Módulos ES nativos servidos como archivos estáticos.
2. **Dependencias en una sola dirección:** `ui → app → ai → engine`, con `services` aparte (§2).
3. **El motor y la IA son funciones puras:** sin DOM, sin Firebase, sin `localStorage`. El reloj (`now`) y el azar (`rnd`) se inyectan desde el principio (en el dominó quedó pendiente).
4. **Un solo dueño para el estado de la app** (`app/store.js`); la interfaz lee y pide acciones.
5. **La compu no hace trampa:** decide con una vista pública de la mesa (`ai/view.js`) y hay una prueba que lo revisa.

## 2. Capas

| Capa | Puede importar | Responsabilidad |
|---|---|---|
| `engine/` | nada | Reglas: `apply(mesa, asiento, acción)` devuelve una mesa nueva o truena con el motivo. |
| `ai/` | `engine/` | La compu y el consejo, solo con lo que un jugador puede saber. |
| `services/` | `engine/` (solo para serializar) | Lo único que habla con Firebase y `localStorage`. |
| `app/` | `engine/`, `ai/`, `services/` | Store y acciones. Decide si una jugada es local (práctica) o una transacción (en línea). |
| `ui/` | `app/`, `engine/` y `ai/` (lectura) | Dibujar y convertir toques en acciones. Nunca llama a Firestore. |

## 3. Forma del estado

Un documento por mesa en `pata_mesas` (`json`, `code`, `created`, `updated`), igual que en el dominó. La mesa completa:

```js
{
  code, config: { n: 2|3|4, teams, timer }, host, created, seats, v,
  status: "lobby" | "playing" | "roundover" | "gameover",
  roundNo: 1..4, scores: [por equipo], gameId, gameStart, log, result,
  hand: {                                   // la ronda en curso
    stock, discard,                         // mazo (se roba del final) y pozo (el tope es el último)
    hands: [[…] por asiento],               // la mano actual
    piles: [[[…11], […11]] por asiento],    // los montones sin abrir, en orden
    pileNo: [1..3 por asiento],             // qué montón juega cada quien
    melds: [[{ id, kind, rank, cards }] por equipo],
    down: [por equipo],                     // si el equipo ya se bajó en esta ronda
    turn, phase: "draw" | "play", turns, nextId, lastDraw,
    history: [{ s, a, t, … }],              // cada acción, para reproducir la ronda
    start: { t, hands, piles, discard, stock, turn },
  },
}
```

**Cartas:** texto de 3 caracteres, número + palo + baraja (`"KH3"`, `"TS0"`, `"XR2"` para un joker). Las 324 cartas son únicas, así que se puede seguir cada una: quién la levantó, si sigue en su mano y si una partida pierde o duplica cartas (hay una prueba).

**Patas:** `kind` es `"natural"` (del 4 al A, con comodines), `"wild"` (pata especial de comodines) o `"red3"`. La clase (limpia, sucia, de 2, de jokers, de comodines) sale de las cartas; una pata cerrada no puede cambiar de clase, que es lo que hace que una limpia cerrada no se ensucie. Un equipo puede tener varias patas normales abiertas del mismo número (issue #8): "bajar" siempre crea una pata nueva y para agregar se toca la pata. Al levantar el pozo, el par y el tope se juntan con una abierta de ese número si caben; si no, forman otra. Las especiales (3 rojos, comodines) siguen siendo una abierta a la vez.

**Tamaño:** una mesa a media ronda pesa unos 25 KB y una ronda grabada de 17 a 30 KB, muy lejos del límite de 1 MB de Firestore.

## 4. Diferencias con el dominó

**Turno en varias acciones.** En el dominó cada turno es una jugada. Aquí son robar, después varias acciones (bajar, agregar, abrir montón) y al final descartar. El motor recibe una acción a la vez (`apply`), cada acción es su propia transacción en línea, y la clave del turno (`turnKey`) incluye cuántas acciones lleva la ronda, para que la jugada de la compu nunca se aplique dos veces. El reloj corre por turno (`clockKey`), no por acción: 60 s, y al vencerse roba (si no había robado) y descarta solo.

**`legalActions` no enumera todo.** Las combinaciones para bajarse son demasiadas. `legalActions` da las acciones sencillas (robar, levantar con cada par, descartar cada carta, agregar una carta, bajar las tercias que ya tienes) y quien juega arma las grandes; `check(mesa, asiento, acción)` dice si una acción vale y por qué no.

**6 jugadores (issue #12).** `config.teams` dice cuántos van por equipo: `false` (individual), `true` o `2` (parejas), `3` (equipos de 3). El equipo de un asiento es asiento mod (número de equipos), así los compañeros quedan repartidos alrededor de la mesa: con 4 en parejas, 0 y 2 contra 1 y 3; con 6 en 3 parejas, cada quien con el de enfrente (0 y 3, 1 y 4, 2 y 5); con 6 en 2 equipos de 3, alternados (0, 2 y 4 contra 1, 3 y 5). Con 6 no hay individual: seis zonas de patas no caben en un teléfono. Con 6 se usan 8 barajas (`decksFor`, cartas de la baraja 0 a 7), y la compu cuenta las copias de cada carta con las barajas de la mesa. En la mesa, arriba van tres jugadores (arriba a la izquierda, enfrente y arriba a la derecha) en forma compacta, y con 3 equipos el marcador se achica para caber en una línea. Las demás reglas no cambian.

**Inicio de ronda (issue #11).** `roundRoles` reparte los papeles de cada ronda: reparte el asiento (ronda − 1) mod n, parte el de su izquierda, pone la muestra el de su derecha y empieza el de la derecha de quien puso la muestra; cada ronda se recorren uno a la derecha. `deal` revuelve, parte el mazo al azar (entre el 25 y el 75 %), reparte los montones y saca la muestra; si la de arriba es comodín, quien la sacó se queda con las 5 (en su mano) y el pozo empieza vacío. Los papeles quedan en `hand` (`dealer`, `cutter`, `sampler`, `sampleTaken`) y en la grabación. En la mesa, quien reparte lleva la etiqueta "reparte".

**Ver el pozo (issue #10).** Con el par para levantar, puedes ver las cartas que te llevarías antes de decidir: la acción `peek` del motor enseña tu par a todos (queda en el registro y en `hand.peek`; la compu lo cuenta como carta conocida, igual que lo que alguien levantó) y no cambia el turno ni la fase. Sin el par no se puede ver. Desde la ventana del pozo se levanta con ese par o se roba del mazo.

**Bajada en preparación.** Mientras tu equipo no se baja, la interfaz guarda en el teléfono las patas que vas apartando (`state.stage`), muestra cuánto llevas contra el mínimo y las manda juntas al confirmar (o con el par al levantar el pozo). Se borran solas al cambiar de turno.

**Información oculta.** Igual que en el dominó, el documento completo (con las manos y los montones de todos) es legible por cualquiera de la mesa y cada teléfono aplica las reglas. La compu y el consejo solo leen la vista pública: su mano, la mesa, el pozo, cuántas cartas y montones tiene cada quien y lo que cada quien levantó del pozo (`ai/deduce.js`). El consejo se detiene cuando tu siguiente paso abriría un montón, porque lo que sigue depende de cartas que todavía no ves.

**La compu.** No hay simulaciones Monte Carlo: con 324 cartas y turnos de varias acciones, unas reglas claras rinden más por milisegundo. Los niveles comparten los criterios (`ai/heuristics.js`) y cambian en sus parámetros (`ai/tune.js`). En partidas simuladas (4 jugadores en parejas, 4 rondas), el intermedio le gana al básico 24 de 24 y el avanzado le gana al intermedio unas 2 de cada 3 (34 de 50, +1,900 puntos de diferencia media). Una decisión tarda pocos milisegundos; igual se calcula en el worker para no frenar la pantalla en teléfonos lentos.

**Fin de ronda sin cartas.** Se agregó una regla (por confirmar): si ni revolviendo el pozo alcanzan las 2 cartas para robar, la ronda termina sin que nadie se vaya. Sin ella, con un pozo de una carta se podía robar y descartar para siempre (lo encontró una simulación).

## 5. Llamadas de voz y video

Issue [#3](../../issues/3). WebRTC directo entre teléfonos, **todos con todos** (mesh): con 2 a 4 jugadores cada teléfono abre como mucho 3 conexiones, así que no hace falta servidor de medios ni dependencias. Firestore solo sirve para que los teléfonos se encuentren (señalización); el audio y el video van directo.

| Capa | Archivo | Qué hace |
|---|---|---|
| `services/` | `call-signaling.js` | `pata_llamadas/{código}/peers/{id}` (quién está, con aviso cada 15 s; sin aviso en 45 s ya no cuenta) y `pata_llamadas/{código}/signals/{id}` (oferta, respuesta y candidatos ICE; quien recibe la señal la borra) |
| `app/` | `call-session.js` | Una llamada: conexiones, micrófono, cámara. Es una fábrica sin estado global, para probar dos teléfonos en el mismo proceso |
| `app/` | `call.js` | La conecta con `state.call`: se escucha al abrir una mesa en línea, se cuelga al salir, y suena cuando alguien empieza la llamada |
| `ui/` | `components/call-bar.js` | Botón flotante, aviso "te llama", cuadritos de video y controles. Vive fuera de `#app` para no recrear los `<video>`/`<audio>` en cada jugada (`notify("call")` no redibuja la mesa) |

**Fuera de la mesa.** La llamada no va en el JSON de la mesa: cada señal sería una transacción que choca con las jugadas y sube `v`.

**Negociación sin choques.** En cada pareja solo el de id menor manda ofertas; el otro solo responde. Desde la primera oferta hay un canal de audio y uno de video (vacío si la cámara está apagada), así que prender o apagar la cámara es `replaceTrack` y nunca se renegocia. Se probó primero "perfect negotiation" (ofertas de los dos lados, el educado cede): en Chromium real, con 3 teléfonos, el lado que cedía a veces no mandaba candidatos ICE y la conexión se quedaba en `new`. Con un solo lado que ofrece, 3 teléfonos se conectan todos con todos y el video llega en las dos direcciones.

**`sid`.** Cada vez que alguien entra a la llamada tiene un `sid` nuevo; las señales llevan el de origen y el de destino, y las de una entrada anterior se descartan. Si alguien vuelve a entrar (otro `sid`), la conexión se rehace.

**Calidad.** Audio con cancelación de eco, supresión de ruido y control de ganancia. Video a 320×240, 15 fps y 300 kbps por conexión: con 4 jugadores cada teléfono sube su video 3 veces.

**STUN y TURN.** STUN de Google por omisión. Si `window.TURN_URL` apunta al Worker de `scripts/turn-worker.js`, se usan las credenciales temporales de Cloudflare TURN (sin el puerto 53, que los navegadores bloquean). Sin TURN, en algunas redes (datos móviles con CGNAT, redes de oficina) la llamada puede conectar sin que se oiga.

**Altavoz o auricular.** En iPhone, mientras la página usa el micrófono, Safari manda el audio de los `<audio>` al auricular y se oye muy bajito ([WebKit 218012](https://bugs.webkit.org/show_bug.cgi?id=218012)); lo que sale por Web Audio sí va al altavoz. Por eso `ui/call-audio.js` reproduce a cada quien por Web Audio (ganancia 1.8 con compresor) en modo **altavoz**, con su `<audio>` en silencio (Chrome solo deja pasar audio remoto de WebRTC a Web Audio si el stream también está en un elemento que reproduce), y en modo **auricular** calla Web Audio y suena el `<audio>`. Donde el navegador deja escoger la salida (`setSinkId`) también se intenta escoger el dispositivo por su nombre. El botón solo sale en iPhone: en Android (probado en Galaxy S25 Ultra con Chrome y S26 Ultra con DuckDuckGo) el navegador decide la salida y siempre usó el altavoz; escoger auricular no cambiaba nada.

**Apagar el sonido.** Un botón apaga el sonido de la llamada en tu teléfono (calla Web Audio y los `<audio>`, en altavoz o en auricular) sin apagar tu micrófono. No se recuerda: cada llamada empieza con sonido. El `AudioContext` se crea en el toque de llamar o contestar y se reanuda con cualquier toque mientras dure la llamada (iPhone lo pausa al prender el micrófono). Cada `<audio>` recibe un stream propio solo con la pista de audio, porque Safari no siempre se entera de pistas nuevas en un stream que ya está reproduciendo.

**Quién habla.** Un `AnalyserNode` por persona (y uno para tu micrófono) marca con borde verde a quien habla y con un aro tu micrófono cuando manda sonido. Sirve también para diagnosticar: si el borde se prende pero no se oye, el audio llega y el problema está en la salida; si no se prende, no está llegando.

**Vistas y colapsar.** Un botón pasa por tres vistas: solo el juego (sin cuadritos; siguen sonando), el juego con los videos chiquitos a la derecha (por omisión), y solo los videos en cuadrícula sobre toda la pantalla, incluido el tuyo. Aparte, los botones se colapsan en una píldora (teléfono y número de personas, con el micrófono o el sonido tachados si están apagados, y late cuando alguien habla); colapsar no cambia la vista. Altavoz/auricular, colapsado y vista se recuerdan en el teléfono (`pata.callOut`, `pata.callMin`, `pata.callView`).

**Teléfonos juntos (sin eco).** Si dos teléfonos de la llamada están en el mismo cuarto, lo que dice uno sale por la bocina del otro, el micrófono del primero lo vuelve a oír y se arma un ciclo (eco o chillido). La cancelación de eco de cada teléfono solo conoce lo que ese mismo teléfono reproduce, así que no lo puede quitar. La corrección: los que están juntos **dejan de reproducirse entre sí** (ya se oyen en persona); siguen oyendo y hablando con los demás, y nadie apaga su micrófono.

La detección es **activa** (`app/near.js`, `ui/call-near.js`): al entrar tú o alguien más, tu teléfono toca una melodía corta (3 notas de 140 ms entre 784 y 2349 Hz, distintas para cada teléfono) **con tu micrófono apagado ese instante**, así que no viaja por la red y solo la oye quien esté cerca. Luego busca esas notas, en ese orden y con esos tiempos, en el audio que llega de cada persona (un analizador de frecuencias por persona): cada nota tiene que sobresalir 9 dB de las frecuencias vecinas y 6 dB más que justo antes, con un mismo retraso de hasta 1.5 s para las tres. Quien la oyó está junto a ti. Cada teléfono publica a quién detectó (`near` en su aviso de `peers`) y basta con que uno de los dos lo detecte para que los dos dejen de reproducirse. La espera antes de tocarla es al azar (para que dos teléfonos no la toquen a la vez, porque mientras uno toca su micrófono está apagado), y a quien no se detectó se le prueba una segunda vez. No se prueba con quien tiene su micrófono en silencio.

Antes se probó una detección **pasiva** (comparar la forma del volumen de mi micrófono con lo que llega de cada quien) y en simulaciones no separaba: con unos segundos de habla, dos voces sin relación se parecen por casualidad casi tanto como una cercana, y un falso positivo (dejar de oír a alguien lejos) es peor que el eco. Con la melodía, en Chromium con WebRTC real (Opus de por medio) y la acústica simulada, el teléfono cercano da un puntaje de 49 a 135 (incluso con la melodía 30 dB más bajita, debajo del ruido) y los lejanos de 16 a 27, y nunca hubo falso positivo.

Aviso al detectar ("Barbara está junto a ti: no se reproduce aquí para evitar eco", con "Oír de todos modos"), y su cuadrito queda atenuado con la etiqueta "cerca"; tocarlo la vuelve a reproducir. Lo detectado se olvida al colgar. Límites: si alguien se aleja a media llamada sigue silenciado hasta que toque "Oír de todos modos" o vuelvan a entrar; quien está lejos puede oír un poco doble a los que están juntos (los dos micrófonos los captan); y no está probado en teléfonos reales: el procesamiento de audio de algunos teléfonos (supresión de ruido) podría atenuar la melodía.

**Timbre.** Suena (Web Audio y vibración) solo cuando alguien empieza la llamada estando tú en la mesa y fuera de la llamada, por 30 s. Si la llamada ya estaba al abrir la mesa, solo se muestra el aviso.

**Límites.** Con el juego cerrado o el teléfono bloqueado no suena: necesitaría notificaciones push (FCM, una Cloud Function en el plan Blaze y, en iPhone, el juego instalado en la pantalla de inicio), y aun así llegaría como notificación, no como pantalla de llamada. En iPhone, Safari corta cámara y micrófono al cambiar de app. Si la misma cuenta de Google está en dos teléfonos de la misma mesa, comparten id y la llamada no los distingue.

**Pruebas.** `tests/near.test.js` (la melodía, encontrarla con retraso y ruido, y no confundirla con ruido, tonos constantes o la melodía de otro) y `tests/call.test.js` usa un WebRTC de mentira y el Firebase de mentira: dos y tres teléfonos se conectan, micrófono, cámara (sin renegociar), colgar y volver a entrar, permiso negado, el timbre y los servidores ICE. La negociación real se revisó aparte en Chromium con cámara y micrófono simulados.

## 6. Lo que se reutilizó del dominó

Sin cambios o casi: `services/firebase.js`, `services/updates.js`, `sw.js`, `app/ai-client.js`, `app/updates.js`, `app/recorder.js`, `app/cleanup.js`, `ui/components/sheet.js`, `ui/components/update-bar.js`, los estilos base y del lobby, la pantalla de asientos y el Firebase de mentira de las pruebas. Las colecciones llevan el prefijo `pata_` para compartir el proyecto `dominomx`, y las preferencias del dispositivo el prefijo `pata.`.

## 7. Fuera de alcance

- Servidor propio o validar jugadas en el servidor (mismo criterio que el dominó).
- Notificaciones push para que la llamada suene con el juego cerrado (fase 4 del issue #3).
- Notas sobre las cartas de otros jugadores (el dominó las tiene; aquí el registro es más simple porque casi todo lo que se sabe es exacto).
