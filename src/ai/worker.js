// Corre las funciones de la IA en un hilo aparte (Web Worker), para que la pantalla no se congele mientras la
// compu piensa o se calcula el consejo. La app lo usa a través de src/app/ai-client.js.
import { botMove, advise } from "./index.js";

const FNS = { botMove, advise };

// Atiende un pedido { id, fn, args } y devuelve { id, result } o { id, error }
export function handle({ id, fn, args }) {
  try {
    if (!FNS[fn]) throw new Error("Función de IA desconocida: " + fn);
    return { id, result: FNS[fn](...args) };
  } catch (e) {
    return { id, error: String((e && e.message) || e) };
  }
}

// Solo cuando corre como worker (en Node, para las pruebas, se importa como módulo normal)
if (typeof self !== "undefined" && typeof window === "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (e) => self.postMessage(handle(e.data));
}
