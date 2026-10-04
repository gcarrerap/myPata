#!/usr/bin/env node
// Descarga las rondas grabadas y las escribe como JSONL: una partida por línea (o una ronda por línea con --rondas).
// No es parte del juego publicado: se corre a mano, con credenciales de administrador.
//
// Uso:
//   npm install --no-save firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=/ruta/cuenta-de-servicio.json node scripts/export-partidas.mjs [salida.jsonl] [--rondas]
//
// La cuenta de servicio se descarga en la consola de Firebase: Configuración del proyecto → Cuentas de servicio.
import { writeFileSync } from "node:fs";
import { groupGames } from "../src/engine/record.js";

const args = process.argv.slice(2);
const perRound = args.includes("--rondas");
const out = args.find((a) => !a.startsWith("--")) || (perRound ? "rondas.jsonl" : "partidas.jsonl");

let admin;
try { admin = (await import("firebase-admin")).default; }
catch { console.error("Falta firebase-admin. Instálalo con: npm install --no-save firebase-admin"); process.exit(1); }

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const snap = await admin.firestore().collection("pata_rondas").get();
const records = [];
for (const d of snap.docs) {
  try { records.push(JSON.parse(d.data().json)); } catch { console.warn("Registro ilegible:", d.id); }
}
const rows = perRound ? records.sort((a, b) => (a.start || 0) - (b.start || 0)) : groupGames(records);
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
const games = perRound ? new Set(records.map((r) => r.gameId)).size : rows.length;
console.log(`${records.length} rondas de ${games} partidas → ${out}`);
