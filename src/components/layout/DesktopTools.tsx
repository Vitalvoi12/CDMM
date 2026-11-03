import { useDialogResize } from '../../hooks/useDialogResize';
import { useSheetExit } from '../../hooks/useSheetExit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { dayNoteRepo, dayTaskRepo, eventRepo, subjectRepo, todoRepo } from '../../services/repositories';
import { useEscapeOverlay } from '../../services/overlays';
import { GROUPS, SHORTCUTS, keyLabel, shortcutKeys, useShortcutSettings } from '../../services/shortcuts';
import { dateKey } from '../../utils/time';

export type DesktopTool = 'help' | 'search' | 'date';
interface Result { id: string; title: string; detail: string; path: string; state?: Record<string, unknown> }

/** Shared desktop keyboard help, local search and date picker. */
export function DesktopTools({ mode, onClose }: { mode: DesktopTool; onClose: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settings = useShortcutSettings();
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(dateKey(new Date()));
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  useSheetExit(overlay, root);
  useEscapeOverlay(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = root.current;
    (el?.querySelector<HTMLElement>('input') ?? el?.querySelector<HTMLElement>('button') ?? el)?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLocaleLowerCase();
    if (mode !== 'search' || !q) return [];
    const subjects = new Map(subjectRepo.getAll().map(s => [s.id, s.name]));
    const all: Result[] = [
      ...eventRepo.getAll().map(e => ({ id: `event:${e.id}`, title: `${subjects.get(e.subjectId) || e.title}${e.description ? ` · ${e.description}` : ''}`, detail: `Event · ${new Date(e.start).toLocaleString()}`, path: '/', state: { selectedDate: new Date(e.start).getTime(), eventId: e.id } })),
      ...dayTaskRepo.getAll().flatMap(l => l.tasks.map(t => ({ id: `task:${t.id}`, title: t.text, detail: `Checklist · ${subjects.get(t.subjectId) || 'No subject'} · ${l.id}${t.done ? ' · Done' : ''}`, path: '/', state: { selectedDate: new Date(`${l.id}T12:00:00`).getTime() } }))),
      ...todoRepo.getAll().map(t => ({ id: `todo:${t.id}`, title: t.title, detail: `Todo${t.completed ? ' · Done' : ''}${t.description ? ` · ${t.description}` : ''}`, path: '/todo', state: { taskId: t.id } })),
      ...dayNoteRepo.getAll().map(n => ({ id: `note:${n.id}`, title: n.content, detail: `Notes · ${n.id}`, path: '/', state: { selectedDate: new Date(`${n.id}T12:00:00`).getTime(), openNotes: true } })),
      ...subjectRepo.getAll().map(s => ({ id: `subject:${s.id}`, title: s.name, detail: 'Subject', path: '/subjects' })),
    ];
    return all.filter(r => `${r.title} ${r.detail}`.toLocaleLowerCase().includes(q)).slice(0, 60);
  }, [mode, query]);
  useDialogResize(root, `${mode}:${results.map(result => result.id).join(',')}`);
  const open = (result: Result) => { onClose(); navigate(result.path, { state: result.state }); };

  return createPortal(
    <div ref={overlay} className="overlay-root z-[150] bg-scrim flex items-center justify-center p-6" onClick={onClose}>
      <div ref={root} role="dialog" aria-modal="true" aria-label={mode === 'help' ? 'Keyboard shortcuts' : mode === 'date' ? 'Go to date' : 'Search CDMM'} tabIndex={-1}
        className="animate-pop-in bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-elev-3 w-full max-w-2xl max-h-[85vh] flex flex-col gap-4 outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key !== 'Tab') return;
          const items = Array.from(root.current?.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]') ?? []).filter(el => !el.hasAttribute('disabled'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          if (!items.length) { e.preventDefault(); return; }
          if (e.shiftKey && index <= 0) { e.preventDefault(); items.at(-1)?.focus(); }
          else if (!e.shiftKey && (index === items.length - 1 || index < 0)) { e.preventDefault(); items[0].focus(); }
        }}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-heading text-on-surface">{mode === 'help' ? 'Keyboard shortcuts' : mode === 'date' ? 'Go to date' : 'Search CDMM'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-on-surface-variant px-2 py-1 rounded-lg hover:bg-surface-container">Esc ×</button>
        </div>
        {mode === 'date' && <form className="flex gap-3" onSubmit={e => { e.preventDefault(); if (!day) return; onClose(); navigate('/', { state: { selectedDate: new Date(`${day}T12:00:00`).getTime() } }); }}>
          <input type="date" aria-label="Date" required value={day} onChange={e => setDay(e.target.value)} className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface" />
          <button type="submit" className="bg-primary text-on-primary rounded-xl px-5">Go</button>
        </form>}
        {mode === 'search' && <>
          <input type="search" aria-label="Search tasks, events, subjects and notes" placeholder="Tasks, events, subjects, notes…" value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            aria-controls="desktop-search-results"
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = results.length ? (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0;
                setActive(next);
                root.current?.querySelector(`[data-search-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
              } else if (e.key === 'Enter' && results[active]) { e.preventDefault(); open(results[active]); }
            }} className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface outline-none focus:border-primary" />
          <div id="desktop-search-results" className="overflow-y-auto min-h-0 flex flex-col gap-1">
            {results.map((r, i) => <button key={r.id} type="button" data-search-index={i} onClick={() => open(r)} onFocus={() => setActive(i)}
              className={`desktop-result-in text-left rounded-xl px-4 py-3 ${i === active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface hover:bg-surface-container'}`}>
              <span className="block truncate">{r.title}</span><span className="block text-meta opacity-70 truncate">{r.detail}</span>
            </button>)}
            <p className="text-meta text-on-surface-variant px-4 py-2">{query.trim() ? results.length ? '↑ / ↓ to select · Enter to open' : 'No results' : 'Search data saved on this device.'}</p>
          </div>
        </>}
        {mode === 'help' && <div className="overflow-y-auto min-h-0 flex flex-col gap-5">
          <p className="text-meta text-on-surface-variant">Single-key shortcuts stay off while typing. Task and event commands require keyboard focus. Tab moves between controls; J / K move within a list.</p>
          {GROUPS.filter(g => g.id === 'global' || g.id === 'builtin' || (pathname === '/' && g.id === 'calendar') || (pathname === '/todo' && g.id === 'todo')).map(g => <section key={g.id}>
            <h3 className="text-section text-on-surface mb-2">{g.title}</h3>
            {SHORTCUTS.filter(s => s.group === g.id).map(s => <div key={s.id} className="flex gap-4 justify-between py-1.5 text-meta text-on-surface">
              <span>{s.label}{s.hint && <span className="block text-on-surface-variant">{s.hint}</span>}</span>
              <span className="shrink-0 text-on-surface-variant">{s.fixed ? s.defaults.map(c => c.map(keyLabel).join(' + ')).join(' / ') : shortcutKeys(s.id, settings).map(keyLabel).join(' / ') || '—'}</span>
            </div>)}
          </section>)}
          <button type="button" onClick={() => { onClose(); navigate('/settings?section=shortcuts'); }} className="text-primary text-left">Customize shortcuts →</button>
        </div>}
      </div>
    </div>, document.body
  );
}
