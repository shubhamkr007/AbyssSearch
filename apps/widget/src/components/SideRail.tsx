export interface SideRailProps {
  trending: string[];
  recent: string[];
  related: string[];
  onPick: (term: string) => void;
  onFeedback: () => void;
  feedbackSent: boolean;
}

function Chips({ items, onPick }: { items: string[]; onPick: (t: string) => void }) {
  return (
    <div className="es-chiplist">
      {items.map((item) => (
        <button key={item} type="button" className="es-chip" onClick={() => onPick(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

export function SideRail({
  trending,
  recent,
  related,
  onPick,
  onFeedback,
  feedbackSent,
}: SideRailProps) {
  return (
    <aside className="es-rail" aria-label="Related and trending">
      {trending.length > 0 ? (
        <section className="es-card">
          <h4>Trending searches</h4>
          <Chips items={trending} onPick={onPick} />
        </section>
      ) : recent.length > 0 ? (
        <section className="es-card">
          <h4>Recent searches</h4>
          <Chips items={recent} onPick={onPick} />
        </section>
      ) : null}

      {related.length > 0 && (
        <section className="es-card">
          <h4>People also search</h4>
          <div className="es-linkrow">
            {related.map((item) => (
              <button key={item} type="button" onClick={() => onPick(item)}>
                {item}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="es-card es-hitl">
        <h4>Improve results</h4>
        {feedbackSent ? (
          <p className="es-hitl-done">Thanks — a reviewer will take a look.</p>
        ) : (
          <>
            <p>Tags off? Send these results for human-in-the-loop review.</p>
            <button type="button" className="es-hitl-btn" onClick={onFeedback}>
              Suggest better tags
            </button>
          </>
        )}
      </section>
    </aside>
  );
}
