# motion

[![CI](https://github.com/keivanmalhani/motion-recipes/actions/workflows/ci.yml/badge.svg)](https://github.com/keivanmalhani/motion-recipes/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.json)

**La mayoria de las microinteracciones no necesitan una libreria de animacion de 70 KB.**

[English](./README.md) | Espanol

---

## Que es esto

Un sitio estatico con catorce recetas de microinteraccion listas para produccion. Cada una tiene una
demo en vivo que puedes ejecutar, un fragmento de codigo de menos de treinta lineas para copiar y
pegar, y un parrafo que explica por que funciona ese timing, no solo que hace.

Todo funciona sobre la Web Animations API (`element.animate`) y CSS. No hay dependencias en tiempo
de ejecucion. Vite, vitest y TypeScript son dependencias de desarrollo y ninguna llega al bundle.

Esto no es un argumento en contra de GSAP. GSAP es excelente, y si estas construyendo una narrativa
dirigida por scroll o secuenciando cuarenta elementos sobre una misma linea de tiempo, deberias
usarlo. Es un argumento de que el press de un boton, el hover de una tarjeta y el shake de un error
en tu producto no justifican la dependencia, y de que la razon por la que la mayoria de las
versiones hechas a mano se sienten baratas es el timing, no las herramientas.

## Las recetas

| # | Receta | Categoria | La idea |
| --- | --- | --- | --- |
| 01 | Spring press | feedback | Un muelle resuelto y horneado en keyframes, reproducido en linear para que sobreviva el rebote |
| 02 | Magnetic hover | feedback | Atraccion hacia el puntero con caida cuadratica y muelle al soltar |
| 03 | Stagger reveal | entrance | Retardo por distancia al centro, con el total acotado |
| 04 | Shared element morph | transition | FLIP real: medir primero, mutar, medir despues, invertir, reproducir |
| 05 | Elastic drawer | transition | El panel sobre un muelle, el contenido detras con retardo escalonado |
| 06 | Number ticker | state | Las columnas de digitos giran en el compositor, el pie de texto cuenta en rAF |
| 07 | Skeleton to content | entrance | Fundido cruzado con solape, nunca un cambio instantaneo |
| 08 | Icon state morph | state | De hamburguesa a cerrar con tres divs: primero trasladar, despues rotar |
| 09 | Success checkmark | feedback | Trazado con stroke-dashoffset, para que la marca se lea como una accion completada |
| 10 | Attention shake | feedback | Amplitud con decaimiento exponencial, para que aterrice en vez de solo detenerse |
| 11 | Progress arc | state | Un dash, un offset, y un pop con muelle justo al completarse |
| 12 | Card lift | feedback | Una capa de sombra aparte mas unos pocos pixeles de parallax interno |
| 13 | Text scramble | entrance | Se resuelve de izquierda a derecha y nunca cambia la longitud del texto |
| 14 | Page transition wipe | transition | Una sola lista de keyframes con una pausa, porque dos animaciones producen un parpadeo |

El conjunto completo esta definido como datos en [`src/core/recipes.ts`](./src/core/recipes.ts). La
interfaz y los tests recorren ese mismo array, asi que anadir una receta anade una tarjeta a la
pagina y la incorpora a todas las aserciones del registro al mismo tiempo.

## Arquitectura

```
src/core/     TypeScript puro, sin construccion de DOM, sin imports de UI
  easing.ts     curvas cubic-bezier con nombre y un solver de muelle a keyframes
  timeline.ts   primitiva de secuenciacion: consulta el estado en cualquier tiempo t
  stagger.ts    retardos por indice: linear, from-center, from-edges, grid-distance
  recipes.ts    el registro, cada receta es datos mas un run(element)
  runtime.ts    el unico punto que llama a element.animate
  target.ts     el contrato estructural minimo que una receta puede tocar
src/ui/       construye la pagina a partir del registro
tests/        vitest, entorno node, sin navegador
```

### Por que core/ esta separado

`src/core` nunca crea un elemento y nunca importa desde `src/ui`. Las recetas reciben un
`RecipeTarget`, cuyo unico miembro obligatorio es `animate()`. Eso tiene dos consecuencias que
justifican la restriccion:

- Un `HTMLElement` real lo satisface estructuralmente, asi que la interfaz pasa los elementos
  directamente, sin cast y sin objeto envoltorio.
- Un stub corto en un archivo de test tambien lo satisface. jsdom no implementa la Web Animations
  API, asi que probar las recetas contra un DOM real solo demostraria que `element.animate` es
  undefined. En su lugar, cada receta se ejecuta sin navegador contra un objetivo que registra sus
  llamadas, y la suite verifica los keyframes y las opciones de timing exactas que produjo.

Todo lo demas que una receta pueda necesitar (hijos, cajas de layout, estilos, atributos) pasa por
accesores protegidos en `target.ts` que devuelven un valor vacio seguro en vez de lanzar. Eso no es
relleno defensivo: es lo que hace significativa la ejecucion sin navegador, y lo que evita que un
elemento colapsado o aun sin layout meta un `NaN` en una cadena de transform y mate la animacion en
silencio.

### El solver de muelles

`solveSpring()` integra numericamente un oscilador armonico amortiguado con Euler semi-implicito y
emite un array de keyframes mas una duracion. Dos detalles importan:

- **Subdivide su propio paso.** Un paso fijo de 480 Hz diverge a `Infinity` con un muelle muy rigido
  en una docena de iteraciones, y todos los keyframes resultantes salen `NaN`. El bucle mide la
  frecuencia natural del muelle y subdivide hasta que el paso es pequeno respecto a ella. Esto lo
  encontro un test, no una revision a ojo.
- **El resultado se reproduce con `easing: "linear"`.** El muelle ya esta en los valores. Si le
  dejas un cubic-bezier encima, suavizas el suavizado: el rebote se aplana y el movimiento se siente
  blando por razones muy dificiles de ver en un diff.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo de vite
npm test         # vitest, entorno node
npm run build    # tsc --noEmit y despues vite build
npm run preview  # sirve dist/
```

**Tests: 103, todos pasando.** Repartidos en cinco archivos, con 310 puntos de asercion que ejecutan
alrededor de 3.700 aserciones, porque la mayoria recorren las catorce recetas.

| Archivo | Cubre |
| --- | --- |
| `tests/easing.test.ts` | Extremos de las bezier, monotonia, rebote, asentamiento del muelle, orden por amortiguacion, numero de keyframes y las guardas que hacen terminar los parametros degenerados |
| `tests/timeline.test.ts` | Estado en t=0, medio, final y pasado el final; pasos solapados; insercion desordenada; pasos de duracion cero; timelines vacias |
| `tests/stagger.test.ts` | Formas de distribucion, from-edges como complemento exacto de from-center, geometria de rejilla y el tope del total |
| `tests/recipes.test.ts` | Forma del registro, ids unicos, compilacion de los fragmentos, y cada receta ejecutada sin navegador con aserciones sobre sus keyframes y opciones |
| `tests/runtime.test.ts` | Propagacion de la velocidad, seguimiento de animaciones, el fallback del driver sin rAF y todos los accesores protegidos |

La salida del build son unos 50 KB de JavaScript (17 KB con gzip) y 21 KB de CSS (5 KB con gzip). La
mayor parte del JavaScript son los catorce fragmentos y sus parrafos explicativos, unos 16 KB de
literales de cadena: el motor en si es pequeno, el material didactico no.

## Accesibilidad y preferencias de movimiento

- Todos los controles son un `<button>` o un `<input>` real. Los anillos de foco nunca se eliminan.
- Los botones con solo icono llevan `aria-label`. El boton de copiar anuncia el exito mediante una
  region live educada, porque un cambio de etiqueta en un boton que acabas de activar no siempre se
  anuncia.
- Los escenarios de demo son `aria-hidden`, porque todo lo que puedes hacer sobre un escenario lo
  puedes hacer tambien desde un boton etiquetado.
- `prefers-reduced-motion` se respeta de verdad, y la persona puede anularlo en cualquier direccion.
  Lo que desactiva es lo que nadie pidio: la reproduccion automatica al hacer scroll y el bucle
  ambiental del hero. Pulsar Replay sigue reproduciendo la demo. Una libreria de movimiento que se
  niega a mostrar movimiento cuando se le pide no es accesible, esta rota.

## Limitaciones

Conviene saberlo antes de copiar nada de aqui:

- **Las recetas son demostraciones, no un paquete.** No hay modulo de npm. Copia el fragmento,
  quedate con lo que necesites y borra el resto. Ese es el flujo previsto.
- **No hay tests de regresion visual.** La suite demuestra que cada receta emite los keyframes y el
  timing que dice emitir. No puede demostrar que el resultado se vea bien, y nada aqui se ha
  comparado contra un render de referencia.
- **La Web Animations API se asume, no se rellena con polyfill.** `element.animate` con un array de
  keyframes tiene soporte amplio, pero el `easing` por keyframe y `composite` son menos
  consistentes, y el runtime degrada a no hacer nada en vez de caer a transiciones CSS.
- **`drive()` es un compromiso.** Dos recetas animan una cadena de texto, que ningun compositor
  puede interpolar, asi que corren sobre `requestAnimationFrame`. Ese bucle respeta la velocidad
  global pero no vive en el hilo del compositor, y sin reloj de frames salta directamente al estado
  resuelto.
- **La demo de FLIP anima dentro de un escenario fijo.** Las transiciones de elemento compartido
  reales suelen cruzar un limite de ruta, lo que trae problemas de restauracion de scroll e
  identidad de elementos que aqui no hay que resolver.
- **Alcance de navegadores.** Desarrollado contra Chromium, Firefox y WebKit actuales. No probado en
  Safari antiguo, donde WAAPI tiene carencias conocidas alrededor de `fill` y `composite`.

## Licencia

MIT. Copyright (c) 2026 Keivan Malhani.
