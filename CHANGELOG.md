# Changelog

Segundo cerebro: se construye por fases (ver la hoja de ruta). Cada fase deja la app desplegable.

## v2: fiabilidad y planificación (bloques 1 y 2 de la hoja de ruta)

Sin migraciones: los campos nuevos viven en `items.data` y los valida el registro de tipos.

- **Tienda en una compra:** selector **Tienda** en su hoja, con **Nueva tienda…** (se crea al guardar, no al elegir). La compra nueva desde la hoja también guarda su tienda. Arregla las compras antiguas que se quedaban en «Sin tienda».
- **Separar en productos:** en la hoja de una compra (no de Trabajo), la IA lee la compra y propone la tienda y los productos; los editas, y al confirmar se crea una compra por producto y la original se archiva. Una llamada a Gemini por pulsación; nada se guarda antes de confirmar.
- **Ordenar lo antiguo** (revisión semanal): ideas que suenan a una tarea («Trabajar») y compras sin tienda, sin IA.
- **Fecha límite** en las tareas, separada de la fecha prevista: posponer solo mueve la prevista. Tareas manda a «Atrasadas» lo que pasó su límite; la revisión semanal y los avisos («Su fecha límite pasó…», «Su fecha límite es hoy») la respetan. Un límite anterior a la fecha prevista es un error del formulario.
- **En espera** (estado nuevo de las tareas): con «Esperando a», «Volver a mirar el» y desde cuándo (lo pone la app). Sale de los pendientes, de Hoy y del siguiente paso de un proyecto, y no avisa de atrasada. El día de volver a mirarla (o a la semana) sale un aviso **Seguimiento** y la revisión semanal tiene el bloque **Seguimientos** (Ya llegó · En 3 días · Hecha). Diseño: `docs/superpowers/specs/2026-11-19-fecha-limite-y-en-espera-design.md`.

## Reformulación: segundo cerebro (PARA ligero)

Ordenar por *para qué* sirve cada cosa, no por *qué tipo* es. Inspirado en Things 3 y GTD (Bandeja y revisión semanal), PARA de Tiago Forte (Proyectos, Áreas, Recursos, Archivo), Capacities (fichas que reúnen lo suyo), Sunsama y Amie (el día en una línea) y Raycast/Linear (⌘K).

- **Pestañas:** Hoy · Bandeja · Tareas · **Proyectos** · **Biblioteca**. La Agenda pasa a ser la vista **Calendario** de Hoy; Listas pasa a llamarse Biblioteca (`/listas` redirige).
- **Hoy en una línea de tiempo:** «Tu día» mezcla citas y tareas con hora por orden; las tareas se completan desde ahí (con Deshacer). La copia de una tarea en el calendario «Tareas» no sale dos veces. Debajo, «Sin hora» (las atrasadas primero) y «Próximas fechas». Selector **Día | Semana | Calendario**.
- **Filtro de área global:** Personal | Trabajo | Todo, recordado en una cookie, en Hoy, Tareas, Bandeja y Proyectos. `?area=` sigue funcionando (avisos, marcadores). Con «Todo», las tareas de trabajo dicen «Trabajo».
- **Proyectos** (migración `0014`, la aplicas tú en el SQL Editor; sin ella todo funciona y Proyectos lo avisa): tarjetas con el siguiente paso o «Sin siguiente paso»; ficha con estado (Activo, En pausa, Terminado), notas, fecha límite y todo lo suyo por tipo. Selector **Proyecto** en la hoja de cualquier elemento; **Convertir en proyecto** en las ideas. Al capturar, `>nombre` lo manda a su proyecto (lo crea si no existe; sin acentos ni mayúsculas; si dos empiezan igual no adivina). Lo de un proyecto de Trabajo no pasa por la IA. Terminar un proyecto no toca sus elementos. La copia de seguridad incluye los proyectos.
- **Archivo:** lo terminado o archivado, por meses, filtrable por tipo, con **Reabrir**.
- **⌘K / `/`:** paleta de comandos con acciones (Capturar, Nuevo proyecto, Procesar Bandeja, Revisión semanal, Ir a…), proyectos y la búsqueda de siempre.
- **Revisión semanal** (`/revision`): cinco pasos con una decisión por toque; Hoy la recuerda los lunes si no la has hecho esa semana en ese dispositivo.

## Reorganización de la app

Menos pantallas sueltas y un sitio claro para cada cosa.

