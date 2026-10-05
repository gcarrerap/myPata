// Detección de teléfonos que están juntos (en el mismo cuarto) durante una llamada, para evitar el eco entre ellos.
//
// El problema: si A y B están juntos, lo que dice B sale por la bocina de A, el micrófono de B lo vuelve a oír y lo
// manda otra vez, y así en ciclo (eco o chillido). La cancelación de eco de cada teléfono solo conoce lo que ese
// mismo teléfono reproduce, así que no puede quitar este ciclo entre dos aparatos.
//
// La corrección: los que están juntos dejan de reproducirse entre sí (ya se oyen en persona). Siguen oyendo y
// hablando con los que están lejos. No se apaga ningún micrófono.
//
// La detección es activa: al entrar a la llamada tu teléfono toca una melodía corta (3 notas, distintas para cada
// teléfono) con tu micrófono apagado ese instante, así que la melodía no viaja por la red. Luego busca esas notas,
// en ese orden y con esos tiempos, en el audio que llega de cada persona. Si aparecen, el micrófono de esa persona
// oyó tu melodía en vivo: está junto a ti. No depende de la red (funciona con uno en Wi-Fi y otro en datos).
//
// Antes se probó una detección pasiva (comparar la forma del volumen de las voces) y en simulaciones no separaba:
// con unos segundos de habla, dos voces sin relación se parecen por casualidad casi tanto como una cercana.
//
// Todo aquí son funciones puras (sin audio ni DOM), para poder probarlas.

// Notas posibles (Hz): en la banda donde la voz y el códec (Opus) las conservan bien, y lejos entre sí
export const NOTES = [784, 988, 1175, 1397, 1661, 1976, 2349];
export const NOTE_MS = 140; // duración de cada nota
export const GAP_MS = 60; // silencio entre notas
export const MIN_LAG_MS = 20; // la red siempre tarda algo
export const MAX_LAG_MS = 1500; // y con datos móviles puede tardar más de un segundo
export const LISTEN_MS = 3 * (NOTE_MS + GAP_MS) + MAX_LAG_MS + 300; // cuánto se escucha después de tocarla
export const MIN_TONE_SNR = 9; // dB que cada nota debe sobresalir de las frecuencias vecinas
export const MIN_CONTRAST = 6; // dB más que justo antes de que empiece (para no confundir un tono que ya sonaba)

// La melodía de un teléfono: 3 notas distintas, escogidas con su id para que dos teléfonos casi nunca usen la misma
export function chimeFor(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = NOTES.slice(), out = [];
  for (let i = 0; i < 3; i++) {
    const k = h % pool.length; h = Math.floor(h / pool.length) + 7919 * (i + 1);
    out.push({ f: pool.splice(k, 1)[0], t: i * (NOTE_MS + GAP_MS), d: NOTE_MS });
  }
  return out;
}

// Qué tanto sobresale la frecuencia f en un espectro (dB por bin, como getFloatFrequencyData): el bin más alto
// cerca de f contra la mediana de los vecinos (entre 60 y 300 Hz de distancia).
export function toneSnr(spectrum, binHz, f) {
  const c = Math.round(f / binHz);
  let peak = -Infinity;
  for (let i = c - 1; i <= c + 1; i++) if (spectrum[i] > peak) peak = spectrum[i];
  const near = [];
  const lo = Math.round(60 / binHz), hi = Math.round(300 / binHz);
  for (let d = lo; d <= hi; d++) { if (c - d >= 0) near.push(spectrum[c - d]); if (c + d < spectrum.length) near.push(spectrum[c + d]); }
  near.sort((a, b) => a - b);
  const med = near.length ? near[Math.floor(near.length / 2)] : -Infinity;
  return Number.isFinite(peak) && Number.isFinite(med) ? peak - med : 0;
}

// ¿Está la melodía en lo que llegó de alguien? frames: [{ t (ms, mismo reloj que t0), snr: { [f]: dB } }].
// t0: cuándo empezó a sonar la melodía. Prueba cada retraso posible y exige que las 3 notas sobresalgan en su
// momento (y menos justo antes). Devuelve { found, lag, score }.
export function detectChime(frames, chime, t0, { minLag = MIN_LAG_MS, maxLag = MAX_LAG_MS, step = 20, minSnr = MIN_TONE_SNR, minContrast = MIN_CONTRAST } = {}) {
  const avg = (f, a, b) => {
    let s = 0, k = 0;
    for (const fr of frames) if (fr.t >= a && fr.t <= b && fr.snr[f] !== undefined) { s += fr.snr[f]; k++; }
    return k ? s / k : null;
  };
  let best = { found: false, lag: 0, score: -Infinity }; // el mejor retraso que cumple; si ninguno, el de más puntaje
  for (let lag = minLag; lag <= maxLag; lag += step) {
    let ok = true, score = 0;
    for (const n of chime) {
      const a = t0 + n.t + lag;
      const on = avg(n.f, a + 20, a + n.d - 20); // el centro de la nota
      const before = avg(n.f, a - 120, a - 30); // justo antes
      if (on === null) { ok = false; break; }
      const contrast = before === null ? on : on - before;
      if (on < minSnr || contrast < minContrast) ok = false;
      score += Math.min(on, 30) + Math.min(contrast, 30) * 0.5;
    }
    if ((ok && (!best.found || score > best.score)) || (!ok && !best.found && score > best.score)) best = { found: ok, lag, score };
  }
  return best;
}

// A quién no reproducir: los que yo detecté, más los que me detectaron a mí (basta con que uno de los dos lo
// note), menos los que la persona pidió volver a oír. Solo cuenta a quien sigue en la llamada.
export function silencedPeers(myId, detected, peers, overrides = new Set()) {
  const out = new Set(detected);
  for (const p of peers) if (Array.isArray(p.near) && p.near.includes(myId)) out.add(p.id);
  for (const id of overrides) out.delete(id);
  for (const id of [...out]) if (!peers.some((p) => p.id === id)) out.delete(id);
  return out;
}
