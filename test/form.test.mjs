// Las pruebas de las formas procedurales, en Node: el registro (las de fábrica y las de una app), la
// definición (atajos, errores que dicen dónde, extends, JSON, hash con la versión) y los parámetros
// por partícula a lo largo de la vida. Lo que dibujan se prueba en un navegador (examples/index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defineEmitter, hashEmitter, createSimulation, registerForm, getForm, listForms, normalizeForm, formGLSL, MAX_FORM_PARAMS,
} from '../src/index.js';

const correr = (sim, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) sim.step(dt); return sim; };
const cerca = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;

test('las formas de fábrica: con su GLSL, parámetros dentro de rango y a lo sumo 4', () => {
  const nombres = listForms().map((f) => f.name);
  for (const n of ['circle', 'ring', 'square', 'diamond', 'star', 'cross', 'spark', 'noise']) assert.ok(nombres.includes(n), n);
  for (const n of nombres) {
    const f = getForm(n);
    assert.ok(Object.keys(f.params).length <= MAX_FORM_PARAMS, n);
    for (const [k, p] of Object.entries(f.params)) assert.ok(p.default >= p.range[0] && p.default <= p.range[1], `${n}.${k}`);
    const g = formGLSL(n);
    assert.match(g, /float formSDF\(vec2 p, vec4 f, float seed\)/);
    Object.keys(f.params).forEach((k, i) => assert.match(g, new RegExp(`float ${k} = f\\.${'xyzw'[i]};`), `${n}.${k}`));
  }
});

test('form: un nombre o { type, …parámetros }, con los que faltan por defecto', () => {
  assert.equal(defineEmitter({}).form, null);
  assert.deepEqual(defineEmitter({ form: 'circle' }).form, { type: 'circle', params: {}, edge: 0 });
  assert.deepEqual(defineEmitter({ form: 'star' }).form, { type: 'star', params: { points: 5, inner: 0.45 }, edge: 0 });
  assert.deepEqual(defineEmitter({ form: { type: 'star', inner: 0.3, edge: 0.2 } }).form, { type: 'star', params: { points: 5, inner: 0.3 }, edge: 0.2 });
});

test('form: un error dice dónde', () => {
  assert.throws(() => defineEmitter({ form: 'estrella' }), /emitter\.form\.type: forma desconocida "estrella"/);
  assert.throws(() => defineEmitter({ form: { type: 'ring', grosor: 0.2 } }), /emitter\.form\.grosor: parámetro desconocido de ring \(van edge, thickness\)/);
  assert.throws(() => defineEmitter({ form: { type: 'ring', edge: 2 } }), /emitter\.form\.edge: va de 0 \(nítido\) a 1/);
  assert.throws(() => defineEmitter({ form: { type: 'ring', thickness: 3 } }), /emitter\.form\.thickness: va de 0\.01 a 1/);
  assert.throws(() => defineEmitter({ formOverLife: { inner: [1, 0] } }), /emitter\.formOverLife: va con form/);
  assert.throws(() => defineEmitter({ form: 'star', formOverLife: { puntas: [5, 8] } }), /emitter\.formOverLife\.puntas: parámetro desconocido de star/);
  assert.throws(() => defineEmitter({ form: 'star', formOverLife: { inner: [0.5, 0] } }), /emitter\.formOverLife\.inner\[1\]: va de 0\.05 a 1/);
});

