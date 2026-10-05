// Todo lo que toca el exterior: Firebase (auth y mesas en Firestore) y localStorage.
export { ls } from "./prefs.js";
export { loadFirebaseSdk, initFirebase, signInWithGoogle, signOut } from "./firebase.js";
export { TABLES, SKIP, makeDb, watchTableList, watchTable, saveNewTable, updateTable } from "./tables-repo.js";
export { registerServiceWorker, fetchPublishedVersion } from "./updates.js";
export { RECORDINGS, saveRoundRecord } from "./recordings.js";
export { CALLS, HEARTBEAT_MS, PEER_TTL_MS, newId, putPeer, removePeer, watchPeers, sendSignal, watchSignals } from "./call-signaling.js";
