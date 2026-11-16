# Changelog

Segundo cerebro: se construye por fases (ver la hoja de ruta). Cada fase deja la app desplegable.

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
