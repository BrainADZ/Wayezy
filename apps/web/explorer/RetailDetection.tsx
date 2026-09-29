import { useEffect, useRef, useState } from 'react';
import {
  applyRetailDebug,
  detectRetailModules,
  parsePlan,
  type DetectionReport,
} from '../../../packages/svg-retail/detect';
import './retail-detection.css';

export default function RetailDetection() {
  const host = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<DetectionReport>();
  const [error, setError] = useState('');
  const [debug, setDebug] = useState(true);
  const source =
    new URLSearchParams(window.location.search).get('source') ?? '/maps/ground-floor-master.svg';
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    async function load() {
      try {
        if (!source.startsWith('/maps/') || source.includes('..'))
          throw new Error('Choose a local SVG under /maps/.');
        const response = await fetch(source, { signal: controller.signal });
        if (!response.ok) throw new Error(`SVG not found: ${source} (${response.status}).`);
        const text = await response.text();
        if (!text.trimStart().startsWith('<svg') && !text.includes('<svg'))
          throw new Error(
            `SVG not found: ${source}. Place the architectural file at public${source}.`,
          );
        const svg = parsePlan(text);
        if (disposed || !host.current) return;
        host.current.replaceChildren(svg);
        await document.fonts.ready;
        if (disposed) return;
        const result = detectRetailModules(svg);
        result.source = source;
        applyRetailDebug(svg, result);
        setReport(result);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      host.current?.replaceChildren();
    };
  }, [source]);
  useEffect(() => {
    host.current?.querySelector('svg')?.setAttribute('data-retail-debug', debug ? 'on' : 'off');
  }, [debug, report]);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'retail-detection-report.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="retail-detection">
      <h1>Retail module detection</h1>
      <p>
        Original architectural SVG · <code>{source}</code>
      </p>
      <label>
        <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Debug
        highlighting
      </label>
      <p className="retail-legend">
        Blue: detected · Amber: uncertain · Purple: green footprint without a label
      </p>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">Inspecting SVG geometry and module labels…</p>}
      <div className="retail-review">
        <div
          ref={host}
          className="retail-original"
          aria-label="Original architectural floor plan with detection overlay"
        />
        {report && (
          <aside aria-label="Detection report">
            <p>
              {report.modules.filter((m) => m.status === 'detected').length} detected ·{' '}
              {report.modules.filter((m) => m.status === 'uncertain').length} uncertain ·{' '}
              {report.modules.filter((m) => m.status === 'unmatched').length} unmatched
            </p>
            <button onClick={download}>Download JSON report</button>
            {report.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {report.modules.map((m, i) => (
                  <tr key={`${m.id}-${i}`} data-status={m.status}>
                    <td>{m.id}</td>
                    <td>
                      {m.status}
                      {m.reasons.map((reason) => (
                        <small key={reason}>{reason}</small>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.unassigned.length > 0 && (
              <details>
                <summary>Unassigned green footprints ({report.unassigned.length})</summary>
                {report.unassigned.map((c, i) => (
                  <p key={i}>
                    unassigned-{i + 1}: {c.reason} ({c.shapeIndexes.length} original shapes)
                  </p>
                ))}
              </details>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
