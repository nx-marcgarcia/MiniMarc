# Changelog

Segundo cerebro: se construye por fases (ver la hoja de ruta). Cada fase deja la app desplegable.

## Fase 3: secciones que funcionan de verdad (en curso)

- **Compras:** agrupadas por tienda (secciones plegables con logo, número y total estimado) o por urgencia; cantidad y precio en cada fila; modo «En la tienda» para ir tachando; lo comprado pasa a un historial.
- **Estado por tipo y campos propios** en la hoja de edición y en el formulario manual (compra: cantidad, precio, variante, urgencia; idea: categoría, potencial, siguiente paso; regalo: precio aproximado, ocasión).
- **Tareas y notas:** correos y teléfonos pulsables (`mailto:` y `tel:`).
- **Regalos:** «Próximas ocasiones» (cumpleaños y fechas de los próximos 90 días) con el aviso «Sin regalo comprado» cuando faltan 30 días o menos; cada persona resume sus regalos («2 ideas · 1 comprado»). En su ficha: historial de regalos entregados (año, ocasión, precio) y botón «Sugerir ideas» (una llamada a la IA por pulsación, con gustos, lo que no le gusta y lo ya regalado; las personas de Trabajo no lo tienen ni se envían a la IA).
- **Libros:** portada, autor y páginas se buscan solos al guardar un libro (Open Library, y Google Books para lo que falte), después de responder y sin pisar nada de lo que escribiste; una foto subida manda sobre la portada automática. Valoración de 1 a 5 en la hoja y estrellas en la fila. Solo se envía el título (y el autor si lo hay) a esos servicios.
- **Tareas agrupadas por día:** Atrasadas, Hoy, Mañana, Esta semana, Más adelante y Sin fecha (en hora de Madrid).
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
