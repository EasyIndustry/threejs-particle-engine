// Hacia dónde mira el quad de cada partícula:
//
//   align: null  (o 'camera')                    mira a la cámara: lo de siempre
//   align: { type: 'velocity', stretch: 0.05 }   estirada en la dirección en que viaja: el largo es
//                                                size + rapidez × stretch (stretch: los segundos de
//                                                recorrido que muestra la estela)
//   align: { type: 'plane', normal: [0, 1, 0] }  acostada en el plano de esa normal, en el espacio del
//                                                emisor (girar el emisor inclina el plano); rotation
//                                                la gira dentro del plano
//
// Con 'velocity' no se usa rotation (la dirección la da la velocidad). Con 'plane' el quad se ve de
// los dos lados. La base del plano (planeBasis) es estable: "arriba" del arte es la vertical del
// mundo proyectada en el plano y, si el plano es horizontal, −z (lo que se ve como arriba desde una
// cámara que mira hacia −z, como la cenital de threejs-game-engine).
//
// Puro: no importa three ni DOM.

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{ type: 'velocity', stretch: number } | { type: 'plane', normal: Vec3 }} AlignDef */

export const ALIGN_TYPES = Object.freeze(['camera', 'velocity', 'plane']);

const finito = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * La orientación normalizada: null (mira a la cámara), { type: 'velocity', stretch } o
 * { type: 'plane', normal } con la normal unitaria. Un error dice dónde.
 * @param {unknown} v @param {string} [que] @returns {AlignDef | null}
 */
export function normalizeAlign(v, que = 'emitter.align') {
  if (v === undefined || v === null || v === 'camera') return null;
  const o = /** @type {Record<string, unknown>} */ (typeof v === 'string' ? { type: v } : v);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new TypeError(`${que}: va 'camera', 'velocity', 'plane' o { type, … }`);
  if (!ALIGN_TYPES.includes(/** @type {string} */ (o.type))) throw new Error(`${que}.type: va ${ALIGN_TYPES.map((x) => `'${x}'`).join(', ')} (vino ${JSON.stringify(o.type)})`);
  const claves = { camera: ['type'], velocity: ['type', 'stretch'], plane: ['type', 'normal'] }[/** @type {'camera' | 'velocity' | 'plane'} */ (o.type)];
  for (const k of Object.keys(o)) if (!claves.includes(k)) throw new Error(`${que}.${k}: clave desconocida con type '${o.type}' (van ${claves.join(', ')})`);
  if (o.type === 'camera') return null;
  if (o.type === 'velocity') {
    const stretch = o.stretch ?? 0.05;
    if (!finito(stretch) || /** @type {number} */ (stretch) < 0) throw new RangeError(`${que}.stretch: va un número ≥ 0, en segundos (vino ${JSON.stringify(stretch)})`);
    return { type: 'velocity', stretch: /** @type {number} */ (stretch) };
  }
  const n = o.normal ?? [0, 1, 0];
  if (!Array.isArray(n) || n.length !== 3 || !n.every(finito)) throw new TypeError(`${que}.normal: va [x, y, z] (vino ${JSON.stringify(n)})`);
  const l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 0)) throw new RangeError(`${que}.normal: va un vector que no sea cero`);
  /** @type {Vec3} */
  const normal = [n[0] / l, n[1] / l, n[2] / l];
  return { type: 'plane', normal: /** @type {Vec3} */ (normal.map((x) => +x.toFixed(9) + 0)) };
}

/**
 * La base de un plano: [u, v], unitarios y perpendiculares entre sí y a la normal, con u × v = n.
 * v es "arriba" del arte: la vertical del mundo proyectada en el plano, o −z si el plano es horizontal.
 * @param {ArrayLike<number>} normal unitaria @returns {[Vec3, Vec3]}
 */
export function planeBasis(normal) {
  const nx = normal[0], ny = normal[1], nz = normal[2];
  // arriba: +y proyectado en el plano; si el plano es (casi) horizontal, −z proyectado
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(ny) > 0.999) { ax = 0; ay = 0; az = -1; }
  const k = ax * nx + ay * ny + az * nz;
  let vx = ax - k * nx, vy = ay - k * ny, vz = az - k * nz;
  const l = Math.hypot(vx, vy, vz);
  vx /= l; vy /= l; vz /= l;
  // u = v × n: con u × v = n, la cara de adelante mira hacia la normal
  const ux = vy * nz - vz * ny, uy = vz * nx - vx * nz, uz = vx * ny - vy * nx;
  return [[ux, uy, uz], [vx, vy, vz]];
}
