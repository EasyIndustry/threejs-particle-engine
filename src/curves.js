// Las curvas a lo largo de la vida de una partícula (de 0, al nacer, a 1, al morir): keyframes
// `[[t, v], …]` con interpolación lineal. Antes del primer keyframe vale el primero y después del
// último, el último. Los colores van en hex y se interpolan en lineal.
//
// Atajos que se normalizan a keyframes:
//   0.5                       un valor fijo:        [[0, 0.5], [1, 0.5]]
//   [1, 0]                    valores repartidos:   [[0, 1], [1, 0]]
//   [1, 2, 0]                                       [[0, 1], [0.5, 2], [1, 0]]
//   ['#fff', '#f80']          lo mismo con colores
//   [[0, 1], [0.2, 3], [1, 0]]  keyframes, con t de 0 a 1 en orden
//
// Puro: no importa three ni DOM.
import { isHexColor, normalizeHex, hexToLinear } from './color.js';

/** @typedef {[number, number][]} NumberCurve */
/** @typedef {[number, string][]} ColorCurve */
/** @typedef {import('./color.js').RGB} RGB */

const finito = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Una curva normalizada a keyframes, o null si no se pasó. Un error dice dónde.
 * @param {unknown} v @param {string} que el camino para los errores
 * @param {'number' | 'color'} tipo @param {[number, number]} [rango] el rango de los valores (números)
 * @returns {NumberCurve | ColorCurve | null}
 */
export function normalizeCurve(v, que, tipo, rango = [-Infinity, Infinity]) {
  if (v === undefined || v === null) return null;
  /** @param {unknown} x @param {string} donde */
  const valor = (x, donde) => {
    if (tipo === 'color') {
      if (!isHexColor(x)) throw new TypeError(`${donde}: va un color '#rrggbb' (vino ${JSON.stringify(x)})`);
      return normalizeHex(x);
    }
    if (!finito(x)) throw new TypeError(`${donde}: va un número (vino ${JSON.stringify(x)})`);
    if (/** @type {number} */ (x) < rango[0] || /** @type {number} */ (x) > rango[1]) throw new RangeError(`${donde}: va de ${rango[0]} a ${rango[1]} (vino ${x})`);
    return /** @type {number} */ (x);
  };
  // un valor suelto
  if (!Array.isArray(v)) {
    const x = valor(v, que);
    return /** @type {any} */ ([[0, x], [1, x]]);
  }
  if (v.length === 0) throw new Error(`${que}: una curva va con al menos un valor`);
  // valores repartidos parejo de 0 a 1
  if (!v.some(Array.isArray)) {
    const xs = v.map((x, i) => valor(x, `${que}[${i}]`));
    if (xs.length === 1) return /** @type {any} */ ([[0, xs[0]], [1, xs[0]]]);
    return /** @type {any} */ (xs.map((x, i) => [i / (xs.length - 1), x]));
  }
  // keyframes
  let antes = -Infinity;
  return /** @type {any} */ (v.map((k, i) => {
    const donde = `${que}[${i}]`;
    if (!Array.isArray(k) || k.length !== 2) throw new TypeError(`${donde}: va un keyframe [t, valor] (o todos valores sueltos, sin keyframes)`);
    if (!finito(k[0]) || k[0] < 0 || k[0] > 1) throw new RangeError(`${donde}[0]: t va de 0 a 1 (vino ${JSON.stringify(k[0])})`);
    if (k[0] < antes) throw new RangeError(`${donde}[0]: los keyframes van en orden de t (${k[0]} después de ${antes})`);
    antes = k[0];
    return [k[0], valor(k[1], `${donde}[1]`)];
  }));
}

/**
 * El valor de una curva de números en t (de 0 a 1), con interpolación lineal.
 * @param {NumberCurve} curve @param {number} t
 */
export function sampleCurve(curve, t) {
  const n = curve.length;
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[n - 1][0]) return curve[n - 1][1];
  let i = 1;
  while (curve[i][0] < t) i++;
  const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
  return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

/**
 * Una curva de colores pasada a lineal, lista para muestrear rápido (sampleLinearColor).
 * @param {ColorCurve} curve @returns {[number, RGB][]}
 */
export const linearColorCurve = (curve) => curve.map(([t, hex]) => /** @type {[number, RGB]} */ ([t, hexToLinear(hex)]));

/**
 * El color (lineal) de una curva ya pasada a lineal, en t. Escribe en `out` y lo devuelve.
 * @param {[number, RGB][]} curve @param {number} t @param {RGB} [out]
 * @returns {RGB}
 */
export function sampleLinearColor(curve, t, out = [0, 0, 0]) {
  const n = curve.length;
  let a = curve[0], b = curve[0], f = 0;
  if (t >= curve[n - 1][0]) a = b = curve[n - 1];
  else if (t > curve[0][0]) {
    let i = 1;
    while (curve[i][0] < t) i++;
    a = curve[i - 1]; b = curve[i];
    f = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
  }
  for (let k = 0; k < 3; k++) out[k] = a[1][k] + (b[1][k] - a[1][k]) * f;
  return out;
}

/**
 * El color de una curva de colores en t, en lineal (interpolado en lineal).
 * @param {ColorCurve} curve @param {number} t @returns {RGB}
 */
export const sampleColorCurve = (curve, t) => sampleLinearColor(linearColorCurve(curve), t);
