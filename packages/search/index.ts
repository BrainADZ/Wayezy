import type { Category, Poi, Snapshot, Tenant } from '../domain';

/**
 * Intent search for tenants and amenities.
 *
 * Queries are normalised (case, accents, punctuation), expanded with synonyms, and matched per
 * field with exact / plural / prefix / typo-tolerant scoring. Field weights favour names and
 * what a place is *for* (cuisine, product types) over long descriptions. Generic words such as
 * "food" or "shop" help ranking but are never required, so "Italian food" finds Italian
 * restaurants and "running shoes" finds sports stores.
 */

export const synonyms: Record<string, string[]> = {
  toilet: ['washroom'],
  toilets: ['washroom'],
  restroom: ['washroom'],
  restrooms: ['washroom'],
  bathroom: ['washroom'],
  loo: ['washroom'],
  wc: ['washroom'],
  washrooms: ['washroom'],
  movie: ['cinema', 'movies'],
  movies: ['cinema'],
  film: ['cinema', 'movies'],
  films: ['cinema', 'movies'],
  theatre: ['cinema'],
  theater: ['cinema'],
  imax: ['cinema'],
  makeup: ['makeup', 'cosmetics', 'beauty'],
  'make-up': ['makeup'],
  cosmetics: ['makeup', 'beauty'],
  lipsticks: ['lipstick'],
  perfume: ['fragrance'],
  perfumes: ['fragrance'],
  sneakers: ['shoes', 'sneakers'],
  trainers: ['shoes', 'sneakers'],
  footwear: ['shoes'],
  shoe: ['shoes'],
  mobile: ['mobile', 'phone', 'smartphone'],
  mobiles: ['mobile', 'phone'],
  cellphone: ['phone', 'smartphone'],
  smartphone: ['phone'],
  phones: ['phone'],
  iphone: ['iphone', 'phone'],
  laptop: ['laptop', 'computer', 'electronics'],
  laptops: ['laptop'],
  computer: ['laptop', 'computer'],
  gadgets: ['electronics'],
  tech: ['electronics'],
  kids: ['kids', 'children'],
  kid: ['kids'],
  children: ['kids'],
  child: ['kids'],
  childrens: ['kids'],
  baby: ['baby', 'kids'],
  clothes: ['clothes', 'clothing', 'fashion'],
  clothing: ['clothes', 'fashion'],
  apparel: ['clothes', 'fashion'],
  dress: ['dresses', 'fashion'],
  cafe: ['coffee', 'cafe'],
  café: ['coffee', 'cafe'],
  espresso: ['coffee'],
  latte: ['coffee'],
  cappuccino: ['coffee'],
  chai: ['tea'],
  cash: ['atm'],
  bank: ['atm'],
  atms: ['atm'],
  elevator: ['lift'],
  lifts: ['lift'],
  car: ['parking'],
  park: ['parking'],
  info: ['information'],
  help: ['information', 'customer'],
  nappy: ['baby'],
  diaper: ['baby'],
  feeding: ['baby'],
  namaz: ['prayer'],
  mosque: ['prayer'],
  chemist: ['pharmacy'],
  medicine: ['pharmacy'],
  medicines: ['pharmacy'],
  doctor: ['first', 'pharmacy'],
  groceries: ['grocery'],
  supermarket: ['grocery'],
  specs: ['eyewear'],
  shades: ['sunglasses'],
  jeans: ['jeans', 'denim'],
  icecream: ['ice', 'gelato'],
  gelato: ['gelato', 'dessert'],
  sweets: ['sweets', 'dessert'],
  burger: ['burger', 'burgers'],
  burgers: ['burger'],
  pizzas: ['pizza'],
  noodles: ['noodles', 'chinese'],
  cab: ['taxi'],
  uber: ['taxi'],
  ola: ['taxi'],
  exit: ['exit', 'entrance'],
  gaming: ['games', 'arcade'],
};

/** Words that express intent but should never be required to match. */
const genericWords = new Set([
  'food',
  'foods',
  'shop',
  'shops',
  'store',
  'stores',
  'place',
  'places',
  'restaurant',
  'restaurants',
  'outlet',
]);
const stopWords = new Set([
  'the',
  'a',
  'an',
  'for',
  'to',
  'me',
  'some',
  'i',
  'my',
  'is',
  'in',
  'at',
  'of',
  'and',
  'with',
  'near',
  'nearest',
  'best',
  'good',
  'buy',
  'want',
  'find',
  'where',
  'get',
  'need',
  'please',
  'show',
]);

