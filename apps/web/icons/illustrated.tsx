import type { CSSProperties, ReactNode } from 'react';

/**
 * WAY EZY illustrated icon family.
 *
 * Flat, chunky retail illustrations on a 64×64 grid: rounded geometry, 2–4 strong colours per
 * icon, one darker "side" shape for depth and a soft highlight. No outlines, no emoji, no
 * third-party icon fonts. Used for categories, amenities, map markers and key visitor actions.
 */
export const palette = {
  red: '#f04b4b',
  redDark: '#c9363a',
  coral: '#ff6b5b',
  orange: '#ff9f2e',
  orangeDark: '#e07b12',
  yellow: '#ffc53d',
  yellowDark: '#e9a712',
  green: '#2fb36e',
  greenDark: '#1e8c52',
  teal: '#14a89c',
  tealDark: '#0e7f76',
  blue: '#2f6bff',
  blueDark: '#1d4ed8',
  sky: '#8fd3f7',
  skyLight: '#c9ecff',
  purple: '#7c5cff',
  purpleDark: '#5b3fd6',
  pink: '#ff5c9a',
  pinkDark: '#d63c7a',
  navy: '#1e3a5f',
  navyDark: '#152b47',
  slate: '#94a3b8',
  cream: '#fff4e0',
  creamDark: '#ecdcc0',
  white: '#ffffff',
  skin: '#ffd2b0',
};
const p = palette;

