import { describe, expect, it } from 'vitest';
import { guessFromLink, parseShortcuts } from '@/lib/capture/prep';

describe('parseShortcuts', () => {
  it('sin atajos devuelve el texto tal cual', () => {
    expect(parseShortcuts('comprar leche y llamar a mamá')).toEqual({ text: 'comprar leche y llamar a mamá', tags: [] });
  });

  it('#tag: lo quita del texto y lo recoge en minúsculas', () => {
    expect(parseShortcuts('probar el restaurante nuevo #Viajes #plan')).toEqual({ text: 'probar el restaurante nuevo', tags: ['viajes', 'plan'] });
  });

  it('@persona: el nombre, con _ como espacio', () => {
    expect(parseShortcuts('caja para relojes @Rosendo').person).toBe('Rosendo');
    expect(parseShortcuts('libro @ana_maría').person).toBe('ana maría');
  });

  it('!alta, !media, !baja y !urgente', () => {
    expect(parseShortcuts('pagar el seguro !alta').priority).toBe('alta');
    expect(parseShortcuts('x !urgente').priority).toBe('alta');
    expect(parseShortcuts('x !baja').priority).toBe('baja');
    expect(parseShortcuts('x !media').priority).toBe('media');
  });

  it('/tipo fija el tipo', () => {
    expect(parseShortcuts('/compra pilas AAA').kind).toBe('compra');
    expect(parseShortcuts('/idea app de shorts').kind).toBe('idea');
    expect(parseShortcuts('/regalo caja').kind).toBe('regalo');
    expect(parseShortcuts('/nota algo largo').kind).toBe('nota');
    expect(parseShortcuts('/enlace https://a.com').kind).toBe('enlace');
  });

  it('$25 y $25,50: el precio', () => {
    expect(parseShortcuts('caja de relojes $25').price).toBe(25);
    expect(parseShortcuts('caja de relojes $25,50').price).toBe(25.5);
    expect(parseShortcuts('caja de relojes $25.5').price).toBe(25.5);
  });

  it('>proyecto: el nombre, con _ como espacio', () => {
    expect(parseShortcuts('contactar >Rehacer_ecommerce').project).toBe('Rehacer ecommerce');
  });

  it('el texto queda limpio y sin espacios de más', () => {
    expect(parseShortcuts('  /compra   pilas   #casa  $3  !alta ')).toEqual({ text: 'pilas', tags: ['casa'], kind: 'compra', price: 3, priority: 'alta' });
  });

  it('no confunde correos, URLs, rutas ni comparaciones con atajos', () => {
    const text = 'escribir a webmaster@gamesuniversal.es y ver https://a.com/x#seccion en /home/marc, si pasa >5 días';
    expect(parseShortcuts(text)).toEqual({ text, tags: [] });
  });

  it('una / sola o un # solo no son atajos', () => {
    expect(parseShortcuts('a / b # c ! d')).toEqual({ text: 'a / b # c ! d', tags: [] });
  });

  it('un tipo que no existe no se come el texto', () => {
    expect(parseShortcuts('/viaje a Roma').text).toBe('/viaje a Roma');
    expect(parseShortcuts('/viaje a Roma').kind).toBeUndefined();
  });
});

describe('guessFromLink', () => {
  it('un texto que no es solo un enlace no se adivina', () => {
    expect(guessFromLink('mira esto https://youtube.com/watch?v=1')).toBeNull();
    expect(guessFromLink('comprar leche')).toBeNull();
    expect(guessFromLink('')).toBeNull();
  });

  it.each([
    ['https://www.youtube.com/watch?v=abc', 'enlace', 'video'],
    ['https://youtu.be/abc', 'enlace', 'video'],
    ['https://www.youtube.com/shorts/abc', 'enlace', 'short'],
    ['https://www.tiktok.com/@x/video/1', 'enlace', 'short'],
    ['https://www.instagram.com/reel/abc/', 'enlace', 'short'],
    ['https://x.com/user/status/1', 'enlace', 'hilo'],
    ['https://twitter.com/user/status/1', 'enlace', 'hilo'],
    ['https://github.com/vercel/next.js', 'enlace', 'herramienta'],
    ['https://www.goodreads.com/book/show/1', 'libro', undefined],
  ] as const)('%s → %s %s', (url, type, linkKind) => {
    const g = guessFromLink(url);
    expect(g).toMatchObject({ url, type });
    expect(g?.linkKind).toBe(linkKind);
  });

  it('un enlace de Google Maps queda como enlace con la etiqueta lugar (hasta que exista el tipo Lugar)', () => {
    expect(guessFromLink('https://www.google.com/maps/place/Casa+Pepe')).toMatchObject({ type: 'enlace', tags: ['lugar'] });
    expect(guessFromLink('https://maps.app.goo.gl/abc')).toMatchObject({ type: 'enlace', tags: ['lugar'] });
  });

  it('una tienda conocida va a Compra con su nombre y dominio', () => {
    expect(guessFromLink('https://www.amazon.es/dp/B0123')).toMatchObject({ type: 'compra', store: { name: 'Amazon', domain: 'amazon.es' } });
    expect(guessFromLink('https://es.aliexpress.com/item/1.html')).toMatchObject({ type: 'compra', store: { name: 'Aliexpress', domain: 'aliexpress.com' } });
  });

  it('una tienda del usuario (por dominio) también va a Compra', () => {
    expect(guessFromLink('https://www.casio.com/es/watches/MTP-B220BL-1AV/', [{ name: 'Casio', domain: 'casio.com' }])).toMatchObject({
      type: 'compra',
      store: { name: 'Casio', domain: 'casio.com' },
    });
  });

  it('un dominio desconocido devuelve el enlace sin tipo: lo decide la IA con la vista previa', () => {
    expect(guessFromLink('https://blog.example.com/post')).toEqual({ url: 'https://blog.example.com/post', type: null, tags: [] });
  });

  it('acepta un enlace con espacios alrededor o sin esquema', () => {
    expect(guessFromLink('  https://youtu.be/abc  ')?.url).toBe('https://youtu.be/abc');
    expect(guessFromLink('www.youtube.com/watch?v=1')?.url).toBe('https://www.youtube.com/watch?v=1');
  });
});
