# Reformulación del segundo cerebro: diseño

Fecha: 2026-11-16 · Estado: aprobado por Marc («dale») sobre la propuesta del chat.

## Por qué

Marc siente la app «un desastre»: demasiadas pantallas sueltas ordenadas por *tipo* de cosa
(compras, enlaces, ideas…), sin un sitio para los planes que mezclan tipos, con Hoy hecho de
bloques apilados y con Personal/Trabajo resuelto distinto en cada pantalla. Quiere una app mucho
más fácil de usar y de organizar, a la altura de lo mejor que hay en «segundos cerebros».

La reorganización del commit `6cceb4a` (Bandeja única, Hoy|Semana, Personas|Regalos, Notas,
Listas agrupadas) fue el primer paso; esto es la reformulación completa.

## De dónde sale (referencias)

- **Things 3 / GTD:** capturar en un sitio, procesar en otro con un ritual corto; Hoy y Archivo (Logbook).
- **PARA (Tiago Forte):** ordenar por *para qué* (Proyectos, Áreas, Recursos, Archivo), no por tipo.
- **Capacities / Tana:** el tipo es una propiedad; personas y proyectos son fichas que reúnen todo lo suyo.
- **Sunsama / Amie:** el día como una sola línea de tiempo, citas y tareas juntas.
- **Raycast / Linear:** ⌘K para ir a cualquier sitio y hacer cualquier cosa.
- **Revisión semanal de GTD.**

## Objetivos

1. Cinco pestañas con un trabajo cada una: **Hoy · Bandeja · Tareas · Proyectos · Biblioteca**. La captura sigue flotando encima; ⌘K en el ordenador.
2. **Hoy** como el día en una sola línea, con la Semana y el Calendario como vistas suyas (la pestaña Agenda desaparece).
3. **Personal | Trabajo | Todo**: un único filtro de área para toda la app.
4. **Proyectos**: planes con fin que juntan tareas, compras, enlaces, ideas y notas.
5. **Biblioteca** (sustituye a Listas) con un **Archivo** de lo terminado.
6. **⌘K** con acciones y una **Revisión semanal** guiada.

## No objetivos

- No se cambia el sistema visual (vidrio, azul glaciar, tokens): se reutiliza tal cual.
- La IA **no** aprende a asignar proyectos en esta reformulación: el proyecto se pone con el atajo `>proyecto`, desde la hoja de edición o desde la ficha del proyecto. (Coste y privacidad: decisión de Marc pendiente de pasar a clave de pago.)
- Nada de Trabajo va a la IA ni a Telegram (se mantiene la regla).
- No se toca PWA, Web Push, Siri, Compartir ni la extensión salvo enlaces y textos.

## Antiobjetivos (sería un fracaso aunque funcione)

- Romper direcciones que usan Siri, la extensión, los avisos o los marcadores (`/sin-clasificar`, `/bandeja`, `/agenda`, `/semana?w=`, `/tareas?area=`, `/listas`…). Las antiguas siguen vivas o redirigen.
- Que la app se caiga antes de que Marc aplique la migración `0014`: sin la tabla de proyectos, Proyectos dice «Falta aplicar la migración 0014» y el resto funciona igual.
- Perder datos o mover elementos sin que Marc lo pida.
- Más pantallas en lugar de menos.

## Restricciones

- Next 16 (leer `node_modules/next/dist/docs/` antes de usar APIs), Supabase, `use cache: private` en `lib/cache/reads.ts`, Server Actions en `app/actions`.
- El repositorio de items es la única puerta a la tabla (hay test). Todo campo nuevo pasa por ahí.
- Migraciones: las escribe el código (`supabase/migrations/0014_*.sql`), las aplica Marc en el SQL Editor.
- Commits directos a `main` tras cada paso verde (tsc + eslint + vitest).
- Hora siempre Europe/Madrid.

## Enfoques considerados

1. **Mantener las secciones por tipo y solo pulir** (lo hecho en `6cceb4a`). Barato, pero no resuelve que los planes queden repartidos ni que Hoy sean bloques. Descartado: Marc pidió reformular a fondo.
2. **PARA completo con Áreas configurables** (Salud, Casa, Finanzas…). Potente, pero añade una capa que hoy no se usa: el campo `area` solo distingue Personal/Trabajo y todo lo demás ya lo cubren tipos y tags. Descartado por ahora.
3. **Elegido: PARA ligero.** Proyectos (nuevo) + Áreas = Personal/Trabajo (filtro global) + Recursos = Biblioteca por tipo + Archivo. Reutiliza casi todo lo que hay y añade una sola tabla.

