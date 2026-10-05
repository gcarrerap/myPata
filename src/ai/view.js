// Vista de la mesa desde un asiento: solo lo que ese jugador puede saber. La compu y el consejo deciden con esto.
// Las cartas ajenas, los montones sin abrir (también los propios) y el orden del mazo nunca entran aquí.
import { teamOf, nTeams, minimumNow, needsMinimum, topOf, nextSeat, decksFor } from "../engine/index.js";
import { knownCards } from "./deduce.js";

export function publicView(st, seat) {
  const h = st.hand, team = teamOf(st, seat), next = nextSeat(st, seat);
  return {
    seat, team, n: st.config.n, teams: !!st.config.teams, nTeams: nTeams(st.config), round: st.roundNo, decks: decksFor(st.config.n),
    minimum: minimumNow(st), needsMin: needsMinimum(st, seat),
    hand: h.hands[seat].slice(), myPilesLeft: h.piles[seat].length,
    handCounts: h.hands.map((x) => x.length), pilesLeft: h.piles.map((p) => p.length),
    melds: h.melds[team], allMelds: h.melds, down: h.down.slice(),
    discard: h.discard.slice(), top: topOf(h), stockCount: h.stock.length,
    phase: h.phase, turn: h.turn,
    known: knownCards(st), next, nextTeam: teamOf(st, next),
  };
}
