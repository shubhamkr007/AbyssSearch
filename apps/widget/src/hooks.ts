import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { SearchParams, SearchResponse, SuggestResponse, WidgetConfig } from './api/types';
import { useWidget } from './context';

/** Debounce a rapidly-changing value (used to throttle suggest requests). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useConfig() {
  const { client } = useWidget();
  return useQuery<WidgetConfig>({
    queryKey: ['config'],
    queryFn: ({ signal }) => client.getConfig(signal),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSearch(params: SearchParams, enabled: boolean) {
  const { client } = useWidget();
  return useQuery<SearchResponse>({
    queryKey: ['search', params],
    queryFn: ({ signal }) => client.search(params, signal),
    enabled,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export function useSuggest(query: string, tab: string, enabled: boolean) {
  const { client } = useWidget();
  const debounced = useDebounced(query, 150);
  const active = enabled && debounced.trim().length > 0;
  return useQuery<SuggestResponse>({
    queryKey: ['suggest', tab, debounced],
    queryFn: ({ signal }) => client.suggest({ q: debounced, tab, size: 8 }, signal),
    enabled: active,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useTrending() {
  const { client } = useWidget();
  return useQuery<string[]>({
    queryKey: ['trending'],
    queryFn: ({ signal }) => client.trending(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** "People also search" — related queries derived from the committed query. */
export function useRelated(query: string, tab: string) {
  const { client } = useWidget();
  const active = query.trim().length > 0;
  return useQuery<SuggestResponse>({
    queryKey: ['related', tab, query],
    queryFn: ({ signal }) => client.suggest({ q: query, tab, size: 6 }, signal),
    enabled: active,
    staleTime: 60 * 1000,
    retry: false,
  });
}
