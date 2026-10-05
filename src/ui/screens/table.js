// La mesa de juego: marcador, jugadores alrededor, las patas de cada equipo, el mazo y el pozo, tu mano y tus acciones.
import { RULES, nTeams, teamOf, nameOf, topOf, isBlack3, sortCards, cardOrder, suitOf, closedCounts, needsMinimum,
  minimumNow, openingValue, check, pickupPairs, isClosed } from "../../engine/index.js";
import { knownCards } from "../../ai/index.js";
import { actions, canReveal, mySeat, scheduleBot, state, timerOn } from "../../app/index.js";
import { tick } from "../clock.js";
import { renderResult } from "../components/result.js";
import { renderPeek } from "../components/peek.js";
import { closeOverlay, openOverlay, renderSheet } from "../components/sheet.js";
import { rulesHelp } from "../components/rules.js";
import { $, esc } from "../dom.js";
import { modeLabel, teamLabels, teamShort, seatPos, teamColor, isPartner, partnerWord, TOP_ORDER } from "../labels.js";
import { renderSeats } from "./seats.js";
import { cardSVG, backSVG, cardChip } from "../svg/card.js";
import { meldChip, sortMelds } from "../svg/meld.js";
const { leave } = actions;

// Menú de la partida: marcador, reglas, ver manos (práctica), jugadas y salir
function renderGameMenu(st, seat, reveal) {
  const labels = teamLabels(st), mine = seat >= 0 ? teamOf(st, seat) : -1;
  renderSheet($("#modal"), "gameMenu", state.view.practice ? "Práctica" : "Mesa " + st.code, `
    <p class="hint">Ronda ${st.roundNo} de ${RULES.rounds} · ${esc(modeLabel(st.config))}${st.status === "playing" ? ` · para bajarse: ${minimumNow(st)} puntos` : ""}</p>
    ${st.hand && st.hand.dealer !== undefined ? `<p class="hint">Reparte ${esc(nameOf(st, st.hand.dealer))} · parte ${esc(nameOf(st, st.hand.cutter))} · ${st.hand.sampleTaken ? `${esc(nameOf(st, st.hand.sampler))} se quedó la muestra` : `muestra ${esc(nameOf(st, st.hand.sampler))}`}</p>` : ""}
    <div class="scores">${st.scores.map((v, i) => `<div class="score ${i === mine ? "mine" : ""}"><div class="who"><span class="teamdot" style="background:${teamColor(i)}"></span>${esc(labels[i])}</div>
      <div class="val">${v.toLocaleString("es-MX")}</div></div>`).join("")}</div>
    ${canReveal() ? `<button id="reveal" class="${reveal ? "primary" : ""}" aria-pressed="${reveal}">${reveal ? "Ocultar manos" : "Ver manos (revisar a la compu)"}</button>` : ""}
    <details class="help"><summary>Cómo se juega</summary>${rulesHelp()}</details>
    <details class="help"><summary>Jugadas (${st.log.length})</summary><div class="log">${st.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div></details>
    <button id="back">← Salir a mesas</button>
    <button class="primary big-cta" id="menuclose">Volver al juego</button>`);
  $("#menuclose").onclick = closeOverlay;
  $("#back").onclick = () => { closeOverlay(); leave(); };
  $("#reveal")?.addEventListener("click", () => actions.setView({ reveal: !state.view.reveal }));
}

