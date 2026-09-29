import { createDemoSnapshot } from './demo';

export { createDemoSnapshot, DEMO_VERSION, floorThemes, unitColors, demoTenants } from './demo';

/**
 * Module-level demo snapshot used by unit tests and as the offline bootstrap.
 * Call `createDemoSnapshot()` when an independent, mutable copy is needed.
 */
export const demo = createDemoSnapshot();
