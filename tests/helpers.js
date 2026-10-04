// Utilidades para las pruebas: azar con semilla, mesas armadas a mano y partidas completas con la compu.
import { newTable, deal, apply, RULES } from "../src/engine/index.js";
import { botMove } from "../src/ai/index.js";

export const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// Mesa en juego armada a mano. Lo que no se da se llena con valores vacíos.
// o: { n, teams, hands, piles, discard, stock, melds, down, turn, phase, roundNo, scores }
export function makeState(o = {}) {
  const n = o.n || 4, teams = o.teams ?? n === 4, T = teams ? 2 : n;
  const st = newTable("TEST", { n, teams, timer: false }, "h0", 1000);
  st.seats = Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: ["Ana", "Beto", "Caro", "Dani"][i] }));
  st.status = "playing"; st.roundNo = o.roundNo || 1; st.gameId = "gtest";
  if (o.scores) st.scores = o.scores.slice();
  let id = 1;
  const melds = (o.melds || Array.from({ length: T }, () => [])).map((ms) => ms.map((m) => ({ id: m.id ?? id++, kind: m.kind || "natural", rank: m.rank, cards: m.cards.slice() })));
  st.hand = {
    stock: (o.stock || []).slice(), discard: (o.discard || []).slice(),
    hands: (o.hands || Array.from({ length: n }, () => [])).map((h) => h.slice()),
    piles: (o.piles || Array.from({ length: n }, () => [])).map((p) => p.map((x) => x.slice())),
    pileNo: Array(n).fill(1), melds, down: o.down || melds.map((ms) => ms.length > 0),
    turn: o.turn ?? 0, phase: o.phase || "draw", turns: 0, nextId: 100, lastDraw: null, history: [], since: 1000,
    start: { t: 1000, hands: [], piles: [], discard: [], stock: [], turn: 0 },
  };
  return st;
}

// n cartas iguales de un número (distintas por palo y baraja): run("K", 3) → ["KS0","KH0","KD0"]
export function run(rank, count, from = 0) {
  const out = [];
  for (let i = from; out.length < count; i++) out.push(rank + "SHDC"[i % 4] + Math.floor(i / 4));
  return out;
}

// Patas cerradas de relleno para un equipo: limpias y sucias de 7 cartas
export function closedMelds(clean, dirty) {
  const ranks = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"], out = [];
  let k = 0;
  for (let i = 0; i < clean; i++) out.push({ rank: ranks[k], cards: run(ranks[k++], 7, 8) });
  for (let i = 0; i < dirty; i++) {
    const r = ranks[k++ % ranks.length], suit = "SHDC"[i % 4], d = i < 4 ? [4, 5] : [2, 3];
    out.push({ rank: r, cards: [...run(r, 5, 16), `2${suit}${d[0]}`, `2${suit}${d[1]}`] });
  }
  return out;
}

// Juega una partida completa con la compu en todos los asientos. onStep(st) se llama después de cada acción.
export function playBots(levels, config, seed, onStep) {
  const rnd = seeded(seed);
  let st = newTable("SIM", config, "h", 0);
  st.seats = levels.map((l, i) => ({ id: "b" + i, name: "Compu " + (i + 1), bot: true, level: l }));
  let actions = 0;
  while (st.status !== "gameover") {
    st = deal(st, rnd, 0);
    while (st.status === "playing") {
      const s = st.hand.turn, m = botMove(st, s, levels[s]);
      if (!m) throw new Error("La compu no encontró jugada");
      const { why, ...a } = m;
      st = apply(st, s, a, { rnd, now: actions });
      actions++;
      if (onStep) onStep(st, a);
      if (actions > 20000) throw new Error("La partida no termina");
    }
  }
  return st;
}

export const TOTAL = RULES.decks * 54;