export const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9ऀ-ॿ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function levenshtein(a: string, b: string, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function wordScore(term: string, word: string) {
  if (word === term) return 10;
  if (word === `${term}s` || `${word}s` === term || word === `${term}es`) return 9;
  if (term.length >= 2 && word.startsWith(term)) return term.length >= 3 ? 7 : 5;
  if (term.length >= 4) {
    const allowed = term.length >= 7 ? 2 : 1;
    if (levenshtein(term, word, allowed) <= allowed) return 5;
  }
  return 0;
}

interface Field {
  words: string[];
  weight: number;
}

const fieldOf = (weight: number, ...values: (string | undefined | null)[]): Field => ({
  words: normalise(values.filter(Boolean).join(' ')).split(' ').filter(Boolean),
  weight,
});

function termScore(term: string, fields: Field[]) {
  let best = 0;
  for (const field of fields) {
    for (const word of field.words) {
      const s = wordScore(term, word) * field.weight;
      if (s > best) best = s;
    }
  }
  return best;
}

export interface SearchResult {
  id: string;
  name: string;
  floorId: string;
  nodeId: string;
  category: string;
  categoryId: string;
  clue: string;
  kind: 'tenant' | 'poi';
  group: 'food' | 'shops' | 'entertainment' | 'services' | 'amenities';
  poiType?: Poi['type'];
  score: number;
}

export interface ParsedQuery {
  terms: { term: string; alternatives: string[] }[];
  generic: string[];
}

export function parseQuery(query: string): ParsedQuery {
  const words = normalise(query).split(' ').filter(Boolean);
  const terms: ParsedQuery['terms'] = [];
  const generic: string[] = [];
  for (const word of words) {
    if (stopWords.has(word)) continue;
    if (genericWords.has(word)) {
      generic.push(word);
      continue;
    }
    terms.push({ term: word, alternatives: [word, ...(synonyms[word] ?? [])] });
  }
  return { terms, generic };
}

const poiTypeWords: Record<Poi['type'], string> = {
  Washroom: 'washroom toilet restroom',
  AccessibleWashroom: 'accessible washroom toilet restroom disabled wheelchair',
  ATM: 'atm cash bank',
  Parking: 'parking car park',
  Lift: 'lift elevator',
  Escalator: 'escalator',
  Stairs: 'stairs staircase',
  Information: 'information help desk info',
  CustomerCare: 'customer care help lost found gift cards',
  BabyCare: 'baby care feeding changing nursing',
  PrayerRoom: 'prayer room',
  Entrance: 'entrance exit way out',
  Exit: 'exit way out',
  Taxi: 'taxi cab pick up ride',
  FirstAid: 'first aid medical',
};

const groupFor = (categoryId: string): SearchResult['group'] =>
  categoryId === 'dining'
    ? 'food'
    : categoryId === 'cinema' || categoryId === 'entertainment' || categoryId === 'kids'
      ? 'entertainment'
      : categoryId === 'services' || categoryId === 'health'
        ? 'services'
        : 'shops';

function rank(
  parsed: ParsedQuery,
  fields: Field[],
  name: string,
  rawQuery: string,
  genericFields: Field[],
) {
  if (!parsed.terms.length && !parsed.generic.length) return 0;
  let total = 0;
  let matched = 0;
  for (const { alternatives } of parsed.terms) {
    let best = 0;
    alternatives.forEach((alt, index) => {
      const s = termScore(alt, fields) * (index === 0 ? 1 : 0.9);
      if (s > best) best = s;
    });
    if (best > 0) matched++;
    total += best;
  }
  for (const word of parsed.generic) total += termScore(word, genericFields) * 0.3;
  const required = parsed.terms.length;
  if (required > 0) {
    if (matched === 0) return 0;
    const coverage = matched / required;
    if (coverage < 0.5) return 0;
    total *= coverage * coverage;
  } else if (total === 0) {
    return 0;
  }
  const normalName = normalise(name);
  const normalQuery = normalise(rawQuery);
  if (normalName === normalQuery) total += 60;
  else if (normalQuery.length >= 3 && normalName.startsWith(normalQuery)) total += 25;
  return Math.round(total * 10) / 10;
}

export function search(
  data: Pick<Snapshot, 'tenants' | 'pois' | 'categories' | 'floors'>,
  query: string,
  categoryId = '',
  floorId = '',
): SearchResult[] {
  const parsed = parseQuery(query);
  const compact = query.replace(/[\s-]/g, '').toLowerCase();
  const categoriesById = new Map(data.categories.map((c) => [c.id, c]));
  // Floor names only ("level 2", "l2"); floor themes like "Cinema & Dining" would add noise.
  const floorText = (id: string) => {
    const floor = data.floors.find((f) => f.id === id);
    return floor ? `${floor.name} ${floor.shortName}` : id;
  };

  const tenantResults = data.tenants
    .filter(
      (t) =>
        t.status !== 'HIDDEN' &&
        (!categoryId || t.categoryId === categoryId) &&
        (!floorId || t.floorId === floorId),
    )
    .map((t: Tenant): SearchResult => {
      const category = categoriesById.get(t.categoryId);
      const fields = [
        fieldOf(1, t.name, t.tradingName),
        fieldOf(0.9, t.subcategory, ...(t.dining?.cuisines ?? []), ...t.productTypes),
        fieldOf(
          0.75,
          ...t.keywords,
          ...t.brands,
          ...t.services,
          ...(t.dining?.dietary ?? []),
          ...(t.cinema?.showtimes.map((s) => s.title) ?? []),
        ),
        fieldOf(0.6, category?.name, ...(category?.synonyms ?? [])),
        fieldOf(0.35, t.shortSummary, t.description),
        fieldOf(0.3, floorText(t.floorId)),
      ];
      const genericFields = [
        fieldOf(1, category?.name, ...(category?.synonyms ?? []), t.subcategory, t.name),
      ];
      let score = rank(parsed, fields, t.name, query, genericFields);
      if (compact.length >= 3 && t.unitNumber.replace(/[\s-]/g, '').toLowerCase() === compact)
        score += 100;
      const cuisine = t.dining?.cuisines.slice(0, 2).join(' · ');
      return {
        id: t.id,
        name: t.name,
        floorId: t.floorId,
        nodeId: t.nodeId,
        category: category?.name ?? '',
        categoryId: t.categoryId,
        clue: cuisine || t.productTypes.slice(0, 3).join(' · '),
        kind: 'tenant',
        group: groupFor(t.categoryId),
        score: t.anchor && score > 0 ? score + 0.5 : score,
      };
    });

  const poiResults = categoryId
    ? []
    : data.pois
        .filter((p) => p.status === 'ACTIVE' && (!floorId || p.floorId === floorId))
        .map((p: Poi): SearchResult => {
          // Accessible variants rank just below the standard amenity unless the query asks for them.
          const typeWeight = p.type === 'AccessibleWashroom' ? 0.85 : 0.95;
          const fields = [
            fieldOf(1, p.name),
            fieldOf(typeWeight, poiTypeWords[p.type]),
            fieldOf(0.35, p.description),
            fieldOf(0.3, floorText(p.floorId)),
          ];
          return {
            id: p.id,
            name: p.name,
            floorId: p.floorId,
            nodeId: p.nodeId,
            category: 'Amenities',
            categoryId: 'amenities',
            clue: p.description,
            kind: 'poi',
            group: 'amenities',
            poiType: p.type,
            score: rank(parsed, fields, p.name, query, [fieldOf(1, p.name)]),
          };
        });

  const ranked = [...tenantResults, ...poiResults]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  // Drop weak partial matches that would bury strong ones (e.g. "running shoes" → not every clothes shop).
  const threshold = (ranked[0]?.score ?? 0) * 0.2;
  return ranked.filter((r) => r.score >= threshold);
}

/** Helpful alternatives for zero-result searches. */
export function suggestAlternatives(
  data: Pick<Snapshot, 'tenants' | 'pois' | 'categories' | 'floors'>,
  query: string,
) {
  const vocabulary = new Set<string>();
  for (const t of data.tenants) {
    for (const word of normalise(
      [t.name, t.subcategory, ...t.keywords, ...t.productTypes, ...(t.dining?.cuisines ?? [])].join(
        ' ',
      ),
    ).split(' ')) {
      if (word.length >= 3) vocabulary.add(word);
    }
  }
  for (const c of data.categories)
    for (const word of normalise([c.name, ...c.synonyms].join(' ')).split(' '))
      if (word.length >= 3) vocabulary.add(word);
  for (const word of Object.keys(synonyms)) vocabulary.add(word);
  for (const words of Object.values(poiTypeWords))
    for (const word of words.split(' ')) vocabulary.add(word);

  const parsed = parseQuery(query);
  let changed = false;
  const corrected = parsed.terms.map(({ term }) => {
    if (vocabulary.has(term) || term.length < 3) return term;
    let best: { word: string; distance: number } | null = null;
    for (const word of vocabulary) {
      const d = levenshtein(term, word, 2);
      if (
        d <= 2 &&
        (!best || d < best.distance || (d === best.distance && word.length < best.word.length))
      )
        best = { word, distance: d };
    }
    if (best) {
      changed = true;
      return best.word;
    }
    return term;
  });
  const didYouMean =
    changed && corrected.length && search(data, corrected.join(' ')).length
      ? corrected.join(' ')
      : null;
  const primaryCategories: Category[] = data.categories
    .filter((c) => c.primary)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    didYouMean,
    categories: primaryCategories,
    popular: ['Coffee', 'Italian food', 'Running shoes', 'Mobile phones', 'Cinema', 'Washroom'],
  };
}
