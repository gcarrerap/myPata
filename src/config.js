// Configuración de Firebase. Para usar tu propio proyecto, reemplaza estos valores
// (ver "Usar tu propio proyecto de Firebase" en el README).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDb1kqzLYwyZ6PdMQrXjlAGeeJhYlzXObM",
  authDomain: "dominomx.firebaseapp.com",
  projectId: "dominomx",
  storageBucket: "dominomx.firebasestorage.app",
  messagingSenderId: "330194849657",
  appId: "1:330194849657:web:a7d2e3e77c69d02fad69a8"
};

// Llamadas de voz y video: dirección del Worker que entrega credenciales de TURN (ver scripts/turn-worker.js).
// Vacío = solo STUN: funciona en la mayoría de las redes, pero en algunas (datos móviles, redes de oficina) la
// llamada puede conectar sin que se oiga nada.
window.TURN_URL = "";
