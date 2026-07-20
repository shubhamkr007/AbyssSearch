// Styles live as a string injected via a <style> element inside the shadow root
// (see App), guaranteeing isolation from the host page's CSS. Tokens are CSS
// custom properties so the `theme` attribute can override them.
export const styles = `
:host { all: initial; }
* { box-sizing: border-box; }

.es-root {
  --es-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --es-fg: #1f2328;
  --es-muted: #6b7280;
  --es-bg: #ffffff;
  --es-surface: #ffffff;
  --es-border: #dfe1e6;
  --es-primary: #2563eb;
  --es-primary-fg: #ffffff;
  --es-accent: #eef2ff;
  --es-danger: #b42318;
  --es-radius: 12px;
  --es-shadow: 0 4px 24px rgba(0,0,0,0.10);
  /* Single knob for widget-wide scaling. Override via the font-size
     attribute or theme (all component sizes are relative to this). */
  --es-font-size: 15px;

  font-family: var(--es-font);
  color: var(--es-fg);
  font-size: var(--es-font-size);
  line-height: 1.45;
  width: 100%;
  display: block;
  /* Respond to the widget's OWN width, not the host viewport, so the layout
     stays correct no matter how wide the embedding container is. */
  container-type: inline-size;
}

.es-searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--es-border);
  border-radius: 999px;
  padding: 8px 8px 8px 16px;
  background: var(--es-surface);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: box-shadow .15s ease, border-color .15s ease;
}
.es-searchbar:focus-within { box-shadow: var(--es-shadow); border-color: var(--es-primary); }
.es-searchbar .es-icon { color: var(--es-muted); flex: 0 0 auto; display: flex; }
.es-input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  font: inherit;
  color: inherit;
  background: transparent;
  min-width: 0;
}
.es-clear, .es-submit {
  border: none;
  cursor: pointer;
  font: inherit;
  border-radius: 999px;
}
.es-clear {
  background: transparent;
  color: var(--es-muted);
  padding: 6px 8px;
}
.es-clear:hover { color: var(--es-fg); }
.es-submit {
  background: var(--es-primary);
  color: var(--es-primary-fg);
  width: 40px;
  height: 40px;
  padding: 0;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.es-submit .es-icon { color: var(--es-primary-fg); }
.es-submit:hover { filter: brightness(0.96); }
.es-submit:disabled { opacity: .5; cursor: default; }

.es-combobox { position: relative; }
.es-suggest {
  position: absolute;
  left: 0; right: 0; top: calc(100% + 6px);
  z-index: 20;
  background: var(--es-surface);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  box-shadow: var(--es-shadow);
  padding: 6px;
  margin: 0;
  list-style: none;
  max-height: 320px;
  overflow: auto;
}
.es-suggest-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.es-suggest-item[aria-selected="true"], .es-suggest-item:hover { background: var(--es-accent); }
.es-suggest-item .es-icon { color: var(--es-muted); }

.es-panel { margin-top: 14px; }

.es-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--es-border);
  margin-bottom: 12px;
  overflow-x: auto;
}
.es-tab {
  border: none;
  background: transparent;
  font: inherit;
  color: var(--es-muted);
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.es-tab:hover { color: var(--es-fg); }
.es-tab[aria-selected="true"] { color: var(--es-primary); border-bottom-color: var(--es-primary); font-weight: 600; }

.es-body { display: grid; grid-template-columns: 180px minmax(0, 1fr) 240px; gap: 20px; align-items: start; }
.es-body.es-nofacets { grid-template-columns: minmax(0, 1fr) 240px; }
@container (max-width: 860px) {
  .es-body { grid-template-columns: 180px minmax(0, 1fr); }
  .es-body.es-nofacets { grid-template-columns: minmax(0, 1fr); }
  .es-rail { display: none; }
}
@container (max-width: 560px) {
  .es-body, .es-body.es-nofacets { grid-template-columns: 1fr; }
  .es-facets { order: 2; }
}

.es-facets { font-size: 0.93em; }
.es-facet-group { margin-bottom: 16px; }
.es-facet-title { font-weight: 600; margin: 0 0 6px; }
.es-facet-list { list-style: none; margin: 0; padding: 0; }
.es-facet-option { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; color: var(--es-fg); }
.es-facet-count { color: var(--es-muted); margin-left: auto; font-variant-numeric: tabular-nums; }

.es-meta { color: var(--es-muted); font-size: 0.87em; margin: 0 0 10px; }
.es-dym { margin: 0 0 12px; }
.es-dym button { border: none; background: none; color: var(--es-primary); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }

.es-results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.es-result { border: 1px solid var(--es-border); border-radius: var(--es-radius); padding: 16px; background: var(--es-surface); }
.es-result-title { margin: 0; font-size: 1.13em; }
.es-result-title a { color: var(--es-primary); text-decoration: none; }
.es-result-title a:hover { text-decoration: underline; }
.es-linklike { border: none; background: none; padding: 0; font: inherit; color: var(--es-primary); cursor: pointer; text-align: left; }
.es-linklike:hover { text-decoration: underline; }
.es-result-url { color: #1a7f37; font-size: 0.87em; margin: 1px 0 4px; word-break: break-all; }
.es-result-snippet { margin: 0; color: var(--es-fg); }
.es-result-snippet em {
  background: #fff3bf;
  color: #1f2328;
  font-style: normal;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.es-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.es-tag { background: var(--es-accent); color: var(--es-primary); font-size: 0.8em; padding: 2px 8px; border-radius: 999px; }
.es-source { color: var(--es-muted); font-size: 0.8em; text-transform: capitalize; }

/* Named entities (NER): each chip is [type-icon + name]; icon encodes the type. */
.es-entities { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--es-border); }
.es-entity { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--es-border); background: var(--es-surface); color: var(--es-fg); border-radius: 999px; padding: 2px 10px 2px 8px; font: inherit; font-size: 0.8em; line-height: 1.7; cursor: default; }
.es-entity-icon { display: inline-flex; flex: 0 0 auto; opacity: .65; }
.es-entity-icon .es-icon { display: block; width: 1.05em; height: 1.05em; }
.es-entity-text { white-space: nowrap; }
button.es-entity { cursor: pointer; transition: background .12s ease, border-color .12s ease, color .12s ease; }
button.es-entity:hover { background: var(--es-accent); border-color: var(--es-primary); color: var(--es-primary); }
button.es-entity:hover .es-entity-icon { opacity: 1; }
.es-entity-more { color: var(--es-primary); border-style: dashed; padding-left: 10px; }
.es-entity-more:hover { background: var(--es-accent); }

/* RAG Answers tab: grounded answer card + numbered source citations. */
.es-answer { border: 1px solid var(--es-border); border-radius: var(--es-radius); padding: 16px 18px; background: var(--es-surface); }
.es-answer-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.es-answer-badge { background: var(--es-accent); color: var(--es-primary); font-size: 0.75em; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 2px 9px; border-radius: 999px; }
.es-answer-flag { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; font-size: 0.75em; padding: 1px 8px; border-radius: 999px; }
.es-answer-text { margin: 0; color: var(--es-fg); white-space: pre-wrap; line-height: 1.6; }
.es-answer-sources { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--es-border); }
.es-answer-sources-label { font-size: 0.8em; text-transform: uppercase; letter-spacing: .04em; color: var(--es-muted); margin-bottom: 10px; }
.es-answer-citations { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.es-answer-citation-link { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 6px; border: none; background: none; padding: 0; font: inherit; text-align: left; cursor: pointer; color: var(--es-primary); }
.es-answer-citation-link:disabled { cursor: default; color: var(--es-fg); }
.es-answer-citation-n { color: var(--es-muted); font-variant-numeric: tabular-nums; }
.es-answer-citation-title { font-weight: 600; }
.es-answer-citation-link:hover:not(:disabled) .es-answer-citation-title { text-decoration: underline; }
.es-answer-citation-source { color: var(--es-muted); font-size: 0.8em; text-transform: capitalize; }
.es-answer-citation-snippet { margin: 3px 0 0; color: var(--es-muted); font-size: 0.87em; line-height: 1.5; }
.es-answer-foot { margin-top: 14px; color: var(--es-muted); font-size: 0.8em; }

.es-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px; }
.es-pagination button {
  border: 1px solid var(--es-border);
  background: var(--es-surface);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
}
.es-pagination button:disabled { opacity: .5; cursor: default; }

.es-state { padding: 28px 8px; text-align: center; color: var(--es-muted); }
.es-notice { background: #fef3f2; color: var(--es-danger); border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; }
.es-notice button { margin-left: 8px; border: none; background: none; color: var(--es-danger); text-decoration: underline; cursor: pointer; font: inherit; }
.es-degraded { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; font-size: 0.87em; }

.es-spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--es-border);
  border-top-color: var(--es-primary);
  border-radius: 50%;
  animation: es-spin .7s linear infinite;
  display: inline-block;
  vertical-align: -3px;
}
@keyframes es-spin { to { transform: rotate(360deg); } }

.es-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

.es-rail { display: flex; flex-direction: column; gap: 14px; }
.es-card { border: 1px solid var(--es-border); border-radius: var(--es-radius); padding: 12px 14px; background: var(--es-surface); }
.es-card h4 { margin: 0 0 10px; font-size: 0.8em; text-transform: uppercase; letter-spacing: .04em; color: var(--es-muted); }
.es-chiplist { display: flex; flex-wrap: wrap; gap: 8px; }
.es-chip { border: 1px solid var(--es-border); background: var(--es-surface); border-radius: 999px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 0.87em; color: var(--es-fg); }
.es-chip:hover { background: var(--es-accent); border-color: var(--es-primary); color: var(--es-primary); }
.es-linkrow { display: flex; flex-direction: column; gap: 4px; }
.es-linkrow button { text-align: left; border: none; background: none; padding: 4px 0; color: var(--es-primary); cursor: pointer; font: inherit; }
.es-linkrow button:hover { text-decoration: underline; }
.es-hitl p { margin: 0 0 10px; color: var(--es-muted); font-size: 0.87em; }
.es-hitl-btn { border: 1px solid var(--es-primary); color: var(--es-primary); background: var(--es-surface); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; }
.es-hitl-btn:hover { background: var(--es-accent); }
.es-hitl-done { color: #1a7f37; font-size: 0.87em; margin: 0; }
`;
