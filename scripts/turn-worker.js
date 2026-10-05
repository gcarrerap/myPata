// Cloudflare Worker que entrega credenciales temporales de Cloudflare TURN para las llamadas de La Pata.
// No es parte del juego: se despliega aparte en Cloudflare y su dirección va en window.TURN_URL (src/config.js).
//
// Por qué hace falta: la llave de TURN es secreta y el repo es público, así que el juego no puede tenerla.
// Este Worker la guarda como secreto y solo responde a los sitios de ALLOWED_ORIGINS.
//
// Pasos (ver README, sección "Llamadas de voz y video"):
//   1. Cloudflare → Realtime → TURN Server → crear una llave: te da TURN_KEY_ID y TURN_KEY_API_TOKEN.
//   2. Workers & Pages → Create → Worker → pega este archivo → Deploy.
//   3. En el Worker, Settings → Variables and Secrets:
//        TURN_KEY_ID          (texto)
//        TURN_KEY_API_TOKEN   (secreto)
//        ALLOWED_ORIGINS      (texto) p. ej. https://gcarrerap.github.io
//   4. Copia la dirección del Worker (https://<nombre>.<cuenta>.workers.dev) en window.TURN_URL.
//
// Cloudflare TURN tiene 1,000 GB al mes gratis; después cobra por GB. Solo se usa cuando la conexión directa
// entre teléfonos no se puede.

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : "null", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!ok) return new Response("Origen no permitido", { status: 403, headers: cors });
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }), // 6 horas: alcanza para una partida
    });
    return new Response(await res.text(), { status: res.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  },
};
