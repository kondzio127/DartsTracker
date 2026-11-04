const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_THEME_ID,
  THEME_IDS,
  THEMES,
  getTheme,
} = require('../build/engine-tests/src/theme/themes.js');

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrastRatio(a, b) {
  const hi = Math.max(relativeLuminance(a), relativeLuminance(b));
  const lo = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

test('Neon Arena is the default and all four themes exist', () => {
  assert.equal(DEFAULT_THEME_ID, 'neonArena');
  assert.equal(THEME_IDS.length, 4);
  assert.deepEqual(Object.keys(THEMES), [...THEME_IDS]);
  assert.equal(THEMES.clubhousePaper.isDark, false);
});

test('every theme has valid semantic hex tokens and readable primary button text', () => {
  const colors = ['background', 'surface', 'surfaceRaised', 'foreground', 'muted', 'accent', 'onAccent', 'border'];
  for (const id of THEME_IDS) {
    const theme = getTheme(id);
    for (const name of colors) {
      assert.match(theme[name], /^#[\da-fA-F]{6}$/, `${id}.${name} must be #RRGGBB`);
    }
    assert.ok(contrastRatio(theme.accent, theme.onAccent) >= 4.5,
      `${id} primary button needs at least 4.5:1 text contrast`);
  }
});
