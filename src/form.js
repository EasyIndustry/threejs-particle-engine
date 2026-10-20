// Las formas procedurales de una partícula: sin textura, una función de distancia firmada (SDF) que
// el shader evalúa en cada fragmento. La misma forma sale nítida a cualquier tamaño (con antialias)
// o, con `pixel`, evaluada en el centro de cada píxel del arte: pixelada.
//
//   form: 'circle'                                   // un nombre, con sus parámetros por defecto
//   form: { type: 'star', points: 5, inner: 0.45 }   // con parámetros
//   formOverLife: { inner: [0.45, 0.2] }             // parámetros a lo largo de la vida (curves.js)
//
// `form` y no `shape`: `shape` es la forma de donde nacen las partículas (cono, esfera…).
//
// Una forma es { name, version, params, glsl, doc }. `glsl` es el cuerpo de una función
//   float formSDF(vec2 p, vec4 f, float seed)
// que devuelve la distancia al borde (negativa adentro) con el quad de -1 a 1 (el borde de un
// círculo que llena el quad está a distancia 1 del centro). Los parámetros llegan como variables con
// su nombre (hasta 4, en el orden de `params`) y `seed` es el azar propio de cada partícula (de 0 a
// 1): con él, cada mancha de `noise` es distinta. El cuerpo puede usar `formNoise(vec2)` (ruido de
// valor de 0 a 1) y las constantes de three (PI).
//
// Las de una app se registran con `registerForm` como 'app/nombre'; su `version` entra en el hash
// del emisor (si cambia el GLSL, cambia el hash), como los generadores de threejs-material-engine.
//
// Puro: no importa three ni DOM.

/** @typedef {{ default: number, range: [number, number], doc?: string }} FormParam */
/** @typedef {{ name: string, version: string, params: Record<string, FormParam>, glsl: string, doc: string }} Form */
/** @typedef {{ type: string, params: Record<string, number> }} FormDef */

/** El máximo de parámetros de una forma (van en un vec4 por partícula). */
export const MAX_FORM_PARAMS = 4;

