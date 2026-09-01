interface SettingsNavProps {
  active: string;
  onChange: (section: string) => void;
}

const sections = [
  { id: 'general', label: 'General' },
  { id: 'study-preferences', label: 'Study Preferences' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'notifications', label: 'Notifications' },
];

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav className="flex flex-col gap-2">
      {sections.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            onClick={() => onChange(section.id)}
            className={`font-label-md text-label-md transition-colors py-2 pr-md border-b flex justify-between items-center text-left ${
              isActive
                ? 'text-primary border-primary'
                : 'text-on-surface-variant hover:text-primary border-surface-variant group'
            }`}
          >
            {section.label}
            <span
              className={`material-symbols-outlined text-[16px] transition-opacity ${
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
