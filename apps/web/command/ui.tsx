import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Glyph } from '../icons/glyphs';
import { AdminIcon } from '../icons/admin';
import { illustratedIconNames } from '../icons/illustrated';
import { useLatest } from '../shared/hooks';
import type { Media } from '../../../packages/domain';

/* ------------------------------------------------------------------ */
/* Layout                                                               */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="cmd-page-header">
      <div>
        {eyebrow ? <span className="cmd-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="cmd-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`cmd-panel ${className ?? ''}`}>
      {title || actions ? (
        <header className="cmd-panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="cmd-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
  children: ReactNode;
}) {
  return <span className={`cmd-badge is-${tone}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: string;
  tone: string;
}) {
  return (
    <div className="cmd-stat" style={{ ['--stat' as string]: tone }}>
      <span className="cmd-stat-icon">
        <Glyph name={icon} size={24} strokeWidth={1.9} />
      </span>
      <div>
        <span className="cmd-stat-label">{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

export function Empty({
  icon = 'search',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cmd-empty">
      <Glyph name={icon} size={34} strokeWidth={1.7} />
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                                */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  searchText,
  filters,
  empty,
  pageSize = 50,
  selectedId,
  toolbar,
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  searchText?: (row: T) => string;
  filters?: ReactNode;
  empty?: ReactNode;
  pageSize?: number;
  selectedId?: string | null;
  toolbar?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
    const column = sort ? columns.find((c) => c.key === sort.key) : null;
    if (column?.sort && sort)
      list = [...list].sort((a, b) =>
        column.sort!(a) > column.sort!(b)
          ? sort.dir
          : column.sort!(a) < column.sort!(b)
            ? -sort.dir
            : 0,
      );
    return list;
  }, [rows, query, sort, columns, searchText]);
  useEffect(() => setPage(0), [query, rows.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div className="cmd-table-wrap">
      {searchText || filters || toolbar ? (
        <div className="cmd-table-toolbar">
          {searchText ? (
            <label className="cmd-search">
              <Glyph name="search" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search table"
              />
            </label>
          ) : null}
          {filters}
          <span className="cmd-table-count">
            {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          </span>
          {toolbar}
        </div>
      ) : null}
      <div className="cmd-table-scroll">
        <table className="cmd-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align }}
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined
                  }
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          sort?.key === c.key
                            ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 }
                            : { key: c.key, dir: 1 },
                        )
                      }
                    >
                      {c.header}
                      <Glyph
                        name={sort?.key === c.key && sort.dir === -1 ? 'chevronUp' : 'chevronDown'}
                        size={12}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className={`${onRowClick ? 'is-clickable' : ''} ${selectedId === row.id ? 'is-selected' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align }}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? (
          <div className="cmd-table-empty">{empty ?? 'Nothing here yet.'}</div>
        ) : null}
      </div>
      {pages > 1 ? (
        <div className="cmd-pager">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <Glyph name="chevronLeft" size={16} /> Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next <Glyph name="chevronRight" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                             */
/* ------------------------------------------------------------------ */

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline closures; keep the latest in a ref so focus is taken once on open,
  // not on every keystroke re-render.
  const close = useLatest(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [close]);
  return (
    <div className="cmd-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className={`cmd-drawer ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="cmd-drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="cmd-icon-btn" onClick={onClose} aria-label="Close">
            <Glyph name="close" size={18} />
          </button>
        </header>
        <div className="cmd-drawer-body">{children}</div>
        {footer ? <footer className="cmd-drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const close = useLatest(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A modal opened from a drawer closes first; the drawer stays open.
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [close]);
  return (
    <div className="cmd-modal-backdrop" onMouseDown={onClose}>
      <div
        className="cmd-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="cmd-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="cmd-icon-btn" onClick={onClose} aria-label="Close">
            <Glyph name="close" size={18} />
          </button>
        </header>
        <div className="cmd-modal-body">{children}</div>
        {footer ? <footer className="cmd-drawer-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmButton({
  label,
  confirmLabel = 'Confirm delete',
  onConfirm,
  disabled,
  tone = 'danger',
}: {
  label: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  tone?: 'danger' | 'default';
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-outline'} ${armed ? 'is-armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          void onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                          */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  wide,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  wide?: boolean;
}) {
  return (
    <div className={`cmd-field ${error ? 'has-error' : ''} ${wide ? 'is-wide' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <span className="cmd-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="cmd-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  type = 'text',
  wide,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide={wide}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  error,
  rows = 3,
  wide = true,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  rows?: number;
  wide?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      hint={hint ?? (maxLength ? `${value.length}/${maxLength}` : undefined)}
      error={error}
      htmlFor={id}
      wide={wide}
    >
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  wide,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string;
  wide?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide={wide}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="cmd-field is-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="cmd-toggle"
        onClick={() => onChange(!checked)}
      >
        <i className="switch" aria-hidden="true" />
        <span>
          <strong>{label}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
      </button>
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <span className="cmd-color">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
        />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </span>
    </Field>
  );
}

export function TagInput({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder = 'Type and press Enter',
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide>
      <div className="cmd-tags">
        {value.map((tag) => (
          <span key={tag} className="cmd-tag">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
            >
              <Glyph name="close" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && value.length)
              onChange(value.slice(0, -1));
          }}
          onBlur={add}
        />
      </div>
    </Field>
  );
}

export function ChipSelect({
  label,
  options,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} wide>
      <div className="cmd-chip-select" role="group" aria-label={label}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              className={on ? 'is-on' : ''}
              onClick={() =>
                onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
              }
            >
              {on ? <Glyph name="check" size={14} /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function IconPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} wide>
      <div className="cmd-icon-picker" role="radiogroup" aria-label={label}>
        {illustratedIconNames.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name || (value === 'home' && name === 'homeLifestyle')}
            className={
              value === name || (value === 'home' && name === 'homeLifestyle') ? 'is-on' : ''
            }
            onClick={() => onChange(name)}
            title={name}
          >
            <AdminIcon name={name} size={22} />
            <span>{name.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}

export function MediaPicker({
  label,
  value,
  onChange,
  media,
  kind = 'image',
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  media: Media[];
  kind?: 'image' | 'video' | 'any';
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = media.filter((m) => kind === 'any' || m.kind === kind);
  const current = media.find((m) => m.url === value);
  return (
    <Field label={label} hint={hint} wide>
      <div className="cmd-media-picker">
        <div className="cmd-media-current">
          {value ? (
            current?.kind === 'video' ? (
              <video src={value} muted />
            ) : (
              <img src={value} alt="" />
            )
          ) : (
            <span className="cmd-media-none">Illustrated default</span>
          )}
          <span>{current?.name ?? (value ? value : 'No media selected')}</span>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(!open)}>
          <Glyph name="image" size={16} /> {open ? 'Close library' : 'Choose'}
        </button>
        {value ? (
          <button type="button" className="btn btn-ghost" onClick={() => onChange('')}>
            Clear
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="cmd-media-grid is-picker">
          {options.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`cmd-media-tile ${m.url === value ? 'is-on' : ''}`}
              onClick={() => {
                onChange(m.url);
                setOpen(false);
              }}
            >
              {m.kind === 'video' ? (
                <video src={m.url} muted />
              ) : (
                <img src={m.url} alt="" loading="lazy" />
              )}
              <span>{m.name}</span>
            </button>
          ))}
          {!options.length ? (
            <p className="cmd-muted">Upload media in the Media Library first.</p>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="cmd-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'is-active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                               */
/* ------------------------------------------------------------------ */

export function LineChart({
  series,
  labels,
  height = 240,
}: {
  series: { name: string; color: string; values: number[] }[];
  labels: string[];
  height?: number;
}) {
  const width = 760;
  const pad = { l: 44, r: 16, t: 16, b: 30 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice =
    Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) *
    Math.pow(10, Math.floor(Math.log10(max)));
  const x = (i: number) =>
    pad.l + (labels.length <= 1 ? 0 : (i * (width - pad.l - pad.r)) / (labels.length - 1));
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / nice);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="cmd-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Chart of ${series.map((s) => s.name).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y(nice * f)}
              y2={y(nice * f)}
              stroke="#e8e5dc"
            />
            <text x={pad.l - 8} y={y(nice * f) + 4} textAnchor="end" className="cmd-chart-axis">
              {Math.round(nice * f)}
            </text>
          </g>
        ))}
        {labels.map((label, i) => (
          <text
            key={label + i}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            className="cmd-chart-axis"
          >
            {label}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <path
              d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 2.5} fill={s.color} />
            ))}
          </g>
        ))}
        {labels.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - (width - pad.l - pad.r) / Math.max(1, labels.length - 1) / 2}
            y={pad.t}
            width={(width - pad.l - pad.r) / Math.max(1, labels.length - 1)}
            height={height - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.t}
            y2={height - pad.b}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        ) : null}
      </svg>
      <div className="cmd-chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} /> {s.name}
            {hover !== null ? <b> {s.values[hover]}</b> : null}
          </span>
        ))}
        {hover !== null ? <span className="cmd-muted">{labels[hover]}</span> : null}
      </div>
    </div>
  );
}

export function BarList({
  items,
  color = '#1a5cff',
  empty = 'No data yet.',
}: {
  items: { label: string; value: number; hint?: string }[];
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="cmd-muted">{empty}</p>;
  return (
    <ol className="cmd-barlist">
      {items.map((item, i) => (
        <li key={item.label + i}>
          <span className="cmd-barlist-rank">{i + 1}</span>
          <span className="cmd-barlist-label">
            {item.label}
            {item.hint ? <small>{item.hint}</small> : null}
          </span>
          <span className="cmd-barlist-bar">
            <i style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </span>
          <b>{item.value.toLocaleString('en-IN')}</b>
        </li>
      ))}
    </ol>
  );
}

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso))
    : '—';

export const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return 'Never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
};
