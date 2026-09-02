import type { Subject } from '../../types';

interface SubjectPickerModalProps {
  subjects: Subject[];
  onSelect: (subjectId: string) => void;
  onClose: () => void;
}

export function SubjectPickerModal({ subjects, onSelect, onClose }: SubjectPickerModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl p-8 max-lg:p-5 shadow-xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md max-lg:!text-[14px] max-lg:mb-3 text-on-surface mb-6">Select Subject</h2>
        <div className="flex flex-col gap-2">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className="flex items-center gap-4 max-lg:gap-2 p-4 max-lg:p-2 rounded hover:bg-surface-container transition-colors text-left"
            >
              <div className="w-3 h-3 max-lg:w-2 max-lg:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
              <span className="font-body-md text-body-md max-lg:!text-[13px] text-on-surface">{subject.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-6 max-lg:mt-4 w-full py-2 max-lg:py-1.5 max-lg:!text-[10px] border border-outline-variant rounded font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors uppercase tracking-widest"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
