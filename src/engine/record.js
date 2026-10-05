// Grabación de rondas: de una ronda terminada a un registro que se puede guardar, reproducir y exportar.
// Funciones puras: no saben de Firebase ni de localStorage (eso vive en app/recorder.js y services/).
//
// Un registro es UNA RONDA terminada, con el reparto completo (manos, montones, pozo y mazo en orden) y cada acción,
// para poder reproducirla con las reglas del motor. La partida completa se arma juntando sus rondas (groupGames).
import { RULES, nTeams } from "./config.js";
import { apply } from "./moves.js";

export const RECORD_VERSION = 1;

const finished = (st) => !!(st && st.hand && st.hand.start && st.result && (st.status === "roundover" || st.status === "gameover"));

export function roundRecordId(st) {
  return finished(st) && st.gameId ? `${st.gameId}_${st.roundNo}` : null;
}

// ctx: { mode: "online" | "practice", app: versión del juego, isBot(seat) opcional }
export function buildRoundRecord(st, ctx = {}) {
  const id = roundRecordId(st); if (!id) return null;
  const h = st.hand, r = st.result, c = st.config;
  const isBot = ctx.isBot || ((s) => !!(st.seats[s] && st.seats[s].bot));
  const players = st.seats.map((p, s) => {
    const bot = isBot(s);
    return { seat: s, name: (p && p.name) || null, id: (p && p.id) || null, bot, level: bot ? (p && p.level) || 1 : null };
  });
  let prevT = h.start.t;
  const events = h.history.map((e) => {
    const t = e.t ?? null;
    const by = e.auto ? "auto" : players[e.s] && players[e.s].bot ? "bot" : "human";
    const { s, a, t: _t, auto, ...rest } = e;
    const ev = { t, ms: t !== null && prevT ? Math.max(0, t - prevT) : null, s, a, by, ...rest };
    if (t !== null) prevT = t;
    return ev;
  });
  return {
    v: RECORD_VERSION, id, gameId: st.gameId, round: st.roundNo,
    mode: ctx.mode || "online", app: ctx.app || null, code: st.code || null,
    config: { n: c.n, teams: c.teams === true ? true : c.teams || false, timer: c.timer !== false },
    rules: { minimum: RULES.minimums[st.roundNo - 1], baseCountsForAll: RULES.baseCountsForAll, red3FromHand: RULES.red3FromHand },
    players,
    gameStart: st.gameStart || null, start: h.start.t || null, end: events.length ? events[events.length - 1].t : null,
    deal: h.start,
    events,
    result: {
      goer: r.goer, team: r.team, rows: r.rows,
      scoresBefore: st.scores.map((v, i) => v - r.rows[i].total), scores: st.scores,
      over: !!r.over, champion: r.over ? r.champion : null,
    },
  };
}

// Vuelve a jugar la ronda desde el reparto, acción por acción, con las mismas reglas del juego.
// Devuelve el estado final; truena si alguna acción no es válida.
export function replayRound(rec) {
  const d = rec.deal, n = rec.config.n, T = nTeams(rec.config);
  const h = {
    stock: d.stock.slice(), discard: d.discard.slice(), hands: d.hands.map((x) => x.slice()), piles: d.piles.map((p) => p.map((x) => x.slice())),
    pileNo: Array(n).fill(1), melds: Array.from({ length: T }, () => []), down: Array(T).fill(false),
    turn: d.turn, phase: "draw", turns: 0, nextId: 1, lastDraw: null, history: [], since: d.t, start: d,
  };
  const seats = rec.players.map((p) => (p.name ? { id: p.id, name: p.name } : null));
  let st = { code: rec.code, config: { ...rec.config }, seats, status: "playing", scores: rec.result.scoresBefore.slice(),
    roundNo: rec.round, hand: h, result: null, log: [], v: 0, gameId: rec.gameId };
  for (const e of rec.events) {
    if (st.status !== "playing") throw new Error("La ronda ya había terminado");
    const action = { type: e.a };
    if (e.a === "pickup") { action.pair = e.pair; if (e.open) action.open = e.open; }
    if (e.a === "peek") action.pair = e.pair;
    if (e.a === "meld") action.groups = e.groups;
    if (e.a === "add") { action.meld = e.meld; action.cards = e.cards; }
    if (e.a === "discard") action.card = e.card;
    st = apply(st, e.s, action, { now: e.t, reshuffle: e.reshuffled ? e.reshuffled.map((x) => x.slice()) : undefined });
  }
  if (st.status === "playing") throw new Error("La ronda no terminó");
  return st;
}

// Junta los registros de ronda en partidas (una por gameId, rondas en orden). Una partida sin la ronda que la
// cierra (o con rondas faltantes) queda marcada como abandonada.
export function groupGames(records) {
  const byGame = new Map();
  for (const r of records) {
    if (!r || !r.gameId) continue;
    if (!byGame.has(r.gameId)) byGame.set(r.gameId, new Map());
    byGame.get(r.gameId).set(r.round, r);
  }
  const games = [];
  for (const [gameId, m] of byGame) {
    const rounds = [...m.values()].sort((a, b) => a.round - b.round);
    const first = rounds[0], last = rounds[rounds.length - 1];
    const complete = rounds.every((r, i) => r.round === i + 1);
    const over = !!last.result.over;
    games.push({
      v: RECORD_VERSION, gameId, mode: first.mode, app: first.app, config: first.config,
      players: first.players, start: first.gameStart || first.start, end: last.end,
      status: over && complete ? "finished" : "abandoned",
      scores: last.result.scores, champion: over ? last.result.champion : null,
      rounds: rounds.map(({ v, gameId: g, mode, app, config, players, gameStart, code, ...rest }) => rest),
    });
  }
  return games.sort((a, b) => (a.start || 0) - (b.start || 0));
}
