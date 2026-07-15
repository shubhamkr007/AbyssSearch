import { forwardRef, type KeyboardEvent } from 'react';

import { ArrowRightIcon, CloseIcon, SearchIcon } from './icons';

export interface SearchBoxProps {
  value: string;
  placeholder: string;
  loading?: boolean;
  expanded: boolean;
  listboxId: string;
  activeId?: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onSubmit: () => void;
  onClear: () => void;
}

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  {
    value,
    placeholder,
    loading,
    expanded,
    listboxId,
    activeId,
    onChange,
    onKeyDown,
    onFocus,
    onSubmit,
    onClear,
  },
  ref,
) {
  return (
    <div className="es-searchbar">
      <span className="es-icon">{loading ? <span className="es-spinner" /> : <SearchIcon />}</span>
      <input
        ref={ref}
        className="es-input"
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      />
      {value.length > 0 && (
        <button className="es-clear" type="button" aria-label="Clear search" onClick={onClear}>
          <CloseIcon />
        </button>
      )}
      <button
        className="es-submit"
        type="button"
        aria-label="Search"
        onClick={onSubmit}
        disabled={value.trim().length === 0}
      >
        <ArrowRightIcon />
      </button>
    </div>
  );
});
