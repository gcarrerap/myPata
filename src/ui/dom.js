// Utilidades del DOM: buscar un elemento y escapar texto para meterlo en HTML.
export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
