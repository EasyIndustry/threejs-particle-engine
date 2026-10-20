// Las formas del emisor: dónde nace cada partícula y hacia dónde sale. Todas en el espacio del
// emisor, con +y para arriba:
//
//   point                         en el centro, hacia cualquier lado
//   sphere { radius, emitFrom }   adentro ('volume') o en la cáscara ('surface'), hacia afuera
//   box    { size, emitFrom }     adentro ('volume') o en las caras ('surface'), hacia +y
//   cone   { angle, radius, emitFrom }
//                                 en la base (un disco de `radius` en el plano xz: adentro o en el
//                                 borde, 'edge'), hacia +y abriéndose hasta `angle` grados: con
//                                 radius > 0 la abertura crece con la distancia al centro (un cono
//                                 truncado, como el de Unity); con radius 0, al azar dentro del cono
//   disk   { radius, emitFrom }   en un disco del plano xz (adentro o en el borde), hacia +y
//   ring   { radius, width }      en un anillo del plano xz, de radius − width a radius, hacia
//                                 afuera (una onda expansiva)
//
// Atajos: 'sphere' en vez de { type: 'sphere' }, y en la esfera `surface: true` es
// `emitFrom: 'surface'`. Para que salgan para el otro lado, `speed` negativa.
//
// Puro: no importa three ni DOM.

/** @typedef {[number, number, number]} Vec3 */
/**
 * @typedef {{ type: 'point' }
 *   | { type: 'sphere', radius: number, emitFrom: 'volume' | 'surface' }
 *   | { type: 'box', size: Vec3, emitFrom: 'volume' | 'surface' }
 *   | { type: 'cone', angle: number, radius: number, emitFrom: 'volume' | 'edge' }
 *   | { type: 'disk', radius: number, emitFrom: 'volume' | 'edge' }
 *   | { type: 'ring', radius: number, width: number }} Shape
 */

/** Las formas, con sus claves, sus valores por defecto y de dónde pueden emitir. */
export const SHAPES = Object.freeze({
  point: Object.freeze({ defaults: Object.freeze({}), emitFrom: null }),
  sphere: Object.freeze({ defaults: Object.freeze({ radius: 1 }), emitFrom: Object.freeze(['volume', 'surface']) }),
  box: Object.freeze({ defaults: Object.freeze({ size: Object.freeze([1, 1, 1]) }), emitFrom: Object.freeze(['volume', 'surface']) }),
  cone: Object.freeze({ defaults: Object.freeze({ angle: 25, radius: 0 }), emitFrom: Object.freeze(['volume', 'edge']) }),
  disk: Object.freeze({ defaults: Object.freeze({ radius: 1 }), emitFrom: Object.freeze(['volume', 'edge']) }),
  ring: Object.freeze({ defaults: Object.freeze({ radius: 1, width: 0 }), emitFrom: null }),
});

const finito = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * La forma normalizada. Un error dice dónde.
 * @param {unknown} v @param {string} [que] @returns {Shape}
 */
export function normalizeShape(v, que = 'emitter.shape') {
  if (v === undefined) v = 'point';
  const o = /** @type {Record<string, unknown>} */ (typeof v === 'string' ? { type: v } : v);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new TypeError(`${que}: va un nombre ('cone') o { type, … }`);
  const tipo = /** @type {keyof typeof SHAPES} */ (o.type);
  const info = SHAPES[tipo];
  if (!info) throw new Error(`${que}.type: forma desconocida ${JSON.stringify(o.type)} (van ${Object.keys(SHAPES).join(', ')})`);
  const claves = ['type', ...Object.keys(info.defaults), ...(info.emitFrom ? ['emitFrom'] : []), ...(tipo === 'sphere' ? ['surface'] : [])];
  for (const k of Object.keys(o)) if (!claves.includes(k)) throw new Error(`${que}.${k}: clave desconocida para ${tipo} (van ${claves.join(', ')})`);
  /** @type {Record<string, any>} */
  const out = { type: tipo };
  /** @param {string} k @param {number} [max] */
  const positivo = (k, max = Infinity) => {
    const x = o[k] ?? /** @type {Record<string, number>} */ (info.defaults)[k];
    if (!finito(x) || /** @type {number} */ (x) < 0 || /** @type {number} */ (x) > max) throw new RangeError(`${que}.${k}: va un número de 0 a ${max} (vino ${JSON.stringify(x)})`);
    return /** @type {number} */ (x);
  };
  if (tipo === 'sphere') out.radius = positivo('radius');
  if (tipo === 'box') {
    let s = o.size ?? SHAPES.box.defaults.size;
    if (finito(s)) s = [s, s, s];
    if (!Array.isArray(s) || s.length !== 3) throw new TypeError(`${que}.size: va [x, y, z] o un número`);
    out.size = s.map((x, i) => {
      if (!finito(x) || x < 0) throw new RangeError(`${que}.size[${i}]: va un número ≥ 0 (vino ${JSON.stringify(x)})`);
      return x;
    });
  }
  if (tipo === 'cone') { out.angle = positivo('angle', 90); out.radius = positivo('radius'); }
  if (tipo === 'disk') out.radius = positivo('radius');
  if (tipo === 'ring') {
    out.radius = positivo('radius');
    out.width = positivo('width');
    if (out.width > out.radius) throw new RangeError(`${que}.width: va de 0 a radius (${out.radius})`);
  }
  if (info.emitFrom) {
    let desde = o.emitFrom;
    if (tipo === 'sphere' && o.surface !== undefined) {
      if (typeof o.surface !== 'boolean') throw new TypeError(`${que}.surface: va true o false`);
      const porSurface = o.surface ? 'surface' : 'volume';
      if (desde !== undefined && desde !== porSurface) throw new Error(`${que}: surface y emitFrom dicen cosas distintas; va uno solo`);
      desde = porSurface;
    }
    desde ??= 'volume';
    if (!info.emitFrom.includes(/** @type {string} */ (desde))) throw new Error(`${que}.emitFrom: ${tipo} va ${info.emitFrom.map((x) => `'${x}'`).join(' o ')} (vino ${JSON.stringify(desde)})`);
    out.emitFrom = desde;
  }
  return /** @type {Shape} */ (out);
}

