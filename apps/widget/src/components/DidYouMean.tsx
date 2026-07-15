export interface DidYouMeanProps {
  suggestion: string;
  onPick: (value: string) => void;
}

export function DidYouMean({ suggestion, onPick }: DidYouMeanProps) {
  return (
    <p className="es-dym">
      Did you mean{' '}
      <button type="button" onClick={() => onPick(suggestion)}>
        {suggestion}
      </button>
      ?
    </p>
  );
}
