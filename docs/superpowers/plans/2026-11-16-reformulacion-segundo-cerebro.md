# Reformulación del segundo cerebro: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar la app a cinco pestañas (Hoy · Bandeja · Tareas · Proyectos · Biblioteca) con Hoy en línea de tiempo, filtro de área global, Proyectos, Archivo, ⌘K y Revisión semanal.

**Architecture:** PARA ligero sobre lo que ya existe. Una tabla nueva (`projects`) y una columna (`items.project_id`) detrás del repositorio de siempre; la lógica nueva va en módulos puros de `lib/` con tests, y las pantallas reutilizan `ItemsScreen`, `InsetList`, `Row`, `ViewSwitch` y `Segmented`.

**Tech Stack:** Next 16 (App Router, `use cache: private`, Server Actions), Supabase, Zod, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-16-reformulacion-segundo-cerebro-design.md`

## Global Constraints

- Leer `node_modules/next/dist/docs/` antes de usar una API de Next que no esté ya en el repo (cookies, redirect, etc.).
- Identificadores en inglés; textos de la interfaz en español, en el tono actual.
- Hora siempre Europe/Madrid (`lib/time.ts`).
- Nada de Trabajo va a la IA ni a Telegram.
- El repositorio de items es la única puerta a la tabla `items` (test existente). `projects` va por su propio repo.
- Ninguna dirección antigua se rompe: `/sin-clasificar`, `/bandeja`, `/agenda?d=`, `/semana?w=`, `/tareas?area=`, `/listas`, `/regalos`, `/personas/[id]`.
- Sin la migración `0014` aplicada, toda pantalla funciona; solo Proyectos dice «Falta aplicar la migración 0014 en Supabase».
- Tras cada tarea: `npx tsc --noEmit`, `npx eslint app components lib tests`, `npx vitest run` en verde → commit directo a `main` con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Migración sin aplicar:** crear o editar un item sin `project_id` no debe escribir esa columna (insert y update), o la captura falla en producción hasta que Marc aplique 0014. → test en Tarea 4.
2. **`>proyecto` de Trabajo:** el texto no debe llegar a la IA. → test en Tarea 6.
3. **Tarea con hora + su copia en Calendar:** sale una sola vez en «Tu día». → test en Tarea 1.
4. **Cookie de área con un valor raro o ausente:** se trata como `todo`; `?area=trabajo` manda sobre la cookie. → test en Tarea 3.
5. **Nombre de proyecto ambiguo en `>`** (dos proyectos empiezan igual): no se adivina, se crea uno nuevo con el nombre exacto solo si no hay coincidencia exacta. → test en Tarea 4.

---

## Fase 1 — Hoy

### Task 1: Línea de tiempo del día (puro)

**Files:**
- Create: `lib/hoy/timeline.ts`
- Modify: `lib/digest/build.ts` (añadir `dayTasks` al `Digest`)
- Test: `tests/hoy/timeline.test.ts`, ampliar `tests/digest/*` si algún `toEqual` del digest completo se rompe

**Interfaces:**
- Produces:
  - `Digest.dayTasks: DigestTask[]`: todas las tareas abiertas y clasificadas, de las dos áreas, atrasadas o de hoy, **sin tope** (el tope `MAX_TASKS_PER_AREA` sigue en `tasks` para Telegram y el push).
  - `type TimelineEntry = { kind: 'event'; event: DigestEvent; time: string } | { kind: 'task'; task: DigestTask; time: string }` (`time` = "HH:MM" en Madrid).
  - `buildDayTimeline(input: { events: DigestEvent[]; tasks: DigestTask[]; tz: string; dayEndsAt: Date }): { allDay: DigestEvent[]; timed: TimelineEntry[]; untimed: DigestTask[] }`

- [ ] **Step 1: tests** en `tests/hoy/timeline.test.ts`:
  - `mezcla citas y tareas con hora por orden de hora`: cita 10:00, tarea con hora 09:30, cita 12:00 → `timed.map(e => e.time)` es `['09:30','10:00','12:00']`.
  - `una tarea con hora no sale dos veces`: tarea con `calendarEventId: 'ev1'` y una cita con `id: 'ev1'` → solo la entrada `kind: 'task'`.
  - `las citas de todo el día van aparte`: cita de 24 h → en `allDay`, no en `timed`.
  - `sin hora y atrasadas`: tarea con `hasTime: false` de hoy y otra atrasada con hora → las dos en `untimed`, atrasadas primero (una atrasada con hora no se pinta en la línea de hoy).
- [ ] **Step 2:** `npx vitest run tests/hoy/timeline.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** implementar `buildDayTimeline` y rellenar `dayTasks` en `buildDigest` desde `collectTasks` antes de recortar (las dos áreas juntas, orden `byOrder`).
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: línea de tiempo del día (citas y tareas juntas, sin duplicar las copias de Calendar)`.

### Task 2: Pantalla Hoy y vistas Día | Semana | Calendario

**Files:**
- Modify: `components/hoy/HoyScreen.tsx`, `components/app/ViewSwitch.tsx` (`HOY_VIEWS` pasa a 3: `Día` `/hoy`, `Semana` `/semana`, `Calendario` `/agenda`), `components/agenda/AgendaScreen.tsx` (selector encima de la tira de la semana), `components/items/ScreenFallback.tsx`, `lib/nav.ts` (`agenda` → pestaña `hoy`), `components/app/AppNav.tsx` (quitar Agenda de pestañas y barra; pestañas provisionales `Hoy · Bandeja · Tareas · Listas`), `tests/ui/helpers.test.ts`
- Create: `components/hoy/DayTimeline.tsx` (cliente: filas de la línea de tiempo con círculo de completar)
- Test: `tests/screens/hoy.test.tsx`

**Interfaces:**
- Consumes: `buildDayTimeline`, `Digest.dayTasks` (Tarea 1); `toggleDone` de `app/actions/items.ts`.
- Produces: `DayTimeline({ timeline, today, tz }: { timeline: ReturnType<typeof buildDayTimeline>; today: string; tz: string })`.

Orden de `/hoy` (spec): selector · fecha y frase · «Ahora» (`ParaHoy`) · «Tu día» (todo el día arriba, luego `timed`) · «Sin hora» · «Próximas fechas» · «N por revisar en la Bandeja». Desaparecen los bloques «Tareas · Personal» y «Tareas · Trabajo». Las filas de tareas de Trabajo llevan la etiqueta «Trabajo». Completar: círculo → `toggleDone(id)`, fila tachada y toast con Deshacer (mismo patrón que `ItemsScreen`).

- [ ] **Step 1: tests** en `tests/screens/hoy.test.tsx` (jsdom, mocks de `setup.ts`):
  - `Tu día pinta citas y tareas en orden de hora` (textos en orden en el DOM).
  - `completar una tarea llama a toggleDone y ofrece Deshacer`.
  - `una tarea de Trabajo lleva la etiqueta Trabajo`.
  - En `tests/ui/helpers.test.ts`: `['/agenda', 'agenda', 'hoy']`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: Hoy como línea de tiempo con vistas Día, Semana y Calendario`.

## Fase 2 — Filtro de área global

### Task 3: Personal | Trabajo | Todo para toda la app

**Files:**
- Create: `lib/area.ts` (puro), `lib/area/server.ts` (lee cookie y `?area=`), `app/actions/area.ts` (`setAreaFilter`), `components/app/AreaFilter.tsx` (sustituye a `components/items/AreaSelector.tsx`, que se borra)
- Modify: `app/(app)/tareas/page.tsx`, `app/(app)/sin-clasificar/page.tsx`, `app/(app)/bandeja/page.tsx`, `app/(app)/hoy/page.tsx`, `components/hoy/HoyScreen.tsx`, `lib/actions/items.ts` (`listTareas`, `listSinClasificar` aceptan `AreaFilter`), `lib/cache/reads.ts` (`readTareas`, `readSinClasificar`, `readRecent` reciben `AreaFilter`), `components/items/ItemsScreen.tsx` (prop `showArea?: boolean`: añade «Trabajo» al subtítulo de las filas de trabajo), `components/items/InboxScreen.tsx` (oculta la sección del área filtrada fuera)
- Test: `tests/area.test.ts`, ampliar `tests/actions/items.test.ts`

**Interfaces:**
- Produces:
  - `type AreaFilter = Area | 'todo'`; `AREA_COOKIE = 'area'`
  - `parseAreaFilter(param: string | string[] | undefined, cookie: string | undefined): AreaFilter`. `?area=` manda; si no, la cookie; cualquier otro valor → `'todo'`.
  - `matchesArea(itemArea: Area | null, filter: AreaFilter): boolean`. `null` cuenta como `personal`.
  - `currentAreaFilter(searchParams: { area?: string | string[] }): Promise<AreaFilter>` (servidor, `cookies()` de `next/headers`).
  - `setAreaFilter(filter: AreaFilter): Promise<void>` (Server Action; cookie de un año, `sameSite: 'lax'`, `path: '/'`).
  - `AreaFilter({ value }: { value: AreaFilter })`: `Segmented` Personal | Trabajo | Todo; al cambiar llama a `setAreaFilter`, quita `?area` de la URL y hace `router.refresh()`.

Alcance (spec, decisión 3): Hoy (solo tareas), Tareas, Bandeja (las dos vistas) y Proyectos (Tarea 7). No toca citas, Personas ni Biblioteca. La frase de la IA no cambia.

- [ ] **Step 1: tests** en `tests/area.test.ts`:
  - `parseAreaFilter(undefined, undefined)` → `'todo'`; `(undefined, 'trabajo')` → `'trabajo'`; `('personal', 'trabajo')` → `'personal'`; `(undefined, 'xx')` → `'todo'`; `(['trabajo','personal'], undefined)` → `'trabajo'`.
  - `matchesArea(null, 'personal')` → true; `matchesArea(null, 'trabajo')` → false; `matchesArea('trabajo', 'todo')` → true.
  - En `tests/actions/items.test.ts`: `listTareas(deps, 'todo')` devuelve las de las dos áreas, ordenadas igual que hoy.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar y cambiar las páginas.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: filtro de área global (Personal, Trabajo o Todo) en Hoy, Tareas y Bandeja`.

## Fase 3 — Proyectos

### Task 4: Migración, tipo y repositorio de proyectos

**Files:**
- Create: `supabase/migrations/0014_proyectos.sql`, `lib/db/projects.ts`
- Modify: `lib/db/backend.ts` (`TableName` + `'projects'`), `lib/db/memory.ts` (tabla `projects: []`), `lib/db/types.ts` (`Item.projectId: string | null`), `lib/db/items.ts` (`COLUMNS.projectId = 'project_id'`; `projectId` en `OPTIONAL_FIELDS`), `lib/db/contentColumns.ts` si lista columnas, `lib/export/*` (la copia JSON incluye `projects`), `docs/despliegue.md` (once migraciones)
- Test: `tests/db/projects.test.ts`, `tests/db/migrations.test.ts`, `tests/db/items.test.ts`

**Interfaces:**
- Produces:
  - `PROJECT_STATUSES = ['activo', 'en_pausa', 'terminado'] as const`; `type ProjectStatus`
  - `interface Project { id: string; name: string; area: Area | null; status: ProjectStatus; notes: string | null; dueDate: string | null; createdAt: string; updatedAt: string }`
  - `interface ProjectsRepo { listProjects(): Promise<Project[]>; getProject(id: string): Promise<Project | null>; createProject(input: { name: string; area?: Area | null; notes?: string | null; dueDate?: string | null }): Promise<Project>; updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'area' | 'status' | 'notes' | 'dueDate'>>): Promise<Project>; findByName(name: string): Promise<Project | null>; available(): Promise<boolean> }`
  - `createProjectsRepo(backend: DbBackend): ProjectsRepo`, `createSupabaseProjectsRepo(client, opts?)`

SQL (spec): tabla `projects` con `user_id` y RLS `projects_owner` copiando el patrón de `stores_owner` de `0011`; `status` con CHECK; `updated_at` con el trigger que ya usa `items` en `0013` si existe; `items.project_id uuid references projects(id) on delete set null`; índices `projects(user_id, status)`, `items(project_id)`; índice único `(user_id, lower(btrim(name)))`.

`findByName`: compara con `nameKey` (sin acentos ni mayúsculas); 1) coincidencia exacta; 2) si no, el **único** proyecto no terminado cuyo nombre empieza por el texto; 3) si hay varios o ninguno → `null`. `available()`: `false` solo si `isMissingTable`; `listProjects` usa `emptyIfTableMissing`.

- [ ] **Step 1: tests**
  - `tests/db/projects.test.ts`: crea y lista por estado (activos primero, luego por nombre); `findByName('japon')` encuentra «Japón 2027» por prefijo, pero no «Viaje a Japón» (solo prefijo, no contiene); con «Japón 2027» y «Japón 2028», `findByName('japon')` → `null` y `findByName('japón 2027')` → el exacto; nombre vacío lanza; `updateProject` con `status: 'xx'` lanza.
  - `tests/db/items.test.ts`: `createItem` sin `projectId` no escribe `project_id` en la fila (`backend.tables.items[0]` no tiene la clave); `updateItem(id, { title })` tampoco; con `projectId: 'p1'` sí.
  - `tests/db/migrations.test.ts`: `0014_proyectos.sql` crea `projects_owner` con el mismo patrón `using … with check …` y `on delete set null`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: proyectos en la base de datos (migración 0014) y su repositorio`.

### Task 5: Acciones y lecturas de proyectos

**Files:**
- Create: `lib/actions/projects.ts`, `app/actions/projects.ts`, `lib/projects.ts` (puro: resumen de una ficha)
- Modify: `lib/actions/items.ts` (`ActionDeps.projects?: ProjectsRepo`; `movePatchSchema` acepta `projectId: z.string().uuid().nullable().optional()`), `lib/actions/server.ts` (cablea el repo), `lib/cache/reads.ts` (`readProyectos(filter: AreaFilter)`, `readProyecto(id)`), `lib/items/href.ts` (nada cambia de tipo; un item con proyecto sigue yendo a su lista)
- Test: `tests/actions/projects.test.ts`, `tests/projects.test.ts`

**Interfaces:**
- Consumes: `ProjectsRepo` (Tarea 4), `AreaFilter`, `matchesArea` (Tarea 3).
- Produces:
  - `createProjectAction(fd: FormData)`, `updateProjectAction(id: string, patch)`, `setProjectStatus(id: string, status: ProjectStatus)`, `ideaToProject(ideaId: string): Promise<ActionResult<Project>>`: Server Actions con `runAction` e invalidación `['items']`.
  - `projectSummary(items: Item[]): { counts: Partial<Record<ItemType, number>>; nextTask: Item | null; needsNextStep: boolean }`: solo items abiertos; `nextTask` = la tarea abierta con fecha más cercana, o la más antigua sin fecha; `needsNextStep` = sin tareas abiertas.
  - `readProyectos(filter)`: `{ available: boolean; active: ProjectCard[]; paused: ProjectCard[]; done: ProjectCard[] }` con `ProjectCard = { project: Project; summary: ReturnType<typeof projectSummary> }`; filtra por `matchesArea(project.area ?? null…)`, con la regla de la spec: proyecto sin área sale en los dos.
  - `readProyecto(id)`: `{ project: Project; sections: { type: ItemType; items: Item[] }[]; people: Person[]; photos: PhotoMap; today: string } | null`.

`ideaToProject`: crea el proyecto con título y notas de la idea (área de la idea), pone `projectId` en la idea y su estado `en_marcha`. Terminar un proyecto no toca sus items (decisión 1).

- [ ] **Step 1: tests**
  - `tests/projects.test.ts`: `projectSummary` cuenta por tipo solo lo abierto; `nextTask` la de fecha más cercana; `needsNextStep` true sin tareas abiertas.
  - `tests/actions/projects.test.ts` (backend en memoria): `ideaToProject` crea el proyecto «Huerto urbano», la idea queda con su `projectId` y `status: 'en_marcha'`; `setProjectStatus(id, 'terminado')` deja sus tareas pendientes intactas; `moveItem(id, { projectId: null })` saca un item del proyecto.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: acciones de proyectos (crear, editar, terminar, idea a proyecto)`.

### Task 6: Captura con `>proyecto`

**Files:**
- Modify: `lib/capture/pipeline.ts` (`CaptureDeps.projects?: ProjectsRepo`; resolver `prep.project` antes del paso de IA), `lib/capture/web.ts` (lee `projectId` del formulario), `lib/capture/kinds.ts` (`CaptureDefaults.projectId: string | null`; `/proyectos/[id]` → `{ kind: 'auto', projectId: id }`), `components/CaptureBar.tsx` (envía `projectId` oculto), donde se construyan los deps de captura (`app/actions/capture.ts`, `app/api/capture/*`)
- Test: `tests/capture/projects.test.ts`, ajustar `tests/capture/quick.test.ts` (`captureDefaults` devuelve `projectId: null` en los casos existentes)

**Interfaces:**
- Consumes: `ProjectsRepo.findByName`, `createProject`, `available` (Tarea 4).
- Produces: `CaptureInput.projectId?: string`.

Reglas: `>nombre` → `findByName`; si `null` y `available()`, `createProject({ name })` (activo, sin área); si no está disponible, se ignora. El proyecto se resuelve **antes** de la IA: si `project.area === 'trabajo'`, la captura se trata como Trabajo (sin IA, área `trabajo`). Cada item creado lleva `projectId`; si el item no tiene área y el proyecto sí, toma la del proyecto.

- [ ] **Step 1: tests** en `tests/capture/projects.test.ts`:
  - `>japon comprar adaptador` con «Japón 2027» → el item lleva su `projectId` y el título no incluye `>japon`.
  - `>reforma llamar al fontanero` sin proyectos → crea «reforma» y el item va dentro.
  - proyecto de Trabajo: `>cliente_x revisar contrato` con «cliente x» (área trabajo) → el doble de IA **no** se llama y el item es `area: 'trabajo'`.
  - repo no disponible (`available()` → false) → la captura sale igual, sin `projectId`.
  - `projectId` del formulario (captura en la ficha) gana sobre `>`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: captura con >proyecto (y lo de un proyecto de Trabajo no pasa por la IA)`.

### Task 7: Pantallas de Proyectos y selector en la hoja

**Files:**
- Create: `app/(app)/proyectos/page.tsx`, `app/(app)/proyectos/[id]/page.tsx`, `components/proyectos/ProyectosScreen.tsx`, `components/proyectos/ProyectoScreen.tsx`, `components/proyectos/ProjectSheet.tsx` (crear y editar: nombre, área, fecha, notas)
- Modify: `components/items/ItemSheet.tsx` (prop `projects?: Project[]`: select «Proyecto» con «Ninguno»; oculto si la lista está vacía; en ideas, botón «Convertir en proyecto» que llama a `ideaToProject`), `components/items/ItemsScreen.tsx` (pasa `projects`), `lib/nav.ts` (`proyectos`), `components/app/AppNav.tsx` (pestaña Proyectos con `FolderIcon`), `components/icons.tsx` (`FolderIcon`), `app/globals` o `components/app/app.css` (tarjeta de proyecto, reutilizar `.app-person-card` si basta)
- Test: `tests/screens/proyectos.test.tsx`, ampliar `tests/screens/itemSheet.test.tsx`

**Interfaces:**
- Consumes: `readProyectos`, `readProyecto`, acciones de la Tarea 5, `AreaFilter` (Tarea 3), `captureDefaults` con `projectId` (Tarea 6).

`/proyectos`: `AreaFilter` arriba; tarjetas activas (nombre, área, «3 tareas · 2 compras», siguiente tarea o «Sin siguiente paso» en rojo, fecha límite); «En pausa» y «Terminados» como secciones plegables; «+» abre `ProjectSheet`. Sin migración: solo el texto «Falta aplicar la migración 0014 en Supabase (SQL Editor). El resto de la app funciona igual.».
`/proyectos/[id]`: cabecera con nombre, estado (`Segmented` Activo | En pausa | Terminado), área, fecha y notas; editar abre `ProjectSheet`; un `ItemsScreen` con una sección por tipo, en el orden Tareas, Compras, Enlaces, Ideas, Notas, Libros, Regalos (solo las que tengan algo), `newItem` = tarea con `projectId`; aviso «Sin siguiente paso» si toca. `notFound()` si no existe.

- [ ] **Step 1: tests**
  - `tests/screens/proyectos.test.tsx`: la lista pinta el aviso «Sin siguiente paso» en un proyecto sin tareas; sin migración pinta el texto de 0014; la ficha pinta secciones solo de los tipos con items.
  - `tests/screens/itemSheet.test.tsx`: con `projects`, cambiar «Proyecto» y guardar envía `projectId` en el patch; sin `projects` no hay select; en una idea, «Convertir en proyecto» llama a `ideaToProject`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: pantallas de Proyectos (lista y ficha) y selector de proyecto en la hoja`.

## Fase 4 — Biblioteca y Archivo

### Task 8: Biblioteca, Archivo y pestañas finales

**Files:**
- Create: `app/(app)/biblioteca/page.tsx` (el contenido actual de `listas/page.tsx` + filas Archivo, Revisión semanal y Ajustes), `app/(app)/archivo/page.tsx`, `components/archivo/ArchivoScreen.tsx`, `lib/archivo.ts` (puro)
- Modify: `app/(app)/listas/page.tsx` → `redirect('/biblioteca')`, `lib/nav.ts` (secciones `biblioteca`, `archivo`, `revision`; `tabFor` según la spec), `components/app/AppNav.tsx` (pestañas finales `Hoy · Bandeja · Tareas · Proyectos · Biblioteca`; barra lateral de la spec), `lib/actions/items.ts` (`listArchivo(deps): Promise<Item[]>`), `lib/cache/reads.ts` (`readArchivo()`), `tests/ui/helpers.test.ts`
- Test: `tests/archivo.test.ts`

**Interfaces:**
- Produces:
  - `listArchivo(deps)`: items no borrados y no abiertos (`!isOpen`), ordenados por `completedAt ?? updatedAt` descendente, máximo 200.
  - `groupArchivo(items: Item[]): { key: string; header: string; items: Item[] }[]` por mes en Madrid («Noviembre de 2026»).
  - `ArchivoScreen`: filtro por tipo (`Segmented`-chips: Todo, Tareas, Compras, Libros, Enlaces, Ideas, Regalos) y `ItemsScreen` con `groupArchivo`; tocar abre la hoja (la hoja ya deja reabrir con el estado).

- [ ] **Step 1: tests**
  - `tests/archivo.test.ts`: `groupArchivo` agrupa por mes de `completedAt` en Madrid (un item completado el 2026-10-31T23:30Z cae en «Noviembre de 2026»); orden descendente.
  - `tests/ui/helpers.test.ts`: `/biblioteca`, `/archivo`, `/compras`, `/ajustes`, `/revision` → pestaña `biblioteca`; `/proyectos/abc` → `proyectos`; `/sin-clasificar` y `/bandeja` → `bandeja`; `/semana` y `/agenda` → `hoy`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: Biblioteca y Archivo; pestañas Hoy, Bandeja, Tareas, Proyectos y Biblioteca`.

## Fase 5 — ⌘K y Revisión semanal

### Task 9: Paleta ⌘K

**Files:**
- Create: `lib/palette.ts` (puro), `components/app/CommandPalette.tsx`, `app/actions/palette.ts`
- Modify: `components/app/SearchShortcut.tsx` (se sustituye por `CommandPalette` en el layout: `app/(app)/layout.tsx`)
- Test: `tests/palette.test.ts`, `tests/screens/palette.test.tsx`

**Interfaces:**
- Produces:
  - `type PaletteAction = { id: string; label: string; keywords: string[]; href?: string; run?: 'capture' | 'newProject' }`
  - `PALETTE_ACTIONS: PaletteAction[]`: Capturar, Nuevo proyecto, Procesar Bandeja (`/sin-clasificar`), Revisión semanal (`/revision`), e «Ir a …» por cada sección (Hoy, Semana, Calendario, Bandeja, Tareas, Proyectos, Biblioteca, Compras, Personas, Regalos, Libros, Enlaces, Ideas, Notas, Archivo, Ajustes).
  - `matchActions(query: string, actions?: PaletteAction[]): PaletteAction[]`: sin texto, todas; con texto, las que contienen la consulta en `label` o `keywords` sin acentos (`nameKey`), las que empiezan por ella primero.
  - `paletteSearch(query: string): Promise<ActionResult<{ results: SearchResults; projects: Project[] }>>`: reutiliza `runSearch`; proyectos por `nameKey` incluido.

Comportamiento: `⌘K`/`Ctrl+K` en cualquier sitio, y `/` fuera de un campo, abren la paleta (diálogo modal con `role="dialog"`, foco en el campo). Flechas mueven, Intro ejecuta, Esc cierra. Con texto: acciones primero, luego proyectos, luego resultados agrupados (máx. 8 por grupo), con búsqueda retrasada 150 ms. En iPhone no cambia nada (la lupa sigue yendo a `/buscar`).

- [ ] **Step 1: tests**
  - `tests/palette.test.ts`: `matchActions('')` devuelve todas; `matchActions('revis')` empieza por «Revisión semanal»; `matchActions('bandeja')` incluye «Procesar Bandeja» e «Ir a Bandeja»; `matchActions('calendario')` incluye «Ir a Calendario».
  - `tests/screens/palette.test.tsx`: ⌘K abre el diálogo; escribir «revis» + Intro navega a `/revision`; Esc cierra; `/` dentro de un input no la abre.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: paleta ⌘K con acciones, proyectos y búsqueda`.

### Task 10: Revisión semanal

**Files:**
- Create: `lib/revision.ts` (puro), `app/(app)/revision/page.tsx`, `components/revision/RevisionScreen.tsx`
- Modify: `lib/cache/reads.ts` (`readRevision()`), `components/hoy/HoyScreen.tsx` (aviso «Toca revisión semanal», cliente, `localStorage`)
- Test: `tests/revision.test.ts`, `tests/screens/revision.test.tsx`

**Interfaces:**
- Consumes: `projectSummary` (Tarea 5), los criterios de «olvidado» de `lib/resurfacing/candidates.ts` (ideas sin tocar 30 días, enlaces sin ver > 2 meses): exportarlos como constantes si no lo están y reutilizarlos.
- Produces:
  - `buildReview(input: { items: Item[]; projects: Project[]; now: Date; tz: string }): { inbox: number; projects: { project: Project; nextTask: Item | null }[]; overdue: Item[]; rescue: Item[]; nextWeekStart: string }`. Proyectos solo activos; `overdue` = tareas abiertas con fecha anterior a hoy (Madrid), Personal y Trabajo; `rescue` = ideas y enlaces olvidados, máximo 10, los más antiguos primero.
  - `REVIEW_KEY = 'revision-semanal'` (localStorage, ISO de la última); `reviewDue(last: string | null, now: Date, tz: string): boolean` → true los lunes (Madrid) si no hay o hace más de 6 días.

Pantalla: cinco secciones numeradas con su estado («Hecho» cuando la sección queda vacía): 1 Bandeja (botón a Por revisar), 2 Proyectos (siguiente tarea o «Añadir siguiente paso» que abre la hoja con `projectId`; Pausar / Terminar), 3 Atrasado (Hecho / Mañana / Próxima semana usando `moveItem` con `dueAt`), 4 Rescatar (Mantener = tocar `updatedAt` con la acción existente de posponer, Archivar), 5 La semana que viene (enlace a `/semana?w=`). Botón final «Terminar revisión» guarda `REVIEW_KEY`.

- [ ] **Step 1: tests**
  - `tests/revision.test.ts`: `buildReview` deja fuera proyectos en pausa; `overdue` no incluye las de hoy; `rescue` como máximo 10; `reviewDue(null, lunes)` true, `reviewDue(hace 3 días, lunes)` false, `reviewDue(null, martes)` false.
  - `tests/screens/revision.test.tsx`: «Terminar revisión» escribe `REVIEW_KEY` en `localStorage`; «Hecho» en una atrasada llama a `toggleDone`.
- [ ] **Step 2:** ejecutar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat: revisión semanal guiada`.

## Fase 6 — Documentación

### Task 11: CHANGELOG, README y guías

**Files:** `CHANGELOG.md` (sección «Reformulación: segundo cerebro»), `README.md` («Qué hace»), `docs/despliegue.md` (paso para aplicar `0014`), `docs/siri.md` y `docs/extension.md` si nombran pantallas que cambian.

- [ ] **Step 1:** `grep -rn "Listas\|Agenda\|Recién añadido" docs README.md` y corregir lo que haya cambiado.
- [ ] **Step 2:** `npx vitest run` → PASS.
- [ ] **Step 3:** commit `docs: reformulación del segundo cerebro (CHANGELOG, README, despliegue con 0014)`.
