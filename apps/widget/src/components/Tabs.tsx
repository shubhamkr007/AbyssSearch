import type { TabConfig } from '../api/types';

export interface TabsProps {
  tabs: TabConfig[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  if (tabs.length <= 1) return null;
  return (
    <div className="es-tabs" role="tablist" aria-label="Result categories">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className="es-tab"
          role="tab"
          type="button"
          aria-selected={tab.key === active}
          tabIndex={tab.key === active ? 0 : -1}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
