import { SearchIcon } from './icons';

export interface SuggestionsProps {
  id: string;
  optionIdPrefix: string;
  items: string[];
  activeIndex: number;
  onSelect: (value: string, index: number) => void;
  onHover: (index: number) => void;
}

export function Suggestions({
  id,
  optionIdPrefix,
  items,
  activeIndex,
  onSelect,
  onHover,
}: SuggestionsProps) {
  return (
    <ul className="es-suggest" id={id} role="listbox">
      {items.map((item, i) => (
        <li
          key={`${item}-${i}`}
          id={`${optionIdPrefix}${i}`}
          role="option"
          aria-selected={i === activeIndex}
          className="es-suggest-item"
          onMouseDown={(e) => {
            // mousedown (not click) so selection happens before the input blurs
            e.preventDefault();
            onSelect(item, i);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <SearchIcon size={15} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
