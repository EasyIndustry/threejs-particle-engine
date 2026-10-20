// Los emisores típicos, como datos: la app los usa tal cual o los pisa con `extends`
// (`{ extends: 'humo', rate: 40 }`), como los presets de threejs-render-engine. Son puntos de
// partida, no el catálogo de una app: el humo de un juego en particular va en ese juego.
//
// La escala es de metros (un fuego de medio metro, polvo en un cuarto de 4 × 4). Para otra escala,
// la app pisa `size`, `speed`, `gravity` y la forma.
//
// Puro: no importa three ni DOM.

/** @param {Record<string, any>} o @returns {any} */
function congelar(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') congelar(v);
  return Object.freeze(o);
}

/** @type {Readonly<Record<string, Readonly<Record<string, any>>>>} */
export const PRESETS = congelar({
  fuego: {
    name: 'fuego', max: 300, rate: 70, duration: 1, loop: true, prewarm: true,
    shape: { type: 'cone', angle: 12, radius: 0.22 },
    life: [0.5, 1], speed: [0.6, 1.2], size: [0.3, 0.55], rotation: [0, 360], angularVelocity: [-90, 90],
    color: ['#ffb347', '#ff7a1a'],
    sizeOverLife: [[0, 0.5], [0.35, 1], [1, 0.15]],
    colorOverLife: [[0, '#ffffff'], [0.45, '#ffa040'], [1, '#801800']],
    alphaOverLife: [[0, 0], [0.12, 1], [0.7, 0.55], [1, 0]],
    gravity: [0, 1.8, 0], drag: 1.2, turbulence: { strength: 1.5, scale: 0.5, speed: 1.2 },
    blending: 'additive', softness: 0.9,
  },
  humo: {
    name: 'humo', max: 120, rate: 10, duration: 1, loop: true, prewarm: true,
    shape: { type: 'cone', angle: 14, radius: 0.15 },
    life: [3, 5], speed: [0.4, 0.7], size: [0.4, 0.7], rotation: [0, 360], angularVelocity: [-25, 25],
    color: ['#6e6e6e', '#9a9a9a'],
    sizeOverLife: [[0, 0.5], [1, 3]],
    alphaOverLife: [[0, 0], [0.12, 0.45], [1, 0]],
    gravity: [0, 0.25, 0], drag: 0.6, wind: [0.5, 0, 0], turbulence: { strength: 0.35, scale: 1.5, speed: 0.4 },
    blending: 'normal', softness: 1,
  },
  chispas: {
    name: 'chispas', max: 200, rate: 35, duration: 1, loop: true,
    shape: { type: 'cone', angle: 35, radius: 0.05 },
    life: [0.4, 0.9], speed: [3, 6], size: [0.03, 0.06],
    color: ['#ffd27a', '#fff2c0'],
    colorOverLife: [[0, '#ffffff'], [1, '#ff5a00']],
    alphaOverLife: [[0, 1], [0.75, 1], [1, 0]],
    sizeOverLife: [1, 0.4],
    gravity: [0, -9.8, 0], drag: 0.5,
    blending: 'additive', softness: 0.35,
  },
  polvo: {
    name: 'polvo', max: 150, rate: 12, duration: 1, loop: true, prewarm: true,
    shape: { type: 'box', size: [4, 1.6, 4] },
    life: [5, 8], speed: [0.01, 0.05], size: [0.015, 0.035], rotation: [0, 360],
    color: '#d9cbb0',
    alphaOverLife: [[0, 0], [0.2, 0.6], [0.8, 0.6], [1, 0]],
    drag: 0.8, turbulence: { strength: 0.06, scale: 1.2, speed: 0.15 },
    blending: 'normal', softness: 0.7,
  },
  lluvia: {
    name: 'lluvia', max: 1500, rate: 600, duration: 1, loop: true, prewarm: true,
    shape: { type: 'box', size: [12, 0, 12] },
    life: [1, 1.2], speed: [-11, -9], size: [0.02, 0.035],
    color: '#a9c3df',
    alphaOverLife: [[0, 0], [0.05, 0.7], [1, 0.7]],
    gravity: [0, -3, 0],
    blending: 'normal', softness: 0.4,
  },
  magia: {
    name: 'magia', max: 300, rate: 45, duration: 1, loop: true, prewarm: true,
    shape: { type: 'sphere', radius: 0.45, emitFrom: 'surface' },
    life: [1, 2], speed: [0.05, 0.25], size: [0.04, 0.1], rotation: [0, 360], angularVelocity: [-180, 180],
    color: ['#7a5cff', '#3fd0ff'],
    sizeOverLife: [[0, 0], [0.2, 1], [1, 0]],
    colorOverLife: [[0, '#ffffff'], [0.3, '#ffffff'], [1, '#ff7ae0']],
    alphaOverLife: [[0, 1], [0.7, 0.9], [1, 0]],
    gravity: [0, 0.35, 0], drag: 1.5, turbulence: { strength: 0.9, scale: 0.4, speed: 0.8 },
    blending: 'additive', softness: 0.6,
  },
});
