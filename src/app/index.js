// Estado de la app y casos de uso. La interfaz lee `state`, se suscribe con `subscribe` y pide acciones.
export { state, subscribe, notify, isGoogle, timerOn, canReveal, mySeat, turnKey, clockKey } from "./store.js";
export * as actions from "./actions.js";
export { BOT_NAMES, BACKUP_MS, BOT_DELAY, scheduleBot, isBotSeat, botRole } from "./bots.js";
export { tickClock } from "./clock.js";
export { checkForUpdate, startUpdateChecks, applyUpdate } from "./updates.js";
export { recorder } from "./recording.js";
export { watchCall, stopCall, joinCall, hangupCall, toggleMute, toggleVideo, dismissRing, setCallOutput, setCallCollapsed, callStream, localStream, isConnected, callSupported, RING_MS } from "./call.js";
