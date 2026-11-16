# Migración a la fase 1 (segundo cerebro)

Pasa tus datos actuales al modelo nuevo sin perder nada. Se hace en este orden y **no hay que saltarse ningún paso**.

## Qué hace

- Traduce los estados antiguos: `pendiente` → el estado inicial de cada tipo (compra: *quiero*, idea: *semilla*…), `hecho` → su estado de completar (tarea: *hecha*, compra: *comprado*, regalo: *entregado*, libro: *leído*, idea: *en marcha*), `archivado` → la marca `archived`, y el estado de lectura de los libros pasa a ser su estado.
- Separa las compras: «Aliexpress» con *masaje de cabeza, cajón organizador…* en la nota se convierte en una compra por producto, con la tienda Aliexpress. «Casio» con su enlace pasa a ser una compra con tienda, enlace y modelo. **La compra original se archiva, no se borra**, y cada compra nueva guarda el texto original.
- Saca las ideas de regalo de las notas de cada persona y las crea como regalos enlazados (Rosendo: «Caja reloj» → un regalo de Rosendo). Las notas no se tocan salvo con `--clean-notes`.
- Manda a la Bandeja lo dudoso (por ejemplo «Trabajar» en Ideas).
- Fusiona personas duplicadas («mamá» y «Mama»): se queda la que más ideas tiene, con las fechas y notas de las dos, y el otro nombre como alias.
- Mantiene las fechas de creación de todo.
- Pasa el enlace de cada item (con su vista previa) a `item_links` y el autor de cada libro a sus campos propios.

**Lo de Trabajo nunca se envía a la IA.**

## Pasos

1. **Copia de seguridad.** En la app, **Ajustes → Tus datos → JSON**, y guarda el archivo en `backups/` (carpeta ignorada por git).
2. **Aplica la migración `0011_segundo_cerebro.sql`** en el SQL Editor de Supabase (solo añade tablas y columnas, no toca datos). Después **despliega** el código de la fase 1: el orden importa, porque el código nuevo guarda estados que los CHECK antiguos rechazarían.
3. **Dry-run** (no toca la base de datos; necesita `GEMINI_API_KEY` en `.env.local`):

   ```bash
   npx tsx scripts/migrate-v2.ts --input backups/agente-personal-AAAA-MM-DD.json
   ```

   Escribe `backups/migration-plan.json` y enseña qué cambiaría. Se puede repetir sin gastar llamadas (las respuestas de la IA se guardan en `backups/migration-ai-cache.json`).
4. **Ideas que estaban en «hecho».** El dry-run las lista. Por defecto pasan a *en marcha*. Para decidir una a una, crea `backups/migration-decisions.json`:

   ```json
   { "<id de la idea>": "descartada", "<otro id>": "explorando" }
   ```

   Estados de idea: `semilla`, `explorando`, `en_marcha`, `descartada`. Repite el dry-run.
5. **Aplicar**, cuando el plan te parezca bien:

   ```bash
   npx tsx scripts/migrate-v2.ts --apply --yes
   ```

   Se niega a seguir si en `backups/` no hay una exportación de menos de 24 horas. Se puede repetir sin duplicar nada. Lo que no se pueda aplicar se lista al final, y el resto sí se aplica.

## Cómo deshacerlo

- Las compras separadas: desarchiva la original y borra las nuevas (sus ids salen en `migration-plan.json`).
- Todo lo demás: la exportación JSON de `backups/` tiene los datos de antes.
- Las columnas antiguas (`link`, `link_title`, `author`, `reading_state`…) siguen ahí. Se quitarán en una migración aparte, con tu OK, cuando todo esté migrado.

`npx tsx` descarga `tsx` la primera vez (no está en las dependencias del proyecto, igual que con `scripts/probe-classify.ts`).
