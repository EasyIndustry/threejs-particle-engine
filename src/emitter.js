// La definición de un emisor, como datos: se valida, se hashea y se guarda en JSON, como un
// material de threejs-material-engine.
//
//   {
//     name: 'humo', max: 200, rate: 12,                 // máximo de vivas, nacimientos por segundo
//     bursts: [{ time: 0, count: [20, 30], cycles: 3, interval: 0.2 }],
//     duration: 2, loop: true, prewarm: true,           // un ciclo; prewarm: arranca ya lleno
//     shape: { type: 'cone', angle: 15, radius: 0.2, emitFrom: 'volume' },
//     life: [2, 4], speed: [0.5, 1], size: 0.4,         // al nacer: un valor o un rango [min, max]
//     rotation: [0, 360], angularVelocity: [-30, 30],   // en grados y grados por segundo
//     color: ['#777777', '#999999'],                    // un color o un rango (al azar, en lineal)
//     sizeOverLife: [[0, 0.5], [1, 2]],                 // a lo largo de la vida (curves.js)
//     colorOverLife: ['#ffffff', '#333333'], alphaOverLife: [[0, 0], [0.1, 1], [1, 0]], speedOverLife: [1, 0.2],
//     gravity: [0, -9.8, 0], drag: 0.5, wind: [1, 0, 0], turbulence: { strength: 0.4, scale: 1.5, speed: 0.5 },
//     space: 'world',                                   // 'world': quedan en el mundo; 'local': siguen al emisor
//     texture: { frames: [4, 4], fps: 12, random: false, filter: 'linear' },   // flipbook (flipbook.js)
//     blending: 'normal', softness: 0.5, seed: 1,
//   }
//
// Qué hace cada cosa a lo largo de la vida:
//   - sizeOverLife multiplica el tamaño con que nació; alphaOverLife es el alfa (de 0 a 1);
//     colorOverLife multiplica (en lineal) el color con que nació; speedOverLife multiplica la
//     velocidad en el momento de moverse (las fuerzas se siguen sumando a la velocidad).
//   - gravity es una aceleración; drag frena hacia el aire (por segundo, independiente del
//     framerate); wind es la velocidad del aire: el drag lleva a las partículas hacia ella, así que
//     sin drag no hay viento (y es un error, para que no pase de largo).
//   - turbulence empuja con un ruido (noise.js): strength es la aceleración, scale el tamaño de los
//     remolinos (en unidades del mundo) y speed cuán rápido cambian.
//   - softness es el borde del círculo suave que se usa sin textura (0 duro, 1 todo degradé).
//
// `extends` parte de un preset (por nombre) o de otra definición, y pisa lo que se pasa: `shape`,
// `texture` y `turbulence` se pisan por clave (salvo que cambie el tipo de forma), el resto entero.
//
// Puro: no importa three ni DOM.
import { isHexColor, normalizeHex } from './color.js';
import { normalizeCurve } from './curves.js';
import { normalizeShape } from './shapes.js';
import { normalizeFlipbook } from './flipbook.js';
import { PRESETS } from './presets.js';

/** @typedef {[number, number]} Range */
/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{ time: number, count: Range, cycles: number, interval: number }} Burst */
/**
 * @typedef {{
 *   name: string, max: number, rate: number, bursts: Burst[], duration: number, loop: boolean, prewarm: boolean,
 *   shape: import('./shapes.js').Shape,
 *   life: Range, speed: Range, size: Range, rotation: Range, angularVelocity: Range, color: [string, string],
 *   sizeOverLife: import('./curves.js').NumberCurve | null, colorOverLife: import('./curves.js').ColorCurve | null,
 *   alphaOverLife: import('./curves.js').NumberCurve | null, speedOverLife: import('./curves.js').NumberCurve | null,
 *   gravity: Vec3, drag: number, wind: Vec3, turbulence: { strength: number, scale: number, speed: number } | null,
 *   space: 'world' | 'local', texture: import('./flipbook.js').Flipbook, blending: 'normal' | 'additive',
 *   softness: number, seed: number,
 * }} EmitterDef
 */

