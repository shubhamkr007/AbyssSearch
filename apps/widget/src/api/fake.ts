import {
  ApiClient,
  DEFAULT_TABS,
  FacetBucket,
  SearchParams,
  SearchResponse,
  SearchResultItem,
  SuggestParams,
  SuggestResponse,
  WidgetConfig,
} from './types';

interface Doc {
  id: string;
  title: string;
  body: string;
  url: string;
  tags: string[];
  source: 'document' | 'news' | 'image';
  entities?: Record<string, string[]>;
}

const TAB_SOURCE: Record<string, Doc['source'] | undefined> = {
  all: undefined,
  documents: 'document',
  news: 'news',
  images: 'image',
};

const DOCS: Doc[] = [
  {
    id: 'doc-onboarding',
    title: 'Employee Onboarding Handbook',
    body: 'Everything a new hire needs: accounts, benefits, first-week checklist and IT setup.',
    url: 'https://acme.example/docs/onboarding',
    tags: ['hr', 'handbook'],
    source: 'document',
    entities: { ORG: ['Acme'], PERSON: ['Jane Doe'], DATE: ['first week'] },
  },
  {
    id: 'doc-security-policy',
    title: 'Information Security Policy',
    body: 'Data classification, acceptable use, password rules and incident reporting for Acme.',
    url: 'https://acme.example/docs/security-policy',
    tags: ['security', 'policy'],
    source: 'document',
    entities: { ORG: ['Acme'] },
  },
  {
    id: 'doc-k8s-runbook',
    title: 'Kubernetes Production Runbook',
    body: 'How to deploy, scale and roll back services on the Kubernetes cluster, with on-call steps.',
    url: 'https://acme.example/docs/kubernetes-runbook',
    tags: ['engineering', 'kubernetes', 'runbook'],
    source: 'document',
    entities: { PRODUCT: ['Kubernetes'], ORG: ['Acme'] },
  },
  {
    id: 'doc-expense-policy',
    title: 'Travel and Expense Policy',
    body: 'Reimbursement limits, approval flow and how to submit an expense report.',
    url: 'https://acme.example/docs/expense-policy',
    tags: ['finance', 'policy'],
    source: 'document',
    entities: { ORG: ['Acme'] },
  },
  {
    id: 'news-q3-results',
    title: 'Acme reports record Q3 results',
    body: 'Revenue grew 24% year over year, driven by strong cloud and security demand.',
    url: 'https://acme.example/news/q3-results',
    tags: ['finance', 'earnings'],
    source: 'news',
    entities: { ORG: ['Acme'], DATE: ['Q3'], PERCENT: ['24%'] },
  },
  {
    id: 'news-security-launch',
    title: 'Acme launches new security platform',
    body: 'The platform brings zero-trust access and threat detection to enterprise customers.',
    url: 'https://acme.example/news/security-launch',
    tags: ['security', 'product'],
    source: 'news',
    entities: { ORG: ['Acme'], PRODUCT: ['zero-trust access'] },
  },
  {
    id: 'news-hiring',
    title: 'Acme to hire 500 engineers in 2026',
    body: 'Expansion focuses on cloud infrastructure and machine learning teams.',
    url: 'https://acme.example/news/hiring-2026',
    tags: ['hr', 'engineering'],
    source: 'news',
    entities: { ORG: ['Acme'], CARDINAL: ['500'], DATE: ['2026'] },
  },
  {
    id: 'img-datacenter',
    title: 'Data center racks',
    body: 'Photo of Acme data center server racks and networking hardware.',
    url: 'https://acme.example/images/datacenter.jpg',
    tags: ['infrastructure', 'photo'],
    source: 'image',
    entities: { ORG: ['Acme'] },
  },
  {
    id: 'img-office',
    title: 'Headquarters office',
    body: 'Photo of the Acme headquarters open-plan office and lobby.',
    url: 'https://acme.example/images/office.jpg',
    tags: ['office', 'photo'],
    source: 'image',
    entities: { ORG: ['Acme'], GPE: ['San Francisco'] },
  },
];

const VOCAB = uniq(
  DOCS.flatMap((d) => [...tokenize(d.title), ...tokenize(d.body), ...d.tags]),
).filter((w) => w.length >= 3);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function scoreDoc(doc: Doc, terms: string[]): number {
  if (terms.length === 0) return 1;
  const title = doc.title.toLowerCase();
  const body = doc.body.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 3;
    if (body.includes(term)) score += 1;
    if (doc.tags.some((t) => t.includes(term))) score += 2;
  }
  return score;
}

