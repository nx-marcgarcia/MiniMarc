# Segundo cerebro v2: hoja de ruta (pendiente)

Fecha: 2026-11-16 · **Estado: pendiente, sin diseño aprobado.** Ideas para la siguiente iteración, después de la reformulación (`2026-11-16-reformulacion-segundo-cerebro-design.md`). Antes de implementar cualquier bloque hay que pasarlo por diseño: preguntas, enfoque, documento aprobado y plan.

Las ideas son de Marc, contrastadas con la documentación de Todoist, Capacities y Readwise. El texto original está más abajo, sin cambios.

## Notas al guardarlo

Escritas por Claude el mismo día, cruzando la propuesta con lo que ya se hizo en la reformulación. Hay que comprobarlas al empezar.

- **Ya cubierto en parte:**
  - Proyectos, con su siguiente paso y «Convertir en proyecto».
  - La revisión semanal.
  - Los avisos de Hoy: se rehízo como una sola línea de tiempo.
  - ⌘K.
  - El filtro Personal/Trabajo único.
  - El Archivo.
- **Por verificar antes de nada (sección 1):** las capturas que motivaron la propuesta son de antes de la reformulación.
  - Los «dos elementos resaltados» de la navegación pueden haber cambiado con las pestañas nuevas.
  - «Día tranquilo» sigue siendo el texto de un día sin citas ni tareas con fecha.
- **Restricciones que siguen vigentes:**
  - Nada de Trabajo va a la IA ni a Telegram.
  - Los avisos solo salen de lunes a viernes, de 9 a 16, hora de Madrid.
  - Antes de una fase que necesite más IA, hay que dar a Marc una estimación de llamadas al día y de coste mensual (clave de pago de Gemini).
  - Las migraciones las aplica Marc desde el SQL Editor.
- **Candidaturas** ya estaba prevista como tipo propio en la fase 9 del plan original.

---

**Ahora no añadiría diez secciones más. Haría que lo que ya tienes sea fiable, esté conectado y te ayude a decidir qué hacer.** La app ya cubre buena parte del plan inicial.

He contrastado las propuestas con documentación de Todoist, Capacities y Readwise. Tomo tu inventario como funciones declaradas, no verificadas: las capturas muestran algunas diferencias importantes.

## 1. Primero, arreglar lo que todavía no encaja

En las capturas veo cuatro cosas que revisaría antes de ampliar la app:

- **Compras por tienda, pero todo aparece en "Sin tienda".** Casio, Amazon y Aliexpress deberían poder asignarse desde esa misma pantalla. Puede que funcione para capturas nuevas y falte migrar las antiguas.
- **Aliexpress sigue siendo una única nota con varios productos.** Añadiría "Separar en productos", con vista previa antes de confirmar.
- **"Trabajar" sigue en Ideas**, aunque la Bandeja dice que ese texto iría a revisión. Revisaría la diferencia entre clasificar capturas nuevas y corregir datos antiguos.
- **Hay pantallas con dos elementos de navegación resaltados**, como Hoy y Tareas. El enlace activo debe ser uno solo.

**Por qué primero:** son detalles que afectan a la confianza. Si pone "todo clasificado" pero los datos siguen mal colocados, cuesta fiarse del cerebro.

---

## 2. Mejoras que añadiría, de más a menos importantes

### 1. Separar "cuándo quiero hacerlo" de "cuándo debe estar acabado"

Ahora posponer parece mover la fecha de la tarea. Yo distinguiría:

- **Planificado para:** miércoles.
- **Fecha límite:** viernes.
- **Duración estimada:** 45 minutos.

Si no lo haces el miércoles, lo mueves al jueves sin perder el viernes como límite.

