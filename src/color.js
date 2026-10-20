// Colores: hex de la definición ↔ lineal, que es como se mezclan (y como los espera three en un
// ShaderMaterial: el shader convierte a sRGB al final). Un rango de colores y las curvas de color
// se interpolan en lineal, como las mezclas de threejs-material-engine.
//
// Puro: no importa three ni DOM.

/** @typedef {[number, number, number]} RGB */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** ¿Un color '#rgb' o '#rrggbb'? @param {unknown} v @returns {v is string} */
export const isHexColor = (v) => typeof v === 'string' && HEX.test(v);

/** '#ABC' → '#aabbcc'. @param {string} hex */
export function normalizeHex(hex) {
  const h = hex.slice(1).toLowerCase();
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
}

const aLineal = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const aSRGB = (/** @type {number} */ c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Un hex (sRGB) a lineal, de 0 a 1. @param {string} hex @returns {RGB} */
export function hexToLinear(hex) {
  const h = normalizeHex(hex);
  return /** @type {RGB} */ ([1, 3, 5].map((i) => aLineal(parseInt(h.slice(i, i + 2), 16) / 255)));
}

/** Lineal a hex (sRGB), recortado a [0, 1]. @param {RGB} rgb */
export const linearToHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, aSRGB(c))) * 255).toString(16).padStart(2, '0')).join('');
