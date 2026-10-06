import { useState } from 'react';
import type { Subject } from '../../types';
import { SUBJECT_COLORS as COLORS, SUBJECT_COLOR_GROUPS as COLOR_GROUPS } from '../../utils/color';
import { useEscapeOverlay } from '../../services/overlays';

interface SubjectFormProps {
  subject: Subject | null;
  onSave: (data: { name: string; color: string }) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export function SubjectForm({ subject, onSave, onCancel, onDelete }: SubjectFormProps) {
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || COLORS[0].value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave({ name: name.trim(), color });
    }
  };

  useEscapeOverlay(onCancel);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:p-5 shadow-elev-3 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 max-lg:mb-4">
          <h2 className="font-headline-md text-headline-md max-lg:!text-[13px] text-on-surface">
            {subject ? 'Edit Subject' : 'Add Subject'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-lg:gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Subject name"
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:py-2 max-lg:px-3 font-body-md text-body-md max-lg:!text-[10px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Color
            </label>
            <div className="flex flex-col gap-3">
              {COLOR_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2.5">
                    {group.colors.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        aria-label={c.label}
                        aria-pressed={color === c.value}
                        className={`w-8 h-8 max-lg:w-7 max-lg:h-7 rounded-full transition-transform ${
                          color === c.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest scale-110' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-3 max-lg:py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md max-lg:!text-[10px] uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
          >
            {subject ? 'Save subject' : 'Add subject'}
          </button>
          {subject && onDelete && (
            <div className="border-t border-outline-variant pt-4">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] mb-2">
                Danger zone
              </p>
              <button
                type="button"
                onClick={() => onDelete(subject.id)}
                className="font-body-md text-body-md max-lg:!text-[10px] text-error hover:opacity-80 transition-opacity"
              >
                Delete subject
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
