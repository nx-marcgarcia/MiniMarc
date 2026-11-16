'use client';

import { useState, useTransition } from 'react';
import { setNotifications } from '@/app/actions/settings';
import { InsetList, Row, Switch } from '@/components/ui';
import { settle } from '@/lib/actions/result';

export type AvisosSectionProps = {
  notifyPush: boolean;
  notifyTelegram: boolean;
  skipHolidays: boolean;
  reminderTimes: string[];
  /** The bot token and chat id are set on the server; without them Telegram cannot be turned on. */
  telegramConfigured: boolean;
};

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/**
 * Ajustes → "Avisos": where the brain may speak (Telegram, the browser) and when. Everything goes out
 * Monday to Friday, 9:00 to 16:00, except a task with an exact time; the three reminders are the only
 * hours to choose, and holidays are skipped by default.
 */
export function AvisosSection(props: AvisosSectionProps) {
  const [push, setPush] = useState(props.notifyPush);
  const [telegram, setTelegram] = useState(props.notifyTelegram && props.telegramConfigured);
  const [holidays, setHolidays] = useState(props.skipHolidays);
  const [times, setTimes] = useState(props.reminderTimes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Applies the change at once and puts `undo` back if the server refuses. */
  function save(patch: Record<string, unknown>, undo: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await settle(() => setNotifications(patch), OFFLINE);
      if (!r.ok) {
        undo();
        setError(r.error);
      }
    });
  }

  function changeTime(index: number, value: string) {
    if (!value) return;
    const previous = times;
    const next = times.map((t, i) => (i === index ? value : t));
    setTimes(next);
    save({ reminderTimes: [...new Set(next)].sort() }, () => setTimes(previous));
  }

  return (
    <InsetList
      header="Avisos"
      footer={
        error ??
        (props.telegramConfigured
          ? 'Solo de lunes a viernes, de 9:00 a 16:00. Lo que toque fuera de ahí espera al siguiente hueco. Una tarea con hora exacta avisa a su hora.'
          : 'Para activar Telegram hacen falta TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel (docs/despliegue.md). Solo de lunes a viernes, de 9:00 a 16:00; una tarea con hora exacta avisa a su hora.')
      }
    >
      <Row
        title="Telegram"
        trailing={
          <Switch
            label="Telegram"
            checked={telegram}
            disabled={!props.telegramConfigured || pending}
            onChange={(v) => {
              setTelegram(v);
              save({ notifyTelegram: v }, () => setTelegram(!v));
            }}
          />
        }
      />
      <Row
        title="Notificaciones del navegador"
        trailing={
          <Switch
            label="Notificaciones del navegador"
            checked={push}
            disabled={pending}
            onChange={(v) => {
              setPush(v);
              save({ notifyPush: v }, () => setPush(!v));
            }}
          />
        }
      />
      {times.map((t, i) => (
        <Row
          key={i}
          title={`Recordatorio ${i + 1}`}
          trailing={
            <input
              className="app-select"
              type="time"
              aria-label={`Recordatorio ${i + 1}`}
              value={t}
              min="09:00"
              max="15:59"
              disabled={pending}
              onChange={(e) => changeTime(i, e.target.value)}
            />
          }
        />
      ))}
      <Row
        title="Saltar festivos"
        subtitle="Nacionales y de la Comunidad Valenciana"
        trailing={
          <Switch
            label="Saltar festivos"
            checked={holidays}
            disabled={pending}
            onChange={(v) => {
              setHolidays(v);
              save({ skipHolidays: v }, () => setHolidays(!v));
            }}
          />
        }
      />
    </InsetList>
  );
}
