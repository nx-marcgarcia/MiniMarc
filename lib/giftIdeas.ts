/**
 * "Sugerir ideas" for a gift: asks the AI for a few ideas from what Marc knows about the person
 * (likes, dislikes, relation, what was already given) and files the chosen one as a regalo.
 * On demand only (one call per click). People of Trabajo never go to the AI.
 */
import { z } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import { UserError } from '@/lib/actions/result';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Item, Person } from '@/lib/db/types';
import { nameKey } from '@/lib/search/normalize';

export interface GiftIdeaDeps {
  ai: AiProvider;
  items: ItemsRepo;
  people: PeopleRepo;
}

export const MAX_SUGGESTIONS = 5;
const AI_TIMEOUT_MS = 10_000;

const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(200).default(''),
  approxPrice: z.number().positive().optional(),
});
const answerSchema = z.object({ ideas: z.array(suggestionSchema).max(MAX_SUGGESTIONS) });

export type GiftSuggestion = z.infer<typeof suggestionSchema>;

function prompt(person: Person, given: Item[], occasion?: string): string {
  const sizes = Object.entries(person.sizes).map(([k, v]) => `${k} ${v}`).join(', ');
  const known = [
    person.relation && `Relación: ${person.relation}`,
    person.likes && `Le gusta: ${person.likes}`,
    person.dislikes && `No le gusta: ${person.dislikes}`,
    sizes && `Tallas: ${sizes}`,
    person.notes && `Notas: ${person.notes}`,
  ].filter(Boolean);
  const already = given.map((g) => g.title);
  return `Propón ideas de regalo para ${person.name}${occasion ? ` (ocasión: ${occasion})` : ''}. Responde solo JSON: {"ideas":[{"title","reason","approxPrice"}]}.
Como máximo ${MAX_SUGGESTIONS} ideas, concretas (algo que se pueda comprar), con un motivo corto en español basado en lo que se sabe y un precio aproximado en euros si lo puedes estimar.
Lo que se sabe de la persona:
${known.length ? known.join('\n') : '(poco: sugiere cosas que gusten a casi todo el mundo)'}
Ya se ha regalado o está apuntado (no lo repitas): ${already.length ? already.join('; ') : '(nada)'}`;
}

/** Suggestions for `personId`, minus anything already given or noted. Throws UserError with a message for Marc. */
export async function suggestGifts(deps: GiftIdeaDeps, personId: string, occasion?: string): Promise<GiftSuggestion[]> {
  const person = await deps.people.getPerson(personId);
  if (!person) throw new UserError('No encuentro a esa persona.');
  if (person.relation === 'trabajo') throw new UserError('No sugiero regalos para personas de Trabajo.');
  const given = (await deps.items.listItems({ type: 'regalo', needsReview: false })).filter((g) => g.personId === personId);
  let answer: z.infer<typeof answerSchema>;
  try {
    answer = await deps.ai.generateJson(prompt(person, given, occasion), answerSchema, { timeoutMs: AI_TIMEOUT_MS });
  } catch {
    throw new UserError('No he podido pensar ideas ahora. Inténtalo dentro de un rato.');
  }
  const taken = new Set(given.map((g) => nameKey(g.title)));
  return answer.ideas.filter((s) => !taken.has(nameKey(s.title)));
}

/** Files a suggestion as a regalo "idea" for the person. */
export async function addGiftIdea(deps: Pick<GiftIdeaDeps, 'items' | 'people'>, personId: string, s: GiftSuggestion): Promise<Item> {
  const parsed = suggestionSchema.parse(s);
  if (!(await deps.people.getPerson(personId))) throw new UserError('No encuentro a esa persona.');
  return deps.items.createItem({
    type: 'regalo',
    title: parsed.title,
    status: 'idea',
    personId,
    notes: parsed.reason || null,
    data: parsed.approxPrice ? { approxPrice: parsed.approxPrice } : {},
  });
}
