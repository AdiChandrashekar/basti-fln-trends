/**
 * Pinned third-party libraries, imported in exactly one place.
 *
 * Everything else in the app imports d3 and Plot from here, so a version bump
 * is a one-line change and no page can accidentally pull a different build.
 *
 * Versions are pinned exactly (no ^ or latest) because the site is served as-is
 * from GitHub Pages with no build step or lockfile — a silently moving CDN
 * version is the only way this dashboard could break without anyone editing it.
 */

export * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
export * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';

export const VERSIONS = {
  d3: '7.9.0',
  plot: '0.6.17',
};
