import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { demo } from '../../packages/domain/seed';
import { search, suggestAlternatives } from '../../packages/search';

const ids = (query: string, n = 6) =>
  search(demo, query)
    .slice(0, n)
    .map((r) => r.id);
const top = (query: string) => search(demo, query)[0];

describe('intent search', () => {
  const expectations: [string, string[]][] = [
    ['shoes', ['nike', 'adidas', 'decathlon']],
    ['running shoes', ['nike', 'adidas', 'decathlon']],
    ['makeup', ['sephora', 'health-glow']],
    ['lipstick', ['sephora', 'health-glow']],
    ['coffee', ['starbucks', 'coffee-bean']],
    ['Italian food', ['olive-trattoria', 'pizza-express']],
    ['pizza', ['pizza-express', 'olive-trattoria']],
    ['kids clothes', ['little-explorers']],
    ['mobile phone', ['apple', 'croma', 'samsung']],
    ['electronics', ['croma', 'apple']],
  ];
  for (const [query, expected] of expectations) {
    it(`"${query}" finds ${expected.join(', ')}`, () => {
      const found = ids(query, 8);
      for (const id of expected)
        assert.ok(found.includes(id), `${id} missing from ${found.join(', ')}`);
    });
  }

  it('ranks dedicated Italian restaurants above loosely related places', () => {
    const results = search(demo, 'Italian food');
    assert.deepEqual(
      results
        .slice(0, 2)
        .map((r) => r.id)
        .sort(),
      ['olive-trattoria', 'pizza-express'],
    );
    assert.ok(results.every((r) => r.group === 'food'));
  });

  it('maps cinema synonyms to the cinema only', () => {
    assert.equal(top('cinema').id, 'pvr');
    assert.equal(top('movie').id, 'pvr');
    assert.equal(top('films').id, 'pvr');
    assert.equal(search(demo, 'movie').length, 1);
  });

  it('finds amenities with synonyms', () => {
    assert.equal(top('ATM').poiType, 'ATM');
    assert.equal(top('washroom').poiType, 'Washroom');
    assert.equal(top('toilet').poiType, 'Washroom');
    assert.equal(top('elevator').poiType, 'Lift');
    assert.equal(top('accessible toilet').poiType, 'AccessibleWashroom');
  });

  it('matches exact names, prefixes, unit numbers and typos', () => {
    assert.equal(top('Zara').id, 'zara');
    assert.equal(top('sepho').id, 'sephora');
    assert.equal(top('L2-07').id, 'olive-trattoria');
    assert.equal(top('starbuks').id, 'starbucks');
    assert.ok(ids('resturant').length > 0);
  });

  it('filters by category and floor', () => {
    assert.ok(search(demo, 'shoes', 'fashion').every((r) => r.categoryId === 'fashion'));
    assert.ok(search(demo, 'coffee', '', 'l2').every((r) => r.floorId === 'l2'));
  });

  it('returns no results for nonsense and offers helpful alternatives', () => {
    assert.equal(search(demo, 'xqzvw plorg').length, 0);
    const alternatives = suggestAlternatives(demo, 'cofee');
    assert.equal(alternatives.didYouMean, 'coffee');
    assert.ok(alternatives.categories.length >= 6);
    assert.ok(alternatives.popular.length > 0);
  });
});
