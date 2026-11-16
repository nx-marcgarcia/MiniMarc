/**
 * Frases reales de Marc, con lo que debería devolver el modelo y lo que debe quedar guardado.
 *
 *   - tests/capture/phrases.test.ts las pasa por el pipeline con una IA que devuelve `model`: prueba
 *     que, dada esa salida, queda guardado exactamente `expect`.
 *   - scripts/eval-classify.ts las pasa por Gemini de verdad y compara el tipo y el número de
 *     elementos con `model`: prueba que el prompt consigue esa salida.
 *
 * Ahora: lunes 2026-11-16, 10:00 en Madrid. Ya existen: la persona Rosendo (cumple el 14 de enero,
 * alias «papá»), Aina (cumple el 12 de abril), mamá, la tienda Casio (casio.com), y los tags casa y viajes.
 */
import { madridToUtc } from '@/lib/time';

export type ModelItem = Record<string, unknown> & { kind: string; title: string; confidence: number };

export interface Phrase {
  /** Qué demuestra. */
  name: string;
  text: string;
  /** Con `trabajo`, la frase se captura con el interruptor de Trabajo: nunca llega a la IA. */
  area?: 'trabajo';
  /** Lo que devuelve el modelo (null: la frase no llega a la IA). */
  model: ModelItem[] | null;
  /** La vista previa que da la página, si es un enlace. */
  page?: { title: string; image: string | null; site: string | null };
  expect: {
    /** Los items guardados, en orden; cada uno se compara parcialmente. */
    items: Record<string, unknown>[];
    /** Citas creadas en Calendar. */
    events?: number;
    /** Fechas especiales de personas guardadas. */
    dates?: number;
  };
}

export const PHRASES_NOW = new Date('2026-11-16T09:00:00.000Z');
const at = (date: string, time: string) => madridToUtc(date, time).toISOString();

