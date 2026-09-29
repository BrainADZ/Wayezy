import { GATE_ICON_PATH, HERE_PIN_PATH } from './ground-symbols';

/** Uses the exact symbols embedded in the prepared inline floor plan. */
export function GroundLegendIcon({ kind }: { kind: string }) {
  if (kind === 'You Are Here')
    return (
      <svg
        className="directory-guide-icon"
        viewBox="-20 -49 40 52"
        width="24"
        height="28"
        aria-hidden="true"
      >
        <path d={HERE_PIN_PATH} fill="#075b4b" stroke="#fffaf0" strokeWidth="2" />
        <circle cx="0" cy="-31" r="6" fill="#fffaf0" />
      </svg>
    );
  if (kind === 'Stairs')
    return (
      <svg
        className="directory-guide-icon"
        viewBox="0 0 24 36"
        width="22"
        height="27"
        aria-hidden="true"
      >
        <use href="#directory-stair-top" width="24" height="36" />
      </svg>
    );
  if (kind === 'Escalator')
    return (
      <svg
        className="directory-guide-icon"
        viewBox="0 0 100 20"
        width="26"
        height="16"
        aria-hidden="true"
      >
        <use href="#directory-escalator-top" width="100" height="20" />
      </svg>
    );
  if (kind === 'Entry gate' || kind === 'Entrance')
    return (
      <svg
        className="directory-guide-icon"
        viewBox="-15 -15 30 30"
        width="26"
        height="26"
        aria-hidden="true"
      >
        <rect
          x="-14"
          y="-14"
          width="28"
          height="28"
          rx="5"
          fill="#075b4b"
          stroke="#fff"
          strokeWidth="1.5"
        />
        <g transform="translate(-10 -10) scale(.8333)" fill="white">
          <path d={GATE_ICON_PATH} />
        </g>
      </svg>
    );
  if (kind === "Men's toilet" || kind === "Women's toilet")
    return (
      <svg
        className="directory-guide-icon"
        viewBox="-19 -19 38 38"
        width="30"
        height="30"
        aria-hidden="true"
      >
        <rect
          x="-18"
          y="-18"
          width="36"
          height="36"
          rx="6"
          fill={kind === "Women's toilet" ? '#775765' : '#075b4b'}
          stroke="#fffdf7"
          strokeWidth="2"
        />
        <use
          href={`#directory-icon-washroom-${kind === "Women's toilet" ? 'female' : 'male'}`}
          x="-13"
          y="-13"
          width="26"
          height="26"
          fill="white"
        />
      </svg>
    );
  const symbol: Record<string, string> = { Lift: 'lift' };
  return (
    <svg
      className="directory-guide-icon"
      viewBox="-15 -15 30 30"
      width="26"
      height="26"
      aria-hidden="true"
    >
      <rect
        x="-14"
        y="-14"
        width="28"
        height="28"
        rx="5"
        fill={kind === 'Entrance' ? '#075b4b' : '#fcfaf4'}
        stroke={kind === 'Entrance' ? '#fff' : '#a6b3a5'}
        strokeWidth="1.5"
      />
      <use
        href={`#directory-icon-${symbol[kind]}`}
        x="-10"
        y="-10"
        width="20"
        height="20"
        fill={kind === 'Entrance' ? 'white' : '#3f5f50'}
      />
    </svg>
  );
}
