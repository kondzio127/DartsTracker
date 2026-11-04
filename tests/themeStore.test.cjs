const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./storage.cjs');
const { useThemeStore: store } = require('../build/engine-tests/src/theme/themeStore.js');
const { THEME_IDS } = require('../build/engine-tests/src/theme/themes.js');
mock.restore();

test('every theme persists and rehydrates independently of game data', async () => {
  await store.persist.rehydrate();
  assert.equal(store.getState().themeId, 'neonArena');
  mock.values.set('darts-tracker-store-v1', 'untouched game data');
  for (const themeId of THEME_IDS) {
    store.getState().setTheme(themeId);
    const saved = mock.values.get('darts-tracker-theme-v1');
    assert.deepEqual(JSON.parse(saved), { state: { themeId }, version: 1 });
    store.setState({ themeId: 'neonArena' });
    mock.values.set('darts-tracker-theme-v1', saved);
    await store.persist.rehydrate();
    assert.equal(store.getState().themeId, themeId);
  }
  assert.equal(mock.values.get('darts-tracker-store-v1'), 'untouched game data');
});

test('invalid stored theme falls back to Neon Arena and keeps setter', async () => {
  mock.values.set('darts-tracker-theme-v1', JSON.stringify({ state: { themeId: 'toString' }, version: 1 }));
  await store.persist.rehydrate();
  assert.equal(store.getState().themeId, 'neonArena');
  store.getState().setTheme('precisionLab');
  assert.equal(store.getState().themeId, 'precisionLab');
});