function computeFacets(docs: Doc[]): Record<string, FacetBucket[]> {
  const counts: Record<string, Record<string, number>> = { tags: {}, source: {} };
  for (const d of docs) {
    counts.source[d.source] = (counts.source[d.source] ?? 0) + 1;
    for (const tag of d.tags) counts.tags[tag] = (counts.tags[tag] ?? 0) + 1;
  }
  const toBuckets = (m: Record<string, number>): FacetBucket[] =>
    Object.entries(m)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return { tags: toBuckets(counts.tags), source: toBuckets(counts.source) };
}

function didYouMean(terms: string[]): string | null {
  const corrected = terms.map((term) => {
    if (VOCAB.includes(term)) return term;
    let best: { word: string; dist: number } | null = null;
    for (const word of VOCAB) {
      const dist = levenshtein(term, word);
      if (!best || dist < best.dist) best = { word, dist };
    }
    return best && best.dist > 0 && best.dist <= 2 ? best.word : term;
  });
  return corrected.some((t, i) => t !== terms[i]) ? corrected.join(' ') : null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** In-memory gateway used for offline dev, the demo host page, and tests. */
export class FakeApiClient implements ApiClient {
  constructor(private readonly delayMs = 150) {}

  async getConfig(signal?: AbortSignal): Promise<WidgetConfig> {
    await sleep(this.delayMs, signal);
    return {
      name: 'Acme (demo)',
      tabs: DEFAULT_TABS,
      facets: [
        { field: 'tags', label: 'Tags' },
        { field: 'source', label: 'Source' },
      ],
    };
  }

  async search(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
    const started = Date.now();
    await sleep(this.delayMs, signal);

    const terms = tokenize(params.query);
    const wantSource = TAB_SOURCE[params.tab];
    const inTab = DOCS.filter((d) => (wantSource ? d.source === wantSource : true));

    let matched = inTab
      .map((d) => ({ d, score: scoreDoc(d, terms) }))
      .filter((x) => x.score > 0);
    matched.sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title));

    const facets = computeFacets(matched.map((x) => x.d));

    const tagFilter = params.filters.tags ?? [];
    const sourceFilter = params.filters.source ?? [];
    let filtered = matched;
    if (tagFilter.length > 0) {
      filtered = filtered.filter((x) => x.d.tags.some((t) => tagFilter.includes(t)));
    }
    if (sourceFilter.length > 0) {
      filtered = filtered.filter((x) => sourceFilter.includes(x.d.source));
    }

    const total = filtered.length;
    const page = Math.max(1, params.page);
    const size = Math.max(1, params.size);
    const startIdx = (page - 1) * size;
    const slice = filtered.slice(startIdx, startIdx + size);

    const results: SearchResultItem[] = slice.map((x) => ({
      id: x.d.id,
      title: x.d.title,
      snippet: x.d.body,
      url: x.d.url,
      tags: x.d.tags,
      score: x.score,
      source: x.d.source,
      entitiesByType: x.d.entities,
      entities: x.d.entities ? Object.values(x.d.entities).flat() : undefined,
    }));

    return {
      query: params.query,
      didYouMean: total === 0 ? didYouMean(terms) : null,
      tab: params.tab,
      total,
      page,
      size,
      took_ms: Date.now() - started,
      degraded: false,
      results,
      facets,
    };
  }

  async trending(signal?: AbortSignal): Promise<string[]> {
    await sleep(Math.min(this.delayMs, 40), signal);
    return ['kubernetes runbook', 'security policy', 'Q3 results', 'onboarding', 'expenses'];
  }

  async suggest(params: SuggestParams, signal?: AbortSignal): Promise<SuggestResponse> {
    await sleep(Math.min(this.delayMs, 80), signal);
    const q = params.q.toLowerCase().trim();
    const size = params.size ?? 8;
    if (q.length === 0) return { query: params.q, suggestions: [] };

    const titles = DOCS.map((d) => d.title);
    const pool = uniq([...titles, ...VOCAB]);
    const starts = pool.filter((s) => s.toLowerCase().startsWith(q));
    const contains = pool.filter(
      (s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q),
    );
    return { query: params.q, suggestions: [...starts, ...contains].slice(0, size) };
  }
}
