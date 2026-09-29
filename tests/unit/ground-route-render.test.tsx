import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroundRoute } from '../../apps/web/explorer/ground-route';
import { findGroundDirectoryRoute } from '../../packages/routing/ground-directory';

test('ground route keeps the full path visible and advances its highlighted segment', () => {
  const route = findGroundDirectoryRoute(
    'ground-entry-starbucks',
    'ground-tenant-cafe-dori',
    false,
  );
  assert.ok(route);
  const plan = renderToStaticMarkup(
    <svg>
      <GroundRoute route={route} stepIndex={null} />
    </svg>,
  );
  const first = renderToStaticMarkup(
    <svg>
      <GroundRoute route={route} stepIndex={0} />
    </svg>,
  );
  const second = renderToStaticMarkup(
    <svg>
      <GroundRoute route={route} stepIndex={1} />
    </svg>,
  );
  assert.match(plan, /class="directory-route-line"[^>]*vector-effect="non-scaling-stroke"/);
  assert.doesNotMatch(plan, /directory-route-active-line/);
  assert.match(first, /class="directory-route-active-line" points="97\.59,493\.49 195,493\.49"/);
  assert.match(second, /class="directory-route-active-line" points="195,493\.49 195,610"/);
  assert.match(second, /class="directory-route-line"/);
});
