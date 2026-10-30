import { useIsMobile } from '../../hooks/useIsMobile';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import type { Editor } from '@tiptap/react';
import { dayNoteRepo } from '../../services/repositories';
import { subscribeSync } from '../../services/serverSync';
import { useEscapeOverlay } from '../../services/overlays';

interface DayNotesPanelProps {
  /** Calendar day the note belongs to. Remount (key) per day. */
  date: Date;
  dateKey: string;
  /** Focus the editor (cursor at the end) once it is ready, then report back. */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** Read-only copy of a neighbouring day beside the page (phone SwipePager). */
  peek?: boolean;
  /**
   * Desktop: whether the note is open in full (formatting bar, scrolls
   * inside) or folded to its first lines. Owned by the page, which also
   * lays the side column out around it. Leave it out for the full note.
   */
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}

/** Idle time after the last keystroke before the note is written to the repo. */
const SAVE_DELAY_MS = 600;

interface ToolbarButton {
  /** Phone toolbar glyph (Material Symbols). */
  icon: string;
  label: string;
  title: string;
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const BUTTONS: ToolbarButton[] = [
  { label: 'B', icon: 'format_bold', title: 'Bold (Ctrl+B)', active: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'I', icon: 'format_italic', title: 'Italic (Ctrl+I)', active: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'S', icon: 'strikethrough_s', title: 'Strikethrough', active: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  { label: 'H1', icon: 'format_h1', title: 'Heading', active: (e) => e.isActive('heading', { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'H2', icon: 'format_h2', title: 'Subheading', active: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: '•', icon: 'format_list_bulleted', title: 'Bulleted list', active: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: '1.', icon: 'format_list_numbered', title: 'Numbered list', active: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: '☑', icon: 'checklist', title: 'Checklist', active: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: '❝', icon: 'format_quote', title: 'Quote', active: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: '</>', icon: 'code', title: 'Code block', active: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

/**
 * Per-day markdown note, edited WYSIWYG. The note is stored as markdown (so it
 * syncs as plain text) and autosaved shortly after typing stops, and again when
 * the panel goes away (day change, tab switch) so no keystroke is lost.
 */
export function DayNotesPanel({ date, dateKey, autoFocus, onAutoFocused, peek = false, expanded = true, onExpandedChange }: DayNotesPanelProps) {
  const isMobile = useIsMobile();
  // Markdown last seen in the repo for this day; the editor's own saves update
  // it, so only genuinely remote changes differ from it.
  const [initial] = useState(() => dayNoteRepo.getContent(dateKey));
  const savedRef = useRef(initial);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current);
    if (pendingRef.current === null) return;
    const md = pendingRef.current;
    pendingRef.current = null;
    savedRef.current = md;
    dayNoteRepo.set(dateKey, md);
  }, [dateKey]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      Placeholder.configure({ placeholder: 'Write a note for this day…' }),
    ],
    content: initial,
    contentType: 'markdown',
    editable: !peek,
    editorProps: {
      attributes: { class: 'note-editor outline-none', spellcheck: 'true' },
      // Escape leaves the note (saving it via onBlur), so the calendar's
      // keyboard shortcuts work again without clicking elsewhere.
      handleKeyDown: (view, e) => {
        if (e.key !== 'Escape') return false;
        (view.dom as HTMLElement).blur();
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      pendingRef.current = e.getMarkdown();
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    onBlur: flush,
  });

  // Pick up edits made on another device while this note is open and idle.
  useEffect(() => {
    if (!editor || peek) return;
    return subscribeSync(() => {
      const stored = dayNoteRepo.getContent(dateKey);
      if (stored === savedRef.current || pendingRef.current !== null || editor.isFocused) return;
      savedRef.current = stored;
      editor.commands.setContent(stored, { contentType: 'markdown' });
    });
  }, [editor, dateKey]);

  // I shortcut: start editing. Also covers a panel that mounts with the request.
  useEffect(() => {
    if (!editor || !autoFocus || peek) return;
    editor.commands.focus('end');
    onAutoFocused?.();
  }, [editor, autoFocus, onAutoFocused]);

  // Folded, the note shows its start, wherever editing left the scroll.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [expanded]);

  // Save on the way out; the editor's `onUpdate` timer would otherwise be lost.
  useEffect(() => flush, [flush]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? BUTTONS.map((b) => b.active(e)) : []),
  });
  // Lines of the note, for the folded card's "Show all · N lines".
  const lineCount = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? e.getMarkdown().split('\n').filter((l) => l.trim()).length : 0),
  }) ?? 0;

  const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Phone: the note fills the tab edge to edge, the formatting bar sits at
  // the bottom (above the keyboard while typing), one 44px icon per action.
  if (isMobile) {
    return (
      // No fade-in: a swipe remounts the panel for the new day, which must
      // show at once (the tab itself slides in).
      // While typing, the formatting bar rides on top of the keyboard
      // (.m-notes in index.css).
      <section aria-label={`Notes for ${dayLabel}`} className="m-notes flex flex-col min-h-0 flex-1">
        <div className="m-notes-body flex-1 min-h-0 overflow-y-auto cursor-text" style={{ padding: '12px 16px' }} onClick={() => editor?.commands.focus()}>
          <EditorContent editor={editor} />
        </div>
        {editor && (
          <div
            role="toolbar"
            aria-label="Formatting"
            className="m-notes-bar m-scx flex-none bg-surface-container-lowest border-t border-outline-variant"
            style={{ gap: 2, padding: '6px 8px' }}
          >
            {BUTTONS.map((b, i) => (
              <button
                key={b.title}
                type="button"
                aria-label={b.title.replace(/ \(.*\)$/, '')}
                aria-pressed={!!state[i]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => b.run(editor)}
                className={`m-ib ${state[i] ? 'bg-secondary-container !text-on-secondary-container' : '!text-on-surface'}`}
              >
                <span className="material-symbols-outlined m-ic">{b.icon}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  const open = () => {
    if (!expanded) onExpandedChange?.(true);
  };

  return (
    <section
      aria-label={`Notes for ${dayLabel}`}
      className={`bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 px-6 py-5 max-lg:p-4 flex flex-col gap-2 min-h-0 animate-fade-in ${
        expanded ? 'flex-[1.6_1_0]' : 'flex-none'
      }`}
    >
      {expanded && onExpandedChange && <EscapeToCollapse onCollapse={onExpandedChange} editor={editor} />}
      <div className="flex items-center gap-3 flex-none">
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tracking-[0.16em]">
          Notes
        </h2>
        <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant/70 tracking-[0.14em] mr-auto">
          {dayLabel}
        </span>
        {onExpandedChange && (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse the note' : 'Open the whole note'}
            title={expanded ? 'Collapse (Esc)' : 'Open the whole note (Shortcut: I)'}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">{expanded ? 'close_fullscreen' : 'open_in_full'}</span>
          </button>
        )}
      </div>

      {editor && expanded && (
        <div className="flex gap-0.5 pb-2 border-b border-outline-variant flex-none" role="toolbar" aria-label="Formatting">
          {BUTTONS.map((b, i) => (
            <button
              key={b.title}
              type="button"
              title={b.title}
              aria-label={b.title.replace(/ \(.*\)$/, '')}
              aria-pressed={!!state[i]}
              // Keep the selection: a click must not blur the editor first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => b.run(editor)}
              className={`flex-1 min-w-0 h-7 flex items-center justify-center rounded-lg transition-colors ${
                state[i]
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[17px] leading-none">{b.icon}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={bodyRef}
        className={expanded ? 'flex-1 min-h-0 overflow-y-auto cursor-text' : 'note-folded max-h-[4.5rem] overflow-hidden cursor-text'}
        onClick={() => {
          if (expanded) editor?.commands.focus();
          else open();
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {!expanded && lineCount > 0 && (
        <button
          type="button"
          onClick={open}
          title="Show the whole note (Shortcut: I)"
          className="flex-none self-start flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Show all · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          <span className="material-symbols-outlined text-[14px] leading-none">expand_more</span>
        </button>
      )}
    </section>
  );
}

/**
 * While mounted, Escape folds the note (via the shared overlay stack, so a
 * window opened over it closes first) and leaves the editor, which saves.
 * Not modal: the page's shortcuts stay on while the note is open.
 */
function EscapeToCollapse({ onCollapse, editor }: { onCollapse: (open: boolean) => void; editor: Editor | null }) {
  // A stable callback: re-registering would move the note above windows
  // opened after it.
  const latest = useRef({ onCollapse, editor });
  useEffect(() => {
    latest.current = { onCollapse, editor };
  });
  const collapse = useCallback(() => {
    (latest.current.editor?.view.dom as HTMLElement | undefined)?.blur();
    latest.current.onCollapse(false);
  }, []);
  useEscapeOverlay(collapse, false);
  return null;
}
