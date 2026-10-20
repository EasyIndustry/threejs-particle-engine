// El ruido de la turbulencia: ruido de valor en 3D, suave (interpolación quíntica entre los
// valores al azar de los vértices de una grilla entera), de −1 a 1. Simple y determinista: el
// mismo punto y la misma semilla dan el mismo valor, en Node y en el navegador.
//
// La turbulencia empuja cada partícula con tres de estos ruidos (uno por eje, con semillas
// distintas) muestreados donde está: las vecinas se mueven parecido y las lejanas, distinto.
// No es un ruido de rotor (curl): sirve para humo, polvo y magia, no para un fluido.
//
// Puro: no importa three ni DOM.

/** Un valor de −1 a 1 por vértice entero de la grilla, mezclado con la semilla. */
function hash(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {number} */ seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const suave = (/** @type {number} */ t) => t * t * t * (t * (t * 6 - 15) + 10);
const mezcla = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;

/**
 * Ruido de valor 3D en (x, y, z), de −1 a 1. Una celda de la grilla mide 1.
 * @param {number} x @param {number} y @param {number} z @param {number} [seed]
 */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = suave(x - xi), v = suave(y - yi), w = suave(z - zi);
  const s = seed | 0;
  const x00 = mezcla(hash(xi, yi, zi, s), hash(xi + 1, yi, zi, s), u);
  const x10 = mezcla(hash(xi, yi + 1, zi, s), hash(xi + 1, yi + 1, zi, s), u);
  const x01 = mezcla(hash(xi, yi, zi + 1, s), hash(xi + 1, yi, zi + 1, s), u);
  const x11 = mezcla(hash(xi, yi + 1, zi + 1, s), hash(xi + 1, yi + 1, zi + 1, s), u);
  return mezcla(mezcla(x00, x10, v), mezcla(x01, x11, v), w);
}
