const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { THEMES } = require('../build/engine-tests/src/theme/themes.js');
let theme = THEMES.neonArena;
let hookIndex = 0;
let state = [];
const game = {
  players: [{ id: 'a', name: 'A player with a very long name' }, { id: 'b', name: 'Bob' }],
  matches: [
    { id: 'done', status: 'COMPLETED', playerIds: ['a'], createdAt: '2026-01-01' },
    { id: 'active', status: 'IN_PROGRESS', playerIds: ['b'], createdAt: '2026-01-02' },
  ],
  aroundTheClockSessions: [{ id: 'practice', playerIds: ['a'], finishedAt: '2026-01-03' }],
};
const originalLoad = Module._load;
let History, NewMatch;
try {
  Module._load = function (id, ...args) {
    if (id === 'react') return {
      ...React,
      useMemo: fn => fn(),
      useState: initial => {
        const index = hookIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    };
    if (id === 'react-native') return {
      View: 'View', FlatList: 'FlatList', Pressable: 'Pressable', ScrollView: 'ScrollView',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      StyleSheet: { create: styles => styles },
    };
    if (id.endsWith('/theme/useAppTheme') || id === './useAppTheme') return { useAppTheme: () => theme };
    if (id.endsWith('/theme/useAppAlert')) return { useAppAlert: () => () => {} };
    if (id.endsWith('/store/gameStore')) return { useGameStore: selector => selector(game) };
    if (id.endsWith('/utils/flags')) return { getFlagEmoji: () => '', getCountryName: () => '' };
    return originalLoad.call(this, id, ...args);
  };
  History = require('../build/engine-tests/src/screens/HistoryScreen.js').default;
  NewMatch = require('../build/engine-tests/src/screens/NewMatchScreen.js').default;
} finally {
  Module._load = originalLoad;
}
function render(Screen) {
  hookIndex = 0;
  return Screen({ navigation: {} });
}
function elements(root, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  }
  visit(root);
  return found;
}
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const rows = root => elements(root, n => n.type === 'ScrollView');
const chips = row => elements(row, n => n.type.name === 'FilterChip');
const list = root => elements(root, n => n.type === 'FlatList')[0];

test('History filter rows do not grow vertically and chips retain single-line intrinsic widths in every theme', () => {
  for (theme of Object.values(THEMES)) {
    state = [];
    const root = render(History);
    assert.equal(rows(root).length, 3);
    for (const row of rows(root)) {
      assert.equal(row.props.horizontal, true);
      assert.equal(row.props.style.flexGrow, 0);
      assert.equal(row.props.style.flexShrink, 0);
      assert.equal(row.props.contentContainerStyle.alignItems, 'center');
      assert.notEqual(row.props.contentContainerStyle.flexWrap, 'wrap');
      for (const element of chips(row)) {
        const chip = element.type(element.props);
        const style = flatten(chip.props.style({ pressed: false }));
        assert.equal(style.flexShrink, 0);
        assert.equal(style.alignSelf, 'center');
        assert.equal(style.height, undefined, 'font scaling must not be clipped by a fixed height');
        assert.equal(chip.props.children.props.numberOfLines, 1);
        assert.equal(chip.props.accessibilityState.selected, element.props.selected);
        assert.equal(style.backgroundColor, element.props.selected ? theme.accent : theme.surface);
        if (element.props.selected) assert.equal(flatten(chip.props.children.props.style).color, theme.onAccent);
      }
    }
    assert.equal(list(root).props.style.flex, 1);
  }
});

test('History chip callbacks still filter game type, status and player and retain the empty state', () => {
  state = [];
  let root = render(History);
  const select = (group, label) => {
    chips(rows(root)[group]).find(c => c.props.label === label).props.onPress();
    root = render(History);
  };
  assert.deepEqual(list(root).props.data.map(x => x.id), ['practice', 'done']);
  select(1, 'In progress');
  assert.deepEqual(list(root).props.data.map(x => x.id), ['active']);
  select(2, game.players[0].name);
  assert.deepEqual(list(root).props.data, []);
  assert.equal(list(root).props.ListEmptyComponent.props.children, 'No sessions match these filters.');
  assert.equal(list(root).props.contentContainerStyle.flexGrow, 1);
  select(1, 'All statuses');
  assert.deepEqual(list(root).props.data.map(x => x.id), ['practice', 'done']);
  select(0, 'Practice');
  assert.deepEqual(list(root).props.data.map(x => x.id), ['practice']);
  select(0, 'X01');
  assert.deepEqual(list(root).props.data.map(x => x.id), ['done']);
});

test('New Game reserves the actual footer height outside the scrolling settings', () => {
  state = [];
  const root = render(NewMatch);
  const content = root.props.children;
  const [scroll, footer] = React.Children.toArray(content.props.children);
  assert.equal(scroll.type, 'ScrollView');
  assert.equal(scroll.props.style.flex, 1);
  assert.equal(footer.type, 'View');
  assert.equal(footer.props.style.flexShrink, 0);
  assert.notEqual(footer.props.style.position, 'absolute');
  assert.equal(elements(scroll, n => n === footer).length, 0);
});
