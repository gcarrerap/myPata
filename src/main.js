// Arranque de la interfaz: reloj, suscripción al estado, redibujar al cambiar el tamaño, conectar con Firebase
// y estar al tanto de versiones nuevas.
import { actions, state, subscribe, checkForUpdate, startUpdateChecks } from "./app/index.js";
import { renderUpdateBar } from "./ui/components/update-bar.js";
import { installOverlayKeys, syncOverlayHistory } from "./ui/components/sheet.js";
import { tick } from "./ui/clock.js";
import { render } from "./ui/render.js";
import { renderTables } from "./ui/screens/lobby.js";

setInterval(tick, 250);

subscribe((what) => { if (what === "list") renderTables(); else { render(); syncOverlayHistory(); } renderUpdateBar(); });
installOverlayKeys();

window.addEventListener("resize", () => { if (state.view.screen === "table") render(); });

render();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", actions.start); else actions.start();

startUpdateChecks();
checkForUpdate();
