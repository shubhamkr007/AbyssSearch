import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { type Tab, useApi } from '../api';
import { Banner, EmptyState, Spinner, errMsg } from '../ui';

interface Row {
  tabKey: string;
  label: string;
  enabled: boolean;
}

export function TabsPanel({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ['config', tenantId], queryFn: () => api.getConfig(tenantId) });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfgQ.data) {
      setRows(cfgQ.data.tabs.map((t) => ({ tabKey: t.tabKey, label: t.label, enabled: t.enabled ?? true })));
      setDirty(false);
    }
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: () => {
      const tabs: Tab[] = rows
        .filter((r) => r.tabKey.trim() && r.label.trim())
        .map((r, i) => ({ tabKey: r.tabKey.trim(), label: r.label.trim(), enabled: r.enabled, position: i }));
      return api.setTabs(tenantId, tabs);
    },
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['config', tenantId] });
    },
  });

  const patch = (i: number, p: Partial<Row>) => {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setRows((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const remove = (i: number) => {
    setRows((cur) => cur.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const add = () => {
    setRows((cur) => [...cur, { tabKey: '', label: '', enabled: true }]);
    setDirty(true);
  };

  if (cfgQ.isLoading) return <Spinner />;
  if (cfgQ.isError) return <Banner kind="error">{errMsg(cfgQ.error)}</Banner>;

  return (
    <div className="card">
      <h3>Search tabs</h3>
      <p className="muted">Tabs shown in the widget. Order here is the display order. The widget always appends an “Answers” tab.</p>
      {rows.length === 0 ? (
        <EmptyState>No tabs configured — the widget falls back to its defaults.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Key</th>
              <th>Label</th>
              <th>Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nowrap">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</button>
                </td>
                <td><input value={r.tabKey} onChange={(e) => patch(i, { tabKey: e.target.value })} placeholder="all" /></td>
                <td><input value={r.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="All" /></td>
                <td className="center"><input type="checkbox" checked={r.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} /></td>
                <td className="right"><button type="button" className="btn btn-danger btn-sm" onClick={() => remove(i)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row gap">
        <button type="button" className="btn" onClick={add}>Add tab</button>
        <button type="button" className="btn btn-primary" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save tabs'}
        </button>
      </div>
      {save.isError && <Banner kind="error">{errMsg(save.error)}</Banner>}
      {save.isSuccess && !dirty && <Banner kind="success">Tabs saved.</Banner>}
    </div>
  );
}
