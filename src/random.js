// El azar con semilla: la misma semilla da la misma secuencia, en Node y en el navegador. Es lo
// que hace determinista a la simulación (y a sus pruebas).
//
// mulberry32: 32 bits de estado, rápido y con buena distribución para efectos (no para
// criptografía).
//
// Puro: no importa three ni DOM.

/**
 * @typedef {{
 *   next: () => number,
 *   range: (min: number, max: number) => number,
 *   int: (min: number, max: number) => number,
 *   readonly state: number,
 * }} Random
 */

/**
 * Un generador con semilla: next() da un número en [0, 1).
 * @param {number} seed un entero (se toma módulo 2³²) @returns {Random}
 */
export function createRandom(seed) {
  if (!Number.isFinite(seed)) throw new TypeError(`la semilla va como un número entero (vino ${seed})`);
  let estado = Math.trunc(seed) >>> 0;
  const next = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Entre min y max (max no incluido; si son iguales, ese valor). */
    range: (min, max) => min + (max - min) * next(),
    /** Un entero entre min y max, los dos incluidos. */
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    get state() { return estado; },
  };
}
