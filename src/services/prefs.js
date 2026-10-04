// Preferencias de este dispositivo en localStorage. Nunca truena: si el navegador bloquea el almacenamiento
// (modo privado, permisos), get devuelve null y set no hace nada.
// Claves en uso: pata.dev (id del dispositivo), pata.name, pata.timer, pata.botLevels, pata.sort (orden de tu mano),
// pata.rec y pata.recSeen (rondas grabadas por subir).
export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
