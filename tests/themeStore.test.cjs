const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./storage.cjs');
const { useThemeStore: store } = require('../build/engine-tests/src/theme/themeStore.js');
const { useGameStore: gameStore } = require('../build/engine-tests/src/store/gameStore.js');
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

test('real game and theme stores save and reload together without interfering', async () => {
  await gameStore.persist.rehydrate();
  gameStore.setState(gameStore.getInitialState(), true);
  gameStore.getState().addPlayer('Alice');
  gameStore.getState().startMatch({ playerIds: ['a', 'b'], startScore: 501 });
  gameStore.getState().addDart(20, 3);
  gameStore.getState().startAroundTheClock(['a', 'b'], 20);
  gameStore.getState().registerAroundTheClockDart(true);
  const gameSave = mock.values.get('darts-tracker-store-v1');

  store.getState().setTheme('tournamentBroadcast');
  const themeSave = mock.values.get('darts-tracker-theme-v1');
  assert.equal(mock.values.get('darts-tracker-store-v1'), gameSave);
  gameStore.getState().addDart(20, 1);
  assert.equal(mock.values.get('darts-tracker-theme-v1'), themeSave);
  const updatedGameSave = mock.values.get('darts-tracker-store-v1');

  gameStore.setState(gameStore.getInitialState(), true);
  store.setState({ themeId: 'neonArena' });
  mock.values.set('darts-tracker-store-v1', updatedGameSave);
  mock.values.set('darts-tracker-theme-v1', themeSave);
  await Promise.all([gameStore.persist.rehydrate(), store.persist.rehydrate()]);

  assert.equal(store.getState().themeId, 'tournamentBroadcast');
  assert.equal(gameStore.getState().players[0].name, 'Alice');
  assert.equal(gameStore.getState().currentLegState.scoresByPlayer.a, 421);
  assert.equal(gameStore.getState().aroundTheClockStatesByPlayer.a.currentTarget, 2);
  assert.equal(gameStore.getState().aroundTheClockUndoStack.length, 1);
});
