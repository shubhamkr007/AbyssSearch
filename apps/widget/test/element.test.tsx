import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { defineEnterpriseSearch } from '../src/element';

describe('enterprise-search custom element', () => {
  it('registers, renders into a shadow root, and emits composed DOM events', async () => {
    defineEnterpriseSearch();
    expect(customElements.get('enterprise-search')).toBeTruthy();

    const events: Array<{ type: string; detail: unknown }> = [];
    document.addEventListener('search', (e) =>
      events.push({ type: e.type, detail: (e as CustomEvent).detail }),
    );

    const el = document.createElement('enterprise-search');
    el.setAttribute('api-base', 'demo');
    el.setAttribute('tenant-key', 'pk_test_demo');
    document.body.appendChild(el);

    const input = await waitFor(
      () => {
        const found = el.shadowRoot?.querySelector('input');
        expect(found).toBeTruthy();
        return found as HTMLInputElement;
      },
      { timeout: 3000 },
    );

    input.focus();
    fireEvent.change(input, { target: { value: 'acme' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(
      () => expect(el.shadowRoot?.querySelector('.es-result-title')).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(events.some((e) => e.type === 'search')).toBe(true);

    document.body.removeChild(el);
  });
});
