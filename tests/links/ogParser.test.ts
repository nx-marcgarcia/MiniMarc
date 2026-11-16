import { describe, expect, it } from 'vitest';
import { parsePreview } from '@/lib/links/ogParser';

const BASE = 'https://www.ejemplo.com/libros/uno';

describe('parsePreview', () => {
  it('lee og:title, og:image y og:site_name', () => {
    const html = `<!doctype html><html><head>
      <title>Título de la pestaña</title>
      <meta property="og:title" content="El nombre del viento">
      <meta property="og:image" content="https://cdn.ejemplo.com/portada.jpg" />
      <meta property="og:site_name" content="Casa del Libro">
    </head><body></body></html>`;
    expect(parsePreview(html, BASE)).toEqual({
      title: 'El nombre del viento',
      image: 'https://cdn.ejemplo.com/portada.jpg',
      site: 'Casa del Libro',
    });
  });

  it('atributos en cualquier orden, comillas simples y mayúsculas', () => {
    const html = `<META CONTENT='Hola' PROPERTY='og:title'><meta content="/img/a.png" name="twitter:image">`;
    expect(parsePreview(html, BASE)).toMatchObject({ title: 'Hola', image: 'https://www.ejemplo.com/img/a.png' });
  });

  it('sin og: usa twitter:* y después <title>', () => {
    expect(parsePreview('<meta name="twitter:title" content="Tuit"><title>T</title>', BASE).title).toBe('Tuit');
    expect(parsePreview('<title>\n  Solo título  \n</title>', BASE)).toEqual({ title: 'Solo título', image: null, site: null });
  });

  it('hace absoluta la imagen relativa (también //cdn…) y descarta esquemas que no son http(s)', () => {
    expect(parsePreview('<meta property="og:image" content="../p.jpg">', BASE).image).toBe('https://www.ejemplo.com/p.jpg');
    expect(parsePreview('<meta property="og:image" content="//cdn.x.com/p.jpg">', BASE).image).toBe('https://cdn.x.com/p.jpg');
    expect(parsePreview('<meta property="og:image" content="javascript:alert(1)">', BASE).image).toBeNull();
    expect(parsePreview('<meta property="og:image" content="data:image/png;base64,AAA">', BASE).image).toBeNull();
  });

  it('decodifica entidades HTML', () => {
    const html = '<meta property="og:title" content="Caf&eacute; &amp; t&#233; &#x2014; &quot;ya&quot; &lt;b&gt;">';
    expect(parsePreview(html, BASE).title).toBe('Café & té — "ya" <b>');
  });

  it('og:image:secure_url y og:image:url valen como imagen', () => {
    expect(parsePreview('<meta property="og:image:secure_url" content="https://a.com/s.jpg">', BASE).image).toBe('https://a.com/s.jpg');
  });

  it('sin nada útil: todo null', () => {
    expect(parsePreview('<html><body>Hola</body></html>', BASE)).toEqual({ title: null, image: null, site: null });
  });

  it('ignora metas vacíos y recorta títulos larguísimos', () => {
    const long = 'x'.repeat(1000);
    const r = parsePreview(`<meta property="og:title" content="  "><meta name="twitter:title" content="${long}">`, BASE);
    expect(r.title?.length).toBeLessThanOrEqual(300);
  });

  it('no confunde metas dentro de comentarios ni de scripts', () => {
    const html = '<!-- <meta property="og:title" content="Falso"> --><script>var s=\'<meta property="og:title" content="Script">\'</script><title>Real</title>';
    expect(parsePreview(html, BASE).title).toBe('Real');
  });
});

describe('parsePreview: precio de la página', () => {
  it('lee el precio de las etiquetas de producto (product:price:*)', () => {
    const html = '<meta property="product:price:amount" content="29,99"><meta property="product:price:currency" content="EUR">';
    expect(parsePreview(html, BASE)).toMatchObject({ price: 29.99, currency: 'EUR' });
  });

  it('o de og:price:*', () => {
    expect(parsePreview('<meta property="og:price:amount" content="12.5"><meta property="og:price:currency" content="USD">', BASE)).toMatchObject({ price: 12.5, currency: 'USD' });
  });

  it('o del JSON-LD de un producto (oferta suelta, lista de ofertas, @graph o rango)', () => {
    const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
    expect(parsePreview(ld({ '@type': 'Product', offers: { '@type': 'Offer', price: '25.99', priceCurrency: 'EUR' } }), BASE)).toMatchObject({ price: 25.99, currency: 'EUR' });
    expect(parsePreview(ld({ '@type': 'Product', offers: [{ price: 40, priceCurrency: 'EUR' }, { price: 50 }] }), BASE)).toMatchObject({ price: 40 });
    expect(parsePreview(ld({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'Product', offers: { price: '9,90', priceCurrency: 'EUR' } }] }), BASE)).toMatchObject({ price: 9.9 });
    expect(parsePreview(ld({ '@type': 'Product', offers: { '@type': 'AggregateOffer', lowPrice: '15', priceCurrency: 'EUR' } }), BASE)).toMatchObject({ price: 15 });
  });

  it('entiende los separadores de miles y decimales', () => {
    const p = (amount: string) => parsePreview(`<meta property="product:price:amount" content="${amount}">`, BASE).price;
    expect(p('1.299,00')).toBe(1299);
    expect(p('1,299.50')).toBe(1299.5);
    expect(p('1299')).toBe(1299);
    expect(p('29.99')).toBe(29.99);
    expect(p('€ 45')).toBe(45);
    expect(p('1.299')).toBe(1299);
  });

  it('sin precio, o con uno que no vale (0, negativo, texto), no hay campos de precio', () => {
    expect(parsePreview('<meta property="og:title" content="X">', BASE)).toEqual({ title: 'X', image: null, site: null });
    expect(parsePreview('<meta property="product:price:amount" content="0">', BASE)).not.toHaveProperty('price');
    expect(parsePreview('<meta property="product:price:amount" content="-5">', BASE)).not.toHaveProperty('price');
    expect(parsePreview('<meta property="product:price:amount" content="gratis">', BASE)).not.toHaveProperty('price');
  });

  it('un JSON-LD roto no rompe la lectura', () => {
    const html = '<meta property="og:title" content="X"><script type="application/ld+json">{no es json</script>';
    expect(parsePreview(html, BASE)).toEqual({ title: 'X', image: null, site: null });
  });

  it('una moneda que no son 3 letras se ignora, y sin moneda queda solo el precio', () => {
    expect(parsePreview('<meta property="product:price:amount" content="10"><meta property="product:price:currency" content="euros">', BASE)).toEqual({
      title: null,
      image: null,
      site: null,
      price: 10,
    });
  });
});
