// Firebase de mentira, en memoria, para las pruebas. Imita solo la parte del SDK compat que usa el juego:
// firebase.initializeApp, firebase.auth() (anónimo, Google, cambios de usuario) y firebase.firestore()
// (doc, collection con orderBy/limit/where, subcolecciones, onSnapshot, runTransaction).

export function fakeFirestore() {
  const docs = new Map(); // path -> data
  const docListeners = new Map(); // path -> Set(fn)
  const colListeners = new Set(); // { name, field, dir, n, ok }
  // Solo los documentos directos de la colección (no los de sus subcolecciones), ordenados por id como Firestore
  const inCol = (p, name) => p.startsWith(name + "/") && !p.slice(name.length + 1).includes("/");
  const snapOf = (path) => ({ exists: docs.has(path), id: path.split("/").pop(), ref: ref(path), data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined) });
  const colSnap = ({ name, field, dir, n, wf, wv }) => {
    let paths = [...docs.keys()].filter((p) => inCol(p, name)).sort();
    if (wf) paths = paths.filter((p) => docs.get(p)[wf] === wv);
    if (field) paths.sort((a, b) => (docs.get(a)[field] - docs.get(b)[field]) * (dir === "desc" ? -1 : 1));
    if (n !== undefined) paths = paths.slice(0, n);
    return { docs: paths.map(snapOf) };
  };
  const notify = (path) => {
    for (const fn of docListeners.get(path) || []) fn(snapOf(path));
    for (const l of [...colListeners]) if (inCol(path, l.name)) l.ok(colSnap(l));
  };
  const write = (path, data) => { if (data === null) docs.delete(path); else docs.set(path, structuredClone(data)); notify(path); };
  function ref(path) { return {
    path,
    get: async () => snapOf(path),
    set: async (data) => write(path, data),
    delete: async () => write(path, null),
    onSnapshot(ok) {
      if (!docListeners.has(path)) docListeners.set(path, new Set());
      docListeners.get(path).add(ok); ok(snapOf(path));
      return () => docListeners.get(path).delete(ok);
    },
  }; }
  const query = (q) => ({
    orderBy: (field, dir = "asc") => query({ ...q, field, dir }),
    limit: (n) => query({ ...q, n }),
    where: (wf, op, wv) => { if (op !== "==") throw new Error("solo =="); return query({ ...q, wf, wv }); },
    onSnapshot(ok) { const l = { ...q, ok }; colListeners.add(l); ok(colSnap(l)); return () => colListeners.delete(l); },
  });
  const fs = {
    writes: 0,
    doc: (path) => ref(path),
    collection: (name) => query({ name }),
    async runTransaction(fn) {
      const pending = [];
      const tx = {
        get: async (r) => snapOf(r.path),
        set: (r, data) => { pending.push([r.path, data]); },
        delete: (r) => { pending.push([r.path, null]); },
      };
      const out = await fn(tx);
      for (const [p, d] of pending) { fs.writes++; write(p, d); }
      return out;
    },
    _docs: docs,
  };
  return fs;
}

// opts.popup: "ok" | código de error de signInWithPopup; opts.redirect: "ok" | código de error
export function fakeFirebase(opts = {}) {
  const calls = [];
  const fs = fakeFirestore();
  let user = opts.user || null, listener = null;
  const setUser = (u) => { user = u; if (listener) listener(u); };
  const err = (code) => Object.assign(new Error(code), { code });
  const auth = {
    getRedirectResult: async () => { calls.push("getRedirectResult"); return null; },
    onAuthStateChanged(fn) { listener = fn; Promise.resolve().then(() => fn(user)); return () => (listener = null); },
    signInAnonymously: async () => { calls.push("signInAnonymously"); if (opts.anonFails) throw err("auth/operation-not-allowed"); setUser({ uid: "anon1", isAnonymous: true }); },
    signInWithPopup: async () => { calls.push("signInWithPopup"); if (opts.popup && opts.popup !== "ok") throw err(opts.popup); setUser({ uid: "g1", isAnonymous: false, displayName: "Memo Carrera", email: "memo@example.com" }); },
    signInWithRedirect: async () => { calls.push("signInWithRedirect"); if (opts.redirect && opts.redirect !== "ok") throw err(opts.redirect); },
    signOut: async () => { calls.push("signOut"); if (opts.signOutFails) throw err("auth/network-request-failed"); setUser(null); },
  };
  function GoogleAuthProvider() { this.params = null; }
  GoogleAuthProvider.prototype.setCustomParameters = function (p) { this.params = p; calls.push("prompt:" + p.prompt); };
  const firebase = {
    initializeApp: (cfg) => { calls.push("initializeApp:" + cfg.projectId); },
    auth: Object.assign(() => auth, { GoogleAuthProvider }),
    firestore: () => fs,
  };
  return { firebase, fs, calls, setUser };
}
