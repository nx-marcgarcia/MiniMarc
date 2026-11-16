import { describe, expect, it } from 'vitest';
import { deriveLink, extractUrls, linkify, shortUrl } from '@/lib/links/linkify';

describe('linkify', () => {
  it('texto sin enlaces: un solo segmento de texto', () => {
    expect(linkify('Comprar pan')).toEqual([{ kind: 'text', text: 'Comprar pan' }]);
  });

  it('cadena vacía: sin segmentos', () => {
    expect(linkify('')).toEqual([]);
  });

  it('separa texto y enlace, con el enlace acortado al dominio y un trozo de ruta', () => {
    expect(linkify('Mira https://www.amazon.es/dp/B0ABCDEFGH/ref=sr_1 mañana')).toEqual([
      { kind: 'text', text: 'Mira ' },
      { kind: 'link', href: 'https://www.amazon.es/dp/B0ABCDEFGH/ref=sr_1', text: 'amazon.es/dp/…' },
      { kind: 'text', text: ' mañana' },
    ]);
  });

  it('deja fuera la puntuación final y el paréntesis de cierre que no es suyo', () => {
    const segs = linkify('(ver https://ejemplo.com/a.) y https://es.wikipedia.org/wiki/Foo_(bar), fin');
    const links = segs.filter((s) => s.kind === 'link').map((s) => s.href);
    expect(links).toEqual(['https://ejemplo.com/a', 'https://es.wikipedia.org/wiki/Foo_(bar)']);
    expect(segs.map((s) => (s.kind === 'link' ? s.href : s.text)).join('')).toBe(
      '(ver https://ejemplo.com/a.) y https://es.wikipedia.org/wiki/Foo_(bar), fin',
    );
  });

  it('www. sin esquema se enlaza con https', () => {
    expect(linkify('www.casadellibro.com')).toEqual([
      { kind: 'link', href: 'https://www.casadellibro.com/', text: 'casadellibro.com' },
    ]);
  });

  it('solo http y https: javascript:, data: y ftp: quedan como texto', () => {
    for (const t of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://ejemplo.com/x']) {
      expect(linkify(t).every((s) => s.kind === 'text')).toBe(true);
    }
  });

  it('un mailto: escrito a mano no es un enlace propio: solo su correo, con el href que construye el código', () => {
    expect(linkify('mailto:a@b.es').map((s) => s.kind)).toEqual(['text', 'email']);
    expect(linkify('mailto:a@b.es')[1]).toMatchObject({ href: 'mailto:a@b.es' });
  });

  it('no enlaza un esquema sin host', () => {
    expect(linkify('https:// nada').every((s) => s.kind === 'text')).toBe(true);
  });

  it('mayúsculas en el esquema', () => {
    expect(linkify('HTTPS://Ejemplo.com/X')[0]).toMatchObject({ kind: 'link', href: 'https://ejemplo.com/X' });
  });

  it('varios enlaces seguidos en líneas distintas', () => {
    const segs = linkify('https://a.com\nhttps://b.com/x');
    expect(segs.filter((s) => s.kind === 'link')).toHaveLength(2);
    expect(segs[1]).toEqual({ kind: 'text', text: '\n' });
  });
});

describe('shortUrl', () => {
  it('dominio sin www, y la ruta corta o «…»', () => {
    expect(shortUrl('https://www.amazon.es/')).toBe('amazon.es');
    expect(shortUrl('https://amazon.es/dp')).toBe('amazon.es/dp');
    expect(shortUrl('https://amazon.es/dp/B0ABC')).toBe('amazon.es/dp/…');
    expect(shortUrl('https://amazon.es/un-titulo-de-producto-muy-largo')).toBe('amazon.es/…');
    expect(shortUrl('https://amazon.es/?q=1')).toBe('amazon.es/…');
  });

  it('texto que no es URL: tal cual', () => {
    expect(shortUrl('no es url')).toBe('no es url');
  });
});

