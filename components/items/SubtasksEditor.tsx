'use client';

import { useState } from 'react';
import { InsetList } from '@/components/ui';
import { addSubtask, removeSubtask, toggleSubtask, type Subtask } from '@/lib/subtasks';

/**
 * The subtasks of a task inside its sheet: tick, add (Enter adds, it does not save the sheet) and
 * remove. The list travels with the form as JSON in a hidden field (`subtasks`).
 */
export function SubtasksEditor({ initial }: { initial: Subtask[] }) {
  const [list, setList] = useState<Subtask[]>(initial);
  const [draft, setDraft] = useState('');

  function add() {
    setList((l) => addSubtask(l, draft));
    setDraft('');
  }

  return (
    <InsetList header="Subtareas">
      <input type="hidden" name="subtasks" value={JSON.stringify(list)} />
      {list.map((s, i) => (
        <div key={s.title} className="ui-row app-subtask">
          <label className="app-subtask__label">
            <input type="checkbox" checked={s.done} onChange={() => setList((l) => toggleSubtask(l, i))} aria-label={s.title} />
            <span data-done={s.done || undefined}>{s.title}</span>
          </label>
          <button type="button" className="ui-bar-button" aria-label={`Quitar «${s.title}»`} onClick={() => setList((l) => removeSubtask(l, i))}>
            Quitar
          </button>
        </div>
      ))}
      <input
        className="app-input"
        aria-label="Nueva subtarea"
        placeholder="Añadir subtarea"
        value={draft}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          add();
        }}
      />
    </InsetList>
  );
}
