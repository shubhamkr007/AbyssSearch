import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import { FakeApiClient } from '../src/api/fake';
import type { ApiClient } from '../src/api/types';
import { WidgetContext, type WidgetContextValue } from '../src/context';

export function renderWidget(
  ui: ReactElement,
  opts: { client?: ApiClient; placeholder?: string } = {},
) {
  const emit = vi.fn();
  const client = opts.client ?? new FakeApiClient(0);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ctx: WidgetContextValue = {
    client,
    tenantKey: 'test',
    placeholder: opts.placeholder ?? 'Search',
    locale: 'en',
    debug: false,
    disableHistory: false,
    emit,
  };
  const result = render(
    <QueryClientProvider client={queryClient}>
      <WidgetContext.Provider value={ctx}>{ui}</WidgetContext.Provider>
    </QueryClientProvider>,
  );
  return { ...result, emit, client };
}
