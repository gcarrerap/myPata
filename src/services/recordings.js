// Rondas grabadas en Firestore (colección "pata_rondas"). Un documento por ronda terminada, con id fijo
// (<partida>_<ronda>): si dos teléfonos de la misma mesa graban la misma ronda, las reglas de Firestore solo
// dejan crear el documento una vez (ver firestore.rules), así que nunca hay duplicados.
// Los teléfonos solo pueden crear: no leen, no cambian y no borran. Se leen con scripts/export-partidas.mjs.

export const RECORDINGS = "pata_rondas";

// Firestore no acepta listas dentro de listas: el registro va como texto JSON, más algunos campos para buscar
export function saveRoundRecord(db, rec) {
  return db.fs.doc(`${RECORDINGS}/${rec.id}`).set({
    json: JSON.stringify(rec), gameId: rec.gameId, round: rec.round, mode: rec.mode, v: rec.v,
    start: rec.start || null, created: Date.now(),
  });
}
