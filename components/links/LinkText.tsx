'use client';

import { Fragment } from 'react';
import { linkify } from '@/lib/links/linkify';

/**
 * Text with its http(s) URLs as links, shown shortened ("amazon.es/…"). React text nodes and
 * <a> only (never HTML). `links={false}` for text inside another link or button: the URLs are
 * still shortened but not clickable (an <a> cannot live inside an <a> or a <button>).
 */
export function LinkText({ text, links = true }: { text: string; links?: boolean }) {
  return (
    <>
      {linkify(text).map((s, i) =>
        s.kind === 'text' ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : links ? (
          <a
            key={i}
            className="app-link"
            href={s.href}
            // Web links open aside; a mail or a call hands over to the system's app.
            {...(s.kind === 'link' && { target: '_blank', rel: 'noopener noreferrer', title: s.href })}
            onClick={(e) => e.stopPropagation()}
          >
            {s.text}
          </a>
        ) : (
          <span key={i} className="app-link app-link--inert">
            {s.text}
          </span>
        ),
      )}
    </>
  );
}
