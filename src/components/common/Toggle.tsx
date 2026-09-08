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
      className={`flex items-center justify-between w-full px-4 py-3 rounded border transition-colors ${
        checked
          ? 'border-primary bg-surface-container'
          : 'border-outline-variant bg-surface-container-lowest hover:border-outline'
      }`}
    >
      <span className="font-label-md text-label-md text-on-surface">{label}</span>
      <span
        className={`material-symbols-outlined text-[20px] ${checked ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        {checked ? 'toggle_on' : 'toggle_off'}
      </span>
    </button>
  );
}
