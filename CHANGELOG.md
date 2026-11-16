# Changelog

Segundo cerebro: se construye por fases (ver la hoja de ruta). Cada fase deja la app desplegable.

## Fase 1: base sólida

- **Modelo:** migración `0011` (tablas `stores`, `item_links`, `tags`; columnas nuevas en `items` y `people`; fuera los CHECK de `type` y `status`). Los items guardan estados por tipo y sus campos propios en `data`, validados por el registro; el repositorio es la única puerta a la tabla (hay un test que lo impone). Las filas antiguas se leen traducidas.
- **Personas y Regalos:** una sola ficha (alias, relación, gustos, tallas, contacto, fechas). Regalos es una vista de Personas.
- **Migración de datos:** `scripts/migrate-v2.ts` con dry-run, plan revisable y aplicación repetible. Guía en `docs/migracion.md`.
- **Copia de seguridad:** la exportación JSON incluye tiendas, enlaces, tags y la ficha completa, y el estado tal como está en la base de datos.

- **PR 1:** registro de tipos (`lib/items/itemTypes.ts`) con estados, campos propios validados con Zod, vista por defecto y estado inicial; incluye `enlace` y `nota`. Sin cambios en la base de datos ni en la UI. `docs/despliegue.md` pasa a diez migraciones y aclara el nombre del proyecto de Vercel. Carpeta `backups/` ignorada por git.
