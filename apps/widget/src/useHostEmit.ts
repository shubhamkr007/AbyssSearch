import { useCallback, useRef } from 'react';

import type { WidgetEventType } from './context';

/**
 * Dispatches DOM CustomEvents from the host custom element so the embedding page
 * can hook analytics/navigation. When rendered inside a shadow root the event is
 * fired on the shadow host (`composed: true` so it crosses the boundary); in
 * plain-DOM tests it fires on the root node and still bubbles.
 */
export function useHostEmit() {
  const rootRef = useRef<HTMLDivElement>(null);
  const emit = useCallback((type: WidgetEventType, detail: unknown) => {
    const node = rootRef.current;
    if (!node) return;
    const root = node.getRootNode();
    const target = root instanceof ShadowRoot ? (root.host as HTMLElement) : node;
    target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }, []);
  return { rootRef, emit };
}
