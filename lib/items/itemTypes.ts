/**
 * Registro de tipos de item: la única fuente de verdad de qué tipos existen, qué estados tienen,
 * qué campos propios guardan (`items.data`, validados con Zod) y cómo se pintan por defecto.
 *
 * Añadir un tipo = añadir una entrada a ITEM_TYPES. Todo lo demás (ids, validación, estado
 * inicial, comprobaciones de estado) se deriva de aquí. Sin imports de servidor: lo usan la UI,
 * los repositorios, el clasificador y la migración.
 *
 * Qué NO va en `fields`: lo que se filtra, ordena o enlaza vive en columnas o tablas hijas
 * (persona, tienda, enlaces, fechas de aviso, tags). Aquí solo los datos propios del tipo.
 * Los identificadores van en inglés, como el resto del código; los valores, en español.
 */
import { z } from 'zod';
import { REPEATS } from '@/lib/recurrence';
import { isValidDate } from '@/lib/time';

const date = z.string().refine(isValidDate, 'Fecha no válida');
const text = z.string().trim().min(1);
const money = z.number().nonnegative();
const rating = z.number().int().min(1).max(5);

export type ItemState = { id: string; label: string };

export interface ItemTypeDef {
  label: string;
  plural: string;
  /** Clave de icono; la UI la traduce a un componente (components/icons.tsx). */
  icon: string;
  /** Campos propios del tipo: lo que se guarda en `items.data`. Estricto: una clave desconocida es un error. */
  fields: z.ZodType<Record<string, unknown>>;
  states: readonly ItemState[];
  /** Estado de un item nuevo. Nunca uno de `doneStates`. */
  initialState: string;
  /** Estados que cierran el item (hecho, comprado, descartado…). */
  doneStates: readonly string[];
  /** Si la fila lleva el círculo de completar (tareas y compras), o solo estado (ideas, libros…). */
  hasCheck: boolean;
  defaultView: 'list' | 'cards' | 'grouped';
}

const states = (...pairs: [string, string][]): ItemState[] => pairs.map(([id, label]) => ({ id, label }));

