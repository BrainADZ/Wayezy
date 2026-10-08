import type { Floor } from '../index';
import model from './first-floor-model.json';

export const FIRST_FLOOR_SOURCE = '/maps/First%20Floor%20Plan-%20Grand%20View%20High%20Street.svg';
export const FIRST_FLOOR_BOUNDS = model.bounds;

/** Dimensions come directly from the supplied architectural SVG. */
export const firstFloor: Floor = {
  id: 'l1',
  name: 'First Floor',
  shortName: '1',
  theme: 'Grand View High Street',
  level: 1,
  width: 1122.6667,
  height: 1588,
  metresPerUnit: 1,
  outline: [
    [0, 0],
    [1122.6667, 0],
    [1122.6667, 1588],
    [0, 1588],
  ],
  sortOrder: 1,
};