test('form: vuelve igual por JSON, entra en el hash y extends la pisa por clave (salvo otro tipo)', () => {
  const d = defineEmitter({ extends: 'chispas', form: { type: 'star', inner: 0.3 }, formOverLife: { inner: [0.3, 0.1] } });
  assert.deepEqual(defineEmitter(JSON.parse(JSON.stringify(d))), d);
  assert.notEqual(hashEmitter({ form: 'star' }), hashEmitter({ form: 'circle' }));
  assert.equal(hashEmitter({ form: 'star' }), hashEmitter({ form: { type: 'star', points: 5 } }));
  const base = { extends: 'humo', form: { type: 'star', points: 6, inner: 0.3 } };
  assert.deepEqual(defineEmitter({ extends: base, form: { inner: 0.5 } }).form, { type: 'star', params: { points: 6, inner: 0.5 }, edge: 0 });
  assert.deepEqual(defineEmitter({ extends: base, form: { type: 'ring' } }).form, { type: 'ring', params: { thickness: 0.3 }, edge: 0 });
  // una definición ya normalizada, pisada con un parámetro suelto
  assert.deepEqual(defineEmitter({ extends: d, form: { inner: 0.6 } }).form?.params.inner, 0.6);
  assert.equal(defineEmitter({ extends: base, form: null }).form, null);
});

test('registerForm: las de una app van como app/nombre, validadas, y su versión cambia el hash', () => {
  assert.throws(() => registerForm({ name: 'gota', version: '1', glsl: 'return 0.0;' }), /'app\/gota'/);
  assert.throws(() => registerForm({ name: 'mi-app/gota', glsl: 'return 0.0;' }), /version/);
  assert.throws(() => registerForm({ name: 'mi-app/gota', version: '1', glsl: 'length(p)' }), /return/);
  assert.throws(() => registerForm({ name: 'mi-app/gota', version: '1', glsl: 'return 0.0;', params: { p: { default: 0, range: [0, 1] } } }), /no sirve como nombre/);
  assert.throws(() => registerForm({ name: 'mi-app/gota', version: '1', glsl: 'return 0.0;', params: { a: { default: 2, range: [0, 1] } } }), /default/);
  const cinco = Object.fromEntries(['a', 'b', 'c', 'e', 'g'].map((k) => [k, { default: 0, range: [0, 1] }]));
  assert.throws(() => registerForm({ name: 'mi-app/gota', version: '1', glsl: 'return 0.0;', params: cinco }), /hasta 4/);

  const gota = { name: 'mi-app/gota', version: '1', doc: 'una gota', params: { punta: { default: 0.5, range: [0, 1] } }, glsl: 'return length(p - vec2(0.0, punta * 0.2)) - 1.0;' };
  registerForm(gota);
  const def = { form: { type: 'mi-app/gota', punta: 0.8 } };
  assert.deepEqual(normalizeForm(def.form), { type: 'mi-app/gota', params: { punta: 0.8 }, edge: 0 });
  const h1 = hashEmitter(def);
  registerForm({ ...gota, version: '2' });
  assert.notEqual(hashEmitter(def), h1, 'otra versión del GLSL, otro hash');
});

test('la simulación: los parámetros de la forma por partícula, con formOverLife según la edad', () => {
  const sim = correr(createSimulation({ rate: 120, life: 1, form: { type: 'star', points: 6, inner: 0.4 }, formOverLife: { inner: [0.4, 0.1] } }), 30);
  assert.ok(sim.alive > 10);
  assert.equal(sim.data.form.length, sim.max * 4);
  for (let i = 0; i < sim.alive; i++) {
    const t = sim.data.age[i] / sim.data.life[i];
    assert.equal(sim.data.form[i * 4], 6, 'points, fijo');
    assert.ok(cerca(sim.data.form[i * 4 + 1], 0.4 + (0.1 - 0.4) * t), 'inner, según la edad');
  }
  assert.equal(createSimulation({}).data.form.length, 0, 'sin form, nada');
});

test('el adaptador: el GLSL de la forma entra en el fragmento, con los defines y el atributo iForm', async () => {
  const s = await readFile(new URL('../adapters/three/particles.js', import.meta.url), 'utf8');
  assert.match(s, /formGLSL\(d\.form\.type\)/);
  for (const k of ['FORM', 'FORM_TEXTURE']) assert.match(s, new RegExp(`#ifdef ${k}\\b`), k);
  assert.match(s, /setAttribute\('iForm'/);
  assert.match(s, /fwidth\(dist\)/, 'sin pixel, el borde con antialias');
});