export const ITEM_TYPES = {
  tarea: {
    label: 'Tarea',
    plural: 'Tareas',
    icon: 'check-circle',
    fields: z.strictObject({
      subtasks: z.array(z.strictObject({ title: text, done: z.boolean() })).optional(),
      recurrence: z.enum(REPEATS).optional(),
      context: z.enum(['casa', 'ordenador', 'recados']).optional(),
      /** Minutos. */
      estimateMin: z.number().int().positive().optional(),
    }),
    states: states(['pendiente', 'Pendiente'], ['hecha', 'Hecha']),
    initialState: 'pendiente',
    doneStates: ['hecha'],
    hasCheck: true,
    defaultView: 'list',
  },
  idea: {
    label: 'Idea',
    plural: 'Ideas',
    icon: 'lightbulb',
    fields: z.strictObject({
      /** Libre: las categorías (negocio, app, contenido, viaje…) serán configurables en Ajustes. */
      category: text.optional(),
      potential: rating.optional(),
      nextStep: text.optional(),
    }),
    states: states(['semilla', 'Semilla'], ['explorando', 'Explorando'], ['en_marcha', 'En marcha'], ['descartada', 'Descartada']),
    initialState: 'semilla',
    doneStates: ['descartada'],
    hasCheck: false,
    defaultView: 'cards',
  },
  compra: {
    label: 'Compra',
    plural: 'Compras',
    icon: 'cart',
    fields: z.strictObject({
      quantity: z.number().int().positive().default(1),
      price: money.optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('EUR'),
      /** Talla, color, modelo… */
      variant: text.optional(),
      urgency: z.enum(['baja', 'media', 'alta']).optional(),
      purchasedAt: date.optional(),
      finalPrice: money.optional(),
      /** Ruta de la factura en el bucket de Storage. */
      invoicePath: text.optional(),
      warrantyEndsAt: date.optional(),
    }),
    states: states(['quiero', 'Quiero'], ['en_carrito', 'En el carrito'], ['comprado', 'Comprado'], ['descartado', 'Descartado']),
    initialState: 'quiero',
    doneStates: ['comprado', 'descartado'],
    hasCheck: true,
    defaultView: 'grouped',
  },
  regalo: {
    label: 'Regalo',
    plural: 'Regalos',
    icon: 'gift',
    fields: z.strictObject({
      occasion: text.optional(),
      approxPrice: money.optional(),
      /** Año en que se regaló, para no repetir. */
      givenYear: z.number().int().min(1900).max(2200).optional(),
    }),
    states: states(['idea', 'Idea'], ['comprado', 'Comprado'], ['envuelto', 'Envuelto'], ['entregado', 'Entregado']),
    initialState: 'idea',
    doneStates: ['entregado'],
    hasCheck: false,
    defaultView: 'grouped',
  },
  libro: {
    label: 'Libro',
    plural: 'Libros',
    icon: 'book',
    fields: z.strictObject({
      author: text.optional(),
      pages: z.number().int().positive().optional(),
      rating: rating.optional(),
      /** Notas y citas de lectura, en markdown. */
      readingNotes: z.string().optional(),
      recommendedBy: text.optional(),
    }),
    states: states(['por_leer', 'Por leer'], ['leyendo', 'Leyendo'], ['leido', 'Leídos'], ['abandonado', 'Abandonados']),
    initialState: 'por_leer',
    doneStates: ['leido', 'abandonado'],
    hasCheck: false,
    defaultView: 'cards',
  },
  enlace: {
    label: 'Enlace',
    plural: 'Enlaces',
    icon: 'link',
    fields: z.strictObject({
      kind: z.enum(['articulo', 'video', 'short', 'hilo', 'herramienta']).optional(),
      /** Resumen de la IA. */
      summary: z.string().optional(),
    }),
    states: states(['por_ver', 'Por ver'], ['visto', 'Visto']),
    initialState: 'por_ver',
    doneStates: ['visto'],
    hasCheck: false,
    defaultView: 'cards',
  },
  nota: {
    label: 'Nota',
    plural: 'Notas',
    icon: 'note',
    fields: z.strictObject({}),
    // Sin estados en la spec; `status` nunca es nulo, así que una nota siempre está "activa".
    states: states(['activa', 'Activa']),
    initialState: 'activa',
    doneStates: [],
    hasCheck: false,
    defaultView: 'list',
  },
} as const satisfies Record<string, ItemTypeDef>;

export type ItemTypeId = keyof typeof ITEM_TYPES;
export const ITEM_TYPE_IDS = Object.keys(ITEM_TYPES) as ItemTypeId[];

/** Los campos propios de un tipo, tal como los devuelve su esquema (con los valores por defecto aplicados). */
export type ItemData<T extends ItemTypeId> = z.output<(typeof ITEM_TYPES)[T]['fields']>;

export function isItemType(v: unknown): v is ItemTypeId {
  return typeof v === 'string' && Object.hasOwn(ITEM_TYPES, v);
}

export function defaultStatus(type: ItemTypeId): string {
  return ITEM_TYPES[type].initialState;
}

export function isValidStatus(type: ItemTypeId, status: string): boolean {
  return ITEM_TYPES[type].states.some((s) => s.id === status);
}

export function isDoneStatus(type: ItemTypeId, status: string): boolean {
  return (ITEM_TYPES[type].doneStates as readonly string[]).includes(status);
}

/**
 * Valida `data` con el esquema del tipo y devuelve el resultado normalizado. Lanza si el tipo no
 * está en el registro o si los datos no encajan. Es la puerta única por la que pasan los campos
 * propios antes de llegar a la base de datos.
 */
export function parseItemData(type: string, data: unknown): Record<string, unknown> {
  if (!isItemType(type)) throw new Error(`Tipo de item desconocido: ${type}`);
  return ITEM_TYPES[type].fields.parse(data);
}
