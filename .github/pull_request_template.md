## Qué cambia y por qué

<!-- Qué problema resuelve, para qué tipo de apps. -->

Cierra #

## Política

- [ ] Viene de un issue `aceptado` (o es un error).
- [ ] Es una herramienta general, no la solución de una app ([POLITICA.md](../POLITICA.md)).
- [ ] Si alcanzaba con un punto de extensión (una definición con `extends`, `texture`, `emitter.object`, la simulación pura), es eso y no una función nueva.

## Contrato

- [ ] Entró primero al núcleo (`src/`), con su prueba en Node, y después al adaptador.
- [ ] Una clave nueva de la definición se valida en `defineEmitter`, con un error que dice dónde, y lo normalizado se puede volver a pasar.
- [ ] La simulación sigue siendo determinista y nunca pasa de `max`.
- [ ] Cada miembro nuevo de la API tiene su línea en `src/members.js`.
- [ ] `src/` no importa three ni el DOM, ni otro motor de la suite.
- [ ] Ninguna dependencia nueva, o está justificada en el issue.
- [ ] Lo que andaba sigue andando (y las definiciones guardadas también), o va en el `CHANGELOG.md` como **Ruptura** con cómo migrar.
- [ ] `npm test` y `npm run typecheck` pasan, y lo que dibuja está probado a ojo en `examples/index.html`.
