// Conexión con Firebase (SDK compat del CDN, como global `firebase`). Es el único módulo que toca `firebase`.

// El SDK se carga aquí, después de dibujar la pantalla, y no en el <head> de index.html: así el lobby y la
// práctica aparecen de inmediato aunque el CDN tarde o no responda. Se usa el SDK compat porque, cargado del
// CDN sin empaquetador, pesa menos que el modular (ver DESIGN.md §5).
const CDN = "https://www.gstatic.com/firebasejs/10.12.2/";
const SDK = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
let loading = null;
export function loadFirebaseSdk() {
  if (window.firebase) return Promise.resolve();
  if (!loading) {
    // Se descargan en paralelo y se ejecutan en orden (auth y firestore necesitan app)
    loading = Promise.all(SDK.map((f) => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = CDN + f; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error("No se pudo cargar " + f));
      document.head.appendChild(s);
    }))).catch((e) => { loading = null; throw e; });
  }
  return loading;
}
// Solo para pruebas: olvidar la carga en curso o hecha
export function _resetLoaderForTests() { loading = null; }

// Carga el SDK, inicia Firebase y espera al primer usuario. Si no hay sesión, entra como invitado (anónimo).
// onUser(u, first) se llama cada vez que cambia el usuario; first es true solo la primera vez.
// Devuelve la instancia de Firestore. Truena si no hay configuración o si Firebase no se pudo cargar.
export async function initFirebase(onUser, config = window.FIREBASE_CONFIG) {
  if (!config || !config.projectId) throw new Error("sin config");
  await loadFirebaseSdk();
  if (!window.firebase) throw new Error("sin config");
  firebase.initializeApp(config);
  const auth = firebase.auth();
  try { await auth.getRedirectResult(); } catch {}
  await new Promise((res) => {
    let first = true;
    auth.onAuthStateChanged(async (u) => {
      if (!u) { try { await auth.signInAnonymously(); } catch (e) { console.warn(e); if (first) { first = false; res(); } } return; }
      const wasFirst = first;
      onUser(u, wasFirst);
      if (first) { first = false; res(); }
    });
  });
  return firebase.firestore();
}

// Entrar con Google: primero en ventana emergente; si el navegador la bloquea, con redirección.
// Truena con el error de Firebase (e.code) para que la interfaz decida qué mensaje mostrar.
export async function signInWithGoogle() {
  const prov = new firebase.auth.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: "select_account" });
  try { await firebase.auth().signInWithPopup(prov); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await firebase.auth().signInWithRedirect(prov); return;
    }
    throw e;
  }
}

export async function signOut() { try { await firebase.auth().signOut(); } catch {} }
