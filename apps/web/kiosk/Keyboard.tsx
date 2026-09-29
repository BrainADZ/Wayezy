import { Glyph } from '../icons/glyphs';

const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** Large on-screen keyboard for touch kiosks (no physical keyboard on the unit). */
export function Keyboard({
  onKey,
  onBackspace,
  onSpace,
  onClear,
  onDone,
  doneLabel,
}: {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onClear: () => void;
  onDone: () => void;
  doneLabel: string;
}) {
  return (
    <div className="keyboard" role="group" aria-label="On-screen keyboard">
      {rows.map((row, index) => (
        <div className={`keyboard-row row-${index}`} key={row}>
          {row.split('').map((key) => (
            <button
              key={key}
              type="button"
              className="key"
              onClick={() => onKey(key.toLowerCase())}
            >
              {key}
            </button>
          ))}
          {index === 3 ? (
            <button
              type="button"
              className="key is-wide"
              onClick={onBackspace}
              aria-label="Backspace"
            >
              <Glyph name="backspace" size={30} />
            </button>
          ) : null}
        </div>
      ))}
      <div className="keyboard-row row-actions">
        <button type="button" className="key is-muted" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="key is-space" onClick={onSpace} aria-label="Space">
          space
        </button>
        <button type="button" className="key is-primary" onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
