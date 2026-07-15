# S1 - Search Widget (`enterprise-search`)

The embeddable, framework-agnostic search UI, shipped as a **Web Component**. Any
host app embeds it with one line and it talks **only** to the public API Gateway
(`/v1/*`). Built with React 18 + Vite and wrapped with
[`@r2wc/react-to-web-component`](https://github.com/bitovi/react-to-web-component);
rendered inside a **shadow DOM** so host CSS/JS can't leak in or out.

## Embed it

```html
<script type="module" src="https://cdn.example.com/enterprise-search.js"></script>

<enterprise-search
  tenant-key="pk_live_acme_xxx"
  api-base="https://search.acme.com"
  placeholder="Search everything…">
</enterprise-search>
```

### Attributes

| Attribute | Type | Required | Description |
|---|---|---|---|
| `tenant-key` | string | yes | Public (search-scoped) API key. Never use an admin key. |
| `api-base` | URL | yes | Gateway base URL. Use `demo` for the built-in offline fake gateway. |
| `theme` | JSON | no | Token overrides, e.g. `{"primary":"#7c3aed","radius":"8px"}`. |
| `tabs` | JSON | no | Client-side tab override, e.g. `[{"key":"all","label":"All"}]`. |
| `trending` | JSON | no | Right-rail trending queries, e.g. `["pricing","roadmap"]`. |
| `locale` | string | no | BCP-47 locale (default `en`). |
| `placeholder` | string | no | Input placeholder text. |
| `debug` | boolean | no | Verbose console diagnostics (never logs the key). |
| `disable-history` | boolean | no | Disable local recent-search storage. |

### Events

All events bubble and are `composed: true` (they cross the shadow boundary):

| Event | `detail` |
|---|---|
| `search` | `{ query, tab, filters }` |
| `resultclick` | `{ id, url, tab, rank }` |
| `suggestselect` | `{ suggestion }` |
| `tabchange` | `{ tab }` |
| `feedback` | `{ query, tab, resultCount }` — human-in-the-loop "suggest better tags" |

```js
document.querySelector('enterprise-search')
  .addEventListener('resultclick', (e) => console.log('clicked', e.detail));
```

### Theming

Theme tokens map to CSS custom properties (`--es-<token>`). Supported tokens
include `primary`, `primaryFg`, `fg`, `muted`, `bg`, `surface`, `border`,
`accent`, `danger`, `radius`, `shadow`, `font`.

## Local development

```bash
pnpm install
pnpm --filter @enterprise-search/widget dev      # Vite dev host at http://localhost:5173
```

The dev page (`index.html`) uses `api-base="demo"`, an **offline in-memory
gateway** (`src/api/fake.ts`) with a small demo dataset — no backend required.
Point `api-base` at `http://localhost:3000` to hit the real API Gateway
(run it with `USE_FAKE=true` for a backend-less end-to-end demo).

## Build

```bash
pnpm --filter @enterprise-search/widget build
```

Produces a single self-contained ESM bundle at `dist/enterprise-search.js`
(React bundled in) suitable for a CDN. Open `demo/host.html` after building to
see plain-HTML integration with live event logging.

## Test

```bash
pnpm --filter @enterprise-search/widget test
```

- `test/fake.test.ts` — the fake gateway (search/tab/facet/suggest/did-you-mean).
- `test/App.test.tsx` — search flow, suggestions, tabs, facets, did-you-mean, events (React Testing Library).
- `test/element.test.tsx` — custom-element registration, shadow-DOM render, composed events.

## Architecture

```
host page
  └─ <enterprise-search> (shadow DOM)
       └─ React app  ──HTTPS──▶  API Gateway /v1/{config,search,suggest,autocomplete}
```

- `src/api/*` — typed client port; `HttpApiClient` (real gateway) + `FakeApiClient` (offline).
- `src/hooks.ts` — TanStack Query hooks; suggest is debounced (150 ms) and requests are cancelled on supersede.
- `src/components/*` — SearchBox, Suggestions, Tabs, Facets, Results (cards), DidYouMean, Pagination, SideRail.
- `src/App.tsx` — composition + state; `src/element.tsx` — the `@r2wc` wrapper.

On search, the results view is a three-column layout: **facets** (left), **result
cards** (center, with tag/entity chips), and a **side rail** (right) with trending
/ recent searches, "people also search" (related queries), and a human-in-the-loop
"suggest better tags" action. The rail collapses on narrow viewports.

## Resilience

- `/v1/config` failure → default tabs + neutral theme.
- Search failure → friendly retryable notice; previous results stay visible (TanStack `keepPreviousData`).
- Suggestions are best-effort and never block search.
