import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type CSSProperties, type KeyboardEvent, useId, useMemo, useState } from 'react';

import { FakeApiClient } from './api/fake';
import { HttpApiClient } from './api/http';
import {
  type ApiClient,
  DEFAULT_TABS,
  type FacetConfig,
  type SearchParams,
  type SearchResultItem,
  type TabConfig,
} from './api/types';
import { DidYouMean } from './components/DidYouMean';
import { Facets } from './components/Facets';
import { Pagination } from './components/Pagination';
import { Results } from './components/Results';
import { SearchBox } from './components/SearchBox';
import { SideRail } from './components/SideRail';
import { Suggestions } from './components/Suggestions';
import { Tabs } from './components/Tabs';
import { WidgetContext, type WidgetContextValue, useWidget } from './context';
import { useConfig, useRelated, useSearch, useSuggest, useTrending } from './hooks';
import { addRecent, getRecent } from './recent';
import { styles } from './styles';
import { useHostEmit } from './useHostEmit';

const PAGE_SIZE = 10;

export interface WidgetProps {
  tenantKey?: string;
  apiBase?: string;
  theme?: Record<string, string> | null;
  tabs?: Array<{ key?: string; tabKey?: string; label?: string }> | null;
  trending?: string[] | null;
  locale?: string;
  placeholder?: string;
  debug?: boolean;
  disableHistory?: boolean;
  /** Base font size for the whole widget, e.g. "16px", "1.1rem", or 14 (px). */
  fontSize?: string | number;
}

function kebab(input: string): string {
  return input.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Normalize a font-size prop into a CSS length (bare numbers become px). */
function toFontSize(value: string | number | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? `${s}px` : s;
}

function humanize(field: string): string {
  const base = field.split('.').pop() ?? field;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function buildThemeVars(theme?: Record<string, string> | null): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme && typeof theme === 'object') {
    for (const [key, value] of Object.entries(theme)) {
      if (value == null) continue;
      vars[`--es-${kebab(key)}`] = String(value);
    }
  }
  return vars as CSSProperties;
}

function normalizeTabs(tabs?: WidgetProps['tabs']): TabConfig[] | null {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const out = tabs
    .map((t) => ({
      key: String(t.key ?? t.tabKey ?? ''),
      label: String(t.label ?? t.key ?? t.tabKey ?? ''),
    }))
    .filter((t) => t.key.length > 0);
  return out.length > 0 ? out : null;
}

function normalizeStringList(list?: string[] | null): string[] | null {
  if (!Array.isArray(list)) return null;
  const out = list.map((s) => String(s)).filter((s) => s.trim().length > 0);
  return out.length > 0 ? out : null;
}

/** Root component wrapped by the custom element. Wires providers + theming. */
export default function WidgetRoot(props: WidgetProps) {
  const { rootRef, emit } = useHostEmit();

  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
    [],
  );

  const client = useMemo<ApiClient>(() => {
    const base = props.apiBase?.trim();
    if (!base || base === 'demo') return new FakeApiClient();
    return new HttpApiClient(base, props.tenantKey ?? '');
  }, [props.apiBase, props.tenantKey]);

  const ctx = useMemo<WidgetContextValue>(
    () => ({
      client,
      tenantKey: props.tenantKey ?? 'default',
      placeholder: props.placeholder ?? 'Search',
      locale: props.locale ?? 'en',
      debug: Boolean(props.debug),
      disableHistory: Boolean(props.disableHistory),
      emit,
    }),
    [
      client,
      props.tenantKey,
      props.placeholder,
      props.locale,
      props.debug,
      props.disableHistory,
      emit,
    ],
  );

  const themeVars = useMemo(() => {
    const vars = buildThemeVars(props.theme) as Record<string, string>;
    const fontSize = toFontSize(props.fontSize);
    if (fontSize) vars['--es-font-size'] = fontSize;
    return vars as CSSProperties;
  }, [props.theme, props.fontSize]);
  const tabOverride = useMemo(() => normalizeTabs(props.tabs), [props.tabs]);
  const trendingOverride = useMemo(() => normalizeStringList(props.trending), [props.trending]);

  return (
    <div className="es-root" ref={rootRef} style={themeVars}>
      <style>{styles}</style>
      <QueryClientProvider client={queryClient}>
        <WidgetContext.Provider value={ctx}>
          <SearchApp tabOverride={tabOverride} trendingOverride={trendingOverride} />
        </WidgetContext.Provider>
      </QueryClientProvider>
    </div>
  );
}

