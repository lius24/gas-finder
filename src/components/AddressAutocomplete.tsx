import { useEffect, useId, useRef, useState } from 'react';

import { autocompleteAddress, type AddressSuggestion } from '@core/adapters/geocoding';

import './AddressAutocomplete.css';

type Props = {
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  onSelect: (suggestion: AddressSuggestion) => void;
};

export function AddressAutocomplete({ placeholder, initialValue, autoFocus, onSelect }: Props) {
  const [value, setValue] = useState(initialValue ?? '');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  // Monotonic id so a slow earlier response can't overwrite a newer query.
  const queryId = useRef(0);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const id = ++queryId.current;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      autocompleteAddress(q)
        .then((r) => {
          if (id !== queryId.current) return;
          setResults(r);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (id !== queryId.current) return;
          setResults([]);
          setFailed(true);
          setOpen(true);
        })
        .finally(() => {
          if (id === queryId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const choose = (s: AddressSuggestion) => {
    queryId.current++; // invalidate any in-flight query
    setValue(s.label);
    setResults([]);
    setOpen(false);
    setActive(-1);
    onSelect(s);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="addr-ac">
      <input
        className="addr-ac-input"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {loading ? <span className="addr-ac-spinner" aria-label="Searching" /> : null}
      {open ? (
        <ul className="addr-ac-list" id={listId} role="listbox">
          {failed ? (
            <li className="addr-ac-msg">Couldn&apos;t search right now — try again.</li>
          ) : results.length === 0 ? (
            <li className="addr-ac-msg">No matches.</li>
          ) : (
            results.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={
                    i === active ? 'addr-ac-item addr-ac-item--active' : 'addr-ac-item'
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s)}
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
