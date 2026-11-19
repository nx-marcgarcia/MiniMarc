# Hoy útil y avisos con contexto, sin IA (bloque 3 de la hoja de ruta v2)

Fecha: 2026-11-19 · Origen: `2026-11-16-segundo-cerebro-v2-hoja-de-ruta.md`, ideas 2 y 3, solo la parte que no necesita IA (Marc pidió empezar por ahí). Escrito sin ronda de preguntas; lo que no viene de la hoja de ruta es **decisión mía**.

## Para qué

«Sin citas» no significa «sin cosas pendientes»: hoy un día vacío dice «Día tranquilo» aunque haya tareas sin fecha. Y los avisos de lo olvidado dicen que algo lleva tiempo parado, pero no dejan contestar con precisión («más adelante», «ya no me interesa», «estoy esperando»).

## Objetivos

- Hoy ayuda a elegir: **Mi prioridad de hoy** (una tarea elegida por Marc), **Si tienes 15 minutos** (acciones pequeñas) y **Algo que llevas aplazando** (un pendiente rescatado).
- Los avisos explican por qué salen y se pueden contestar con más matiz.
- Cero llamadas a la IA, cero migraciones.

## No objetivos

- «Planificar mi día» (propone tareas según huecos): idea con IA/huecos de calendario, queda para después de la estimación de coste que pide Marc.
- Resurfacing por relación entre elementos («tienes un proyecto relacionado»): necesita las relaciones (idea 4).
- Control de frecuencia de los avisos (idea 3, final): las tres horas ya se configuran en Ajustes.
- Cambiar los botones de Telegram: sus acciones están restringidas en la base de datos (`check` en `resurfacing_events.action`) y ampliarlas exige migración. Las respuestas nuevas son solo de la web («Para hoy»).

## Restricciones

- Sin migración: la prioridad de hoy y la duración viven en `items.data` de la tarea y las valida el registro.
- Lo de Trabajo no sale hacia Telegram ni a la IA (los avisos ya lo respetan). En la web, Hoy sigue el filtro de área.
- Las respuestas nuevas se registran con una acción que ya admite la base de datos (`posponer`), decisión mía: así no hace falta migrar. Efecto secundario conocido: tres «más adelante» seguidos hacen que el aviso pregunte si se archiva, que es justo lo que se quiere.

## Diseño

### Parte 1: elegir (Hoy)

- Campo propio nuevo `focusOn` (fecha) en la tarea. **Mi prioridad de hoy** = la tarea abierta con `focusOn` igual a hoy. Se caduca sola al día siguiente (no hay nada que limpiar). Solo una: elegir otra quita la anterior.
- Bloque «Tu prioridad» en Hoy: si hay una, se ve con su botón Hecho y «Quitar»; si no, un botón «Elegir mi prioridad» abre la lista corta (hasta 8: atrasadas primero, luego las de hoy, luego las demás; no las que están en espera).
- Campo «Duración (min)» en la hoja de una tarea (`estimateMin`, ya existía en el registro pero ningún formulario lo rellenaba). La fila de una tarea con duración la muestra.
- Bloque «Si tienes 15 minutos»: hasta tres tareas con duración de 15 min o menos (más cortas primero, atrasadas antes), con Hecho y «Mi prioridad». Sin tareas con duración, el bloque no aparece (no se inventa nada).
- Los bloques de elegir respetan el filtro de área de Hoy; la prioridad ya elegida se ve siempre.
- Con un día sin citas ni tareas con fecha, el titular deja de decir «Día tranquilo» cuando hay algo que elegir: «Sin citas ni tareas con fecha. Elige por dónde empezar.».

### Parte 2: avisos con contexto y respuestas

- Nuevo tipo de aviso `tarea_aplazada` («Algo que llevas aplazando»): tarea abierta, sin fecha o con fecha pasada, no en espera, sin tocar desde hace 14 días o más, no de Trabajo (los avisos ya lo excluyen). Es de baja urgencia, como las ideas olvidadas. Sale en «Para hoy» y también por Telegram con los botones de siempre.
- Los textos explican el porqué y proponen: «La idea lleva un mes parada. ¿Defines un primer paso?», «Guardaste este enlace hace 2 meses y sigue sin ver», «Lleva 3 semanas sin tocarse».
- Abrir un elemento no reinicia su antigüedad: ya es así (la antigüedad es `updatedAt`, que solo cambia con el contenido); se deja un test que lo fija.
- Respuestas nuevas en «Para hoy»:
  - **Más adelante** (en lo olvidado y lo aplazado): no vuelve a salir en 30 días.
  - **Ya no me interesa** (en lo olvidado y lo aplazado): se archiva (es el Archivar de siempre con otra etiqueta).
  - **No me recuerdes**: silencia el elemento para siempre (usa `snoozedUntil` muy lejano; el elemento sigue donde estaba).
  - **En espera** (en cualquier tarea): pasa la tarea a «En espera» desde hoy, a mirar dentro de una semana. Es la respuesta «Estoy esperando a alguien»; el nombre se pone después en la hoja.
- En lo urgente (atrasadas, vence hoy, fecha límite, regalos, garantías, compras urgentes) los botones no cambian salvo «En espera» en las tareas.

## Qué se deja al implementador

Textos exactos, el aspecto de los bloques nuevos y el número de filas de cada uno.
