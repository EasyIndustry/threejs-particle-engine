// Partículas de pixel art: que se vean del mismo mundo que los sprites (threejs-sprite-engine), con
// píxeles del mismo tamaño y sin lo que el pixel art no usa (tamaños intermedios, alfa a medias,
// colores fuera de la paleta, giros de cualquier ángulo).
//
//   pixel: {
//     pixelsPerUnit: 16,     // cuántos píxeles del arte hay en una unidad del mundo (como los sprites)
//     snap: true,            // la posición, pegada a la grilla de píxeles en el plano de la vista
//     fade: 'dither',        // cómo se desvanece: 'dither' (tramado), 'cutout' (recorte duro) o 'alpha'
//     palette: ['#fff', '#ffe066', '#ff8c1a'],   // el color final, al más cercano de la paleta
//     rotation: 90,          // el giro, de a esos grados (90: cuartos de vuelta; 0: sin giro; null: libre)
//   }
//   pixel: true             // lo mismo con los valores por defecto (PIXEL_DEFAULTS)
//
// Lo que se calcula sin dibujar está acá y lo usa la simulación: el tamaño redondeado a píxeles
// enteros, el giro de a pasos y la paleta. Lo que depende de la pantalla lo hace el shader del
// adaptador con las mismas reglas: el snap, el muestreo de la textura en la grilla de la partícula
// (así el círculo sin textura sale pixelado) y el tramado, con la matriz de BAYER_4 en píxeles del
// arte.
//
// Puro: no importa three ni DOM.
import { isHexColor, normalizeHex, hexToLinear } from './color.js';

/** @typedef {'alpha' | 'cutout' | 'dither'} PixelFade */
/** @typedef {{ pixelsPerUnit: number, snap: boolean, fade: PixelFade, palette: string[] | null, rotation: number | null }} PixelDef */

/** Los valores de `pixel: true` (y de lo que no se pasa). */
export const PIXEL_DEFAULTS = Object.freeze({ pixelsPerUnit: 16, snap: true, fade: /** @type {PixelFade} */ ('dither'), palette: null, rotation: 90 });
export const PIXEL_FADES = Object.freeze(['alpha', 'cutout', 'dither']);
const CLAVES = Object.keys(PIXEL_DEFAULTS);
/** Hasta cuántos colores una paleta (el shader no la usa: es para que no se vaya de las manos). */
const MAX_PALETA = 256;

/**
 * La matriz de Bayer de 4 × 4, con los umbrales de 0 a 1 (fila por fila): un píxel se dibuja si su
 * alfa pasa el umbral de su lugar en la grilla. El shader del adaptador usa la misma.
 */
export const BAYER_4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((x) => (x + 0.5) / 16));

/**
 * La sección `pixel` normalizada, o null (sin pixel art). Un error dice dónde.
 * @param {unknown} v @param {string} [que] @returns {PixelDef | null}
 */
