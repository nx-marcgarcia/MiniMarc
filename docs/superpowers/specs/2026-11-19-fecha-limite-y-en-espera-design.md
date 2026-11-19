# Fecha límite y «En espera» (bloque 2 de la hoja de ruta v2)

Fecha: 2026-11-19 · Origen: `2026-11-16-segundo-cerebro-v2-hoja-de-ruta.md`, ideas 1 y 7. Escrito sin ronda de preguntas, porque Marc pidió seguir sin parar; todo lo que no viene de la hoja de ruta está marcado como **decisión mía** para que la corrija.

## Para qué

Posponer una tarea mueve su fecha, y eso puede esconder un compromiso real: «lo hago el miércoles» y «tiene que estar el viernes» son dos cosas distintas. Además, una tarea enviada («escribí a la tienda Funko») no está hecha, pero tampoco se puede ejecutar ahora: no debería seguir apareciendo como pendiente de hacer ni provocar avisos que digan «envía el correo».

## Objetivos

- Una tarea puede tener **fecha límite** además de su fecha prevista. Posponer mueve solo la fecha prevista.
- Una tarea puede estar **en espera** de alguien o de algo, con una fecha para volver a mirarla.
- Lo que está en espera deja de molestar (Tareas, avisos) y vuelve solo el día de revisarla, como un seguimiento.

## No objetivos

- Duración estimada: ya existe `estimateMin` en el registro; no se toca.
- Planificador de días («Planificar mi día»): es la idea 2 de la hoja de ruta, otro bloque.
- Quitar la fecha límite de Hoy/Semana: esas vistas siguen usando la fecha prevista (ver Límites).

## Restricciones

- **Sin migración de base de datos.** Los campos propios de una tarea viven en `items.data` y los valida el registro (`lib/items/itemTypes.ts`); los estados son texto libre validado por el mismo registro (decisión de la fase 1).
- Lo de Trabajo no va a la IA ni a Telegram (los avisos ya lo respetan: este bloque no añade ninguna llamada a la IA).
- Compatible con todo lo que ya hay: una tarea sin los campos nuevos se comporta exactamente como hoy.

## Enfoques considerados

1. **Columnas nuevas** (`deadline_at`, `waiting_for`…) con migración. Más limpio para consultas, pero obliga a Marc a aplicar una migración y a tocar el repositorio, la exportación y la importación. Descartado: nada de esto se filtra en la base de datos, la app ya carga todas las tareas.
2. **Campos en `data` + un estado nuevo** *(elegido, decisión mía)*. Cero migración, validado por el registro, se exporta solo.
3. **«En espera» como campo, sin estado.** Evita tocar `isOpen`, pero cada pantalla tendría que mirar el campo para esconderla; un estado deja una única pregunta («¿está en espera?») fácil de comprobar y de probar.

## Diseño

### Parte A: fecha límite

- `tarea.fields.deadline`: fecha `YYYY-MM-DD` (día de Madrid, sin hora). Opcional.
- Hoja de la tarea: campo **Fecha límite** junto a Fecha, Hora y Repetir. Una fecha límite anterior a la fecha prevista es un error del formulario (decisión mía: planear después del límite es casi siempre un descuido).
- **Posponer** (Para hoy, revisión semanal, hoja) mueve `dueAt` y no toca `deadline`: no hay que hacer nada, ya es lo que ocurre. Hay un test que lo fija.
- **Tareas**: una tarea cuya fecha límite ya pasó va a «Atrasadas» aunque su fecha prevista sea futura; una con límite y sin fecha prevista se agrupa por su límite en vez de ir a «Sin fecha». La fila dice «Límite: vie 20 nov».
- **Revisión semanal, «Atrasado»**: incluye las que pasaron su límite.
- **Avisos** (`resurfacing/candidates`): «Su fecha límite pasó hace N días» (atrasada) y «Su fecha límite es hoy» (vence hoy). Misma ventana y mismos horarios de siempre.

### Parte B: En espera

- Estado nuevo `en_espera` en `tarea.states` (entre Pendiente y Hecha). Campos: `waitingFor` (texto: persona o respuesta, opcional), `waitingSince` (fecha, la pone la app al pasar a espera), `reviewOn` (fecha para volver a mirarla, opcional).
- Hoja de la tarea: el selector Estado ya existe para tipos con más de dos estados; al elegir «En espera» aparecen «Esperando a» y «Volver a mirar el».
- **Tareas**: las tareas en espera salen de los grupos por día y van a un grupo propio **«En espera»** al final, con «Esperando a X · desde hace N días».
- **Avisos y Hoy**: una tarea en espera no genera avisos de «atrasada» ni «vence hoy». El día de `reviewOn` (o, sin fecha, a los 7 días de `waitingSince`, decisión mía) genera un aviso nuevo **«Seguimiento: …»** con el mismo orden de urgencia que «vence hoy».
- Revisión semanal: lo que lleva en espera y ya pasó su `reviewOn` aparece en «Atrasado» como seguimiento.
- Completar una tarea en espera la cierra como cualquier otra.

## Límites conocidos (a propósito)

- La línea de tiempo de Hoy y Semana sigue usando la fecha prevista. La fecha límite llega a Hoy por el bloque «Para hoy» (los avisos). Meterla en la línea de tiempo toca `collectTasks` y la ordenación del digest; queda para cuando se rehaga Hoy (idea 2).
- Las tareas que se repiten mantienen su límite tal cual al avanzar; lo normal es no ponérselo a las que se repiten.

## Qué se deja al implementador

Textos exactos de las filas y de los avisos, orden dentro de «En espera» (más antigua primero), y el aspecto del campo en la hoja.
