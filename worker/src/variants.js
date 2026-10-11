// Stable internal designations are per canonical game, never part of IGDB IDs.
export function suffixForIndex(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('index');
  let n = index + 1, result = '';
  while (n > 0) { n--; result = String.fromCharCode(97 + (n % 26)) + result; n = Math.floor(n / 26); }
  return result;
}
export function nextSuffix(used) {
  const taken = new Set(used.filter(Boolean));
  for (let i = 0; i < 10000; i++) { const s = suffixForIndex(i); if (!taken.has(s)) return s; }
  throw new RangeError('Too many variants for game');
}
export function variantLabel(gameId, suffix) {
  return `${gameId}.${suffix}`;
}
