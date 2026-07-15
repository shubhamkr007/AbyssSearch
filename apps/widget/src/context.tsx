import { createContext, useContext } from 'react';

import type { ApiClient } from './api/types';

export type WidgetEventType =
  | 'search'
  | 'resultclick'
  | 'suggestselect'
  | 'tabchange'
  | 'feedback'
  | 'entityclick';

export interface WidgetContextValue {
  client: ApiClient;
  tenantKey: string;
  placeholder: string;
  locale: string;
  debug: boolean;
  disableHistory: boolean;
  emit: (type: WidgetEventType, detail: unknown) => void;
}

export const WidgetContext = createContext<WidgetContextValue | null>(null);

export function useWidget(): WidgetContextValue {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error('useWidget must be used within <WidgetProvider>');
  return ctx;
}
