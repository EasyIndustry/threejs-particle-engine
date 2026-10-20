// Las tablas de help(): una línea por miembro, una tabla por objeto del adaptador (el motor y cada
// emisor). Viven aparte (puras, sin three) para que la prueba en Node pueda compararlas con la
// API de adapters/three/particles.js, en las dos direcciones.

/** @type {import('./help.js').Member[]} */
export const ENGINE_MEMBERS = [
  ['emitter(def, { texture?, seed?, sort?, autoplay?, autoDispose? })', "un emisor: la definición (o { extends: 'humo', … }) y, si hace falta, una THREE.Texture con la hoja; devuelve el emisor (su .object va a motor.content)"],
  ['define(def)', 'la definición completa y validada: con los atajos resueltos, y un error que dice dónde si algo está mal'],
  ['hash(def)', 'el identificador de la definición: igual definición (aunque escrita distinto), igual hash'],
  ['PRESETS', 'los emisores típicos como datos: fuego, humo, chispas, polvo, lluvia, magia (se usan con extends)'],
  ['registerForm(form)', "agregar una forma procedural de una app ('app/nombre'): { name, version, params, glsl, doc? }, el GLSL de su distancia (ver src/form.js)"],
  ['forms()', 'las formas procedurales que hay: { name, version, params, doc } (circle, ring, square, diamond, star, cross, spark, noise y las de la app)'],
  ['emitters', 'los emisores que hay (una copia de la lista)'],
  ['update(dt, camera?)', 'avanza todos los emisores dt segundos y sube lo que cambió; con la cámara ordena los de blending normal (motor.onFrame((dt) => particulas.update(dt, motor.camera)))'],
  ['stats()', 'qué hay: { emitters, alive, drawCalls, dropped }'],
  ['dispose()', 'soltar todos los emisores, sus geometrías, materiales y las texturas propias'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const EMITTER_MEMBERS = [
  ['object', 'el Object3D del emisor, para colgar en motor.content: moverlo o girarlo mueve el emisor'],
  ['def', 'la definición completa (defineEmitter)'],
  ['simulation', 'la simulación pura (createSimulation): los arrays y el estado'],
  ['position', 'dónde está el emisor: el Vector3 del object (se puede asignar un [x, y, z])'],
  ['alive', 'cuántas partículas hay vivas'],
  ['emitting', '¿está emitiendo? (sin loop, deja de emitir al terminar el ciclo)'],
  ['done', '¿terminó? no emite más y no queda ninguna viva'],
  ['play()', 'arranca a emitir desde el principio del ciclo (con prewarm, ya lleno) y saca la pausa'],
  ['stop()', 'deja de emitir: las vivas terminan su vida'],
  ['pause()', 'congela todo hasta play()'],
  ['clear()', 'saca todas las vivas, ya'],
  ['burst(n)', 'n partículas ya, donde está el emisor'],
  ['dispose()', 'sacarlo de la escena y soltar su geometría y su material (la textura de la app no)'],
  ['help()', 'esta tabla'],
];
