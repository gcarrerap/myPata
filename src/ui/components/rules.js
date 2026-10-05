// Las reglas en corto, para la ventana "Cómo se juega" (lobby y menú de la partida).
import { RULES } from "../../engine/index.js";

export function rulesHelp() {
  const S = RULES.specials, P = RULES.points;
  return `<div class="rules">
    <p><b>Material:</b> ${RULES.decks} barajas con jokers. Individual o en parejas cruzadas.</p>
    <p><b>Reparto:</b> cada quien recibe ${RULES.piles} montones de ${RULES.perPile} cartas y juega uno a la vez. Se abren ${RULES.sample} cartas en el pozo.</p>
    <p><b>Tu turno:</b> roba 2 del mazo, o levanta las ${RULES.pickupN} de arriba del pozo si tienes un par igual al tope. Baja patas o agrega a las de tu equipo y descarta una carta. Con el par puedes ver antes las cartas del pozo (todos ven tu par).</p>
    <p><b>Patas:</b> 3 o más cartas del mismo número; se cierran con ${RULES.closeAt}. Los 2 y los jokers son comodines y nunca puede haber más comodines que naturales. Una limpia cerrada ya no se ensucia. Puedes abrir otra pata de un número aunque tu equipo tenga una abierta.</p>
    <p><b>Tapones:</b> un 3 negro en el pozo no se puede levantar y nunca se baja. Un 3 rojo se levanta con un par de 3 rojos y solo va en su pata especial; guardado al final resta ${-P.red3}.</p>
    <p><b>Bajarte por primera vez:</b> ${RULES.minimums.map((m, i) => `${m} en la ronda ${i + 1}`).join(", ")}. Joker 50; As y 2, 20; del 8 al K, 10; del 3 al 7, 5. Si tu pareja ya se bajó, no necesitas el mínimo. Para levantar el pozo sin haberte bajado, tienes que bajarte sin usar el par ni el pozo.</p>
    <p><b>Montones:</b> si te quedas sin cartas antes de descartar, abres tu siguiente montón y sigues.</p>
    <p><b>Irse:</b> con ${RULES.goOut.clean} limpias y ${RULES.goOut.dirty} sucias cerradas en tu equipo, sin montones y descartando tu última carta (+${P.out}).</p>
    <p><b>Puntos:</b> limpia ${P.clean}, sucia ${P.dirty}. Las patas de más solo cuentan para el equipo que se fue. Especiales: 3 rojos +${S.red3}, jokers +${S.jokers}, siete 2 +${S.twos}, 2 y jokers +${S.mixed}; incompletas restan lo mismo.</p>
    <p class="hint">Si se acaba el mazo se revuelve el pozo; si ni así alcanzan las 2 cartas para robar, la ronda se acaba sin que nadie se vaya. Gana el equipo con más puntos tras ${RULES.rounds} rondas.</p>
  </div>`;
}
