/**
 * Chart palette for the fleet dashboards.
 *
 * These are not picked by eye. They are the validated categorical slots from
 * the design reference, checked with the palette validator against both
 * surfaces:
 *
 *   light (#fcfcfb): lightness band PASS, chroma PASS,
 *                    CVD ΔE 9.1 (protan, worst adjacent) PASS, normal 22.9 PASS,
 *                    contrast WARN on aqua (2.74) and yellow (2.11)
 *   dark  (#0b0b0b): all five checks PASS, CVD ΔE 8.4
 *
 * ⚠ The light-mode contrast WARN is NOT dismissable: any series drawn in aqua
 * or yellow on the light surface must carry a visible label or appear in a
 * table. Every chart here ships a legend plus either direct labels or a table,
 * so identity never rests on colour alone.
 *
 * Add a 9th series by folding the tail into "Other" — never by generating a
 * new hue, which would be indistinguishable under CVD.
 */

export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#008300', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#008300', '#e66767'],
};

/** Reserved for state. Never reused as "series N". */
export const STATUS = {
  good: '#1baf7a',
  warning: '#eda100',
  serious: '#eb6834',
  critical: '#e34948',
  neutral: '#8a8a85',
};

/** Severity is an ordered scale, so it reads as a ramp rather than 4 identities. */
export const SEVERITY = {
  critical: '#e34948',
  high: '#eb6834',
  warning: '#eda100',
  medium: '#eda100',
  info: '#8a8a85',
  low: '#b5b5ae',
  unknown: '#c9c9c2',
};

export const SURFACE = { light: '#fcfcfb', dark: '#0b0b0b' };

export const INK = {
  light: { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8a85', grid: '#e8e8e4' },
  dark: { primary: '#ffffff', secondary: '#c3c2b7', muted: '#8a8a85', grid: '#242422' },
};

export const seriesColor = (i, dk) => CATEGORICAL[dk ? 'dark' : 'light'][i % 8];

/** A single-hue sequential ramp for magnitude (more = darker). */
export const sequential = (t, dk) => {
  const stops = dk
    ? ['#17334f', '#1d4a73', '#246099', '#2d77bf', '#3987e5']
    : ['#d6e6f8', '#a8caf0', '#73a9e4', '#4a8ddb', '#2a78d6'];
  const i = Math.max(0, Math.min(stops.length - 1, Math.round(t * (stops.length - 1))));
  return stops[i];
};
