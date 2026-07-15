import { useState } from 'react';
import type { SearchResponse, SearchResultItem } from '../api/types';
import { EntityTypeIcon } from './icons';

export interface ResultsProps {
  data: SearchResponse;
  onResultClick: (item: SearchResultItem, rank: number) => void;
  onEntityClick?: (text: string) => void;
}

// How many entity chips to show before the "+N more" expander.
const ENTITY_LIMIT = 7;

// spaCy entity labels -> friendly, human-readable group names.
const ENTITY_LABELS: Record<string, string> = {
  ORG: 'Organizations',
  PERSON: 'People',
  GPE: 'Places',
  LOC: 'Locations',
  NORP: 'Groups',
  PRODUCT: 'Products',
  EVENT: 'Events',
  FAC: 'Facilities',
  WORK_OF_ART: 'Works',
  LAW: 'Laws',
  LANGUAGE: 'Languages',
  DATE: 'Dates',
  TIME: 'Times',
  MONEY: 'Amounts',
  PERCENT: 'Percentages',
  QUANTITY: 'Quantities',
  CARDINAL: 'Numbers',
  ORDINAL: 'Ordinals',
};

// Named entities first (most useful), quantitative labels last.
const ENTITY_ORDER = [
  'ORG', 'PERSON', 'GPE', 'LOC', 'NORP', 'PRODUCT', 'EVENT', 'FAC',
  'WORK_OF_ART', 'LAW', 'LANGUAGE', 'DATE', 'TIME', 'MONEY', 'QUANTITY',
  'PERCENT', 'CARDINAL', 'ORDINAL',
];

function entityLabel(label: string): string {
  return ENTITY_LABELS[label] ?? label.charAt(0) + label.slice(1).toLowerCase();
}

interface EntityChip {
  label: string;
  text: string;
}

// Flatten the typed entity map into a single ordered list of chips, keeping
// type order (named entities first) and de-duplicating repeated names.
function flattenEntities(map: Record<string, string[]>): EntityChip[] {
  const rank = (label: string): number => {
    const i = ENTITY_ORDER.indexOf(label);
    return i < 0 ? ENTITY_ORDER.length : i;
  };
  const labels = Object.keys(map)
    .filter((label) => Array.isArray(map[label]) && map[label].length > 0)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const seen = new Set<string>();
  const chips: EntityChip[] = [];
  for (const label of labels) {
    for (const text of map[label]) {
      const key = `${label}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ label, text });
    }
  }
  return chips;
}

function ResultEntities({
  entitiesByType,
  onEntityClick,
}: {
  entitiesByType: Record<string, string[]>;
  onEntityClick?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chips = flattenEntities(entitiesByType);
  if (chips.length === 0) return null;

  const shown = expanded ? chips : chips.slice(0, ENTITY_LIMIT);
  const hidden = chips.length - shown.length;

  return (
    <div className="es-entities" aria-label="Entities">
      {shown.map(({ label, text }) => {
        const title = `${entityLabel(label)}: ${text}`;
        const inner = (
          <>
            <span className="es-entity-icon">
              <EntityTypeIcon label={label} />
            </span>
            <span className="es-entity-text">{text}</span>
          </>
        );
        return onEntityClick ? (
          <button
            key={`${label}:${text}`}
            type="button"
            className="es-entity"
            title={`${title} · click to search`}
            onClick={() => onEntityClick(text)}
          >
            {inner}
          </button>
        ) : (
          <span key={`${label}:${text}`} className="es-entity" title={title}>
            {inner}
          </span>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          className="es-entity es-entity-more"
          onClick={() => setExpanded(true)}
        >
          +{hidden} more
        </button>
      )}
      {expanded && chips.length > ENTITY_LIMIT && (
        <button
          type="button"
          className="es-entity es-entity-more"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      )}
    </div>
  );
}

export function Results({ data, onResultClick, onEntityClick }: ResultsProps) {
  if (data.total === 0) {
    return <div className="es-state">No results for “{data.query}”.</div>;
  }

  return (
    <div>
      {data.degraded && (
        <p className="es-degraded" role="status">
          Showing partial results — semantic ranking is temporarily unavailable.
        </p>
      )}
      <p className="es-meta">
        {data.total.toLocaleString()} result{data.total === 1 ? '' : 's'} · {data.took_ms} ms
      </p>
      <ul className="es-results">
        {data.results.map((item, i) => {
          const rank = (data.page - 1) * data.size + i + 1;
          return (
            <li key={item.id} className="es-result">
              <h3 className="es-result-title">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onResultClick(item, rank)}
                  >
                    {item.title ?? item.url}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="es-linklike"
                    onClick={() => onResultClick(item, rank)}
                  >
                    {item.title ?? item.id}
                  </button>
                )}
              </h3>
              {item.url && <div className="es-result-url">{item.url}</div>}
              {item.snippet && <p className="es-result-snippet">{item.snippet}</p>}
              {(item.source || (item.tags && item.tags.length > 0)) && (
                <div className="es-tags">
                  {item.source && <span className="es-source">{item.source}</span>}
                  {(item.tags ?? []).map((tag) => (
                    <span key={tag} className="es-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {item.entitiesByType && (
                <ResultEntities
                  entitiesByType={item.entitiesByType}
                  onEntityClick={onEntityClick}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