Todoist distingue la fecha de trabajo de la fecha límite y permite estimar duración. Copiaría esa separación, no necesariamente toda su interfaz.  [todoist](https://www.todoist.com/help/todoist/features/introduction-to-deadlines-in-todoist-uMqbSLM6U) [todoist](https://www.todoist.com/help/articles/set-a-task-duration-L1kYkZv8d)

**Por qué:** evita que al posponer estés ocultando un compromiso real.

### 2. "Hoy" debería ayudarte a elegir, incluso en días vacíos

En tu captura pone "Día tranquilo", pero tienes tareas sin fecha. **Sin citas no significa sin cosas pendientes.**

Añadiría:

- **Mi prioridad de hoy:** una tarea elegida por ti.
- **Si tienes 15 minutos:** una acción pequeña.
- **Algo que llevas aplazando:** un pendiente rescatado.
- Botón **"Planificar mi día"**, que propone tareas según tus huecos y tú confirmas.

Ejemplo:

> No tienes citas. Puedes dedicar 20 minutos al CV o enviar el correo a la tienda Funko.

**Por qué:** convierte Hoy en una pantalla útil para actuar, no solo en un calendario.

### 3. Resurfacing con contexto, no solo por antigüedad

Ya tienes recordatorios. Mejoraría **qué eligen y cómo lo explican**:

- "Te recuerdo esto porque vence el viernes."
- "Guardaste este artículo y ahora tienes un proyecto relacionado."
- "La idea del blog lleva un mes parada. ¿Quieres definir un primer paso?"

Añadiría respuestas más precisas:

- **Me interesa, pero más adelante.**
- **Ya no me interesa.**
- **Estoy esperando a alguien.**
- **No me recuerdes este elemento.**

Un detalle importante: **abrir un elemento no debería reiniciar automáticamente su antigüedad**. Verlo no significa haber avanzado.

Readwise usa repetición espaciada y permite ajustar la frecuencia de revisión. Para tu app copiaría el control de frecuencia y la respuesta del usuario, sin convertir cada tarea en una ficha de estudio.  [docs.readwise](https://docs.readwise.io/readwise) [docs.readwise](https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights#how-does-the-readwise-spaced-repetition-algorithm-work-mastery)

**Por qué:** recibir tres avisos diarios solo aporta si cada vez resultan relevantes. Mantendría tu horario de lunes a viernes de 9 a 16.

### 4. Relaciones entre elementos, sin añadir un grafo

Los proyectos ya agrupan cosas. Falta poder relacionarlas también fuera de un proyecto:

- Un libro **me lo recomendó una persona**.
- Un enlace **inspiró una idea**.
- Una compra **es una opción para un regalo**.
- Una nota **explica una decisión de un proyecto**.

En el detalle aparecería un bloque **"Relacionado"** y otro **"Dónde se menciona"**.

Capacities diferencia las relaciones confirmadas de las menciones de texto que todavía no están enlazadas. Ese patrón encaja bien aquí.  [docs.capacities](https://docs.capacities.io/reference/backlinks)

**Por qué:** recuerdas las cosas por asociaciones. "El libro que me recomendó Ainhoa" es una forma natural de buscar.

### 5. Búsqueda por contenido y un chat con fuentes

Tu inventario dice "Búsqueda de todo", pero no confirma búsqueda semántica o dentro de los documentos. Revisaría eso antes de darlo por hecho.

La ampliaría para encontrar:

- Texto de notas y subtareas.
- Texto extraído de fotos y documentos.
- Fragmentos guardados de artículos.
- Sinónimos y descripciones aproximadas.

Después añadiría **"Pregúntale a mi cerebro"**:

> ¿Qué tengo pendiente relacionado con buscar trabajo?

La respuesta debe enlazar los elementos usados y decir cuando no encuentra información. **Los datos de Trabajo siguen fuera de la IA**, salvo que cambies expresamente esa política.

**Por qué:** buscar "CV" es fácil. Recuperar lo que recuerdas a medias es donde un segundo cerebro aporta más.

### 6. Guardar lo aprendido, no solo el enlace

En Libros y Enlaces añadiría:

- Fragmentos destacados.
- Notas tuyas sobre cada fragmento.
- "Qué quiero recordar".
- "Dónde podría aplicar esto".
- Resumen opcional, identificado como generado por IA.

Readwise Reader permite leer, subrayar, anotar y buscar el contenido guardado, y conecta los destacados con su revisión diaria.  [readwise](https://readwise.io/read)

Para empezar **no construiría un lector completo**. Bastaría con guardar un fragmento seleccionado desde la extensión y enlazarlo con su fuente.

**Por qué:** un enlace dice dónde estaba algo. Un fragmento con tu comentario conserva por qué te importó.

### 7. Estado "En espera"

Añadiría a las tareas:

- **En espera de:** persona o respuesta.
- **Desde cuándo.**
- **Volver a revisar:** fecha.
- Último contacto.

Ejemplo:

> Contactar tienda Funko → correo enviado → esperando respuesta → revisar el jueves.

**Por qué:** una tarea enviada no está hecha del todo, pero tampoco es una tarea que puedas ejecutar ahora. El resurfacing debería proponerte seguimiento, no insistir en que mandes el mismo correo.

### 8. Colecciones inteligentes y favoritos

Sin añadir más secciones fijas, permitiría guardar vistas como:

- "Compras para casa".
- "Ideas de apps".
- "Lecturas de menos de 10 minutos".
- "Pendientes de respuesta".
- "Todo lo relacionado con mi CV".

Capacities permite guardar consultas con filtros, orden y agrupación, y reutilizarlas en otras páginas.  [docs.capacities](https://docs.capacities.io/reference/queries)

**Por qué:** cada usuario tiene sus propias formas de encontrar cosas. No hace falta convertir todas en nuevas entradas del menú.

### 9. Una ficha de detalle más cómoda

Mantendría tu estética, pero abriría cada elemento en un **panel de detalle**:

- Título completo y descripción.
- Campos propios del tipo.
- Links, fotos y adjuntos.
- Relaciones.
- Historial de cambios.
- Acciones principales.

En Ideas, las filas podrían mostrar categoría, siguiente paso y fecha de última actividad. Ahora todas se parecen demasiado y el título largo se corta.

**Por qué:** la lista sirve para localizar; el detalle sirve para pensar y editar. No conviene meterlo todo en la fila.

### 10. Historial y restauración real

Ya exportas, pero añadiría:

- Historial de cambios de los elementos.
- Deshacer una clasificación incorrecta.
- Copia que incluya fotos y adjuntos.
- Importación con vista previa.
- Una prueba de restauración.

**Por qué:** exportar un JSON no demuestra que puedas recuperar tu cerebro si algo se rompe.

---

## 3. Tipos nuevos que sí te podrían aportar

Los añadiría solo si los necesitas, aprovechando los proyectos existentes.

| Tipo | Qué guardaría | Para qué |
|---|---|---|
| **Decisiones** | Qué decidiste, alternativas, motivo y fecha de revisión | Recordar por qué elegiste algo y no repetir debates |
| **Candidaturas** | Empresa, puesto, CV enviado, estado y seguimiento | Encaja con tus tareas del CV y búsqueda de empleo |
| **Documentos y vencimientos** | Facturas, garantías, renovaciones y fechas | Tener lo importante localizable y recibir avisos |
| **Lugares** | Restaurante, ciudad, link de Maps y quién lo recomendó | Guardar planes sin convertirlos en tareas |

Los viajes los montaría primero como proyectos. No crearía un módulo nuevo hasta que el proyecto se quede corto.

## 4. Cambios visuales concretos

- Cambiar **"Agente" por "Mi cerebro"** o el nombre que quieras darle.
- Un único elemento activo en la navegación.
- **Botón "Añadir" con texto**, en lugar de un "+" aislado.
- Filtro Personal/Trabajo consistente, con aviso claro de si la captura pasará por IA.
- Aprovechar mejor el ancho en escritorio, conservando una vista compacta opcional.
- Ocultar bloques vacíos redundantes. En Hoy se pueden resumir en una sola frase.
- Mostrar unos pocos favoritos arriba, en vez de seguir alargando la barra lateral.

## Mi orden para la siguiente iteración

1. **Auditar los flujos reales y corregir los datos antiguos.**
2. **Separar planificación y fecha límite, y añadir "En espera".**
3. **Hacer Hoy y el resurfacing más útiles.**
4. **Mejorar el detalle y conectar elementos.**
5. **Ampliar búsqueda, fragmentos y chat con fuentes.**
6. **Colecciones inteligentes y tipos nuevos que realmente uses.**

**La prueba que usaría es sencilla:** si preguntas "¿qué estaba pensando hacer con esto, por qué lo guardé y qué toca ahora?", tu app debería poder responder. Ese es el salto que le falta para sentirse de verdad como tu cerebro.
