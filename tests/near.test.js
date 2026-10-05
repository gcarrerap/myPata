// Pruebas de la detección de teléfonos juntos (app/near.js): la melodía de cada teléfono, la medida de cada nota
// en un espectro, encontrar la melodía con retraso y ruido, no confundirla con ruido, un tono que ya sonaba ni
// con la melodía de otro, y a quién se deja de reproducir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chimeFor, toneSnr, detectChime, silencedPeers, NOTES, NOTE_MS, GAP_MS, MAX_LAG_MS } from "../src/app/near.js";

let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Cuadros cada 20 ms con el SNR de cada nota: la melodía aparece con retraso `lag` y nivel `level` dB, más ruido
function frames(chime, { lag = 0, level = 15, noise = 4, from = -300, to = 2500, extra = () => ({}) } = {}) {
  const out = [];
  for (let t = from; t <= to; t += 20) {
    const snr = {};
    for (const f of NOTES) snr[f] = rnd() * noise;
    if (lag !== null) for (const n of chime) { const a = n.t + lag; if (t >= a && t <= a + n.d) snr[n.f] = level + rnd() * 3; }
    out.push({ t, snr: { ...snr, ...extra(t) } });
  }
  return out;
}

test("cada teléfono tiene una melodía de 3 notas distintas, la misma para el mismo id", () => {
  const a = chimeFor("g_123:0"), b = chimeFor("g_123:0");
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((n) => n.f)).size, 3);
  for (const n of a) assert.ok(NOTES.includes(n.f));
  assert.deepEqual(a.map((n) => n.t), [0, NOTE_MS + GAP_MS, 2 * (NOTE_MS + GAP_MS)]);
  const distinct = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => chimeFor(x).map((n) => n.f).join()));
  assert.ok(distinct.size >= 6, "distintos teléfonos casi siempre tienen melodías distintas");
});

test("toneSnr: cuánto sobresale una frecuencia de sus vecinas", () => {
  const binHz = 48000 / 2048, spec = new Float32Array(1024).fill(-90);
  spec[Math.round(1175 / binHz)] = -60;
  assert.ok(toneSnr(spec, binHz, 1175) >= 29);
  assert.ok(Math.abs(toneSnr(spec, binHz, 1661)) < 1);
});

test("encuentra la melodía con el retraso de la red, aunque sea más de un segundo", () => {
  const ch = chimeFor("yo");
  for (const lag of [40, 430, 1200]) {
    const r = detectChime(frames(ch, { lag, to: 2800 }), ch, 0);
    assert.equal(r.found, true, "retraso " + lag);
    assert.ok(Math.abs(r.lag - lag) <= 20, `retraso ${lag} → ${r.lag}`);
  }
  assert.ok(MAX_LAG_MS >= 1200);
});

test("no la confunde con ruido, con un tono que ya sonaba, ni con la melodía de otro teléfono", () => {
  const ch = chimeFor("yo");
  assert.equal(detectChime(frames(ch, { lag: null }), ch, 0).found, false, "solo ruido");
  assert.equal(detectChime(frames(ch, { lag: null, noise: 10 }), ch, 0).found, false, "ruido fuerte");
  // Un silbido constante en una de las notas: no hay contraste con "justo antes"
  const whistle = Object.fromEntries(ch.map((n) => [n.f, 20]));
  assert.equal(detectChime(frames(ch, { lag: null, extra: () => whistle }), ch, 0).found, false, "tonos constantes");
  // Otro teléfono cerca tocando su propia melodía (otras notas u otro orden)
  const other = chimeFor("otro");
  assert.notDeepEqual(other.map((n) => n.f), ch.map((n) => n.f));
  assert.equal(detectChime(frames(other, { lag: 300 }), ch, 0).found, false, "la melodía de otro");
  // Muy bajita: no alcanza
  assert.equal(detectChime(frames(ch, { lag: 300, level: 5 }), ch, 0).found, false, "demasiado bajita");
});

test("a quién no reproducir: los que detecté, los que me detectaron, menos los que pedí oír y los que se fueron", () => {
  const peers = [{ id: "a", near: [] }, { id: "b", near: ["yo"] }, { id: "c" }];
  assert.deepEqual([...silencedPeers("yo", new Set(["a"]), peers)].sort(), ["a", "b"]);
  assert.deepEqual([...silencedPeers("yo", new Set(["a"]), peers, new Set(["b"]))], ["a"]);
  assert.deepEqual([...silencedPeers("yo", new Set(["zz"]), peers)], ["b"], "quien ya no está en la llamada no cuenta");
});
