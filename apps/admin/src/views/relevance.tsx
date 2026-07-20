import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useApi } from '../api';
import { Banner, Field, Spinner, errMsg } from '../ui';

interface FacetObj {
  field: string;
  label?: string;
}

function facetsToText(facets: unknown[]): string {
  return facets
    .map((f) => {
      if (typeof f === 'string') return f;
      const o = f as FacetObj;
      return o.label ? `${o.field}:${o.label}` : o.field;
    })
    .filter(Boolean)
    .join('\n');
}

function textToFacets(text: string): FacetObj[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [field, ...rest] = line.split(':');
      const label = rest.join(':').trim();
      return label ? { field: field.trim(), label } : { field: field.trim() };
    });
}

function synonymsToText(syn: unknown[]): string {
  return syn.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join('\n');
}

export function RelevancePanel({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ['config', tenantId], queryFn: () => api.getConfig(tenantId) });

  const [facetsText, setFacetsText] = useState('');
  const [synonymsText, setSynonymsText] = useState('');
  const [boostsText, setBoostsText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const sc = cfgQ.data?.searchConfig;
    if (sc) {
      setFacetsText(facetsToText(sc.facets ?? []));
      setSynonymsText(synonymsToText(sc.synonyms ?? []));
      setBoostsText(JSON.stringify(sc.boosts ?? {}, null, 2));
      setDirty(false);
      setJsonError(null);
    }
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: () => {
      let boosts: Record<string, unknown> = {};
      const raw = boostsText.trim() || '{}';
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Boosts must be a JSON object');
        }
        boosts = parsed as Record<string, unknown>;
      } catch (e) {
        setJsonError(errMsg(e));
        return Promise.reject(e);
      }
      setJsonError(null);
      const synonyms = synonymsText.split('\n').map((s) => s.trim()).filter(Boolean);
      return api.upsertSearchConfig(tenantId, { facets: textToFacets(facetsText), synonyms, boosts });
    },
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['config', tenantId] });
    },
  });

  if (cfgQ.isLoading) return <Spinner />;
  if (cfgQ.isError) return <Banner kind="error">{errMsg(cfgQ.error)}</Banner>;

  const mark = () => setDirty(true);

  return (
    <div className="card">
      <h3>Relevance & facets</h3>
      <div className="grid-2">
        <Field label="Facet fields" hint="One per line. Use field or field:Label (e.g. source:Source).">
          <textarea
            rows={7}
            value={facetsText}
            onChange={(e) => { setFacetsText(e.target.value); mark(); }}
            placeholder={'source\ntags\nauthor:Author'}
          />
        </Field>
        <Field label="Synonyms" hint="One rule per line, comma-separated (e.g. laptop, notebook, macbook).">
          <textarea
            rows={7}
            value={synonymsText}
            onChange={(e) => { setSynonymsText(e.target.value); mark(); }}
            placeholder={'laptop, notebook\nvpn, remote access'}
          />
        </Field>
      </div>
      <Field label="Field boosts (JSON)" hint='e.g. {"title": 3, "body": 1}'>
        <textarea
          rows={5}
          className="mono"
          value={boostsText}
          onChange={(e) => { setBoostsText(e.target.value); mark(); }}
        />
      </Field>
      {jsonError && <Banner kind="error">Invalid boosts JSON: {jsonError}</Banner>}
      <button type="button" className="btn btn-primary" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save relevance'}
      </button>
      {save.isError && !jsonError && <Banner kind="error">{errMsg(save.error)}</Banner>}
      {save.isSuccess && !dirty && <Banner kind="success">Relevance saved.</Banner>}
    </div>
  );
}
