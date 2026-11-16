import { describe, expect, it } from 'vitest';
import { appUrlFromEnv, telegramFromEnv } from '@/lib/telegram/env';

describe('telegramFromEnv', () => {
  it('con token y chat id configura el bot', () => {
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_CHAT_ID: '42' })).toEqual({ token: '1:abc', chatId: '42' });
  });

  it('sin uno de los dos, o en blanco, el bot no está configurado', () => {
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: '1:abc' })).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_CHAT_ID: '42' })).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: '  ', TELEGRAM_CHAT_ID: '42' })).toBeNull();
    expect(telegramFromEnv({})).toBeNull();
  });

  it('recorta espacios y saltos de línea de lo pegado en Vercel', () => {
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: ' 1:abc\n', TELEGRAM_CHAT_ID: '42 ' })).toEqual({ token: '1:abc', chatId: '42' });
  });
});

describe('appUrlFromEnv', () => {
  it('APP_URL manda', () => {
    expect(appUrlFromEnv({ APP_URL: 'https://mi-app.test/', VERCEL_PROJECT_PRODUCTION_URL: 'otra.vercel.app' })).toBe('https://mi-app.test');
  });

  it('en Vercel usa el dominio de producción que Vercel ya da (sin esquema)', () => {
    expect(appUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'mini-marc-personal.vercel.app' })).toBe('https://mini-marc-personal.vercel.app');
  });

  it('en local, localhost', () => {
    expect(appUrlFromEnv({})).toBe('http://localhost:3000');
  });
});
