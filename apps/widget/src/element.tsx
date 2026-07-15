import r2wc from '@r2wc/react-to-web-component';

import WidgetRoot from './App';

type PropType = 'string' | 'number' | 'boolean' | 'json';

// Attribute -> prop mapping (kebab attributes like `tenant-key` map to `tenantKey`).
const propTypes: Record<string, PropType> = {
  tenantKey: 'string',
  apiBase: 'string',
  theme: 'json',
  tabs: 'json',
  trending: 'json',
  locale: 'string',
  placeholder: 'string',
  debug: 'boolean',
  disableHistory: 'boolean',
  fontSize: 'string',
};

export const EnterpriseSearchElement = r2wc(WidgetRoot, {
  shadow: 'open',
  props: propTypes,
});

export function defineEnterpriseSearch(tag = 'enterprise-search'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, EnterpriseSearchElement);
  }
}

defineEnterpriseSearch();