describe('extractUrls / deriveLink', () => {
  it('extrae las URL http(s) en orden', () => {
    expect(extractUrls('a https://x.com/1 b www.y.es c')).toEqual(['https://x.com/1', 'https://www.y.es/']);
  });

  it('sin link: toma la primera URL del título y, si no, de las notas', () => {
    expect(deriveLink({ title: 'Ver https://a.com/x', notes: 'https://b.com', link: null })).toBe('https://a.com/x');
    expect(deriveLink({ title: 'Ver esto', notes: 'en https://b.com/y', link: null })).toBe('https://b.com/y');
  });

  it('con link: lo respeta', () => {
    expect(deriveLink({ title: 'https://a.com', notes: null, link: 'https://mio.es' })).toBe('https://mio.es');
  });

  it('sin URL en ningún sitio: null', () => {
    expect(deriveLink({ title: 'Pan', notes: null, link: null })).toBeNull();
    expect(deriveLink({ title: 'Pan', notes: undefined, link: '  ' })).toBeNull();
  });
});

describe('linkify: correos y teléfonos', () => {
  const parts = (text: string) => linkify(text).map((s) => (s.kind === 'text' ? s.text : `[${s.kind}:${s.text}→${s.href}]`));

  it('un correo es pulsable (mailto:) y la puntuación final se queda fuera', () => {
    expect(parts('Escribir a webmaster@gamesuniversal.es.')).toEqual(['Escribir a ', '[email:webmaster@gamesuniversal.es→mailto:webmaster@gamesuniversal.es]', '.']);
    expect(parts('ana.perez+pedidos@correo.com, gracias')).toEqual(['[email:ana.perez+pedidos@correo.com→mailto:ana.perez+pedidos@correo.com]', ', gracias']);
  });

  it('un teléfono español, con o sin prefijo y como se escriba, es pulsable (tel:)', () => {
    expect(parts('llamar al 600 000 000 mañana')).toEqual(['llamar al ', '[phone:600 000 000→tel:600000000]', ' mañana']);
    expect(parts('+34 961 234 567')).toEqual(['[phone:+34 961 234 567→tel:+34961234567]']);
    expect(parts('961234567')).toEqual(['[phone:961234567→tel:961234567]']);
    expect(parts('961-23-45-67')).toEqual(['[phone:961-23-45-67→tel:961234567]']);
  });

  it('un teléfono internacional con + también', () => {
    expect(parts('+1 415 555 2671')).toEqual(['[phone:+1 415 555 2671→tel:+14155552671]']);
  });

  it('no confunde números con teléfonos: precios, fechas, códigos cortos o muy largos', () => {
    for (const text of ['pagar 1.299,00 €', 'el 2026-11-16', 'código 12345678', 'pedido 6001234567890', 'son 3,5 kg', 'hay 100 200 300 cosas']) {
      expect(linkify(text)).toEqual([{ kind: 'text', text }]);
    }
  });

  it('un enlace con un correo o un número dentro sigue siendo un solo enlace', () => {
    expect(linkify('https://x.com/u/ana@correo.com/600000000')).toEqual([{ kind: 'link', href: 'https://x.com/u/ana@correo.com/600000000', text: 'x.com/u/…' }]);
  });

  it('todo mezclado en una nota', () => {
    expect(parts('Funko: webmaster@gamesuniversal.es, 961 234 567 y https://funko.es/oferta')).toEqual([
      'Funko: ',
      '[email:webmaster@gamesuniversal.es→mailto:webmaster@gamesuniversal.es]',
      ', ',
      '[phone:961 234 567→tel:961234567]',
      ' y ',
      '[link:funko.es/oferta→https://funko.es/oferta]',
    ]);
  });

  it('extractUrls y deriveLink solo miran las URL, no los correos ni los teléfonos', () => {
    expect(extractUrls('webmaster@gamesuniversal.es 600 000 000')).toEqual([]);
    expect(deriveLink({ title: 'Llamar 600 000 000', notes: 'a x@y.es' })).toBeNull();
  });
});
