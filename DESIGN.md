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

**Patas:** `kind` es `"natural"` (del 4 al A, con comodines), `"wild"` (pata especial de comodines) o `"red3"`. La clase (limpia, sucia, de 2, de jokers, de comodines) sale de las cartas; una pata cerrada no puede cambiar de clase, que es lo que hace que una limpia cerrada no se ensucie. Por equipo hay como mucho una pata abierta de cada número; cuando se cierra se puede empezar otra.

**Tamaño:** una mesa a media ronda pesa unos 25 KB y una ronda grabada de 17 a 30 KB, muy lejos del límite de 1 MB de Firestore.

## 4. Diferencias con el dominó

**Turno en varias acciones.** En el dominó cada turno es una jugada. Aquí son robar, después varias acciones (bajar, agregar, abrir montón) y al final descartar. El motor recibe una acción a la vez (`apply`), cada acción es su propia transacción en línea, y la clave del turno (`turnKey`) incluye cuántas acciones lleva la ronda, para que la jugada de la compu nunca se aplique dos veces. El reloj corre por turno (`clockKey`), no por acción: 60 s, y al vencerse roba (si no había robado) y descarta solo.

**`legalActions` no enumera todo.** Las combinaciones para bajarse son demasiadas. `legalActions` da las acciones sencillas (robar, levantar con cada par, descartar cada carta, agregar una carta, bajar las tercias que ya tienes) y quien juega arma las grandes; `check(mesa, asiento, acción)` dice si una acción vale y por qué no.

**Bajada en preparación.** Mientras tu equipo no se baja, la interfaz guarda en el teléfono las patas que vas apartando (`state.stage`), muestra cuánto llevas contra el mínimo y las manda juntas al confirmar (o con el par al levantar el pozo). Se borran solas al cambiar de turno.

**Información oculta.** Igual que en el dominó, el documento completo (con las manos y los montones de todos) es legible por cualquiera de la mesa y cada teléfono aplica las reglas. La compu y el consejo solo leen la vista pública: su mano, la mesa, el pozo, cuántas cartas y montones tiene cada quien y lo que cada quien levantó del pozo (`ai/deduce.js`). El consejo se detiene cuando tu siguiente paso abriría un montón, porque lo que sigue depende de cartas que todavía no ves.

**La compu.** No hay simulaciones Monte Carlo: con 324 cartas y turnos de varias acciones, unas reglas claras rinden más por milisegundo. Los niveles comparten los criterios (`ai/heuristics.js`) y cambian en sus parámetros (`ai/tune.js`). En partidas simuladas (4 jugadores en parejas, 4 rondas), el intermedio le gana al básico 24 de 24 y el avanzado le gana al intermedio unas 2 de cada 3 (34 de 50, +1,900 puntos de diferencia media). Una decisión tarda pocos milisegundos; igual se calcula en el worker para no frenar la pantalla en teléfonos lentos.

**Fin de ronda sin cartas.** Se agregó una regla (por confirmar): si ni revolviendo el pozo alcanzan las 2 cartas para robar, la ronda termina sin que nadie se vaya. Sin ella, con un pozo de una carta se podía robar y descartar para siempre (lo encontró una simulación).

## 5. Lo que se reutilizó del dominó

Sin cambios o casi: `services/firebase.js`, `services/updates.js`, `sw.js`, `app/ai-client.js`, `app/updates.js`, `app/recorder.js`, `app/cleanup.js`, `ui/components/sheet.js`, `ui/components/update-bar.js`, los estilos base y del lobby, la pantalla de asientos y el Firebase de mentira de las pruebas. Las colecciones llevan el prefijo `pata_` para compartir el proyecto `dominomx`, y las preferencias del dispositivo el prefijo `pata.`.

## 6. Fuera de alcance

- Servidor propio o validar jugadas en el servidor (mismo criterio que el dominó).
- Video y voz.
- Notas sobre las cartas de otros jugadores (el dominó las tiene; aquí el registro es más simple porque casi todo lo que se sabe es exacto).