/** Los valores por defecto de cada clave (lo que no se pasa). */
export const EMITTER_DEFAULTS = Object.freeze({
  name: '', max: 500, rate: 10, bursts: Object.freeze([]), duration: 5, loop: true, prewarm: false,
  shape: 'point', life: 1, speed: 1, size: 0.1, rotation: 0, angularVelocity: 0, color: '#ffffff',
  sizeOverLife: null, colorOverLife: null, alphaOverLife: null, speedOverLife: null,
  gravity: Object.freeze([0, 0, 0]), drag: 0, wind: Object.freeze([0, 0, 0]), turbulence: null,
  space: 'world', texture: null, blending: 'normal', softness: 0.5, seed: 1,
});
const CLAVES = Object.keys(EMITTER_DEFAULTS);
const SPACES = ['world', 'local'];
const BLENDINGS = ['normal', 'additive'];
/** Las secciones que `extends` pisa por clave. */
const SECCIONES = ['shape', 'texture', 'turbulence'];

const plano = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finito = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
/** Las definiciones que ya pasaron por defineEmitter (no se vuelven a validar). */
const normalizados = new WeakSet();

/** @param {unknown} v @param {string} que @param {number} [min] @param {number} [max] */
function num(v, que, min = -Infinity, max = Infinity) {
  if (!finito(v)) throw new TypeError(`${que}: va un número (vino ${JSON.stringify(v)})`);
  const x = /** @type {number} */ (v);
  if (x < min || x > max) throw new RangeError(`${que}: va ${max === Infinity ? `≥ ${min}` : `de ${min} a ${max}`} (vino ${x})`);
  return x;
}

/** @param {unknown} v @param {string} que @param {number} [min] @param {number} [max] */
function entero(v, que, min = 0, max = Infinity) {
  if (!Number.isInteger(v)) throw new TypeError(`${que}: va un entero (vino ${JSON.stringify(v)})`);
  return num(v, que, min, max);
}

/**
 * Un valor o un rango [min, max] → siempre [min, max].
 * @param {unknown} v @param {string} que @param {{ min?: number, max?: number, int?: boolean, positive?: boolean }} [o] @returns {Range}
 */
function rango(v, que, { min = -Infinity, max = Infinity, int = false, positive = false } = {}) {
  const uno = (/** @type {unknown} */ x, /** @type {string} */ q) => {
    const n = int ? entero(x, q, min, max) : num(x, q, min, max);
    if (positive && !(n > 0)) throw new RangeError(`${q}: va mayor que 0 (vino ${n})`);
    return n;
  };
  if (!Array.isArray(v)) { const x = uno(v, que); return [x, x]; }
  if (v.length !== 2) throw new TypeError(`${que}: va un valor o un rango [min, max]`);
  const a = uno(v[0], `${que}[0]`), b = uno(v[1], `${que}[1]`);
  if (a > b) throw new RangeError(`${que}: va [min, max] con min ≤ max (vino [${a}, ${b}])`);
  return [a, b];
}

/** @param {unknown} v @param {string} que @returns {Vec3} */
function vec3(v, que) {
  if (!Array.isArray(v) || v.length !== 3) throw new TypeError(`${que}: va [x, y, z] (vino ${JSON.stringify(v)})`);
  return /** @type {Vec3} */ (v.map((x, i) => num(x, `${que}[${i}]`)));
}

/** @param {unknown} v @param {string} que @returns {[string, string]} */
function colores(v, que) {
  const uno = (/** @type {unknown} */ x, /** @type {string} */ q) => {
    if (!isHexColor(x)) throw new TypeError(`${q}: va un color '#rrggbb' (vino ${JSON.stringify(x)})`);
    return normalizeHex(x);
  };
  if (!Array.isArray(v)) { const c = uno(v, que); return [c, c]; }
  if (v.length !== 2) throw new TypeError(`${que}: va un color o un rango ['#desde', '#hasta']`);
  return [uno(v[0], `${que}[0]`), uno(v[1], `${que}[1]`)];
}

/** @param {unknown} v @param {number} duracion @returns {Burst[]} */
function rafagas(v, duracion) {
  if (!Array.isArray(v)) throw new TypeError('emitter.bursts: va un array de { time, count, cycles?, interval? }');
  return v.map((b, i) => {
    const que = `emitter.bursts[${i}]`;
    if (!plano(b)) throw new TypeError(`${que}: va { time, count, cycles?, interval? }`);
    for (const k of Object.keys(b)) if (!['time', 'count', 'cycles', 'interval'].includes(k)) throw new Error(`${que}.${k}: clave desconocida (van time, count, cycles, interval)`);
    const time = b.time === undefined ? 0 : num(b.time, `${que}.time`, 0);
    if (b.count === undefined) throw new Error(`${que}.count: falta cuántas partículas (un entero o [min, max])`);
    const count = rango(b.count, `${que}.count`, { min: 0, int: true });
    const cycles = b.cycles === undefined ? 1 : entero(b.cycles, `${que}.cycles`, 1);
    let interval = 0;
    if (cycles > 1) {
      if (b.interval === undefined) throw new Error(`${que}.interval: con cycles > 1 va cada cuántos segundos se repite`);
      interval = num(b.interval, `${que}.interval`, 0);
      if (!(interval > 0)) throw new RangeError(`${que}.interval: va mayor que 0`);
    } else if (b.interval !== undefined) interval = num(b.interval, `${que}.interval`, 0);
    const ultima = time + (cycles - 1) * interval;
    if (ultima >= duracion) throw new RangeError(`${que}: ${cycles > 1 ? 'la última ráfaga' : 'la ráfaga'} (a los ${+ultima.toFixed(4)} s) cae fuera del ciclo (duration: ${duracion} s)`);
    return { time, count, cycles, interval: cycles > 1 ? interval : 0 };
  });
}

