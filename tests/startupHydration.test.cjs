const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const mock = require('./storage.cjs');
const gameModule = require('../build/engine-tests/src/store/gameStore.js');
mock.restore();
const { useGameStore: store, getGameHydrationStatus, subscribeGameHydrationStatus, retryGameHydration } = gameModule;
const engine = require('../build/engine-tests/src/engine/x01.js');
const { THEMES } = require('../build/engine-tests/src/theme/themes.js');
const key = 'darts-tracker-store-v1';
const tick = () => new Promise(resolve => setImmediate(resolve));
function Navigation() { throw new Error('Navigation must not mount before ready'); }
const originalLoad = Module._load;
let App;
try {
  // Inspect the real root's elements with native components and hook snapshots stubbed.
  // Hydration, subscriptions, middleware, recovery and storage remain real.
  Module._load = function(id, ...args) {
    if (id === 'react') return { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (id === 'react-native') return { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable' };
    if (id.endsWith('/navigation/RootNavigator')) return { default: Navigation, __esModule: true };
    if (id.endsWith('/theme/useAppTheme') || id === './useAppTheme') return { useAppTheme: () => THEMES.neonArena };
    return originalLoad.call(this, id, ...args);
  };
  App = require('../build/engine-tests/App.js').default;
} finally { Module._load = originalLoad; }
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
function blocked(status) {
  assert.equal(getGameHydrationStatus().status, status);
  const root = App();
  assert.notEqual(root.type, Navigation);
  const nodes = elements(root);
  assert.equal(nodes.some(node => node.type === Navigation), false);
  assert.equal(nodes.some(node => ['New Game', 'Players', 'Start'].includes(node.props.label)), false);
  if (status === 'loading') {
    assert.equal(nodes.some(node => node.type === 'ActivityIndicator'), true);
    assert.equal(nodes.some(node => node.props.label === 'Retry'), false);
  }
  return nodes;
}
function ready() {
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(getGameHydrationStatus().status, 'ready');
  assert.equal(App().type, Navigation);
}
function seed(kind = 'partial', bestOfLegs = 3) {
  store.getState().addPlayer('Alice');
  store.getState().startMatch({ playerIds: ['a', 'b'], startScore: 40, bestOfLegs });
  if (kind === 'checkout') {
    const leg = engine.commitTurn(engine.applyDart(store.getState().currentLegState, engine.createDartThrow(20, 2))).legState;
    leg.visits[0].legId = store.getState().currentLegId;
    store.setState({ currentLegState: leg });
  } else {
    store.getState().addDart(10, 1, store.getState().currentLegId);
  }
  const saved = mock.values.get(key);
  store.setState(store.getInitialState(), true);
  mock.values.set(key, saved);
  return saved;
}
function controlWrites(t) {
  const original = mock.storage.setItem;
  const writes = [];
  mock.storage.setItem = (writeKey, value) => new Promise((resolve, reject) => {
    writes.push({ value, reject, resolve: () => { mock.values.set(writeKey, value); resolve(); } });
  });
  t.after(() => { mock.storage.setItem = original; });
  return writes;
}
test.before(async () => { await store.persist.rehydrate(); });
test.beforeEach(() => { store.setState(store.getInitialState(), true); mock.values.clear(); });

test('fresh installation hydrates before root mount without writing storage', async t => {
  const writes = controlWrites(t);
  await store.persist.rehydrate();
  ready();
  assert.equal(writes.length, 0);
  assert.equal(mock.values.has(key), false);
});

test('normal partial-visit hydration becomes ready with no additional write', async t => {
  seed();
  const writes = controlWrites(t);
  const notifications = [];
  const unsubscribe = subscribeGameHydrationStatus(() => notifications.push(getGameHydrationStatus().status));
  t.after(unsubscribe);
  const hydration = store.persist.rehydrate();
  blocked('loading');
  await hydration;
  ready();
  assert.deepEqual(notifications, ['loading', 'ready']);
  assert.equal(writes.length, 0);
  assert.equal(store.getState().players[0].name, 'Alice');
  assert.equal(store.getState().currentLegState.turnDarts.length, 1);
  assert.equal(store.getState().currentLegState.scoresByPlayer.a, 30);
});

test('delayed initial storage read blocks navigation and mutation controls', async t => {
  const originalRead = mock.storage.getItem;
  let release;
  mock.storage.getItem = () => new Promise(resolve => { release = resolve; });
  t.after(() => { mock.storage.getItem = originalRead; });
  const hydration = store.persist.rehydrate();
  await tick();
  blocked('loading');
  release(null);
  await hydration;
  ready();
});

test('pending checkout recovery blocks root until durable save and publishes once', async t => {
  const saved = seed('checkout');
  const writes = controlWrites(t);
  const hydration = store.persist.rehydrate();
  await tick();
  blocked('loading');
  assert.equal(store.persist.hasHydrated(), false);
  assert.equal(mock.values.get(key), saved);
  assert.equal(writes.length, 1);
  writes[0].resolve();
  await hydration;
  ready();
  assert.equal(store.getState().currentMatch.legs.length, 1);
  assert.equal(store.getState().currentLegWins.a, 1);
});

test('failed recovery offers functional Retry, preserves original history and blocks repeated presses', async t => {
  const saved = seed('checkout');
  const writes = controlWrites(t);
  const hydration = store.persist.rehydrate();
  await tick();
  writes[0].reject(new Error('write failed'));
  await hydration;
  const nodes = blocked('error');
  assert.equal(store.persist.hasHydrated(), false);
  assert.equal(mock.values.get(key), saved);
  const retryButton = nodes.find(node => node.props.label === 'Retry');
  assert.ok(retryButton);
  retryButton.props.onPress();
  retryButton.props.onPress(); // A stale button callback cannot launch another attempt.
  blocked('loading');
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(mock.values.get(key), saved);
  assert.equal(writes[1].value, writes[0].value);
  const finished = new Promise(resolve => {
    const unsubscribe = store.persist.onFinishHydration(() => { unsubscribe(); resolve(); });
  });
  writes[1].resolve();
  await finished;
  ready();
  const restored = store.getState();
  assert.equal(restored.players[0].name, 'Alice');
  assert.equal(restored.matches.length, 1);
  assert.equal(restored.currentMatch.legs.length, 1);
  assert.equal(restored.currentLegWins.a, 1);
});

test('storage read errors before root mount render error and retry recovers', async t => {
  const originalRead = mock.storage.getItem;
  mock.storage.getItem = async () => { throw new Error('read failed'); };
  t.after(() => { mock.storage.getItem = originalRead; });
  await store.persist.rehydrate();
  blocked('error');
  mock.storage.getItem = originalRead;
  await retryGameHydration();
  ready();
});

test('superseded hydration cannot enable navigation while newer attempt is pending', async t => {
  const originalRead = mock.storage.getItem;
  const reads = [];
  mock.storage.getItem = () => new Promise(resolve => { reads.push(resolve); });
  t.after(() => { mock.storage.getItem = originalRead; });
  const first = store.persist.rehydrate();
  await tick();
  const second = store.persist.rehydrate();
  reads[0](null);
  await first;
  await tick();
  blocked('loading');
  assert.equal(store.persist.hasHydrated(), false);
  reads[1](null);
  await second;
  ready();
});

test('match-ending recovery enables root with completed history and no active match', async t => {
  seed('checkout', 1);
  const writes = controlWrites(t);
  const hydration = store.persist.rehydrate();
  await tick();
  blocked('loading');
  writes[0].resolve();
  await hydration;
  ready();
  assert.equal(store.getState().currentMatch, undefined);
  assert.equal(store.getState().matches[0].status, 'COMPLETED');
  assert.equal(store.getState().matches[0].legs.length, 1);
  await store.persist.rehydrate();
  ready();
  assert.equal(writes.length, 1);
});