export function normalizePixel(v, que = 'emitter.pixel') {
  if (v === undefined || v === null || v === false) return null;
  if (v === true) return { ...PIXEL_DEFAULTS };
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${que}: va true, null o { ${CLAVES.join(', ')} }`);
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of Object.keys(o)) if (!CLAVES.includes(k)) throw new Error(`${que}.${k}: clave desconocida (van ${CLAVES.join(', ')})`);
  const ppu = o.pixelsPerUnit ?? PIXEL_DEFAULTS.pixelsPerUnit;
  if (typeof ppu !== 'number' || !Number.isFinite(ppu) || !(ppu > 0)) throw new RangeError(`${que}.pixelsPerUnit: va un número mayor que 0 (vino ${JSON.stringify(ppu)})`);
  const snap = o.snap ?? PIXEL_DEFAULTS.snap;
  if (typeof snap !== 'boolean') throw new TypeError(`${que}.snap: va true o false`);
  const fade = o.fade ?? PIXEL_DEFAULTS.fade;
  if (!PIXEL_FADES.includes(/** @type {string} */ (fade))) throw new Error(`${que}.fade: va ${PIXEL_FADES.map((x) => `'${x}'`).join(', ')} (vino ${JSON.stringify(fade)})`);
  /** @type {string[] | null} */
  let palette = null;
  if (o.palette !== undefined && o.palette !== null) {
    if (!Array.isArray(o.palette) || o.palette.length < 1 || o.palette.length > MAX_PALETA) throw new TypeError(`${que}.palette: va una lista de 1 a ${MAX_PALETA} colores '#rrggbb', o null`);
    palette = o.palette.map((c, i) => {
      if (!isHexColor(c)) throw new TypeError(`${que}.palette[${i}]: va un color '#rrggbb' (vino ${JSON.stringify(c)})`);
      return normalizeHex(c);
    });
  }
  let rotation = /** @type {number | null} */ (PIXEL_DEFAULTS.rotation);
  if (o.rotation !== undefined) {
    rotation = /** @type {number | null} */ (o.rotation);
    if (rotation !== null && (typeof rotation !== 'number' || !Number.isFinite(rotation) || rotation < 0 || rotation > 360)) {
      throw new RangeError(`${que}.rotation: va de 0 a 360 grados (90: cuartos de vuelta; 0: sin giro) o null (libre) (vino ${JSON.stringify(o.rotation)})`);
    }
  }
  return { pixelsPerUnit: ppu, snap, fade: /** @type {PixelFade} */ (fade), palette, rotation };
}

/**
 * El tamaño de una partícula redondeado a píxeles enteros del arte, en unidades del mundo. Lo que
 * queda por debajo de medio píxel es 0 (no se ve).
 * @param {number} size en unidades del mundo @param {number} pixelsPerUnit
 */
export const pixelSize = (size, pixelsPerUnit) => Math.round(size * pixelsPerUnit) / pixelsPerUnit;

/**
 * Un giro (en radianes) de a pasos de `step` grados: 0 es sin giro y null, libre.
 * @param {number} angle en radianes @param {number | null} step en grados
 */
export function stepAngle(angle, step) {
  if (step === null) return angle;
  if (step === 0) return 0;
  const paso = (step * Math.PI) / 180;
  return Math.round(angle / paso) * paso;
}

/**
 * Una paleta lista para buscar rápido: cada color en lineal y en su raíz (la distancia se mide en la
 * raíz del lineal, que se parece a sRGB y separa bien los oscuros, sin la cuenta de sRGB por
 * partícula).
 * @param {string[]} palette @returns {{ linear: Float32Array, near: Float32Array, size: number }}
 */
export function createPalette(palette) {
  const n = palette.length;
  const linear = new Float32Array(n * 3), near = new Float32Array(n * 3);
  palette.forEach((hex, i) => {
    const c = hexToLinear(hex);
    for (let k = 0; k < 3; k++) { linear[i * 3 + k] = c[k]; near[i * 3 + k] = Math.sqrt(c[k]); }
  });
  return { linear, near, size: n };
}

/**
 * Lleva un color lineal al más cercano de la paleta (createPalette). Escribe en `out` desde `offset`
 * (por defecto, en el mismo lugar del que lee) y devuelve el índice del color elegido.
 * @param {ReturnType<typeof createPalette>} p @param {ArrayLike<number> & { [i: number]: number }} out
 * @param {number} [offset] @param {ArrayLike<number>} [src] de dónde leer (por defecto, out)
 */
export function nearestColor(p, out, offset = 0, src = out) {
  const r = Math.sqrt(Math.max(0, src[offset])), g = Math.sqrt(Math.max(0, src[offset + 1])), b = Math.sqrt(Math.max(0, src[offset + 2]));
  let mejor = 0, dist = Infinity;
  for (let i = 0; i < p.size; i++) {
    const dr = p.near[i * 3] - r, dg = p.near[i * 3 + 1] - g, db = p.near[i * 3 + 2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < dist) { dist = d; mejor = i; }
  }
  out[offset] = p.linear[mejor * 3]; out[offset + 1] = p.linear[mejor * 3 + 1]; out[offset + 2] = p.linear[mejor * 3 + 2];
  return mejor;
}