## El diseño

### Navegación

```
iPhone (pestañas)  Hoy · Bandeja · Tareas · Proyectos · Biblioteca
Ordenador (barra)  Capturar · Buscar (⌘K)
                   Hoy · Bandeja · Tareas · Proyectos
                   Biblioteca: Compras · Personas y regalos · Libros · Enlaces · Ideas · Notas · Archivo
                   Revisión semanal · Ajustes
Arriba en cada lista: selector de área  Personal | Trabajo | Todo
```

- `sectionFor`/`tabFor`: `agenda` y `semana` → pestaña Hoy; `bandeja`/`sin-clasificar` → Bandeja; `proyectos` → Proyectos; `biblioteca`, cada colección, `archivo`, `ajustes`, `revision` → Biblioteca.
- `/listas` redirige a `/biblioteca`.

### Hoy

Vistas: **Día | Semana | Calendario** (`/hoy`, `/semana`, `/agenda`; la Agenda actual pasa a ser la tercera vista, sin cambiar su pantalla salvo el selector arriba).

`/hoy`, de arriba abajo:
1. Fecha y frase de la IA (como ahora).
2. **Ahora**: los avisos de «Para hoy» (sin cambios de lógica).
3. **Tu día**: una sola lista ordenada por hora que mezcla citas de Calendar y tareas con hora (citas con su franja; tareas con su círculo de completar). Las de todo el día van arriba.
4. **Sin hora**: tareas de hoy y atrasadas sin hora (las atrasadas marcadas), con círculo de completar.
5. **Próximas fechas** (cumpleaños y fechas a 14 días, como ahora).
6. Fila «N por revisar en la Bandeja» si hay.

El filtro de área decide qué tareas entran (Todo = las dos, con la etiqueta «Trabajo» en las de trabajo). Completar una tarea desde Hoy usa la misma acción que Tareas (con Deshacer).

### Filtro de área global

- Valor en una cookie `area` (`personal` | `trabajo` | `todo`; por defecto `todo`). El selector la cambia y refresca.
- `?area=` en la URL manda sobre la cookie (compatibilidad con `/tareas?area=trabajo` y los avisos).
- Se aplica en Hoy, Tareas, Bandeja, Proyectos y Biblioteca. Un item sin área cuenta como Personal (regla existente).
- Tareas con «Todo» muestra las dos áreas en secciones por día, con la etiqueta «Trabajo» en las de trabajo.

### Proyectos

Modelo (migración `0014_proyectos.sql`):

```
projects(id uuid pk, user_id, name text not null, area text check in ('personal','trabajo') null,
         status text not null default 'activo' check in ('activo','en_pausa','terminado'),
         notes text, due_date date null, created_at, updated_at)
items.project_id uuid null references projects(id) on delete set null
índices: projects(user_id, status), items(project_id)
RLS igual que las demás tablas de usuario.
```

Pantallas:
- `/proyectos`: tarjetas de proyectos activos (nombre, área, «3 tareas · 2 compras · 1 enlace», siguiente tarea, fecha límite), luego «En pausa» y «Terminados» plegados. Botón «+ Proyecto».
- `/proyectos/[id]`: cabecera con nombre, estado, área, fecha y notas (editables); secciones por tipo con sus filas de siempre (tareas con check, compras, enlaces, ideas, notas); «+» que crea un item ya dentro del proyecto. Aviso «Sin siguiente paso» si no tiene tareas pendientes. Botón «Terminar proyecto».
- Hoja de edición de cualquier item: selector «Proyecto».
- Idea → proyecto: en la hoja de una idea, «Convertir en proyecto» crea el proyecto con el título y las notas de la idea, la enlaza y la pone «en marcha».
- Captura: el atajo `>nombre` (ya se lee en `lib/capture/prep.ts`) busca un proyecto por nombre sin acentos ni mayúsculas (prefijo único vale); si no existe, lo crea activo. La captura en la ficha de un proyecto lo asigna sola.
- Sin migración aplicada: `/proyectos` muestra el aviso; el selector de proyecto no aparece; la captura ignora `>`.