/** @param {unknown} v @returns {EmitterDef['turbulence']} */
function turbulencia(v) {
  if (v === null || v === undefined) return null;
  if (!plano(v)) throw new TypeError('emitter.turbulence: va { strength, scale?, speed? } o null');
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of Object.keys(o)) if (!['strength', 'scale', 'speed'].includes(k)) throw new Error(`emitter.turbulence.${k}: clave desconocida (van strength, scale, speed)`);
  const strength = o.strength === undefined ? 1 : num(o.strength, 'emitter.turbulence.strength', 0);
  const scale = o.scale === undefined ? 1 : num(o.scale, 'emitter.turbulence.scale', 0);
  if (!(scale > 0)) throw new RangeError('emitter.turbulence.scale: va mayor que 0 (el tamaño de los remolinos)');
  const speed = o.speed === undefined ? 0.5 : num(o.speed, 'emitter.turbulence.speed', 0);
  return { strength, scale, speed };
}

/**
 * La definición sin `extends`: el preset o la definición de base, con lo que se pasa encima.
 * @param {Record<string, unknown>} def @param {number} [hondo] @returns {Record<string, unknown>}
 */
function resolverExtends(def, hondo = 0) {
  if (!('extends' in def)) return def;
  if (hondo > 16) throw new Error('emitter.extends: demasiados niveles (¿un ciclo?)');
  const { extends: base, ...resto } = def;
  /** @type {Record<string, unknown>} */
  let desde;
  if (typeof base === 'string') {
    const p = PRESETS[base];
    if (!p) throw new Error(`emitter.extends: preset desconocido ${base} (van ${Object.keys(PRESETS).join(', ')})`);
    desde = structuredClone(p);
  } else if (plano(base)) desde = resolverExtends(structuredClone(/** @type {Record<string, unknown>} */ (base)), hondo + 1);
  else throw new TypeError("emitter.extends: va el nombre de un preset ('humo') o una definición");
  /** @type {Record<string, unknown>} */
  const out = { ...desde };
  for (const [k, v] of Object.entries(resto)) {
    const b = desde[k];
    if (SECCIONES.includes(k) && plano(v) && (plano(b) || (k === 'shape' && typeof b === 'string'))) {
      const bo = /** @type {Record<string, unknown>} */ (typeof b === 'string' ? { type: b } : b);
      const vo = /** @type {Record<string, unknown>} */ (v);
      // otra forma: no se mezclan las claves de una con las de la otra
      out[k] = k === 'shape' && vo.type !== undefined && vo.type !== bo.type ? vo : { ...bo, ...vo };
      // la esfera dice de dónde emite con surface o con emitFrom: el que se pasa manda
      if (k === 'shape' && ('surface' in vo || 'emitFrom' in vo)) {
        const s = /** @type {Record<string, unknown>} */ (out[k]);
        if (!('surface' in vo)) delete s.surface;
        if (!('emitFrom' in vo)) delete s.emitFrom;
      }
    } else out[k] = v;
  }
  return out;
}

/**
 * La definición completa y validada de un emisor. Acepta los atajos (un valor en vez de un rango,
 * un nombre de forma, curvas cortas, `extends`) y devuelve siempre la misma forma, que se puede
 * guardar en JSON y volver a pasar. Un error dice dónde está.
 * @param {Record<string, unknown>} def @returns {EmitterDef}
 */
