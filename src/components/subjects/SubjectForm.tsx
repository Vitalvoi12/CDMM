import { useState } from 'react';
import type { Subject } from '../../types';

const COLORS = [
  { value: '#111111', label: 'Black' },
  { value: '#3f51b5', label: 'Indigo' },
  { value: '#00897b', label: 'Teal' },
  { value: '#d32f2f', label: 'Red' },
  { value: '#f57c00', label: 'Orange' },
  { value: '#7b1fa2', label: 'Purple' },
  { value: '#0277bd', label: 'Blue' },
  { value: '#2e7d32', label: 'Green' },
  { value: '#c2185b', label: 'Pink' },
  { value: '#5d4037', label: 'Brown' },
  { value: '#455a64', label: 'Blue Grey' },
  { value: '#00838f', label: 'Cyan' },
];

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim" onClick={onCancel}>
      <div
        className="bg-surface-container-lowest rounded-xl p-8 max-lg:p-5 shadow-xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md max-lg:!text-[14px] max-lg:mb-3 text-on-surface mb-6">
          {subject ? 'Edit Subject' : 'Add Subject'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-lg:gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md max-lg:!text-[10px] text-on-surface-variant uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Subject name"
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 max-lg:py-1.5 max-lg:px-3 font-body-md text-body-md max-lg:!text-[12px] text-on-surface outline-none transition-colors"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md max-lg:!text-[10px] text-on-surface-variant uppercase tracking-wider">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 max-lg:w-6 max-lg:h-6 rounded-full transition-all ${
                    color === c.value ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-4 max-lg:gap-2 mt-2">
            {subject && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(subject.id)}
                className="px-4 py-2 max-lg:px-3 max-lg:py-1.5 max-lg:!text-[10px] bg-error-container text-on-error-container rounded font-label-md text-label-md uppercase tracking-widest hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 max-lg:py-1.5 max-lg:!text-[10px] border border-outline-variant rounded font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 max-lg:py-1.5 max-lg:!text-[10px] bg-primary text-on-primary rounded font-label-md text-label-md uppercase tracking-widest hover:bg-tertiary-container transition-colors"
            >
              {subject ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
