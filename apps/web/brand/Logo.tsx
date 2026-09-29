import { useId } from 'react';
import { markRibbons, ribbons, TAGLINE, WORDMARK_HEIGHT, WORDMARK_WIDTH } from './logo-data';

/**
 * WAY EZY wordmark (vector, traced from the approved artwork).
 * `product` adds the sub-brand line: "GO" (mobile) or "COMMAND" (admin).
 */
export function Logo({
  height = 48,
  tagline = true,
  theme = 'light',
  product,
  className,
}: {
  height?: number;
  tagline?: boolean;
  theme?: 'light' | 'dark';
  product?: 'GO' | 'COMMAND';
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const totalHeight = WORDMARK_HEIGHT + (tagline ? 104 : 0);
  // Ribbon overlaps come from opacity alone: inline mix-blend-mode renders as a dark block on
  // software-rasterised Chrome (some kiosk players, headless capture), so it is not used at runtime.
  return (
    <span
      className={`way-logo ${className ?? ''}`}
      style={{ height }}
      role="img"
      aria-label={product ? `WAY EZY ${product}` : 'WAY EZY — Find, Explore, Enjoy'}
    >
      <svg
        viewBox={`-8 -8 ${WORDMARK_WIDTH + 16} ${totalHeight + 16}`}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {ribbons.map((r) => {
            const stops = r.stops.filter(Boolean) as string[];
            return (
              <linearGradient
                key={r.id}
                id={`${uid}-${r.id}`}
                x1="0"
                y1="0"
                x2={r.axis === 'h' ? 1 : 0}
                y2={r.axis === 'v' ? 1 : 0}
              >
                {stops.map((color, i) => (
                  <stop
                    key={color + i}
                    offset={stops.length === 1 ? 0 : i / (stops.length - 1)}
                    stopColor={color}
                  />
                ))}
              </linearGradient>
            );
          })}
        </defs>
        <g>
          {ribbons.map((r) => (
            <polygon
              key={r.id}
              points={r.points}
              fill={`url(#${uid}-${r.id})`}
              stroke={`url(#${uid}-${r.id})`}
              strokeWidth={7}
              strokeLinejoin="round"
              opacity={0.93}
            />
          ))}
        </g>
        {tagline ? (
          <text
            x={WORDMARK_WIDTH / 2}
            y={WORDMARK_HEIGHT + 86}
            textAnchor="middle"
            fontFamily="Inter, 'Segoe UI', sans-serif"
            fontSize="54"
            fontWeight="600"
            letterSpacing="17"
            fill={theme === 'dark' ? '#e8ecf7' : '#34405e'}
          >
            {TAGLINE}
          </text>
        ) : null}
      </svg>
      {product ? (
        <span className={`way-logo-product product-${product.toLowerCase()}`}>{product}</span>
      ) : null}
    </span>
  );
}

export function LogoMark({
  size = 40,
  background = '#ffffff',
}: {
  size?: number;
  background?: string;
}) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className="way-logo-mark"
      role="img"
      aria-label="WAY EZY"
    >
      <defs>
        {markRibbons.map((r) => {
          const stops = r.stops.filter(Boolean) as string[];
          return (
            <linearGradient key={r.id} id={`${uid}-m-${r.id}`} x1="0" y1="0" x2="0" y2="1">
              {stops.map((color, i) => (
                <stop
                  key={color + i}
                  offset={i / Math.max(1, stops.length - 1)}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          );
        })}
      </defs>
      <rect width="512" height="512" rx="112" fill={background} />
      <g transform="translate(78 138) scale(0.93)">
        {markRibbons.map((r) => (
          <polygon
            key={r.id}
            points={r.points}
            fill={`url(#${uid}-m-${r.id})`}
            stroke={`url(#${uid}-m-${r.id})`}
            strokeWidth={7}
            strokeLinejoin="round"
            opacity={0.94}
          />
        ))}
      </g>
      <circle cx="410" cy="392" r="26" fill="#ff4f9a" />
    </svg>
  );
}
