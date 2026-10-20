// Lo que el motor promete de su forma, sin three (el CI no lo instala): que el núcleo sea puro y
// que las tablas de help() coincidan con la API del adaptador, leyendo su fuente como texto. Lo que
// dibuja se prueba en un navegador (examples/index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ENGINE_MEMBERS, EMITTER_MEMBERS, memberNames, help } from '../src/index.js';

const fuente = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

/**
 * Los miembros de un objeto literal del fuente (`const nombre = {` … `};`): los que están un nivel
 * adentro, sean métodos, getters, setters, `clave: valor` o shorthand.
 */
function miembros(s, nombre) {
  const i = s.indexOf(`const ${nombre} = {`);
  assert.ok(i >= 0, `no está const ${nombre} = { en el adaptador`);
  const sangria = s.slice(s.lastIndexOf('\n', i) + 1, i);
  const fin = s.indexOf(`\n${sangria}};`, i);
  const cuerpo = s.slice(i, fin);
  const adentro = `${sangria}  `;
  const api = new Set();
  const re = new RegExp(`^${adentro}(?:async |get |set )?([A-Za-z_$][\\w$]*)\\s*(?:\\(|:|,)`, 'gm');
  for (const m of cuerpo.matchAll(re)) api.add(m[1]);
  return api;
}

/** La tabla y la API, en las dos direcciones. */
function coinciden(api, tabla, quien) {
  const doc = new Set(tabla.flatMap(([sig]) => memberNames(sig)));
  assert.ok(api.size > 3, `${quien}: no se encontró la API`);
  for (const n of api) assert.ok(doc.has(n), `${quien}: ${n} está en la API pero no en la tabla de help()`);
  for (const n of doc) assert.ok(api.has(n), `${quien}: ${n} está en la tabla de help() pero no en la API`);
}

test('lo puro no importa three ni el DOM', async () => {
  const archivos = (await readdir(new URL('../src/', import.meta.url))).filter((f) => f.endsWith('.js'));
  assert.ok(archivos.length >= 10);
  for (const f of archivos) {
    const s = await fuente(`src/${f}`);
    assert.doesNotMatch(s, /from 'three/, f);
    assert.doesNotMatch(s, /\b(document|window)\./, f);
    assert.doesNotMatch(s, /from '\.\.\//, `${f}: src/ no importa nada de afuera de src/`);
  }
});

test('three se importa solo en el adaptador', async () => {
  const s = await fuente('adapters/three/particles.js');
  assert.match(s, /^import \* as THREE from 'three';$/m);
});

test('la tabla de help() y la API del motor coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/three/particles.js'), 'motor'), ENGINE_MEMBERS, 'motor');
});

test('la tabla de help() y la API del emisor coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/three/particles.js'), 'emisor'), EMITTER_MEMBERS, 'emisor');
});

test('el adaptador: un ShaderMaterial sin escribir profundidad, una llamada por emisor, y las marcas de render', async () => {
  const s = await fuente('adapters/three/particles.js');
  assert.match(s, /new THREE\.InstancedBufferGeometry\(\)/);
  assert.match(s, /new THREE\.ShaderMaterial\(/);
  assert.match(s, /depthWrite: false/);
  assert.match(s, /userData\.noEdge = true/);
  assert.match(s, /userData\.noAO = true/);
  assert.match(s, /addUpdateRange\(/);
  assert.doesNotMatch(s, /noRender/, 'el path tracer ya deja afuera el material de shader propio');
});

test('help(): imprime la tabla con console.table y la devuelve', () => {
  const filas = help('x', [['a()', 'uno']], { print: false });
  assert.deepEqual(filas, [{ member: 'a()', description: 'uno' }]);
  assert.deepEqual(memberNames('emitter(def, { texture? })'), ['emitter']);
});
