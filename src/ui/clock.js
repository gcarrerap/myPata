// Reloj de turno: pinta lo que calcula src/app/clock.js y, si se venció el turno, lo resuelve.
import { tickClock } from "../app/index.js";
import { $ } from "./dom.js";

export function tick() {
  const c = tickClock(); if (!c) return;
  const el = $("#clock"), bar = $("#clockbar");
  if (el) { el.textContent = `· ${c.secs} s`; el.classList.toggle("low", c.secs <= 5); }
  if (bar) { bar.style.width = c.pct + "%"; bar.classList.toggle("low", c.secs <= 5); }
  if (c.fire) c.fire();
}
