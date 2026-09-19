import type { Subject } from '../../types';

interface SubjectGridProps {
  subjects: Subject[];
  onEdit: (subject: Subject) => void;
}

export function SubjectGrid({ subjects, onEdit }: SubjectGridProps) {
  if (subjects.length === 0) {
    return (
      <div className="border border-dashed border-outline-variant rounded-2xl py-14 px-4 flex flex-col items-center justify-center gap-2 text-center">
        <span className="material-symbols-outlined text-[22px] text-on-surface-variant opacity-60">layers</span>
        <p className="font-body-md text-body-md text-on-surface-variant">No subjects yet</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-lg:gap-2 max-lg:mt-[8px] relative">
      {subjects.map((subject) => {
        return (
          <div
            key={subject.id}
            onClick={() => onEdit(subject)}
            className="relative bg-surface-container-lowest border border-outline-variant hover:border-outline rounded-2xl p-5 max-lg:p-3 transition-colors flex items-center justify-between gap-4 cursor-pointer group"
          >
            <div className="flex items-center gap-4 max-lg:gap-3 min-w-0">
              <div
                className="w-3 h-3 max-lg:w-2.5 max-lg:h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: subject.color }}
              />
              <div className="min-w-0">
                <h3 className="font-body-lg text-body-lg max-lg:!text-[11px] max-lg:leading-tight text-on-surface font-medium truncate">{subject.name}</h3>
                <p className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant mt-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[11px] max-lg:text-[8px]">{subject.icon || 'school'}</span>
                  {subject.modules ?? 0} modules
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[16px] max-lg:text-[13px] text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all flex-shrink-0">
              chevron_right
            </span>
          </div>
        );
      })}
    </div>
  );
}
