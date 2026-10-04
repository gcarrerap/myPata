// Pide a la IA los cálculos pesados (jugada de la compu Avanzada, consejo) en un hilo aparte (src/ai/worker.js).
// Si el navegador no puede crear el worker, o el worker falla al cargar, calcula aquí mismo como antes:
// el juego nunca se queda esperando.
import { botMove, advise } from "../ai/index.js";

const LOCAL = { botMove, advise };
const local = (fn, args) => new Promise((resolve, reject) => { try { resolve(LOCAL[fn](...args)); } catch (e) { reject(e); } });

let worker = null, failed = false, seq = 0;
const pending = new Map(); // id -> { resolve, reject, fn, args }

// Si el worker deja de servir, lo pendiente se calcula aquí
function fallBack() {
  failed = true;
  if (worker) { try { worker.terminate(); } catch {} worker = null; }
  for (const { resolve, reject, fn, args } of pending.values()) local(fn, args).then(resolve, reject);
  pending.clear();
}

function getWorker() {
  if (failed || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../ai/worker.js", import.meta.url), { type: "module" });
  } catch { failed = true; return null; }
  worker.onmessage = (e) => {
    const { id, result, error } = e.data, p = pending.get(id); if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error)); else p.resolve(result);
  };
  worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); console.warn("La IA no pudo correr en un hilo aparte; se calcula aquí." + (e && e.message ? " " + e.message : "")); fallBack(); };
  worker.onmessageerror = fallBack;
  return worker;
}

// runAI("botMove", st, seat, level) o runAI("advise", st, seat): devuelve una promesa con el resultado
export function runAI(fn, ...args) {
  if (!LOCAL[fn]) return Promise.reject(new Error("Función de IA desconocida: " + fn));
  const w = getWorker();
  if (!w) return local(fn, args);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, fn, args });
    try { w.postMessage({ id, fn, args }); } catch { fallBack(); }
  });
}

// Solo para pruebas: volver a empezar (por ejemplo, con otro Worker de mentira)
export function _resetForTests() { if (worker) { try { worker.terminate(); } catch {} } worker = null; failed = false; pending.clear(); }
