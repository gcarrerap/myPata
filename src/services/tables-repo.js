// Mesas en Firestore (colección "pata_mesas"). Cada mesa es un documento con el estado completo como texto JSON
// (Firestore no acepta listas dentro de listas) más code, created y updated para ordenar y buscar.
// La colección lleva el prefijo "pata_" para poder compartir el proyecto de Firebase con el dominó (myDomino).

export const TABLES = "pata_mesas";
export const SKIP = {}; // un cambio que al final no hace falta guardar

// Adaptador: guarda cada mesa como texto JSON
export function makeDb(fs) {
  // updated: cuándo se guardó por última vez (ms), para saber cuánto lleva sin cambios
  const wrap = (snap) => ({ exists: snap.exists, data: () => (snap.exists ? JSON.parse(snap.data().json) : undefined), updated: snap.exists ? snap.data().updated : undefined });
  const pack = (st) => ({ json: JSON.stringify(st), code: st.code, created: st.created || Date.now(), updated: Date.now() });
  const docApi = (ref) => ({
    _ref: ref,
    onSnapshot: (ok, bad) => ref.onSnapshot((s) => ok(wrap(s)), bad),
    get: async () => wrap(await ref.get()),
    set: (st) => ref.set(pack(st)),
    delete: () => ref.delete(),
  });
  return {
    fs, pack, wrap,
    doc: (path) => docApi(fs.doc(path)),
    collection: (name) => {
      const q = (query) => ({
        orderBy: (f, d) => q(query.orderBy(f, d)),
        limit: (n) => q(query.limit(n)),
        onSnapshot: (ok, bad) => query.onSnapshot((snap) => ok({ docs: snap.docs.map(wrap) }), bad),
      });
      return q(fs.collection(name));
    },
  };
}

// Las 20 mesas más recientes. onList(list, updated) recibe la lista de estados y, por código de mesa, cuándo
// se guardó por última vez (ms). Devuelve la función para dejar de escuchar.
export function watchTableList(db, onList, onError) {
  return db.collection(TABLES).orderBy("created", "desc").limit(20).onSnapshot((snap) => {
    const list = [], updated = {};
    for (const d of snap.docs) { const st = d.data(); if (st) { list.push(st); updated[st.code] = d.updated; } }
    onList(list, updated);
  }, onError);
}

// Una mesa. onState recibe el estado, o null si la mesa ya no existe; devuelve la función para dejar de escuchar.
export function watchTable(db, code, onState, onError) {
  return db.doc(`${TABLES}/${code}`).onSnapshot((snap) => onState(snap.exists ? snap.data() : null), onError);
}

export function saveNewTable(db, st) {
  return db.doc(`${TABLES}/${st.code}`).set(st);
}

// Aplica un cambio a la mesa en una transacción: lee lo último, aplica fn y guarda.
// fn recibe una copia del estado y devuelve el nuevo estado, null para borrar la mesa, o SKIP para no guardar.
// Devuelve true si no hubo que guardar (SKIP). Truena si la mesa no existe o Firestore rechaza el cambio.
export async function updateTable(db, code, fn) {
  const ref = db.fs.doc(`${TABLES}/${code}`);
  let skipped = false;
  await db.fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Esta mesa ya no existe.");
    const next = fn(structuredClone(JSON.parse(snap.data().json)));
    if (next === SKIP) { skipped = true; return; }
    if (next === null) tx.delete(ref); else tx.set(ref, db.pack(next));
  });
  return skipped;
}