// Las patas de un equipo con su avance hacia las 5 limpias y 5 sucias. De los otros equipos importa qué patas
// tienen abiertas y cuántas cerradas (issue #19): las cerradas se juntan en una ficha que se toca para verlas.
function zoneHTML(st, team, seat, { tappable, sel }) {
  const h = st.hand, melds = h.melds[team], cc = closedCounts(melds), mine = seat >= 0 && teamOf(st, seat) === team;
  const G = RULES.goOut, down = h.down[team];
  const all = sortMelds(melds), closed = all.filter(isClosed);
  const collapse = !mine && closed.length > 0, expanded = (state.view.showClosed || []).includes(team);
  const order = collapse && !expanded ? all.filter((m) => !isClosed(m)) : all;
  const toggle = collapse ? `<button class="closed-chip ${expanded ? "on" : ""}" data-closed="${team}" aria-expanded="${expanded}" aria-label="${expanded ? "Ocultar" : "Ver"} sus ${closed.length} patas cerradas">${expanded ? "Ocultar cerradas" : `✓ ${closed.length} cerrada${closed.length === 1 ? "" : "s"}`}</button>` : "";
  const chips = order.map((m) => {
    const can = tappable && sel.length > 0;
    const hot = can && !check(st, seat, { type: "add", meld: m.id, cards: sel });
    return meldChip(m, { tappable: can, hot });
  }).join("");
  const prog = (have, need, label) => `<span class="prog ${have >= need ? "done" : ""}">${label} <b>${Math.min(have, 99)}</b>/${need}</span>`;
  return `<section class="zone ${mine ? "mine" : ""}" aria-label="Patas de ${esc(teamShort(st, team, seat))}">
    <div class="zone-head"><span class="teamdot" style="background:${teamColor(team)}"></span><b>${esc(teamShort(st, team, seat))}</b>
      ${prog(cc.clean, G.clean, "Limpias")}${prog(cc.dirty, G.dirty, "Sucias")}${down ? "" : `<span class="notdown">sin bajarse</span>`}</div>
    <div class="melds">${toggle}${chips || (toggle ? "" : `<span class="empty-z">${down ? "" : "Todavía no hay patas"}</span>`)}</div>
  </section>`;
}

// Tu mano en filas que caben a lo ancho (las cartas se enciman si son muchas)
function handRows(cards, width, cardW) {
  if (!cards.length) return [];
  const minStep = cardW * 0.5; // como mucho se enciman a la mitad
  const perMax = Math.max(1, Math.floor((width - cardW) / minStep) + 1);
  const rows = Math.ceil(cards.length / perMax);
  const per = Math.ceil(cards.length / rows);
  const out = [];
  for (let i = 0; i < cards.length; i += per) out.push(cards.slice(i, i + per));
  return out;
}

export function sortHand(hand, by) {
  if (by === "suit") return hand.slice().sort((a, b) => ("SHDCRB".indexOf(suitOf(a)) - "SHDCRB".indexOf(suitOf(b))) || cardOrder(a) - cardOrder(b));
  return sortCards(hand);
}

