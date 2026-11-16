/**
 * Pasa las frases de tests/fixtures/phrases.ts por Gemini de verdad y compara con lo que debería
 * devolver (el tipo de cada elemento y cuántos son). Sirve para medir el prompt del clasificador
 * cuando se toca, o cuando Google cambia el modelo; los tests normales no llaman a la IA.
 *
 *   npx tsx scripts/eval-classify.ts            # todas las frases que pasan por la IA
 *   npx tsx scripts/eval-classify.ts tortilla   # solo las que contienen ese texto
 *   (si la CLI de tsx no puede abrir su canal IPC: node --import tsx scripts/eval-classify.ts)
 *
 * Gasta una llamada por frase (unas 30). Lee .env.local como `next dev`. Solo muestra las frases (que
 * son de prueba) y lo que devuelve el modelo, nunca la clave.
 */
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(__dirname, '..'));

async function main() {
  // Imported after loadEnvConfig so the provider reads the key it just loaded.
  const { createGeminiProvider } = await import('../lib/ai/gemini');
  const { classify } = await import('../lib/ai/classify');
  const { guessFromLink, parseShortcuts } = await import('../lib/capture/prep');
  const { PHRASES, PHRASES_NOW } = await import('../tests/fixtures/phrases');

  const filter = process.argv[2]?.toLowerCase();
  const ai = createGeminiProvider({ dailyCap: 1000 });
  const ctx = {
    now: PHRASES_NOW,
    tz: 'Europe/Madrid',
    people: ['Rosendo (también: papá)', 'Aina', 'mamá', 'Ainhoa'],
    stores: ['Casio'],
    tags: ['casa', 'viajes'],
  };

  let ok = 0;
  let total = 0;
  for (const p of PHRASES) {
    if (!p.model || p.area || (filter && !p.text.toLowerCase().includes(filter))) continue;
    const body = parseShortcuts(p.text).text || p.text;
    const page = guessFromLink(body) && p.page ? { url: body, title: p.page.title, site: p.page.site } : undefined;
    total++;
    try {
      const got = await classify(body, { ...ctx, ...(page && { page }) }, ai);
      const want = p.model.map((m) => m.kind);
      const have = got.map((g) => g.kind);
      const same = want.length === have.length && want.every((k, i) => k === have[i]);
      if (same) ok++;
      console.log(`${same ? '✓' : '✗'} ${p.name}\n    «${p.text}»\n    esperado: ${want.join(', ')}   modelo: ${have.join(', ')} (confianza ${got.map((g) => g.confidence).join(', ')})`);
    } catch (err) {
      console.log(`✗ ${p.name}\n    «${p.text}»\n    error: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n${ok} de ${total} con el mismo tipo y número de elementos que lo esperado.`);
  process.exitCode = ok === total ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
