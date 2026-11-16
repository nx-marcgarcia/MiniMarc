/** "Para hoy" (the block at the top of Hoy): a few of what the brain would bring back, mixing kinds. Pure. */
import type { Candidate } from './candidates';

export const TODAY_MAX = 3;

/** Up to `max` of `list`, one per kind while there are kinds to choose from, then the rest in order. */
function mix(list: Candidate[], max: number): Candidate[] {
  const picked: Candidate[] = [];
  const kinds = new Set<string>();
  for (const c of list) {
    if (picked.length === max) break;
    if (kinds.has(c.kind)) continue;
    kinds.add(c.kind);
    picked.push(c);
  }
  for (const c of list) {
    if (picked.length === max) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

/**
 * The candidates come most urgent first. What is urgent takes the places first (mixing kinds among
 * themselves); what is merely forgotten only fills what is left, mixing kinds too: "no three ideas
 * in a row", but a forgotten idea never pushes an overdue task out.
 */
export function pickForToday(candidates: Candidate[], max = TODAY_MAX): Candidate[] {
  const urgent = mix(candidates.filter((c) => c.urgent), max);
  return [...urgent, ...mix(candidates.filter((c) => !c.urgent), max - urgent.length)];
}