export function renderTable(app) {
  const st = state.tableState;
  app.className = "wrap";
  if (!st) { app.innerHTML = `<div class="top"><button class="ghost" id="back">← Mesas</button></div><p class="hint">${esc(state.view.err || "Cargando mesa…")}</p>`; $("#back").onclick = leave; $("#modal").innerHTML = ""; return; }
  const seat = mySeat(st);
  if (st.status === "lobby") return renderSeats(app, st, seat);
  app.className = "game";
  const c = st.config, h = st.hand, n = c.n, T = nTeams(c);
  const myTeam = seat >= 0 ? teamOf(st, seat) : 0;
  const playing = st.status === "playing";
  const myTurn = playing && seat >= 0 && h.turn === seat;
  const reveal = state.view.reveal && canReveal();
  const known = playing ? knownCards(st) : st.seats.map(() => []);
  const hand = seat >= 0 ? h.hands[seat] : [];
  const sel = state.view.sel.filter((x) => hand.includes(x));
  if (sel.length !== state.view.sel.length) state.view.sel = sel;
  const staged = seat >= 0 && playing ? actions.stagedGroups(st, seat) : [];
  const stagedCards = new Set(staged.flat());
  const needMin = seat >= 0 && playing && needsMinimum(st, seat);

  // Marcador corto: mi equipo primero
  const order = [...Array(T).keys()].sort((a, b) => (b === myTeam) - (a === myTeam));
  // Con 3 equipos o más solo el punto de color y los puntos (los nombres están en cada zona), para que quepa
  const many = T > 2;
  const short = order.map((t) => `<span class="sc ${t === myTeam && seat >= 0 ? "mine" : ""}" ${many ? `aria-label="${esc(teamShort(st, t, seat))}: ${st.scores[t]}"` : ""}><span class="teamdot" style="background:${teamColor(t)}"></span>${many ? "" : esc(teamShort(st, t, seat).slice(0, 9)) + " "}<b>${st.scores[t].toLocaleString("es-MX")}</b></span>`).join("");

  // Jugadores alrededor de la mesa: una franja en su orilla
  const badge = (s) => {
    const pos = seatPos(st, seat, s), cnt = h.hands[s].length, piles = h.piles[s].length;
    const partner = isPartner(st, seat, s);
    const backs = reveal ? `<span class="rl-rev">${sortCards(h.hands[s]).map(cardChip).join("")}</span>` : `<span class="rl-backs">${"<i></i>".repeat(Math.min(cnt, 12))}</span>`;
    // Arriba con 6 jugadores, compacto: C:4 · M1/3 (cartas y montón; issue #19)
    const compact = n === 6 && pos.startsWith("top");
    const info = (compact ? [`C:${cnt}`, `M${h.pileNo[s]}/${RULES.piles}`, known[s].length ? `lev ${known[s].length}` : ""]
      : [`${cnt} carta${cnt === 1 ? "" : "s"}`, `montón ${h.pileNo[s]}/${RULES.piles}`, known[s].length ? `levantó ${known[s].length}` : ""]).filter(Boolean).join(" · ");
    const infoLong = [`${cnt} carta${cnt === 1 ? "" : "s"}`, `montón ${h.pileNo[s]} de ${RULES.piles}`, known[s].length ? `levantó ${known[s].length}` : ""].filter(Boolean).join(", ");
    return `<button class="rl rl-${pos} ${playing && h.turn === s ? "turn" : ""}" data-track="${s}" aria-label="${esc(nameOf(st, s))}${partner ? ", tu " + partnerWord(st) : ""}: ${infoLong}. Ver registro">
      <span class="rl-nm"><span class="teamdot" style="background:${teamColor(teamOf(st, s))}"></span>${esc(nameOf(st, s))}${partner ? " · " + partnerWord(st) : ""}${h.dealer === s ? ` <span class="dealer" title="Reparte esta ronda">reparte</span>` : ""}</span>
      ${backs}<span class="rl-info">${esc(info)}</span></button>`;
  };
  const others = []; for (let k = 0; k < n; k++) if (k !== seat) others.push(k);
  const at = (pos) => others.filter((s) => seatPos(st, seat, s) === pos).map(badge).join("");
  // Arriba caben hasta 3 (con 6 jugadores), de izquierda a derecha
  const atTop = () => TOP_ORDER.map(at).join("");

  // Patas: rivales arriba, tu equipo abajo (cerca de tu mano)
  const canAdd = myTurn && h.phase === "play" && h.down[myTeam];
  const zonesTop = order.filter((t) => t !== myTeam || seat < 0).reverse().map((t) => zoneHTML(st, t, seat, { tappable: false, sel })).join("");
  const zoneMine = seat >= 0 ? zoneHTML(st, myTeam, seat, { tappable: canAdd, sel }) : "";

  // Mazo y pozo
  const top = topOf(h);
  const drawPhase = myTurn && h.phase === "draw";
  const pairs = drawPhase ? pickupPairs(st, seat) : [];
  const pile = `<div class="piles">
      <button class="stack ${drawPhase ? "hot" : ""}" id="stock" ${drawPhase ? "" : "disabled"} aria-label="Mazo: ${h.stock.length} cartas${drawPhase ? ". Robar 2" : ""}">${backSVG(40, 56)}<span class="cnt">${h.stock.length}</span></button>
      <button class="stack ${drawPhase && pairs.length ? "hot" : ""}" id="discard" ${drawPhase && top ? "" : "disabled"} aria-label="Pozo: ${h.discard.length} cartas${top ? "" : ", vacío"}${top && isBlack3(top) ? ", tapado con un 3 negro" : ""}${drawPhase ? ". Levantar" : ""}">
        ${top ? cardSVG(top, 40, 56) : `<span class="emptypile"></span>`}<span class="cnt">${h.discard.length}</span>${top && isBlack3(top) ? `<span class="lock">tapado</span>` : ""}</button>
    </div>`;

  // Estado y ayuda del turno
  let statusTxt = "";
  if (playing) {
    if (myTurn) statusTxt = h.phase === "draw" ? (pairs.length ? "Te toca: roba 2 o levanta el pozo" : "Te toca: roba 2 del mazo") : needMin ? `Bájate con ${minimumNow(st)} puntos, o descarta` : sel.length ? "Toca una pata para agregar, o baja o descarta" : "Escoge cartas para bajar, agregar o descartar";
    else statusTxt = `Turno de ${nameOf(st, h.turn)}`;
    // Primer turno de la ronda: si la muestra salió con comodín arriba, quien la sacó se la quedó (issue #11)
    if (h.turns === 0 && h.phase === "draw" && h.dealer === seat && !h.sampleTaken) statusTxt = "Repartiste. " + statusTxt;
    if (h.turns === 0 && h.phase === "draw" && h.sampleTaken) statusTxt = `${h.sampler === seat ? "Te quedaste" : nameOf(st, h.sampler) + " se quedó"} la muestra (salió comodín). ` + statusTxt;
  }

  // Bajada en preparación
  const stagedVal = openingValue(staged), minNow = playing ? minimumNow(st) : 0;
  const stagePanel = needMin && (staged.length || myTurn) ? `<div class="stage" aria-label="Tu bajada">
      <div class="stage-head"><b>Tu bajada</b> <span class="stage-sum ${stagedVal >= minNow ? "ok" : ""}">${stagedVal} / ${minNow}</span>
        ${staged.length ? `<button class="mini ghost" id="unstageall">Quitar</button>` : ""}
        ${myTurn && h.phase === "draw" && sel.length >= 3 ? `<button class="mini primary" id="stagenow">Apartar (${sel.length})</button>` : ""}
        ${staged.length && myTurn && h.phase === "play" ? `<button class="mini primary" id="confirm" ${stagedVal >= minNow ? "" : "disabled"}>Bajarme</button>` : ""}</div>
      ${staged.length ? `<div class="stage-groups">${staged.map((g, i) => `<button class="sgroup" data-unstage="${i}" aria-label="Quitar esta pata de la bajada">${g.map(cardChip).join("")}<span aria-hidden="true">✕</span></button>`).join("")}</div>`
        : `<p class="hint small">${h.phase === "draw" && myTurn ? "Para levantar el pozo sin haberte bajado: escoge las cartas de tu bajada (sin el par), toca Apartar y luego Levantar pozo." : "Escoge 3 o más cartas iguales y toca Apartar."}</p>`}
    </div>` : "";

  // Mano
  const newOnes = new Set(h.lastDraw && h.lastDraw.seat === seat ? h.lastDraw.cards : []);
  const sorted = sortHand(hand.filter((x) => !stagedCards.has(x)), state.sortBy);

  app.innerHTML = `
    <header class="gbar">
      <button class="menubtn" id="menu" aria-label="Menú de la partida" aria-haspopup="dialog"><span></span><span></span><span></span></button>
      <div class="bar-sc ${T > 2 ? "many" : ""}">${short}</div>
      <div class="bar-info">Ronda <b>${st.roundNo}</b>/${RULES.rounds}</div>
    </header>
    <section class="table">
      <div class="rail rail-top ${n === 6 ? "three" : ""}">${atTop()}</div>
      <div class="rail rail-left">${at("left")}</div>
      <div class="board" id="board">
        <div class="zones">${zonesTop}</div>
        ${pile}
        <div class="zones">${zoneMine}</div>
      </div>
      <div class="rail rail-right">${at("right")}</div>
    </section>
    <section class="me">
      <div class="status ${myTurn ? "me" : ""}">${esc(statusTxt)}${playing && timerOn(st) ? ` <span id="clock" class="clock"></span>` : ""}</div>
      ${playing && timerOn(st) ? `<div class="timer" aria-hidden="true"><i id="clockbar"></i></div>` : ""}
      ${stagePanel}
      <div class="hand" id="hand" aria-label="Tu mano: ${hand.length} cartas"></div>
      ${seat >= 0 && playing ? `<div class="actions">
        ${drawPhase ? `<button id="draw" class="primary">Robar 2</button><button id="pick" ${pairs.length ? "" : "disabled"}>Levantar pozo</button>${pairs.length ? `<button id="peek" aria-label="Ver las cartas del pozo enseñando tu par">Ver pozo</button>` : ""}`
          : `<button id="meld" ${myTurn && h.phase === "play" && sel.length >= 3 ? "" : "disabled"}>${needMin ? "Apartar" : "Bajar"}${sel.length >= 3 ? ` (${sel.length})` : ""}</button>
             <button id="discardbtn" ${myTurn && h.phase === "play" && sel.length === 1 ? "" : "disabled"}>Descartar</button>`}
        <button id="advice" class="ghost-felt" ${myTurn ? "" : "disabled"}>Consejo</button>
        <button id="sort" class="ghost-felt" aria-label="Ordenar por ${state.sortBy === "rank" ? "palo" : "número"}">${state.sortBy === "rank" ? "Por palo" : "Por número"}</button></div>` : ""}
      ${seat < 0 ? `<p class="hint center">Estás mirando la mesa.</p>` : ""}
      ${state.view.err ? `<p class="err" role="alert">${esc(state.view.err)}</p>` : ""}
    </section>`;

  // Mano: se acomoda en filas según el ancho real
  const handEl = $("#hand");
  if (handEl && seat >= 0) {
    const W = handEl.clientWidth || 360, CW = W >= 640 ? 56 : W < 340 ? 42 : 48, CH = Math.round(CW * 1.41);
    const rows = handRows(sorted, W, CW);
    handEl.innerHTML = rows.map((row) => {
      const step = row.length > 1 ? Math.min(CW + 2, (W - CW) / (row.length - 1)) : CW;
      const ov = Math.min(2, step - CW);
      return `<div class="hrow">${row.map((x, i) => `<button class="cardbtn ${sel.includes(x) ? "sel" : ""} ${newOnes.has(x) ? "new" : ""}" style="${i ? `margin-left:${ov.toFixed(1)}px` : ""}" data-card="${x}" aria-pressed="${sel.includes(x)}" aria-label="${esc(cardLabel(x))}">${cardSVG(x, CW, CH)}</button>`).join("")}</div>`;
    }).join("") || `<p class="hint center">${playing ? "Sin cartas en la mano" : ""}</p>`;
    handEl.querySelectorAll("[data-card]").forEach((b) => b.onclick = () => actions.toggleCard(b.dataset.card));
  }

  $("#menu").onclick = () => openOverlay({ sheet: "gameMenu" });
  app.querySelectorAll("[data-track]").forEach((b) => b.onclick = () => openOverlay({ track: +b.dataset.track }));
  $("#stock")?.addEventListener("click", () => actions.doDraw(seat));
  $("#draw")?.addEventListener("click", () => actions.doDraw(seat));
  $("#discard")?.addEventListener("click", () => actions.doPickup(seat));
  $("#pick")?.addEventListener("click", () => actions.doPickup(seat));
  $("#peek")?.addEventListener("click", () => actions.doPeek(seat));
  $("#meld")?.addEventListener("click", () => actions.doMeld(seat));
  $("#discardbtn")?.addEventListener("click", () => actions.doDiscard(seat));
  $("#advice")?.addEventListener("click", () => actions.askAdvice(seat));
  $("#sort")?.addEventListener("click", () => actions.setSort(state.sortBy === "rank" ? "suit" : "rank"));
  $("#confirm")?.addEventListener("click", () => actions.confirmOpening(seat));
  $("#unstageall")?.addEventListener("click", () => actions.clearStage());
  // Antes de robar también se puede apartar la bajada, para levantar el pozo (issue #18)
  $("#stagenow")?.addEventListener("click", () => actions.stageSelected(st, seat));
  app.querySelectorAll("[data-unstage]").forEach((b) => b.onclick = () => actions.unstage(+b.dataset.unstage));
  app.querySelectorAll("[data-meld]").forEach((b) => b.onclick = () => actions.doAdd(seat, +b.dataset.meld));
  // Ver u ocultar las patas cerradas de otro equipo
  app.querySelectorAll("[data-closed]").forEach((b) => b.onclick = () => {
    const t = +b.dataset.closed, cur = state.view.showClosed || [];
    actions.setView({ showClosed: cur.includes(t) ? cur.filter((x) => x !== t) : cur.concat(t) });
  });
  // Si la mesa no cabe, se muestra la parte de abajo (tus patas y el pozo); arriba se llega recorriendo
  const board = $("#board");
  if (board && board.scrollHeight > board.clientHeight + 2) board.scrollTop = board.scrollHeight;
  // Una sola ventana a la vez, en este orden: menú de la partida, resultado de la ronda, consejo, registro
  if (state.view.sheet === "gameMenu") renderGameMenu(st, seat, reveal);
  else if (state.view.sheet === "peek") renderPeek(st, seat);
  else renderResult(st, seat);
  scheduleBot();
  tick();
}

const RANK_WORD = { A: "As", T: "10", J: "J", Q: "Q", K: "K", X: "Joker" };
const SUIT_WORD = { S: "espadas", H: "corazones", D: "diamantes", C: "tréboles" };
function cardLabel(c) {
  if (c[0] === "X") return "Joker";
  return `${RANK_WORD[c[0]] || c[0]} de ${SUIT_WORD[c[1]]}`;
}
