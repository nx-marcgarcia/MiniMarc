// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { LinkText } from '@/components/links/LinkText';
import { renderScreen } from './setup';

test('un correo, un teléfono y una web son enlaces pulsables; los dos primeros no abren pestaña nueva', () => {
  renderScreen(<LinkText text="Escribir a webmaster@gamesuniversal.es o llamar al 961 234 567 y ver https://funko.es/oferta" />);
  const mail = screen.getByRole('link', { name: 'webmaster@gamesuniversal.es' });
  expect(mail.getAttribute('href')).toBe('mailto:webmaster@gamesuniversal.es');
  expect(mail.getAttribute('target')).toBeNull();
  const tel = screen.getByRole('link', { name: '961 234 567' });
  expect(tel.getAttribute('href')).toBe('tel:961234567');
  expect(tel.getAttribute('target')).toBeNull();
  const web = screen.getByRole('link', { name: 'funko.es/oferta' });
  expect(web.getAttribute('href')).toBe('https://funko.es/oferta');
  expect(web.getAttribute('target')).toBe('_blank');
  expect(web.getAttribute('rel')).toBe('noopener noreferrer');
});

test('dentro de otro enlace o botón no son enlaces (no se anidan <a>)', () => {
  renderScreen(<LinkText links={false} text="a x@y.es 600 000 000" />);
  expect(screen.queryAllByRole('link')).toEqual([]);
  expect(screen.getByText('x@y.es')).toBeTruthy();
});
