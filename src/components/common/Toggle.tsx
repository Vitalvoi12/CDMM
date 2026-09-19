interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-colors ${
        checked
          ? 'border-outline bg-surface-container'
          : 'border-outline-variant bg-surface-container-low hover:border-outline'
      }`}
    >
      <span className="font-label-md text-label-md text-on-surface uppercase tracking-[0.1em]">{label}</span>
      <span
        className={`material-symbols-outlined text-[18px] ${checked ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        {checked ? 'toggle_on' : 'toggle_off'}
      </span>
    </button>
  );
}
