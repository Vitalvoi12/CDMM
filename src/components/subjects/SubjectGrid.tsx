import type { Subject } from '../../types';

interface SubjectGridProps {
  subjects: Subject[];
  onEdit: (subject: Subject) => void;
}

export function SubjectGrid({ subjects, onEdit }: SubjectGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-lg:gap-2 relative">
      <div className="absolute -inset-4 bg-gradient-to-br from-surface-container to-transparent opacity-50 pointer-events-none rounded-xl" />
      {subjects.map((subject) => {
        const progress = subject.progress || 0;
        return (
          <div
            key={subject.id}
            onClick={() => onEdit(subject)}
            className="relative bg-surface-container-lowest rounded-xl p-6 max-lg:p-3 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group cursor-pointer overflow-hidden z-10"
          >
            <div
              className="absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out"
              style={{ backgroundColor: `${subject.color}0d` }}
            />
            <div className="flex items-center gap-6 max-lg:gap-3 relative z-10">
              <div
                className="w-3 h-3 max-lg:w-2 max-lg:h-2 rounded-full shadow-sm group-hover:scale-125 transition-transform duration-300"
                style={{ backgroundColor: subject.color }}
              />
              <div>
                <h3 className="font-headline-md text-headline-md max-lg:!text-[13px] max-lg:leading-tight text-on-surface">{subject.name}</h3>
                <p className="font-body-sm text-body-sm max-lg:!text-[10px] max-lg:mt-0 text-on-surface-variant mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] max-lg:text-[10px]">{subject.icon || 'school'}</span>
                  {subject.modules} modules
                </p>
              </div>
            </div>
            <div className="relative w-12 h-12 max-lg:w-7 max-lg:h-7 z-10">
              <svg className="w-full h-full transform -rotate-90 text-surface-container-high" viewBox="0 0 36 36">
                <path
                  className="stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="3"
                />
                <path
                  className="drop-shadow-sm"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={subject.color}
                  strokeDasharray={`${progress}, 100`}
                  strokeWidth="3"
                />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