- **Cinco pestañas con un trabajo cada una:** Hoy, Agenda, Tareas, **Bandeja** (nueva pestaña) y Listas. Ajustes deja de ocupar una pestaña y pasa al final de Listas (en el ordenador sigue abajo en la barra lateral).
- **Una sola Bandeja** con dos vistas: **Por revisar** (lo que la IA no tuvo claro, antes «Bandeja» en `/sin-clasificar`) y **Últimas 24 h** (antes «Recién añadido» en `/bandeja`). Las dos direcciones siguen funcionando para Siri, la extensión y los marcadores. La Papelera se abre desde aquí. Los textos de «Sin clasificar» pasan a decir «la Bandeja».
- **Hoy | Semana:** la semana es la segunda vista de Hoy (un selector arriba), en lugar del enlace «Ver la semana» al final.
- **Personas | Regalos:** las dos son la misma sección («Personas y regalos»), con un selector para pasar de una a otra.
- **Notas** tiene por fin su pantalla (`/notas`); lo que se captura como nota se abre ahí.
- **Listas agrupadas por lo que haces con ellas:** *Por conseguir* (Compras, Personas y regalos), *Para leer y ver* (Libros, Enlaces) y *Para pensar* (Ideas, Notas), con una línea que explica cada una. La barra lateral usa los mismos grupos.

## Rediseño de interfaz (tras la Fase 4)

- **Botones de verdad** dentro de filas y tarjetas (`.app-btn`: principal, tintado, discreto, destructivo), en lugar del texto azul de la barra superior que se usaba por error. Afecta a «Para hoy», Enlaces, Compras, Bandeja, la tarjeta de captura, subtareas y sugerencias de regalo.
- **Filas con margen derecho** (se cortaban en Ideas, Enlaces, «Para hoy», subtareas y Bandeja).
- **Ideas:** categoría y potencial como etiquetas, siguiente paso en su línea y un estado de color por valor (válido en modo oscuro).
- **Para hoy:** barra roja en lo urgente, tipo del aviso encima del título.
- **Enlaces:** miniatura de 72 px (o un hueco con icono), título a dos líneas.
- **Compras:** «En la tienda · N por comprar» como botón destacado.

## Fase 4: que el cerebro me recuerde las cosas

- **Horario único:** de lunes a viernes, de 9:00 a 16:00 (Madrid, con el cambio de hora resuelto por el reloj de la zona, nunca con horas fijas en UTC). Fuera de ahí no se envía nada, salvo una tarea con hora exacta («llamar el sábado a las 11»), que avisa a su hora. Lo del fin de semana sale el lunes a las 9:00. Opción de saltar festivos (nacionales y de la Comunidad Valenciana).
- **Cron cada 30 minutos** (`pg_cron`, migración `0013`): la ruta `/api/cron/morning` decide en el servidor si toca enviar algo, y es idempotente (la franja se marca antes de enviar; cada aviso queda en `resurfacing_events`; uno que no llegó por ningún canal se olvida para poder reintentarlo).
- **Briefing diario a las 9:00** (también por Telegram): tareas y citas de hoy, fechas próximas con «sin regalo comprado», Bandeja y una cosa rescatada. Un día sin nada es una sola línea. El resumen semanal pasa al primer día laborable de la semana (la opción «Domingo 20:00» desaparece: salía fuera de horario).
- **Tres recordatorios** (11:00, 13:30 y 15:30, configurables): uno por franja, lo urgente primero (tareas atrasadas o de hoy, cumpleaños y fechas a 10 días sin regalo comprado, garantías que caducan en un mes, compras urgentes que llevan semanas en «quiero») y después lo olvidado (ideas sin tocar en 30 días, enlaces sin ver de hace más de 2 meses, libros por leer). Mezcla tipos, no repite el mismo elemento en 7 días y a la tercera vez que se pospone pregunta si se archiva. Lo de Trabajo no sale nunca por Telegram.
- **Telegram:** bot con botones **Hecho**, **Posponer 1 semana**, **Archivar** y **Abrir**; el webhook (`/api/telegram/webhook`) exige el secreto de Telegram y solo obedece a tu chat. Web Push y Telegram conviven y se activan o desactivan en **Ajustes → Avisos**, donde también están las tres horas y los festivos.
- **«Para hoy»** arriba de Hoy, con los mismos botones.
- **Posponer** una tarea con hora mueve también su evento de Google Calendar. `items.updated_at` (solo lo mueve el contenido, no la sincronización) permite saber qué idea lleva 30 días sin tocar.
- **Tests:** la semana entera simulada con el cron real cada 30 minutos (martes: briefing y 3 recordatorios; sábado: nada; lunes 9:00: lo pendiente), y las reglas de ventana, franjas, candidatos y botones por separado.
- **Pendiente de decidir (no bloquea):** las candidaturas llegarán con su tipo en la fase 9.

## Fase 3: secciones que funcionan de verdad

