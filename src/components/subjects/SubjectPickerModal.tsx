import type { Subject } from '../../types';

interface SubjectPickerModalProps {
  subjects: Subject[];
  onSelect: (subjectId: string) => void;
  onClose: () => void;
}

export function SubjectPickerModal({ subjects, onSelect, onClose }: SubjectPickerModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim animate-fade-in" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:p-5 shadow-elev-3 w-full max-w-sm mx-4 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md max-lg:!text-[12px] max-lg:mb-3 text-on-surface mb-5">Select Subject</h2>
        <div className="flex flex-col gap-1.5">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className="flex items-center gap-4 max-lg:gap-3 px-4 py-3 max-lg:p-2.5 rounded-xl border border-transparent hover:border-outline-variant hover:bg-surface-container transition-colors text-left"
            >
              <div className="w-3 h-3 max-lg:w-2.5 max-lg:h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
              <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface">{subject.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-5 max-lg:mt-4 w-full py-2.5 max-lg:py-2 max-lg:!text-[8px] border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
