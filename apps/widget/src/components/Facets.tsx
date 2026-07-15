import type { FacetBucket, FacetConfig } from '../api/types';

export interface FacetsProps {
  configs: FacetConfig[];
  facets: Record<string, FacetBucket[]>;
  selected: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
}

export function Facets({ configs, facets, selected, onToggle }: FacetsProps) {
  const groups = configs.filter((c) => (facets[c.field]?.length ?? 0) > 0);
  if (groups.length === 0) return null;

  return (
    <div className="es-facets" aria-label="Filters">
      {groups.map((cfg) => (
        <div className="es-facet-group" key={cfg.field}>
          <p className="es-facet-title">{cfg.label}</p>
          <ul className="es-facet-list">
            {facets[cfg.field].map((bucket) => {
              const checked = (selected[cfg.field] ?? []).includes(bucket.value);
              return (
                <li key={bucket.value}>
                  <label className="es-facet-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(cfg.field, bucket.value)}
                    />
                    <span>{bucket.value}</span>
                    <span className="es-facet-count">{bucket.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
