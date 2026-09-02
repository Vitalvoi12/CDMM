import { useState, useCallback } from 'react';
import { settingsRepo } from '../services/repositories';
import { useTheme } from '../hooks/useTheme';
import { SettingsNav } from '../components/settings/SettingsNav';
import { CalDavForm } from '../components/settings/CalDavForm';
import type { UserSettings, ThemeMode } from '../types';

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text' },
  { value: 'dark', label: 'Dark', hint: 'Deep surfaces, light text' },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(settingsRepo.get());
  const [activeSection, setActiveSection] = useState('integrations');
  const { theme, setTheme } = useTheme();

  const handleSave = useCallback(
    (data: Partial<UserSettings>) => {
      const updated = settingsRepo.update(data);
      setSettings(updated);
    },
    []
  );

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="grid grid-cols-12 gap-6 relative">
        <div className="col-span-12 lg:col-span-3 mb-8 lg:mb-0">
          <div className="sticky top-[112px]">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-6">Settings</h2>
            <SettingsNav active={activeSection} onChange={setActiveSection} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5">
          {activeSection === 'integrations' && (
            <>
              <div className="mb-16 flex flex-col gap-2">
                <h1 className="font-display-lg text-display-lg text-on-background">Integrations</h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                  Manage external services connected to StudyCore.
                </p>
              </div>
              <CalDavForm settings={settings} onSave={handleSave} />
            </>
          )}
          {activeSection === 'general' && (
            <div className="mb-16 flex flex-col gap-2">
              <h1 className="font-display-lg text-display-lg text-on-background">General</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                General application settings.
              </p>
              <div className="mt-8 bg-surface-container-lowest border border-outline-variant rounded p-8 flex flex-col gap-8 max-w-xl">
                <div className="flex flex-col gap-4">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Appearance
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {THEME_OPTIONS.map((option) => {
                      const isSelected = theme === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTheme(option.value)}
                          aria-pressed={isSelected}
                          className={`flex flex-col items-start gap-1 p-4 rounded border text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-surface-container'
                              : 'border-outline-variant hover:border-outline bg-surface-container-lowest'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
                            <span
                              className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}
                            >
                              {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                            </span>
                            {option.label}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant pl-[26px]">
                            {option.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Daily Study Goal
                  </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={Math.floor(settings.dailyGoalMinutes / 60)}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          const m = settings.dailyGoalMinutes % 60;
                          handleSave({ dailyGoalMinutes: h * 60 + m });
                        }}
                        className="w-20 bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                      />
                      <span className="font-body-md text-body-md text-on-surface-variant">h</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={settings.dailyGoalMinutes % 60}
                        onChange={(e) => {
                          const m = Number(e.target.value);
                          const h = Math.floor(settings.dailyGoalMinutes / 60);
                          handleSave({ dailyGoalMinutes: h * 60 + m });
                        }}
                        className="w-20 bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                      />
                      <span className="font-body-md text-body-md text-on-surface-variant">min</span>
                    </div>
                </div>
              </div>
            </div>
          )}
          {(activeSection === 'study-preferences' || activeSection === 'notifications') && (
            <div className="mb-16 flex flex-col gap-2">
              <h1 className="font-display-lg text-display-lg text-on-background capitalize">
                {activeSection.replace('-', ' ')}
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Coming soon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