export function defineEmitter(def) {
  if (!plano(def)) throw new TypeError("el emisor va como un objeto: { rate, life, speed, … } o { extends: 'humo', … }");
  const d = resolverExtends(def);
  for (const k of Object.keys(d)) if (!CLAVES.includes(k)) throw new Error(`clave desconocida: ${k} (van extends, ${CLAVES.join(', ')})`);
  /** @param {string} k */
  const de = (k) => (d[k] === undefined ? /** @type {Record<string, unknown>} */ (EMITTER_DEFAULTS)[k] : d[k]);

  if (typeof de('name') !== 'string') throw new TypeError('emitter.name: va un texto');
  const duration = num(de('duration'), 'emitter.duration', 0.01);
  if (typeof de('loop') !== 'boolean') throw new TypeError('emitter.loop: va true o false');
  if (typeof de('prewarm') !== 'boolean') throw new TypeError('emitter.prewarm: va true o false');
  if (de('prewarm') && !de('loop')) throw new Error('emitter.prewarm: va con loop: true (arranca como si ya hubiera estado andando)');
  const drag = num(de('drag'), 'emitter.drag', 0);
  const wind = vec3(de('wind'), 'emitter.wind');
  if (drag === 0 && wind.some((x) => x !== 0)) throw new Error('emitter.wind: el viento lleva las partículas a través del aire: va con drag > 0');
  const space = de('space');
  if (!SPACES.includes(/** @type {string} */ (space))) throw new Error(`emitter.space: va 'world' o 'local' (vino ${JSON.stringify(space)})`);
  const blending = de('blending');
  if (!BLENDINGS.includes(/** @type {string} */ (blending))) throw new Error(`emitter.blending: va 'normal' o 'additive' (vino ${JSON.stringify(blending)})`);
  const seed = entero(de('seed'), 'emitter.seed', 0, 2 ** 32 - 1);

  /** @type {EmitterDef} */
  const out = {
    name: /** @type {string} */ (de('name')),
    max: entero(de('max'), 'emitter.max', 1, 1_000_000),
    rate: num(de('rate'), 'emitter.rate', 0),
    bursts: rafagas(de('bursts'), duration),
    duration,
    loop: /** @type {boolean} */ (de('loop')),
    prewarm: /** @type {boolean} */ (de('prewarm')),
    shape: normalizeShape(de('shape')),
    life: rango(de('life'), 'emitter.life', { min: 0, positive: true }),
    speed: rango(de('speed'), 'emitter.speed'),
    size: rango(de('size'), 'emitter.size', { min: 0 }),
    rotation: rango(de('rotation'), 'emitter.rotation'),
    angularVelocity: rango(de('angularVelocity'), 'emitter.angularVelocity'),
    color: colores(de('color'), 'emitter.color'),
    sizeOverLife: /** @type {any} */ (normalizeCurve(de('sizeOverLife'), 'emitter.sizeOverLife', 'number', [0, Infinity])),
    colorOverLife: /** @type {any} */ (normalizeCurve(de('colorOverLife'), 'emitter.colorOverLife', 'color')),
    alphaOverLife: /** @type {any} */ (normalizeCurve(de('alphaOverLife'), 'emitter.alphaOverLife', 'number', [0, 1])),
    speedOverLife: /** @type {any} */ (normalizeCurve(de('speedOverLife'), 'emitter.speedOverLife', 'number')),
    gravity: vec3(de('gravity'), 'emitter.gravity'),
    drag,
    wind,
    turbulence: turbulencia(de('turbulence')),
    space: /** @type {EmitterDef['space']} */ (space),
    texture: normalizeFlipbook(de('texture')),
    blending: /** @type {EmitterDef['blending']} */ (blending),
    softness: num(de('softness'), 'emitter.softness', 0, 1),
    seed,
  };
  normalizados.add(out);
  return out;
}

/**
 * La definición normalizada: la misma si ya pasó por defineEmitter, si no la valida.
 * @param {Record<string, unknown> | EmitterDef} def @returns {EmitterDef}
 */
export const resolveEmitter = (def) => (normalizados.has(def) ? /** @type {EmitterDef} */ (def) : defineEmitter(/** @type {Record<string, unknown>} */ (def)));

/** JSON con las claves ordenadas, para que el hash no dependa del orden en que se escribió. @param {unknown} v @returns {string} */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(/** @type {Record<string, unknown>} */ (v)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Un identificador corto del emisor: dos definiciones iguales (aunque escritas distinto, con
 * atajos o con `extends`) dan el mismo. `extra`: algo más que cambie el resultado.
 * @param {Record<string, unknown> | EmitterDef} def @param {string} [extra]
 */
export function hashEmitter(def, extra = '') {
  const s = stableStringify(resolveEmitter(def)) + extra;
  // FNV-1a de 53 bits, como hashMaterial
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h2 >>> 0) * 2 ** 21 + ((h1 >>> 0) >>> 11)).toString(36);
}