export function SearchApp({
  tabOverride,
  trendingOverride = null,
}: {
  tabOverride: TabConfig[] | null;
  trendingOverride?: string[] | null;
}) {
  const { placeholder, emit, tenantKey, disableHistory } = useWidget();
  const configQ = useConfig();
  const uid = useId().replace(/:/g, '');
  const listboxId = `es-listbox-${uid}`;
  const optPrefix = `es-opt-${uid}-`;

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(1);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() =>
    disableHistory ? [] : getRecent(tenantKey),
  );
  const [feedbackSent, setFeedbackSent] = useState(false);

  const tabs = tabOverride ?? configQ.data?.tabs ?? DEFAULT_TABS;
  const activeTab = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'all');

  const searchParams = useMemo<SearchParams>(
    () => ({ query, tab: activeTab, filters, page, size: PAGE_SIZE }),
    [query, activeTab, filters, page],
  );
  const hasQuery = query.trim().length > 0;
  const searchQ = useSearch(searchParams, hasQuery);
  const suggestQ = useSuggest(input, activeTab, focused && input.trim().length > 0);
  const trendingQ = useTrending();
  const relatedQ = useRelated(query, activeTab);

  const suggestions =
    focused && input.trim().length > 0 ? (suggestQ.data?.suggestions ?? []) : [];
  const showSuggest = suggestions.length > 0;
  const didYouMean = searchQ.data?.didYouMean ?? null;
  const trending = trendingOverride ?? trendingQ.data ?? [];
  const related = (relatedQ.data?.suggestions ?? [])
    .filter((s) => s.toLowerCase() !== query.trim().toLowerCase())
    .slice(0, 6);

  const facetConfigs = useMemo<FacetConfig[]>(() => {
    if (configQ.data && configQ.data.facets.length > 0) return configQ.data.facets;
    return Object.keys(searchQ.data?.facets ?? {}).map((f) => ({ field: f, label: humanize(f) }));
  }, [configQ.data, searchQ.data]);
  const hasFacets = facetConfigs.some((c) => (searchQ.data?.facets[c.field]?.length ?? 0) > 0);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setInput(trimmed);
    setPage(1);
    setFocused(false);
    setActiveIndex(-1);
    setFeedbackSent(false);
    if (!disableHistory) setRecent(addRecent(tenantKey, trimmed));
    emit('search', { query: trimmed, tab: activeTab, filters });
  };

  const selectSuggestion = (value: string) => {
    emit('suggestselect', { suggestion: value });
    commit(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && showSuggest) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && showSuggest) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (showSuggest && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      } else {
        commit(input);
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      setActiveIndex(-1);
    }
  };

  const onTabChange = (key: string) => {
    setTab(key);
    setPage(1);
    setActiveIndex(-1);
    emit('tabchange', { tab: key });
  };

  const onToggleFacet = (field: string, value: string) => {
    setFilters((prev) => {
      const current = prev[field] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const copy = { ...prev };
      if (next.length > 0) copy[field] = next;
      else delete copy[field];
      return copy;
    });
    setPage(1);
  };

  const onResultClick = (item: SearchResultItem, rank: number) => {
    emit('resultclick', { id: item.id, url: item.url, tab: activeTab, rank });
  };

  const onEntityClick = (text: string) => {
    emit('entityclick', { entity: text, tab: activeTab });
    commit(text);
  };

  const onFeedback = () => {
    emit('feedback', { query, tab: activeTab, resultCount: searchQ.data?.total ?? 0 });
    setFeedbackSent(true);
  };

  return (
    <>
      <div className="es-combobox">
        <SearchBox
          value={input}
          placeholder={placeholder}
          loading={searchQ.isFetching || suggestQ.isFetching}
          expanded={showSuggest}
          listboxId={listboxId}
          activeId={activeIndex >= 0 ? `${optPrefix}${activeIndex}` : undefined}
          onChange={(v) => {
            setInput(v);
            setFocused(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onSubmit={() => commit(input)}
          onClear={() => {
            setInput('');
            setActiveIndex(-1);
          }}
        />
        {showSuggest && (
          <Suggestions
            id={listboxId}
            optionIdPrefix={optPrefix}
            items={suggestions}
            activeIndex={activeIndex}
            onSelect={(value) => selectSuggestion(value)}
            onHover={setActiveIndex}
          />
        )}
      </div>

      {hasQuery && (
        <div className="es-panel">
          <Tabs tabs={tabs} active={activeTab} onChange={onTabChange} />
          {didYouMean && <DidYouMean suggestion={didYouMean} onPick={commit} />}
          <div className={hasFacets ? 'es-body' : 'es-body es-nofacets'}>
            {hasFacets && (
              <Facets
                configs={facetConfigs}
                facets={searchQ.data?.facets ?? {}}
                selected={filters}
                onToggle={onToggleFacet}
              />
            )}
            <div className="es-main">
              {searchQ.isError ? (
                <div className="es-notice" role="alert">
                  Search is temporarily unavailable.
                  <button type="button" onClick={() => searchQ.refetch()}>
                    Retry
                  </button>
                </div>
              ) : searchQ.isLoading ? (
                <div className="es-state">
                  <span className="es-spinner" /> Searching…
                </div>
              ) : searchQ.data ? (
                <>
                  <Results
                    data={searchQ.data}
                    onResultClick={onResultClick}
                    onEntityClick={onEntityClick}
                  />
                  <Pagination
                    page={searchQ.data.page}
                    size={searchQ.data.size}
                    total={searchQ.data.total}
                    onPage={setPage}
                  />
                </>
              ) : null}
            </div>
            <SideRail
              trending={trending}
              recent={recent}
              related={related}
              onPick={commit}
              onFeedback={onFeedback}
              feedbackSent={feedbackSent}
            />
          </div>
        </div>
      )}
    </>
  );
}