export const PHRASES: Phrase[] = [
  {
    name: 'una compra y una tarea en la misma frase',
    text: 'comprar leche y llamar a mamá',
    model: [
      { kind: 'compra', title: 'Leche', confidence: 0.95 },
      { kind: 'tarea', title: 'Llamar a mamá', confidence: 0.92 },
    ],
    expect: { items: [{ type: 'compra', title: 'Leche', status: 'quiero' }, { type: 'tarea', title: 'Llamar a mamá', area: 'personal' }] },
  },
  {
    name: 'Aliexpress: dos compras bajo la misma tienda',
    text: 'Aliexpress: masaje de cabeza, cajón organizador de calcetines',
    model: [
      { kind: 'compra', title: 'Masaje de cabeza', store: { name: 'Aliexpress', domain: 'aliexpress.com' }, confidence: 0.93 },
      { kind: 'compra', title: 'Cajón organizador de calcetines', store: { name: 'Aliexpress' }, confidence: 0.93 },
    ],
    expect: { items: [{ type: 'compra', title: 'Masaje de cabeza' }, { type: 'compra', title: 'Cajón organizador de calcetines' }] },
  },
  {
    name: 'regalo para Rosendo con precio, ligado a su cumpleaños',
    text: 'regalo para Rosendo: caja para relojes, unos 30€',
    model: [{ kind: 'regalo', title: 'Caja para relojes', personName: 'Rosendo', price: 30, confidence: 0.96 }],
    expect: { items: [{ type: 'regalo', title: 'Caja para relojes', status: 'idea', data: { approxPrice: 30, occasion: 'Cumpleaños' } }] },
  },
  {
    name: 'una idea de regalo escrita como nota de la persona',
    text: 'Rosendo: caja reloj buen regalo',
    model: [{ kind: 'regalo', title: 'Caja para relojes', personName: 'Rosendo', confidence: 0.85 }],
    expect: { items: [{ type: 'regalo', title: 'Caja para relojes', needsReview: false }] },
  },
  {
    name: 'por el alias: «papá» es Rosendo',
    text: 'regalo para papá: una cartera',
    model: [{ kind: 'regalo', title: 'Cartera', personName: 'papá', confidence: 0.9 }],
    expect: { items: [{ type: 'regalo', title: 'Cartera' }] },
  },
  {
    name: 'una tarea con fecha y hora relativas (el jueves a las 10)',
    text: 'llamar al de la tienda funko el jueves a las 10',
    model: [{ kind: 'tarea', title: 'Llamar a la tienda Funko', date: '2026-11-19', time: '10:00', confidence: 0.92 }],
    expect: { items: [{ type: 'tarea', title: 'Llamar a la tienda Funko', dueAt: at('2026-11-19', '10:00'), hasTime: true }] },
  },
  {
    name: 'mañana a las 5 (de la tarde)',
    text: 'mañana a las 5 llamar al gestor',
    model: [{ kind: 'tarea', title: 'Llamar al gestor', date: '2026-11-17', time: '17:00', confidence: 0.9 }],
    expect: { items: [{ type: 'tarea', dueAt: at('2026-11-17', '17:00'), hasTime: true }] },
  },
  {
    name: 'en 2 semanas, sin hora',
    text: 'en 2 semanas renovar el DNI',
    model: [{ kind: 'tarea', title: 'Renovar el DNI', date: '2026-11-30', confidence: 0.9 }],
    expect: { items: [{ type: 'tarea', dueAt: at('2026-11-30', '00:00'), hasTime: false }] },
  },
  {
    name: 'antes de Navidad, con prioridad dicha',
    text: 'pagar el seguro antes de navidad, urgente',
    model: [{ kind: 'tarea', title: 'Pagar el seguro', date: '2026-12-24', priority: 'alta', confidence: 0.85 }],
    expect: { items: [{ type: 'tarea', title: 'Pagar el seguro', priority: 'alta', dueAt: at('2026-12-24', '00:00') }] },
  },
  {
    name: 'una cita con lugar va a Calendar',
    text: 'cita con el médico el viernes a las 9:30 en Avinguda del Cardenal Benlloch 4',
    model: [{ kind: 'cita', title: 'Médico', date: '2026-11-20', time: '09:30', location: 'Avinguda del Cardenal Benlloch 4', confidence: 0.94 }],
    expect: { items: [], events: 1 },
  },
  {
    name: 'una palabra suelta y ambigua: a la Bandeja con sugerencia',
    text: 'Trabajar',
    model: [{ kind: 'idea', title: 'Trabajar', confidence: 0.2 }],
    expect: { items: [{ type: 'idea', title: 'Trabajar', needsReview: true, suggestion: { type: 'idea', confidence: 0.2 } }] },
  },
  {
    name: 'texto sin sentido: a la Bandeja',
    text: 'asdf',
    model: [{ kind: 'nota', title: 'asdf', confidence: 0.1 }],
    expect: { items: [{ title: 'asdf', needsReview: true }] },
  },
  {
    name: 'una idea de app',
    text: 'idea: app para organizar shorts',
    model: [{ kind: 'idea', title: 'App para organizar shorts', category: 'app', confidence: 0.95 }],
    expect: { items: [{ type: 'idea', title: 'App para organizar shorts', status: 'semilla', data: { category: 'app' } }] },
  },
  {
    name: 'una serie para ver, como idea',
    text: 'ver la serie Severance',
    model: [{ kind: 'idea', title: 'Ver Severance', category: 'contenido', confidence: 0.7 }],
    expect: { items: [{ type: 'idea', title: 'Ver Severance', needsReview: false }] },
  },
  {
    name: 'un libro con autor',
    text: 'quiero leer Sapiens de Harari',
    model: [{ kind: 'libro', title: 'Sapiens', author: 'Harari', confidence: 0.96 }],
    expect: { items: [{ type: 'libro', title: 'Sapiens', author: 'Harari', status: 'por_leer' }] },
  },
  {
    name: 'un libro con el atajo /libro',
    text: '/libro El nombre del viento de Patrick Rothfuss',
    model: [{ kind: 'libro', title: 'El nombre del viento', author: 'Patrick Rothfuss', confidence: 0.95 }],
    expect: { items: [{ type: 'libro', title: 'El nombre del viento', author: 'Patrick Rothfuss' }] },
  },
  {
    name: 'una fecha especial que se repite cada año',
    text: 'el 14 de febrero es nuestro aniversario con Ainhoa',
    model: [{ kind: 'fecha', title: 'Aniversario', personName: 'Ainhoa', label: 'Aniversario', date: '2026-02-14', yearKnown: false, confidence: 0.93 }],
    expect: { items: [], dates: 1 },
  },
  {
    name: 'un cumpleaños se guarda en la persona',
    text: 'recordar el cumpleaños de Aina el 12 de abril',
    model: [{ kind: 'fecha', title: 'Cumpleaños', personName: 'Aina', label: 'Cumpleaños', date: '2026-04-12', yearKnown: false, confidence: 0.94 }],
    expect: { items: [], dates: 1 },
  },
  {
    name: 'cantidad y tag',
    text: 'comprar pilas AAA x2 #casa',
    model: [{ kind: 'compra', title: 'Pilas AAA', quantity: 2, confidence: 0.93 }],
    expect: { items: [{ type: 'compra', title: 'Pilas AAA', tags: ['casa'], data: { quantity: 2, currency: 'EUR' } }] },
  },
  {
    name: 'una compra con la tienda dicha dentro de la frase',
    text: 'comprar un cargador para el móvil en Amazon',
    model: [{ kind: 'compra', title: 'Cargador para el móvil', store: { name: 'Amazon', domain: 'amazon.es' }, confidence: 0.92 }],
    expect: { items: [{ type: 'compra', title: 'Cargador para el móvil' }] },
  },
  {
    name: 'varias compras de una tienda de ropa',
    text: 'Zara: camiseta negra, pantalón vaquero',
    model: [
      { kind: 'compra', title: 'Camiseta negra', store: { name: 'Zara' }, confidence: 0.92 },
      { kind: 'compra', title: 'Pantalón vaquero', store: { name: 'Zara' }, confidence: 0.92 },
    ],
    expect: { items: [{ type: 'compra', title: 'Camiseta negra' }, { type: 'compra', title: 'Pantalón vaquero' }] },
  },
  {
    name: 'regalo con precio y ocasión dicha',
    text: 'regalo para Aina por Navidad: libro de recetas, unos 20 euros',
    model: [{ kind: 'regalo', title: 'Libro de recetas', personName: 'Aina', price: 20, occasion: 'Navidad', confidence: 0.95 }],
    expect: { items: [{ type: 'regalo', title: 'Libro de recetas', data: { approxPrice: 20, occasion: 'Navidad' } }] },
  },
  {
    name: 'un regalo y una tarea a la vez',
    text: 'comprar regalo de navidad para mamá y llamar al dentista el lunes a las 12',
    model: [
      { kind: 'regalo', title: 'Regalo de Navidad', personName: 'mamá', occasion: 'Navidad', confidence: 0.9 },
      { kind: 'tarea', title: 'Llamar al dentista', date: '2026-11-23', time: '12:00', confidence: 0.9 },
    ],
    expect: { items: [{ type: 'regalo', title: 'Regalo de Navidad' }, { type: 'tarea', title: 'Llamar al dentista', dueAt: at('2026-11-23', '12:00') }] },
  },
  {
    name: 'un correo dentro de la tarea no se pierde',
    text: 'contactar con webmaster@gamesuniversal.es para rehacer el ecommerce Funko',
    model: [{ kind: 'tarea', title: 'Contactar con webmaster@gamesuniversal.es para rehacer el ecommerce Funko', confidence: 0.9 }],
    expect: { items: [{ type: 'tarea', title: 'Contactar con webmaster@gamesuniversal.es para rehacer el ecommerce Funko' }] },
  },
  {
    name: 'atajos: tipo, tag, prioridad y persona',
    text: '/regalo caja de relojes #viajes !alta $25 @Rosendo',
    model: [{ kind: 'idea', title: 'caja de relojes', confidence: 0.7 }],
    expect: { items: [{ type: 'regalo', title: 'caja de relojes', tags: ['viajes'], priority: 'alta', data: { approxPrice: 25, occasion: 'Cumpleaños' } }] },
  },
  {
    name: 'atajo de tipo: /compra',
    text: '/compra pilas',
    model: [{ kind: 'idea', title: 'pilas', confidence: 0.6 }],
    expect: { items: [{ type: 'compra', title: 'pilas', needsReview: false, suggestion: null }] },
  },
  {
    name: 'solo un atajo: se guarda para revisar',
    text: '#viajes',
    model: [{ kind: 'nota', title: '#viajes', confidence: 0.1 }],
    expect: { items: [{ needsReview: true }] },
  },
  {
    name: 'un texto largo es una nota',
    text: 'Resumen de la reunión: acordamos rehacer el ecommerce de Funko, empezar por el catálogo y dejar el blog para después',
    model: [{ kind: 'nota', title: 'Resumen de la reunión', notes: 'Acordamos rehacer el ecommerce de Funko, empezar por el catálogo y dejar el blog para después', confidence: 0.8 }],
    expect: { items: [{ type: 'nota', title: 'Resumen de la reunión', status: 'activa' }] },
  },
  {
    name: 'solo un vídeo de YouTube → Enlace de tipo vídeo, sin IA',
    text: 'https://www.youtube.com/watch?v=abc123',
    model: null,
    page: { title: 'Receta de tortilla', image: 'https://i.ytimg.com/vi/abc123/hq.jpg', site: 'YouTube' },
    expect: { items: [{ type: 'enlace', title: 'Receta de tortilla', data: { kind: 'video' }, link: 'https://www.youtube.com/watch?v=abc123' }] },
  },
  {
    name: 'solo un short de TikTok → Enlace de tipo short',
    text: 'https://www.tiktok.com/@alguien/video/123',
    model: null,
    page: { title: 'Un truco', image: null, site: 'TikTok' },
    expect: { items: [{ type: 'enlace', data: { kind: 'short' } }] },
  },
  {
    name: 'solo un enlace de Amazon → Compra con la tienda, sin IA',
    text: 'https://www.amazon.es/dp/B0123456',
    model: null,
    page: { title: 'Cafetera Nespresso Vertuo', image: 'https://m.media-amazon.com/x.jpg', site: 'Amazon' },
    expect: { items: [{ type: 'compra', title: 'Cafetera Nespresso Vertuo', status: 'quiero' }] },
  },
  {
    name: 'el enlace de una tienda que Marc ya tiene → Compra en esa tienda (Casio)',
    text: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/',
    model: null,
    page: { title: 'MTP-B220BL-1AV', image: 'https://www.casio.com/i.png', site: 'CASIO' },
    expect: { items: [{ type: 'compra', title: 'MTP-B220BL-1AV' }] },
  },
  {
    name: 'un enlace de una página cualquiera: decide la IA con el título',
    text: 'https://blog.example.com/como-montar-un-blog',
    model: [{ kind: 'enlace', title: 'Cómo montar un blog', linkKind: 'articulo', confidence: 0.9 }],
    page: { title: 'Cómo montar un blog', image: null, site: 'Example' },
    expect: { items: [{ type: 'enlace', title: 'Cómo montar un blog', data: { kind: 'articulo' } }] },
  },
  {
    name: 'una compra con su enlace dentro de la frase',
    text: 'Casio MTP-B220BL-1AV https://www.casio.com/es/watches/MTP-B220BL-1AV/',
    model: [{ kind: 'compra', title: 'Casio MTP-B220BL-1AV', store: { name: 'Casio', domain: 'casio.com' }, confidence: 0.94 }],
    expect: { items: [{ type: 'compra', title: 'Casio MTP-B220BL-1AV', link: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/' }] },
  },
  {
    name: 'una tarea del trabajo se guarda sin IA (área Trabajo)',
    text: 'preparar la demo del jueves',
    area: 'trabajo',
    model: null,
    expect: { items: [{ type: 'tarea', area: 'trabajo', title: 'preparar la demo del jueves' }] },
  },
];
