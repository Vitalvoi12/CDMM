interface SettingsNavProps {
  active: string;
  onChange: (section: string) => void;
}

const sections = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account' },
  { id: 'study-preferences', label: 'Study Preferences' },
  { id: 'notifications', label: 'Notifications' },
];

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            onClick={() => onChange(section.id)}
            className={`font-label-md text-[12px] leading-[16px] uppercase tracking-[0.1em] transition-colors py-3 px-5 rounded-xl flex justify-between items-center text-left ${
              isActive
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low group'
            }`}
          >
            {section.label}
            <span
              className={`material-symbols-outlined text-[14px] transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              arrow_forward
            </span>
          </button>
        );
      })}
    </nav>
  );
}
