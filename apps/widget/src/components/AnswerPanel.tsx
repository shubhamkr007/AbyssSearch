import type { AnswerCitation, AnswerResponse } from '../api/types';

export interface AnswerPanelProps {
  data?: AnswerResponse;
  isLoading: boolean;
  isError: boolean;
  onCitationClick?: (citation: AnswerCitation) => void;
  onRetry?: () => void;
}

/** Renders a RAG grounded answer with numbered, clickable source citations. */
export function AnswerPanel({
  data,
  isLoading,
  isError,
  onCitationClick,
  onRetry,
}: AnswerPanelProps) {
  if (isLoading) {
    return (
      <div className="es-state" aria-live="polite">
        <span className="es-spinner" /> Generating answer…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="es-notice" role="alert">
        Answers are unavailable for this query.
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="es-answer">
      <div className="es-answer-head">
        <span className="es-answer-badge">AI answer</span>
        {data.degraded && (
          <span className="es-answer-flag" title="Generated without the full model">
            best-effort
          </span>
        )}
      </div>

      <p className="es-answer-text">{data.answer}</p>

      {data.citations.length > 0 && (
        <div className="es-answer-sources">
          <div className="es-answer-sources-label">Sources</div>
          <ol className="es-answer-citations">
            {data.citations.map((c) => (
              <li key={c.n} className="es-answer-citation">
                <button
                  type="button"
                  className="es-answer-citation-link"
                  onClick={() => onCitationClick?.(c)}
                  disabled={!onCitationClick}
                >
                  <span className="es-answer-citation-n">[{c.n}]</span>
                  <span className="es-answer-citation-title">
                    {c.title ?? c.url ?? 'Source'}
                  </span>
                  {c.source && <span className="es-answer-citation-source">{c.source}</span>}
                </button>
                {c.snippet && <p className="es-answer-citation-snippet">{c.snippet}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="es-answer-foot">
        {data.model} · {data.took_ms} ms
      </div>
    </div>
  );
}