- **Compras:** agrupadas por tienda (secciones plegables con logo, número y total estimado) o por urgencia; cantidad y precio en cada fila; modo «En la tienda» para ir tachando; lo comprado pasa a un historial.
- **Estado por tipo y campos propios** en la hoja de edición y en el formulario manual (compra: cantidad, precio, variante, urgencia; idea: categoría, potencial, siguiente paso; regalo: precio aproximado, ocasión).
- **Tareas y notas:** correos y teléfonos pulsables (`mailto:` y `tel:`).
- **Regalos:** «Próximas ocasiones» (cumpleaños y fechas de los próximos 90 días) con el aviso «Sin regalo comprado» cuando faltan 30 días o menos; cada persona resume sus regalos («2 ideas · 1 comprado»). En su ficha: historial de regalos entregados (año, ocasión, precio) y botón «Sugerir ideas» (una llamada a la IA por pulsación, con gustos, lo que no le gusta y lo ya regalado; las personas de Trabajo no lo tienen ni se envían a la IA).
- **Libros:** portada, autor y páginas se buscan solos al guardar un libro (Open Library, y Google Books para lo que falte), después de responder y sin pisar nada de lo que escribiste; una foto subida manda sobre la portada automática. Valoración de 1 a 5 en la hoja y estrellas en la fila. Solo se envía el título (y el autor si lo hay) a esos servicios.
- **Tareas agrupadas por día:** Atrasadas, Hoy, Mañana, Esta semana, Más adelante y Sin fecha (en hora de Madrid).
- **Tareas que se repiten** (cada día, semana, mes o año; selector «Repetir» en la hoja, y necesitan fecha): al completarlas no se cierran, pasan a su siguiente fecha (contada desde la fecha de la tarea, o desde hoy si va con retraso, y a la misma hora local aunque cambie la hora de verano). El toast dice la próxima fecha y Deshacer devuelve la anterior.
- **Subtareas** en la hoja de una tarea (marcar, añadir con Intro, quitar); la fila dice «1/3 subtareas».
- **Enlaces** (nueva): por ver / vistos, con vista previa, filtros por tipo y dominio. Lo que se captura como enlace llega aquí.
- **Ideas:** sin círculo de completar; cada idea lleva su selector de estado (semilla, explorando, en marcha, descartada) que guarda al momento. Filtros por estado, categoría y tag; las descartadas solo salen al filtrar por ese estado; orden por potencial.

## Fase 2: captura con IA que acierta

- **Clasificador v2:** tipos `enlace` y `nota`; tienda, precio, cantidad, tags, prioridad, categoría, ocasión y tipo de enlace, validados con Zod. Recibe las tiendas, tags y personas (con sus alias) que ya existen para enlazar en vez de duplicar. Una captura puede crear varios items («Aliexpress: masaje, cajón» → 2 compras de la misma tienda).
- **Atajos** `#tag @persona !alta /compra $25 >proyecto`, leídos en código antes de la IA. Un enlace suelto se resuelve por su dominio (vídeo, hilo, libro, tienda conocida o tuya) sin gastar IA; lo desconocido lo decide la IA con el título de la página.
- **Pipeline:** guarda tienda, enlaces (`item_links` con vista previa), tags y campos propios; un regalo para alguien con cumpleaños toma esa ocasión. Un item dudoso va a la Bandeja con la sugerencia de la IA. Aviso de posible duplicado por texto (y fusión). Cada captura queda en `capture_log` (migración `0012`). Si algo falla, la captura se guarda igual.
- **Toast con lo que ha entendido:** líneas («2 compras en Aliexpress», «Regalo para Rosendo · Cumpleaños 14 ene · 30 €»), chips para cambiar tipo, persona o tienda con un toque (cada corrección va al registro), Deshacer y Editar.
- **Bandeja** (antes «Sin clasificar»): sugerencia de la IA con Aceptar / Cambiar tipo / Descartar y modo Procesar con teclado (A, D, S, 1…7, Esc). La barra de captura dice que la IA lo ordena y el «+» de cada sección explica que es el formulario manual.
- **Tests:** 36 frases reales con su salida esperada (`tests/fixtures/phrases.ts`) y `scripts/eval-classify.ts` para medir el prompt contra Gemini real.

## Fase 1: base sólida

- **Modelo:** migración `0011` (tablas `stores`, `item_links`, `tags`; columnas nuevas en `items` y `people`; fuera los CHECK de `type` y `status`). Los items guardan estados por tipo y sus campos propios en `data`, validados por el registro; el repositorio es la única puerta a la tabla (hay un test que lo impone). Las filas antiguas se leen traducidas.
- **Personas y Regalos:** una sola ficha (alias, relación, gustos, tallas, contacto, fechas). Regalos es una vista de Personas.
- **Migración de datos:** `scripts/migrate-v2.ts` con dry-run, plan revisable y aplicación repetible. Guía en `docs/migracion.md`.
- **Copia de seguridad:** la exportación JSON incluye tiendas, enlaces, tags y la ficha completa, y el estado tal como está en la base de datos.

- **PR 1:** registro de tipos (`lib/items/itemTypes.ts`) con estados, campos propios validados con Zod, vista por defecto y estado inicial; incluye `enlace` y `nota`. Sin cambios en la base de datos ni en la UI. `docs/despliegue.md` pasa a diez migraciones y aclara el nombre del proyecto de Vercel. Carpeta `backups/` ignorada por git.