const art: Record<string, ReactNode> = {
  fashion: (
    <>
      <path d="M13 23h38l4 30.5a5 5 0 0 1-5 5.5H14a5 5 0 0 1-5-5.5z" fill={p.red} />
      <path d="M44 23h7l4 30.5a5 5 0 0 1-5 5.5h-4z" fill={p.redDark} />
      <path
        d="M23 26v-7a9 9 0 0 1 18 0v7"
        fill="none"
        stroke="#8e2332"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M24 34.5l6-3.5h4l6 3.5 3.6 5.6-4.6 2.5-1.8-2.3V51H26.8V40.3L25 42.6l-4.6-2.5z"
        fill={p.white}
      />
      <path d="M29.6 31h4.8a2.4 2.4 0 0 1-4.8 0z" fill="#ffd9d9" />
    </>
  ),
  dining: (
    <g transform="translate(5.5 7) scale(0.84)">
      <g transform="rotate(38 32 34)">
        <rect x="29" y="27" width="6" height="31" rx="3" fill={p.teal} />
        <rect x="24" y="17" width="16" height="12" rx="6" fill={p.teal} />
        <rect x="24" y="5" width="3.6" height="16" rx="1.8" fill={p.teal} />
        <rect x="30.2" y="5" width="3.6" height="16" rx="1.8" fill={p.teal} />
        <rect x="36.4" y="5" width="3.6" height="16" rx="1.8" fill={p.teal} />
        <rect x="32.5" y="27" width="2.5" height="31" rx="1.2" fill={p.tealDark} />
      </g>
      <g transform="rotate(-38 32 34)">
        <ellipse cx="32" cy="15" rx="8.5" ry="11" fill={p.yellow} />
        <path
          d="M32 4a8.5 11 0 0 1 8.5 11 8.5 11 0 0 1-8.5 11z"
          fill={p.yellowDark}
          opacity="0.55"
        />
        <rect x="29" y="24" width="6" height="34" rx="3" fill={p.yellow} />
        <ellipse cx="29" cy="11" rx="2.2" ry="4.2" fill={p.white} opacity="0.6" />
      </g>
      <path
        d="M52 5l2.6-3.4M59 12l4-1.6M46 2.5l.5-3"
        stroke={p.orange}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  ),
  cinema: (
    <>
      <g transform="rotate(-11 10 24)">
        <rect x="9" y="13" width="46" height="10" rx="2.5" fill={p.navy} />
        <path d="M17 13h7l-5 10h-7zM31 13h7l-5 10h-7zM45 13h7l-5 10h-7z" fill={p.white} />
      </g>
      <rect x="9" y="25" width="46" height="31" rx="5" fill={p.navy} />
      <rect x="46" y="25" width="9" height="31" rx="4" fill={p.navyDark} />
      <rect x="14" y="30.5" width="33" height="20.5" rx="3" fill={p.cream} />
      <path d="M27 35l11 5.8-11 5.8z" fill={p.coral} />
      <circle cx="11.5" cy="25" r="3" fill={p.yellow} />
      <path
        d="M58 30l4-2M59 38h4M58 46l4 2"
        stroke={p.orange}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </>
  ),
  beauty: (
    <>
      <path d="M20 30V16.5L31 9v21z" fill="#ff5c7a" />
      <path d="M26 12.8L31 9v21h-5z" fill="#e0405f" />
      <rect x="18" y="28" width="15" height="8" rx="1.8" fill={p.yellow} />
      <rect x="28" y="28" width="5" height="8" rx="1.5" fill={p.yellowDark} />
      <rect x="17" y="35" width="17" height="23" rx="3.5" fill={p.navy} />
      <rect x="28" y="35" width="6" height="23" rx="3" fill={p.navyDark} />
      <rect x="39" y="41" width="13" height="17" rx="6.5" fill={p.navy} />
      <rect x="41.5" y="36.5" width="8" height="6" rx="2" fill={p.navyDark} />
      <path d="M49 12l1.7 5.3L56 19l-5.3 1.7L49 26l-1.7-5.3L42 19l5.3-1.7z" fill={p.pink} />
    </>
  ),
  electronics: (
    <>
      <path
        d="M40 31a12 12 0 0 1 21 0"
        fill="none"
        stroke={p.yellow}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <rect x="37.5" y="31" width="7" height="15" rx="3.5" fill={p.yellow} />
      <rect x="56" y="31" width="7" height="15" rx="3.5" fill={p.navy} />
      <g transform="rotate(-9 22 34)">
        <rect x="8" y="9" width="28" height="48" rx="6.5" fill={p.navy} />
        <rect x="12" y="14.5" width="20" height="35" rx="3" fill={p.sky} />
        <path d="M12 38l20-19v8.5L12 46.5z" fill={p.white} opacity="0.45" />
        <rect x="18" y="52" width="8" height="2.4" rx="1.2" fill={p.sky} />
      </g>
    </>
  ),
  services: (
    <>
      <circle cx="32" cy="15" r="8.5" fill={p.navy} />
      <path d="M17 35a15 12.5 0 0 1 30 0z" fill={p.navy} />
      <path d="M11 35h42l-3.5 21.5A3.5 3.5 0 0 1 46 59.5H18a3.5 3.5 0 0 1-3.5-3z" fill={p.red} />
      <rect x="8" y="32" width="48" height="7" rx="3.5" fill={p.coral} />
      <path d="M46 39h7l-3.5 17.5A3.5 3.5 0 0 1 46 59.5h-2.5z" fill={p.redDark} />
      <circle cx="32" cy="48" r="7.5" fill={p.white} />
      <rect x="30.4" y="46.3" width="3.2" height="6.4" rx="1.6" fill={p.red} />
      <circle cx="32" cy="43.2" r="1.9" fill={p.red} />
    </>
  ),
  offers: (
    <>
      <g transform="rotate(-38 32 32)">
        <path d="M15 19h24.5L54 32 39.5 45H15a5 5 0 0 1-5-5V24a5 5 0 0 1 5-5z" fill={p.red} />
        <path d="M39.5 19L54 32 39.5 45z" fill={p.redDark} />
        <circle cx="42.5" cy="32" r="3.2" fill={p.cream} />
        <circle cx="19.5" cy="27" r="3.3" fill="none" stroke={p.white} strokeWidth="2.8" />
        <circle cx="30" cy="37" r="3.3" fill="none" stroke={p.white} strokeWidth="2.8" />
        <path d="M31 25L18.5 39" stroke={p.white} strokeWidth="3" strokeLinecap="round" />
      </g>
      <path
        d="M50 9a5 5 0 1 1 6 6"
        fill="none"
        stroke={p.navy}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M55 30l5-2M52 39l4 3" stroke={p.orange} strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  events: (
    <>
      <rect x="9" y="14" width="46" height="44" rx="7" fill={p.cream} />
      <path d="M16 14h32a7 7 0 0 1 7 7v7H9v-7a7 7 0 0 1 7-7z" fill={p.red} />
      <rect x="19" y="7" width="5.5" height="13" rx="2.75" fill={p.navy} />
      <rect x="39.5" y="7" width="5.5" height="13" rx="2.75" fill={p.navy} />
      <g fill={p.creamDark}>
        <rect x="14.5" y="33" width="6" height="5" rx="1.5" />
        <rect x="14.5" y="42" width="6" height="5" rx="1.5" />
        <rect x="43.5" y="33" width="6" height="5" rx="1.5" />
        <rect x="43.5" y="42" width="6" height="5" rx="1.5" />
        <rect x="14.5" y="50" width="6" height="4" rx="1.5" />
        <rect x="43.5" y="50" width="6" height="4" rx="1.5" />
      </g>
      <path
        d="M32 32.5l3.2 6.5 7.1 1-5.2 5 1.3 7.1L32 48.8l-6.4 3.3 1.3-7.1-5.2-5 7.1-1z"
        fill={p.yellow}
      />
    </>
  ),
  search: (
    <>
      <rect
        x="38"
        y="33"
        width="9"
        height="26"
        rx="4.5"
        transform="rotate(-45 42.5 46)"
        fill={p.red}
      />
      <circle cx="27" cy="27" r="19" fill={p.teal} />
      <circle cx="27" cy="27" r="13" fill={p.sky} />
      <path
        d="M18 23a10 10 0 0 1 9-8"
        fill="none"
        stroke={p.white}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.8"
      />
    </>
  ),
  information: (
    <>
      <circle cx="32" cy="32" r="21" fill={p.yellow} />
      <path d="M32 11a21 21 0 0 1 0 42z" fill={p.yellowDark} opacity="0.35" />
      <circle cx="32" cy="21.5" r="3.6" fill={p.navy} />
      <path d="M27 29h7v14h3v4.5H27V43h3v-9.5h-3z" fill={p.navy} />
      <path
        d="M4 32h4M56 32h4M9 17l3.5 2M9 47l3.5-2M55 17l-3.5 2M55 47l-3.5-2"
        stroke={p.orange}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </>
  ),
  parking: (
    <>
      <rect x="8" y="8" width="48" height="48" rx="11" fill={p.blue} />
      <rect x="13" y="13" width="38" height="38" rx="8" fill={p.blueDark} />
      <path
        fillRule="evenodd"
        d="M24 19h10.5a9.5 9.5 0 0 1 0 19H30v9h-6zm6 5.5v8h4.3a4 4 0 0 0 0-8z"
        fill={p.white}
      />
    </>
  ),
  washroom: (
    <>
      <circle cx="18" cy="12.5" r="5.5" fill={p.blue} />
      <rect x="11.5" y="20" width="13" height="19" rx="5" fill={p.blue} />
      <rect x="12.5" y="35" width="5" height="21" rx="2.5" fill={p.blue} />
      <rect x="18.5" y="35" width="5" height="21" rx="2.5" fill={p.blueDark} />
      <rect x="30.8" y="10" width="2.6" height="46" rx="1.3" fill={p.slate} />
      <circle cx="46" cy="12.5" r="5.5" fill={p.pink} />
      <path d="M41.5 20h9a3 3 0 0 1 2.9 2.2L58 40H34l4.6-17.8A3 3 0 0 1 41.5 20z" fill={p.pink} />
      <rect x="40.5" y="39" width="4.5" height="17" rx="2.25" fill={p.pink} />
      <rect x="47" y="39" width="4.5" height="17" rx="2.25" fill={p.pinkDark} />
    </>
  ),
  accessibleWashroom: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="13" fill="#e3edff" />
      <circle cx="28" cy="15" r="4.6" fill={p.blue} />
      <path
        d="M28 21v12h10l4 9"
        fill="none"
        stroke={p.blue}
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.5 30a11 11 0 1 0 14.5 14"
        fill="none"
        stroke={p.blue}
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d="M48 11c3 4.3 5 7.2 5 9.6a5 5 0 0 1-10 0c0-2.4 2-5.3 5-9.6z" fill={p.teal} />
    </>
  ),
  atm: (
    <>
      <rect x="11" y="6" width="42" height="52" rx="6" fill={p.green} />
      <rect x="45" y="6" width="8" height="52" rx="4" fill={p.greenDark} />
      <rect x="16" y="12" width="29" height="15" rx="3" fill={p.navy} />
      <path
        d="M20.5 23.5l3-8h2l3 8M22 21h5M31 15.5h7M34.5 15.5v8M40.5 23.5v-8l2.5 4.5 2.5-4.5v8"
        fill="none"
        stroke={p.white}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-2 0)"
      />
      <rect x="16" y="33" width="29" height="7" rx="3.5" fill={p.navy} />
      <rect x="20.5" y="37" width="20" height="15" rx="1.5" fill={p.white} />
      <rect x="20.5" y="37" width="20" height="4" fill={p.sky} />
    </>
  ),
  lift: (
    <>
      <path d="M26 9l-4.5 6h9z" fill={p.green} />
      <path d="M38 15l-4.5-6h9z" fill={p.coral} />
      <rect x="10" y="18" width="44" height="40" rx="4" fill="#64748b" />
      <rect x="14" y="22" width="17" height="36" fill="#a6dcf7" />
      <rect x="33" y="22" width="17" height="36" fill="#a6dcf7" />
      <path
        d="M17 44l10-12M36 44l10-12"
        stroke={p.white}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <rect x="31" y="22" width="2" height="36" fill={p.navy} />
    </>
  ),
  escalator: (
    <>
      <path d="M9 45h10.5L38 24h13a7 7 0 0 1 0 14h-8.5L24 59H9a7 7 0 0 1 0-14z" fill={p.teal} />
      <path
        d="M9 50.5h12.8L40.5 29.5H51"
        fill="none"
        stroke="#7de0d4"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="11" r="5" fill={p.navy} />
      <path d="M18.5 18h6.5l5 18.5-6.5 3-3.5-11.5v13h-5V22a4 4 0 0 1 3.5-4z" fill={p.navy} />
      <path
        d="M40 17l12-9M45 7.5h7.5V15"
        fill="none"
        stroke={p.orange}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  stairs: (
    <>
      <path d="M7 58V49h12V38h12V27h12V16h14v42z" fill={p.navy} />
      <path d="M50 16h7v42h-7z" fill={p.navyDark} />
      <path
        d="M12 31l13-13M17.5 16.5H26v8.5"
        fill="none"
        stroke={p.orange}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  accessibility: (
    <>
      <circle cx="30" cy="10.5" r="5.8" fill={p.blue} />
      <path
        d="M30 19v17h13.5l6 13"
        fill="none"
        stroke={p.blue}
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M30 27h10" stroke={p.blue} strokeWidth="5" strokeLinecap="round" />
      <path
        d="M21 31a15.5 15.5 0 1 0 20.5 19.5"
        fill="none"
        stroke={p.blue}
        strokeWidth="5.6"
        strokeLinecap="round"
      />
    </>
  ),
  babyCare: (
    <>
      <path d="M26 12h12l-2.5-5.5a3.5 3.5 0 0 0-7 0z" fill={p.yellow} />
      <rect x="22" y="12" width="20" height="9" rx="3" fill={p.pink} />
      <rect x="21" y="20" width="22" height="38" rx="8" fill="#b9d8ff" />
      <rect x="34" y="20" width="9" height="38" rx="6" fill="#97c3ff" />
      <path d="M21 31h7M21 38h9M21 45h7" stroke={p.white} strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M52 15.5c-2-3.6-7-2.3-7 1.3 0 3.3 7 7.5 7 7.5s7-4.2 7-7.5c0-3.6-5-4.9-7-1.3z"
        fill={p.coral}
      />
    </>
  ),
  prayerRoom: (
    <>
      <path d="M32 5.5l1.8 4.2-1.8 1.8-1.8-1.8z" fill={p.yellow} />
      <path d="M17 36a15 17 0 0 1 30 0z" fill={p.green} />
      <path d="M32 19a15 17 0 0 1 15 17H32z" fill={p.greenDark} opacity="0.35" />
      <rect x="31" y="11" width="2" height="9" fill={p.yellowDark} />
      <rect x="15" y="35" width="34" height="23" fill={p.cream} />
      <rect x="8" y="41" width="8" height="17" fill={p.creamDark} />
      <rect x="48" y="41" width="8" height="17" fill={p.creamDark} />
      <path d="M26 58V47a6 6 0 0 1 12 0v11z" fill={p.greenDark} />
    </>
  ),
  exit: (
    <>
      <path d="M10 8h24v6H16v38h6v6H10z" fill={p.navy} />
      <path d="M24 12l30-5v52l-30-5z" fill={p.green} />
      <path d="M50 8v50l-4-.8V8.8z" fill={p.greenDark} />
      <path
        d="M29 33h14m-5-6 6 6-6 6"
        fill="none"
        stroke={p.white}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  entrance: (
    <>
      <rect x="8" y="54" width="48" height="5" rx="2.5" fill={p.creamDark} />
      <path d="M28 6h26v48H28z" fill={p.navy} />
      <path d="M32 10h18v44H32z" fill="#a6dcf7" />
      <path
        d="M35 36l12-14"
        stroke={p.white}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M6 32h26m-7-7 7 7-7 7"
        fill="none"
        stroke={p.blue}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  home: (
    <>
      <rect x="41" y="10" width="7" height="14" rx="1.5" fill={p.redDark} />
      <path d="M14 30h36v24a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill={p.cream} />
      <path
        d="M6 32L32 9l26 23"
        fill="none"
        stroke={p.red}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 58V45a6 6 0 0 1 12 0v13z" fill={p.navy} />
      <rect x="38" y="38" width="8" height="8" rx="1.5" fill="#d9c49e" />
    </>
  ),
  directions: (
    <>
      <rect x="29.5" y="6" width="5" height="52" rx="2.5" fill={p.navy} />
      <path d="M17 12h31l7 7-7 7H17a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" fill={p.yellow} />
      <path d="M47 30H16l-7 7 7 7h31a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3z" fill={p.teal} />
      <rect x="21" y="17.2" width="21" height="3.6" rx="1.8" fill={p.white} />
      <rect x="21" y="35.2" width="21" height="3.6" rx="1.8" fill={p.white} />
    </>
  ),
  qr: (
    <>
      <path
        d="M8 18V11a3 3 0 0 1 3-3h7M46 8h7a3 3 0 0 1 3 3v7M56 46v7a3 3 0 0 1-3 3h-7M18 56h-7a3 3 0 0 1-3-3v-7"
        fill="none"
        stroke={p.red}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <g fill={p.navy}>
        <path fillRule="evenodd" d="M15 15h13v13H15zm4 4v5h5v-5z" />
        <path fillRule="evenodd" d="M36 15h13v13H36zm4 4v5h5v-5z" />
        <path fillRule="evenodd" d="M15 36h13v13H15zm4 4v5h5v-5z" />
        <rect x="36" y="36" width="5" height="5" rx="1" />
        <rect x="44" y="36" width="5" height="5" rx="1" />
        <rect x="40" y="44" width="5" height="5" rx="1" />
        <rect x="31" y="15" width="3" height="3" rx="0.8" />
        <rect x="31" y="22" width="3" height="6" rx="0.8" />
        <rect x="31" y="31" width="3" height="3" rx="0.8" />
      </g>
      <rect x="47" y="44" width="4" height="5" rx="1" fill={p.teal} />
    </>
  ),
  phone: (
    <>
      <path
        d="M13 22a14 14 0 0 0 0 20M7 17a21 21 0 0 0 0 30M51 22a14 14 0 0 1 0 20M57 17a21 21 0 0 1 0 30"
        fill="none"
        stroke={p.green}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <rect x="18" y="6" width="28" height="52" rx="7" fill={p.navy} />
      <rect x="22" y="12" width="20" height="40" rx="3" fill={p.sky} />
      <path d="M22 40l20-22v9L22 49z" fill={p.white} opacity="0.4" />
      <rect x="28" y="8.5" width="8" height="2" rx="1" fill={p.sky} />
    </>
  ),
  map: (
    <>
      <path d="M6 16l14-5v43l-14 5z" fill={p.green} />
      <path d="M20 11l14 5v43l-14-5z" fill={p.blue} />
      <path d="M34 16l14-5v43l-14 5z" fill={p.teal} />
      <path d="M48 11l10 4v43l-10-4z" fill={p.yellow} />
      <path d="M20 32l14 5v10l-14-5z" fill={p.skyLight} opacity="0.5" />
      <path
        d="M36 4a10 10 0 0 1 10 10c0 7.4-10 17-10 17S26 21.4 26 14A10 10 0 0 1 36 4z"
        fill={p.red}
      />
      <circle cx="36" cy="14" r="4" fill={p.white} />
    </>
  ),
  floor: (
    <>
      <path d="M32 40l24 10-24 10L8 50z" fill={p.blue} />
      <path d="M32 26l24 10-24 10L8 36z" fill={p.purple} />
      <path d="M32 12l24 10-24 10L8 22z" fill={p.pink} />
      <path d="M32 32l24-10v2L32 34z" fill={p.pinkDark} opacity="0.6" />
      <path d="M32 46l24-10v2L32 48z" fill={p.purpleDark} opacity="0.6" />
    </>
  ),
  currentLocation: (
    <>
      <circle cx="32" cy="32" r="26" fill={p.blue} opacity="0.16" />
      <circle cx="32" cy="32" r="18" fill={p.blue} opacity="0.22" />
      <circle cx="32" cy="32" r="11" fill={p.white} />
      <circle cx="32" cy="32" r="8" fill={p.blue} />
      <circle cx="29.5" cy="29.5" r="2.2" fill={p.white} opacity="0.7" />
    </>
  ),
  destination: (
    <>
      <ellipse cx="32" cy="53" rx="20" ry="7.5" fill="none" stroke={p.yellow} strokeWidth="4.5" />
      <ellipse cx="32" cy="53" rx="8" ry="3" fill={p.yellow} />
      <path
        d="M32 4a16 16 0 0 1 16 16c0 12-16 30-16 30S16 32 16 20A16 16 0 0 1 32 4z"
        fill={p.red}
      />
      <path d="M32 4a16 16 0 0 1 16 16c0 12-16 30-16 30z" fill={p.redDark} opacity="0.35" />
      <circle cx="32" cy="20" r="6.5" fill={p.white} />
    </>
  ),
  help: (
    <>
      <path d="M11 58a21 15 0 0 1 42 0z" fill={p.red} />
      <rect x="34" y="47" width="11" height="4" rx="2" fill={p.white} />
      <circle cx="32" cy="27" r="12" fill={p.skin} />
      <path d="M20 26a12 12.5 0 0 1 24 0c-3-4-8-6-13-4.5-4 1.2-7.5 3-11 4.5z" fill={p.navy} />
      <path
        d="M17 29a15 15 0 0 1 30 0"
        fill="none"
        stroke={p.navy}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <rect x="13" y="24" width="7" height="12" rx="3.5" fill={p.navy} />
      <rect x="44" y="24" width="7" height="12" rx="3.5" fill={p.navy} />
      <path
        d="M47.5 36c0 5-4 8-9 8h-3"
        fill="none"
        stroke={p.navy}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="34" cy="44" r="2.4" fill={p.navy} />
    </>
  ),
  language: (
    <>
      <circle cx="26" cy="36" r="20" fill={p.teal} />
      <path
        d="M26 16c-6 5-9 12-9 20s3 15 9 20M26 16c6 5 9 12 9 20s-3 15-9 20M6.5 31h39M6.5 41h39"
        fill="none"
        stroke="#7de0d4"
        strokeWidth="2.4"
      />
      <path
        d="M40 6h16a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-7l-6 5v-5h-3a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z"
        fill={p.orange}
      />
      <path
        d="M43.5 23l4.5-12 4.5 12M45 19h6"
        fill="none"
        stroke={p.white}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  notifications: (
    <>
      <path d="M32 7a15 15 0 0 1 15 15v13l5 8H12l5-8V22A15 15 0 0 1 32 7z" fill={p.yellow} />
      <path d="M32 7a15 15 0 0 1 15 15v13l5 8H32z" fill={p.yellowDark} opacity="0.45" />
      <path d="M25 47h14a7 7 0 0 1-14 0z" fill={p.orange} />
      <circle cx="47" cy="13" r="8" fill={p.red} />
      <rect x="45.6" y="9" width="2.8" height="5.5" rx="1.4" fill={p.white} />
      <circle cx="47" cy="17" r="1.5" fill={p.white} />
    </>
  ),
  sports: (
    <>
      <path
        d="M9 45V23a5 5 0 0 1 5-5h6c2 7 6.5 10.5 12 10.5l14.5 7.5H52a9 9 0 0 1 9 9z"
        fill={p.green}
      />
      <path d="M46.5 36H52a9 9 0 0 1 9 9H40z" fill={p.greenDark} />
      <path d="M9 23a5 5 0 0 1 5-5h6c.8 2.8 2 5 3.5 6.8L12 33H9z" fill={p.teal} />
      <path
        d="M15 40c10-1 20-5 29-10"
        fill="none"
        stroke={p.white}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M26 27.5l2.5-4M31.5 29.5l2.5-4M37 32.5l2.5-4"
        stroke={p.navy}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M5 45h56a0 0 0 0 1 0 0v4a6 6 0 0 1-6 6H10a5 5 0 0 1-5-5z" fill={p.white} />
      <path d="M5 50h56v-1a6 6 0 0 1-6 6H10a5 5 0 0 1-5-5z" fill="#d7dee8" />
      <path d="M4 12h10M2 18h8" stroke={p.orange} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  homeLifestyle: (
    <>
      <rect x="12" y="16" width="40" height="22" rx="7" fill={p.yellow} />
      <rect x="6" y="28" width="12" height="20" rx="5" fill={p.orange} />
      <rect x="46" y="28" width="12" height="20" rx="5" fill={p.orangeDark} />
      <rect x="14" y="33" width="36" height="13" rx="4" fill={p.yellowDark} />
      <rect x="10" y="46" width="44" height="6" rx="3" fill={p.orange} />
      <rect x="12" y="51" width="4" height="7" rx="1.5" fill={p.navy} />
      <rect x="48" y="51" width="4" height="7" rx="1.5" fill={p.navy} />
    </>
  ),
  kids: (
    <>
      <circle cx="18" cy="16" r="7" fill="#e07b52" />
      <circle cx="46" cy="16" r="7" fill="#e07b52" />
      <circle cx="18" cy="16" r="3.5" fill={p.skin} />
      <circle cx="46" cy="16" r="3.5" fill={p.skin} />
      <circle cx="32" cy="31" r="17" fill="#f08a5d" />
      <ellipse cx="32" cy="37" rx="8" ry="6" fill={p.skin} />
      <circle cx="25" cy="28" r="2.4" fill={p.navy} />
      <circle cx="39" cy="28" r="2.4" fill={p.navy} />
      <path d="M29.5 34.5h5l-2.5 2.8z" fill={p.navy} />
      <path d="M22 50l10 4 10-4-10-4z" fill={p.pink} />
      <circle cx="32" cy="50" r="2.5" fill={p.pinkDark} />
    </>
  ),
  entertainment: (
    <>
      <path
        d="M17 18h30c7 0 11 6 12 14l2 12c.8 5-3 9-7.5 7.5L45 48H19l-8.5 3.5C6 53 2.2 49 3 44l2-12c1-8 5-14 12-14z"
        fill={p.purple}
      />
      <path d="M45 48l8.5 3.5C58 53 61.8 49 61 44l-2-12c-.8-6-3.2-11-8-13z" fill={p.purpleDark} />
      <rect x="14" y="29" width="14" height="4.6" rx="2.3" fill={p.white} />
      <rect x="18.7" y="24.3" width="4.6" height="14" rx="2.3" fill={p.white} />
      <circle cx="42" cy="27.5" r="3.2" fill={p.yellow} />
      <circle cx="49" cy="33" r="3.2" fill={p.pink} />
      <circle cx="42" cy="38.5" r="3.2" fill={p.teal} />
    </>
  ),
  grocery: (
    <>
      <circle cx="22" cy="20" r="9" fill={p.red} />
      <path
        d="M22 11c0-3 2-5 5-5"
        fill="none"
        stroke={p.greenDark}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M34 22c6-10 18-10 22-4-8-2-14 1-18 8z" fill={p.yellow} />
      <path d="M8 28h48l-5 26a4 4 0 0 1-4 3H17a4 4 0 0 1-4-3z" fill={p.green} />
      <path d="M44 28h12l-5 26a4 4 0 0 1-4 3h-3z" fill={p.greenDark} />
      <path
        d="M20 36v14M28 36v14M36 36v14"
        stroke="#8fe0b3"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  ),
  health: (
    <>
      <rect x="8" y="8" width="48" height="48" rx="12" fill={p.teal} />
      <path d="M26 17h12v9h9v12h-9v9H26v-9h-9V26h9z" fill={p.white} />
      <g transform="rotate(-40 48 48)">
        <rect x="38" y="42" width="22" height="11" rx="5.5" fill={p.coral} />
        <rect x="49" y="42" width="11" height="11" rx="5.5" fill={p.yellow} />
        <rect x="47" y="42" width="4" height="11" fill={p.yellow} />
      </g>
    </>
  ),
  taxi: (
    <>
      <rect x="24" y="6" width="16" height="7" rx="2" fill={p.navy} />
      <path d="M16 14h32l6 16H10z" fill={p.yellow} />
      <path d="M20 17h24l4 11H16z" fill="#a6dcf7" />
      <rect x="6" y="29" width="52" height="19" rx="6" fill={p.yellow} />
      <rect x="6" y="38" width="52" height="10" rx="5" fill={p.yellowDark} />
      <circle cx="16" cy="37" r="4" fill={p.white} />
      <circle cx="48" cy="37" r="4" fill={p.white} />
      <rect x="10" y="47" width="10" height="10" rx="3" fill={p.navy} />
      <rect x="44" y="47" width="10" height="10" rx="3" fill={p.navy} />
    </>
  ),
  firstAid: (
    <>
      <rect
        x="22"
        y="8"
        width="20"
        height="10"
        rx="3"
        fill="none"
        stroke={p.navy}
        strokeWidth="4"
      />
      <rect x="6" y="16" width="52" height="40" rx="8" fill={p.red} />
      <rect x="46" y="16" width="12" height="40" rx="6" fill={p.redDark} />
      <path d="M27 25h10v8h8v10h-8v8H27v-8h-8V33h8z" fill={p.white} />
    </>
  ),
  customerCare: null,
  sparkle: (
    <>
      <path d="M32 6l5 16 16 5-16 5-5 16-5-16-16-5 16-5z" fill={p.yellow} />
      <path d="M50 42l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={p.pink} />
    </>
  ),
};
art.customerCare = art.help;

export type IllustratedIconName = keyof typeof art;
export const illustratedIconNames = Object.keys(art) as IllustratedIconName[];

export function WayIcon({
  name,
  size = 48,
  title,
  className,
  style,
}: {
  name: string;
  size?: number | string;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const content = art[name] ?? art.sparkle;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className ? `way-icon ${className}` : 'way-icon'}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
}

/** Category id → illustrated icon. Categories store their icon key, so admins can change it. */
export const categoryIconOptions: IllustratedIconName[] = [
  'fashion',
  'dining',
  'cinema',
  'beauty',
  'electronics',
  'services',
  'sports',
  'homeLifestyle',
  'kids',
  'entertainment',
  'grocery',
  'health',
  'offers',
  'events',
];
export const categoryIcon = (icon: string) => (icon === 'home' ? 'homeLifestyle' : icon);

export const poiIcon: Record<string, IllustratedIconName> = {
  Washroom: 'washroom',
  AccessibleWashroom: 'accessibleWashroom',
  ATM: 'atm',
  Parking: 'parking',
  Lift: 'lift',
  Escalator: 'escalator',
  Stairs: 'stairs',
  Information: 'information',
  CustomerCare: 'customerCare',
  BabyCare: 'babyCare',
  PrayerRoom: 'prayerRoom',
  Entrance: 'entrance',
  Exit: 'exit',
  Taxi: 'taxi',
  FirstAid: 'firstAid',
};