### Biblioteca y Archivo

- `/biblioteca`: los grupos de Listas (Por conseguir, Para leer y ver, Para pensar), con recuentos, más **Archivo**, **Revisión semanal** y **Ajustes**.
- `/archivo`: lo terminado o archivado (tareas hechas, comprado, leído, entregado, visto, descartado, archivado), más reciente primero, agrupado por mes, filtrable por tipo; tocar abre la hoja (desde donde se puede reabrir). Límite de 200.

### ⌘K

- Paleta superpuesta (ordenador y teclado del iPad): `⌘K` y `/` la abren (sustituye el atajo actual que enfoca Buscar).
- Sin texto: acciones (Capturar, Nuevo proyecto, Procesar Bandeja, Revisión semanal, Ir a… cada sección).
- Con texto: acciones que encajan + resultados de la búsqueda existente (`lib/search`) + proyectos por nombre. Flechas, Intro y Esc.
- En iPhone sigue la lupa a `/buscar`.

### Revisión semanal

`/revision`, pasos en una sola pantalla con progreso:
1. **Bandeja a cero**: recuento y botón a Por revisar.
2. **Proyectos**: cada proyecto activo con su siguiente tarea, o «Sin siguiente paso» y un botón para añadir una; botones Pausar / Terminar.
3. **Atrasado**: tareas atrasadas con Hecho / Mañana / Próxima semana.
4. **Rescatar**: ideas sin tocar en 30 días y enlaces sin ver de más de 2 meses (los mismos criterios de los recordatorios), con Mantener / Archivar.
5. **La semana que viene**: enlace a `/semana?w=` de la siguiente.
La fecha de la última revisión se guarda en `localStorage` y Hoy muestra «Toca revisión semanal» los lunes si hace más de 6 días.

### Decisiones de quien construye (tras la revisión del diseño)

Tomadas por Claude, no por Marc; corregibles:

1. **Terminar un proyecto** solo cambia su estado a `terminado`: sus items no se tocan (siguen pendientes, enlazados y visibles en su lista de tipo). No hay flag `archived` en proyectos: el estado manda. Los terminados salen plegados en `/proyectos`, no en `/archivo` (que es de items).
2. **Área de proyecto e items:** cada item conserva su área. Un item creado *dentro* de un proyecto (el «+» de la ficha, la captura en la ficha, el atajo `>`) toma el área del proyecto si este la tiene. En la captura, el proyecto se resuelve **antes** de decidir si va la IA: si el proyecto es de Trabajo, el item es Trabajo y la IA no se llama. El filtro de área se aplica al proyecto (sin área = sale en los dos); dentro de la ficha se ve todo lo suyo.
3. **Alcance del filtro de área:** solo filtra lo que tiene área de verdad: tareas (Hoy y Tareas), la Bandeja y los Proyectos. Las citas de Calendar, Personas y regalos y las colecciones de la Biblioteca lo ignoran (son personales). La frase de la IA de Hoy sigue usando solo lo personal.
4. **Sin duplicados en «Tu día»:** las citas del calendario «Tareas» (las copias que hace `taskSync` de las tareas con hora) se quitan de la línea de tiempo; manda la fila de la tarea, con su círculo. Lo que Marc meta a mano en ese calendario tampoco sale en Hoy (sí en la vista Calendario).

## Fases (un commit por paso verde)

1. Hoy: línea de tiempo + Día|Semana|Calendario; Agenda deja de ser pestaña.
2. Filtro de área global.
3. Proyectos: migración, repositorio, pantallas, selector en la hoja, idea→proyecto, atajo `>`.
4. Biblioteca + Archivo; pestañas finales.
5. ⌘K y Revisión semanal.
6. CHANGELOG, README, docs.

## Lo que decide quien construye

- Componentes y nombres de archivo, siempre reutilizando `ItemsScreen`, `ItemRow`, `InsetList`, `Row`, `ViewSwitch`, `Segmented`.
- Cómo leer citas de hoy para la línea de tiempo (el digest ya las trae).
- Textos de vacío, siempre en el tono actual.
