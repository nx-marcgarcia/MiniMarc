import { z } from 'zod';
import { isValidDate } from '@/lib/time';

export const CLASSIFICATION_KINDS = ['tarea', 'idea', 'compra', 'regalo', 'libro', 'cita', 'fecha', 'enlace', 'nota'] as const;
export type ClassificationKind = (typeof CLASSIFICATION_KINDS)[number];

const optionalText = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || undefined);

/** The kinds of link an `enlace` can be (the registry's `enlace.kind`). */
export const LINK_KINDS = ['articulo', 'video', 'short', 'hilo', 'herramienta'] as const;

/** A store as the model names it; empty names are dropped and `domain` is optional. */
const storeSchema = z
  .object({ name: z.string(), domain: optionalText })
  .nullish()
  .transform((s) => (s && s.name.trim() ? { name: s.name.trim(), ...(s.domain && { domain: s.domain }) } : undefined));

/** What the model must return. Unknown keys (e.g. an `area`) are stripped by zod. */
export const modelItemSchema = z.object({
  kind: z.enum(CLASSIFICATION_KINDS),
  title: z.string(),
  notes: optionalText,
  personName: optionalText,
  /** The address or place, as said ("Avinguda del Cardenal Benlloch, 4, Valencia"). */
  location: optionalText,
  /** libro: the author, as written ("Harari"). */
  author: optionalText,
  /** fecha: "Aniversario", "Santo", "Nos conocimos"… */
  label: optionalText,
  /** fecha: whether `date` carries the original year. */
  yearKnown: z.boolean().nullish(),
  /** Local date in the user's zone, "YYYY-MM-DD". */
  date: z.string().refine(isValidDate, 'Fecha no válida').nullish(),
  /** Local time in the user's zone, "HH:mm". */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida')
    .nullish(),
  /** compra / regalo: the store, as said ("Aliexpress"), with its domain when it is known. */
  store: storeSchema,
  /** compra: the price of one unit; regalo: the approximate price. In `currency` (default EUR). */
  price: z.number().nonnegative().nullish(),
  currency: optionalText,
  quantity: z.number().int().positive().nullish(),
  /** Reuse the existing tags before inventing new ones. */
  tags: z.array(z.string()).nullish(),
  priority: z.enum(['baja', 'media', 'alta']).nullish(),
  /** idea: negocio, app, contenido, viaje, personal… */
  category: optionalText,
  /** regalo: "Cumpleaños", "Navidad"… */
  occasion: optionalText,
  /** enlace: what the link is. */
  linkKind: z.enum(LINK_KINDS).nullish(),
  confidence: z.number().min(0).max(1),
});

export const modelOutputSchema = z.object({ items: z.array(modelItemSchema) });
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/**
 * The same shape as JSON Schema, for the model's structured-output mode. Asking for the shape in
 * prose is not enough: the model sometimes answers with a bare array instead of `{"items": […]}`,
 * and zod then rejects the whole note, which lands it in "Sin clasificar". Derived from the zod
 * schema so the two can never drift.
 *
 * Only the envelope is guaranteed here; zod stays the real validator. Keywords the model's schema
 * dialect does not accept (`$schema`, `pattern`) are stripped, so a tightening of the zod schema
 * can never turn into a rejected request.
 */
function forModel(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forModel);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'pattern') continue;
    out[key] = forModel(value);
  }
  return out;
}

/** The JSON Schema of any zod schema, in the dialect the model accepts (see `forModel`). */
export function jsonSchemaForModel(schema: z.ZodType): unknown {
  return forModel(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }));
}

export const modelOutputJsonSchema = jsonSchemaForModel(modelOutputSchema);
