// Fin de ronda y puntuación. Funciones puras.
//
// Por equipo: limpias cerradas (500) y sucias cerradas (300); las primeras 5 y 5 cuentan para todos y las extra
// solo para el equipo que se fue (RULES.baseCountsForAll). Las especiales siempre cuentan: suman completas y
// restan lo mismo incompletas. Irse da +500. Cada 3 rojo guardado (en la mano o en montones sin abrir) resta 500.
// Las patas de menos de 7 y las demás cartas no cuentan. Tras la ronda 4 gana el equipo con más puntos.
import { RULES, nTeams, teamOf } from "./config.js";
import { isRed3 } from "./cards.js";
import { closedCounts, isClosed, isSpecial, meldClass, specialValue } from "./melds.js";
import { pushLog, nameOf } from "./table.js";

// Puntos de la ronda de cada equipo, sin cambiar la mesa. goer = asiento que se fue, o null.
export function roundBreakdown(st, goer) {
  const h = st.hand, T = nTeams(st.config), P = RULES.points, G = RULES.goOut;
  const goerTeam = goer === null || goer === undefined ? null : teamOf(st, goer);
  const rows = [];
  for (let t = 0; t < T; t++) {
    const melds = h.melds[t], { clean, dirty } = closedCounts(melds);
    const all = t === goerTeam;
    const cleanN = all ? clean : RULES.baseCountsForAll ? Math.min(clean, G.clean) : 0;
    const dirtyN = all ? dirty : RULES.baseCountsForAll ? Math.min(dirty, G.dirty) : 0;
    const specials = melds.filter(isSpecial).map((m) => ({ id: m.id, cls: meldClass(m), closed: isClosed(m), pts: (isClosed(m) ? 1 : -1) * specialValue(m) }));
    let red3 = 0;
    st.seats.forEach((_, s) => {
      if (teamOf(st, s) !== t) return;
      red3 += h.hands[s].filter(isRed3).length + h.piles[s].flat().filter(isRed3).length;
    });
    const row = {
      team: t, clean, dirty, cleanN, dirtyN,
      cleanPts: cleanN * P.clean, dirtyPts: dirtyN * P.dirty,
      specials, specialPts: specials.reduce((q, x) => q + x.pts, 0),
      out: all ? P.out : 0, red3, red3Pts: red3 * P.red3,
    };
    row.total = row.cleanPts + row.dirtyPts + row.specialPts + row.out + row.red3Pts;
    rows.push(row);
  }
  return { goer: goerTeam === null ? null : goer, team: goerTeam, rows };
}

// Termina la ronda (s ya es una copia): suma los puntos y decide si sigue otra ronda o terminó la partida
export function endRound(s, goer, now) {
  const b = roundBreakdown(s, goer);
  s.scores = s.scores.map((v, t) => v + b.rows[t].total);
  const over = s.roundNo >= RULES.rounds;
  const best = Math.max(...s.scores);
  const champions = s.scores.map((v, t) => (v === best ? t : -1)).filter((t) => t >= 0);
  s.result = { ...b, round: s.roundNo, over, champion: over ? champions[0] : null, champions: over ? champions : null };
  s.status = over ? "gameover" : "roundover";
  s.hand.phase = "over"; s.hand.endedAt = now ?? null;
  s.log = pushLog(s.log, goer === null || goer === undefined ? `Fin de la ronda ${s.roundNo}` : `Fin de la ronda ${s.roundNo}: se fue ${nameOf(s, goer)}`);
  s.v++;
  return s;
}