/** El ruido de valor que pueden usar las formas: formNoise(p), de 0 a 1, suave. */
export const FORM_NOISE_GLSL = /* glsl */ `
float formHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float formNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(formHash(i), formHash(i + vec2(1.0, 0.0)), u.x), mix(formHash(i + vec2(0.0, 1.0)), formHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/** @param {number} d @param {number} lo @param {number} hi @param {string} doc @returns {FormParam} */
const param = (d, lo, hi, doc) => ({ default: d, range: [lo, hi], doc });

/** @type {Form[]} */
const DE_FABRICA = [
  {
    name: 'circle', version: '1', params: {}, doc: 'un disco: el círculo de siempre, nítido a cualquier tamaño',
    glsl: 'return length(p) - 1.0;',
  },
  {
    name: 'ring', version: '1', doc: 'un anillo (una onda que se abre: thickness con formOverLife)',
    params: { thickness: param(0.3, 0.01, 1, 'el ancho del anillo, en fracción del radio') },
    glsl: 'return abs(length(p) - (1.0 - thickness * 0.5)) - thickness * 0.5;',
  },
  {
    name: 'square', version: '1', doc: 'un cuadrado, con las puntas redondeadas si roundness > 0',
    params: { roundness: param(0, 0, 1, 'el radio de las puntas, en fracción del lado') },
    glsl: 'vec2 q = abs(p) - (1.0 - roundness); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - roundness;',
  },
  {
    name: 'diamond', version: '1', params: {}, doc: 'un rombo (un cuadrado girado 45°)',
    glsl: 'return (abs(p.x) + abs(p.y) - 1.0) * 0.70710678;',
  },
  {
    name: 'star', version: '1', doc: 'una estrella de puntas rectas',
    params: { points: param(5, 2, 16, 'cuántas puntas (se redondea)'), inner: param(0.45, 0.05, 1, 'el radio de adentro, en fracción del de afuera') },
    // se pliega el ángulo a media punta: ahí el borde es un solo segmento, de la punta (0, 1) al
    // vértice de adentro; la distancia es al segmento y el signo, el lado de la recta
    glsl: `float n = max(2.0, floor(points + 0.5));
  float an = PI / n;
  float a = mod(atan(p.x, p.y) + an, 2.0 * an) - an;
  a = abs(a);
  vec2 q = length(p) * vec2(sin(a), cos(a));
  vec2 A = vec2(0.0, 1.0), e = inner * vec2(sin(an), cos(an)) - A, w = q - A;
  float d = length(w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0));
  return e.x * w.y - e.y * w.x < 0.0 ? -d : d;`,
  },
  {
    name: 'cross', version: '1', doc: 'una cruz (un destello de cuatro puntas rectas)',
    params: { thickness: param(0.35, 0.05, 1, 'el ancho de los brazos, en fracción del lado') },
    glsl: `vec2 a = abs(p);
  vec2 q1 = a - vec2(1.0, thickness), q2 = a - vec2(thickness, 1.0);
  float d1 = length(max(q1, 0.0)) + min(max(q1.x, q1.y), 0.0);
  float d2 = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0);
  return min(d1, d2);`,
  },
  {
    name: 'spark', version: '1', doc: 'una chispa: un rombo alargado en vertical (con rotation, hacia donde se quiera)',
    params: { width: param(0.3, 0.02, 1, 'el ancho, en fracción del largo') },
    glsl: 'return (abs(p.x) / width + abs(p.y) - 1.0) * width / sqrt(1.0 + width * width);',
  },
  {
    name: 'noise', version: '1', doc: 'una mancha con el borde de ruido, distinta en cada partícula (humo, nubes, polvo sin textura)',
    params: { amount: param(0.5, 0, 1, 'cuánto se deforma el borde'), scale: param(2.5, 0.1, 16, 'el tamaño de los grumos: más, más chicos') },
    // el radio va de 1 − 0.9·amount a 1 según el ruido: queda centrada y adentro del quad
    glsl: `vec2 o = vec2(seed * 71.3, seed * 113.9);
  float n = formNoise(p * scale + o) * 0.65 + formNoise(p * scale * 2.1 + o.yx) * 0.35;
  return length(p) - 1.0 + 0.9 * amount * n;`,
  },
];

/** El registro: las de fábrica y las de las apps. @type {Map<string, Form>} */
const registro = new Map();

const NOMBRE = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVADAS = new Set(['p', 'f', 'seed']);

/**
 * Valida y congela una forma.
 * @param {unknown} v @param {boolean} deFabrica @returns {Form}
 */
function validar(v, deFabrica) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('registerForm(form): va { name, version, params, glsl, doc? }');
  const o = /** @type {Record<string, unknown>} */ (v);
  for (const k of Object.keys(o)) if (!['name', 'version', 'params', 'glsl', 'doc'].includes(k)) throw new Error(`registerForm: clave desconocida ${k} (van name, version, params, glsl, doc)`);
  const name = o.name;
  if (typeof name !== 'string' || !NOMBRE.test(name)) throw new TypeError(`registerForm: name va en minúsculas, 'app/nombre' (vino ${JSON.stringify(name)})`);
  if (!deFabrica && !name.includes('/')) throw new Error(`registerForm: la forma de una app va como 'app/${name}' (las de una palabra son de fábrica)`);
  if (typeof o.version !== 'string' || !o.version) throw new TypeError(`registerForm ${name}: version va un texto ('1'): entra en el hash del emisor`);
  if (typeof o.glsl !== 'string' || !/\breturn\b/.test(o.glsl)) throw new TypeError(`registerForm ${name}: glsl va el cuerpo de float formSDF(vec2 p, vec4 f, float seed), con su return`);
  const params = o.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new TypeError(`registerForm ${name}: params va { nombre: { default, range: [min, max] } }`);
  const entradas = Object.entries(params);
  if (entradas.length > MAX_FORM_PARAMS) throw new RangeError(`registerForm ${name}: hasta ${MAX_FORM_PARAMS} parámetros (van en un vec4)`);
  /** @type {Record<string, FormParam>} */
  const ps = {};
  for (const [k, pv] of entradas) {
    if (!IDENT.test(k) || RESERVADAS.has(k)) throw new Error(`registerForm ${name}: el parámetro ${k} no sirve como nombre de GLSL (o choca con p, f, seed)`);
    const pp = /** @type {Record<string, unknown>} */ (pv);
    const r = pp?.range;
    if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => typeof x === 'number' && Number.isFinite(x)) || r[0] > r[1]) throw new TypeError(`registerForm ${name}.params.${k}.range: va [min, max]`);
    const def = pp.default;
    if (typeof def !== 'number' || def < r[0] || def > r[1]) throw new RangeError(`registerForm ${name}.params.${k}.default: va un número dentro de range`);
    ps[k] = Object.freeze({ default: def, range: /** @type {[number, number]} */ (Object.freeze([r[0], r[1]])), doc: typeof pp.doc === 'string' ? pp.doc : '' });
  }
  return Object.freeze({ name, version: o.version, params: Object.freeze(ps), glsl: o.glsl, doc: typeof o.doc === 'string' ? o.doc : '' });
}

for (const f of DE_FABRICA) registro.set(f.name, validar(f, true));

/**
 * Agrega la forma de una app ('app/nombre'). Registrar otra vez el mismo nombre la reemplaza (con
 * otra `version`, el hash de los emisores que la usan cambia). Devuelve la forma, congelada.
 * @param {{ name: string, version: string, params?: Record<string, { default: number, range: [number, number], doc?: string }>, glsl: string, doc?: string }} form
 */
export function registerForm(form) {
  const f = validar(form, false);
  registro.set(f.name, f);
  return f;
}

/** Una forma por nombre, o undefined. @param {string} name */
export const getForm = (name) => registro.get(name);

/** Las formas que hay: { name, version, params, doc }. */
export const listForms = () => [...registro.values()].map(({ name, version, params, doc }) => ({ name, version, params, doc }));

/**
 * La forma normalizada: { type, params } con todos sus parámetros, o null. Un error dice dónde.
 * @param {unknown} v @param {string} [que] @returns {FormDef | null}
 */
export function normalizeForm(v, que = 'emitter.form') {
  if (v === undefined || v === null) return null;
  const o = /** @type {Record<string, unknown>} */ (typeof v === 'string' ? { type: v } : v);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new TypeError(`${que}: va el nombre de una forma ('star') o { type, …parámetros }`);
  const forma = typeof o.type === 'string' ? registro.get(o.type) : undefined;
  if (!forma) throw new Error(`${que}.type: forma desconocida ${JSON.stringify(o.type)} (van ${[...registro.keys()].join(', ')})`);
  /** @type {Record<string, number>} */
  const params = {};
  // los parámetros pueden venir sueltos ({ type, inner }) o, ya normalizados, en params; sueltos
  // mandan (extends pisa una forma normalizada con un parámetro suelto)
  const dados = /** @type {Record<string, unknown>} */ ({ ...(o.params && typeof o.params === 'object' ? o.params : {}), ...o });
  for (const k of Object.keys(dados)) if (k !== 'type' && k !== 'params' && !(k in forma.params)) throw new Error(`${que}.${k}: parámetro desconocido de ${forma.name} (van ${Object.keys(forma.params).join(', ') || 'ninguno'})`);
  for (const [k, p] of Object.entries(forma.params)) {
    const x = dados[k] === undefined ? p.default : dados[k];
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`${que}.${k}: va un número (vino ${JSON.stringify(x)})`);
    if (x < p.range[0] || x > p.range[1]) throw new RangeError(`${que}.${k}: va de ${p.range[0]} a ${p.range[1]} (vino ${x})`);
    params[k] = x;
  }
  return { type: forma.name, params };
}

/**
 * La firma de las formas que usa un emisor (para el hash): 'nombre@versión', o ''.
 * @param {FormDef | null} form
 */
export const formSignature = (form) => (form ? `${form.type}@${/** @type {Form} */ (registro.get(form.type)).version}` : '');

/**
 * El GLSL de la forma: la función formSDF con sus parámetros como variables, más el ruido.
 * @param {string} name
 */
export function formGLSL(name) {
  const f = registro.get(name);
  if (!f) throw new Error(`formGLSL: forma desconocida ${name}`);
  const vars = Object.keys(f.params).map((k, i) => `  float ${k} = f.${'xyzw'[i]};\n`).join('');
  return `${FORM_NOISE_GLSL}\nfloat formSDF(vec2 p, vec4 f, float seed) {\n${vars}  ${f.glsl}\n}`;
}