/**
 * Una dirección al azar, uniforme en la esfera. Escribe en `out`.
 * @param {() => number} rnd @param {Vec3} out
 */
function alAzar(rnd, out) {
  const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  out[0] = r * Math.cos(a); out[1] = z; out[2] = r * Math.sin(a);
}

/**
 * Dónde nace una partícula y hacia dónde sale (unitaria), en el espacio del emisor. Escribe en
 * `pos` y `dir`.
 * @param {Shape} s @param {() => number} rnd en [0, 1) @param {Vec3} pos @param {Vec3} dir
 */
export function sampleShape(s, rnd, pos, dir) {
  switch (s.type) {
    case 'point': {
      pos[0] = pos[1] = pos[2] = 0;
      alAzar(rnd, dir);
      return;
    }
    case 'sphere': {
      alAzar(rnd, dir);
      const r = s.emitFrom === 'surface' ? s.radius : s.radius * Math.cbrt(rnd());
      pos[0] = dir[0] * r; pos[1] = dir[1] * r; pos[2] = dir[2] * r;
      return;
    }
    case 'box': {
      const [sx, sy, sz] = s.size;
      pos[0] = (rnd() - 0.5) * sx; pos[1] = (rnd() - 0.5) * sy; pos[2] = (rnd() - 0.5) * sz;
      if (s.emitFrom === 'surface') {
        // una cara, con probabilidad según su área; la partícula se pega a esa cara
        const ax = sy * sz, ay = sx * sz, az = sx * sy, total = 2 * (ax + ay + az);
        if (total > 0) {
          let u = rnd() * total;
          const lado = () => (rnd() < 0.5 ? -0.5 : 0.5);
          if ((u -= 2 * ax) < 0) pos[0] = lado() * sx;
          else if ((u -= 2 * ay) < 0) pos[1] = lado() * sy;
          else pos[2] = lado() * sz;
        }
      }
      dir[0] = 0; dir[1] = 1; dir[2] = 0;
      return;
    }
    case 'disk':
    case 'cone': {
      const a = rnd() * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const f = s.emitFrom === 'edge' ? 1 : Math.sqrt(rnd());
      pos[0] = c * f * s.radius + 0; pos[1] = 0; pos[2] = sn * f * s.radius + 0; // + 0: sin −0
      if (s.type === 'disk') { dir[0] = 0; dir[1] = 1; dir[2] = 0; return; }
      const max = (s.angle * Math.PI) / 180;
      if (s.radius > 0) {
        // la abertura crece con la distancia al centro, hacia afuera
        const t = max * f;
        dir[0] = c * Math.sin(t); dir[1] = Math.cos(t); dir[2] = sn * Math.sin(t);
      } else {
        // uniforme dentro del cono (en ángulo sólido)
        const cz = 1 - rnd() * (1 - Math.cos(max)), r = Math.sqrt(Math.max(0, 1 - cz * cz)), b = rnd() * Math.PI * 2;
        dir[0] = r * Math.cos(b); dir[1] = cz; dir[2] = r * Math.sin(b);
      }
      return;
    }
    case 'ring': {
      const a = rnd() * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const r = s.radius - s.width * rnd();
      pos[0] = c * r; pos[1] = 0; pos[2] = sn * r;
      dir[0] = c; dir[1] = 0; dir[2] = sn;
      return;
    }
  }
}
