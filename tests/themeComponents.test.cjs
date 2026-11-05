const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { THEMES } = require('../build/engine-tests/src/theme/themes.js');
let theme = THEMES.neonArena;
const originalLoad = Module._load;
let Button, Card, Text, Input;
try {
  // Inspect real component elements; stub native rendering and the hook boundary.
  Module._load = function (id, ...args) {
    if (id === 'react-native') return { Pressable: 'Pressable', View: 'View', Text: 'Text', TextInput: 'TextInput' };
    if (id === './useAppTheme') return { useAppTheme: () => theme };
    return originalLoad.call(this, id, ...args);
  };
  Button = require('../build/engine-tests/src/theme/ThemedButton.js').default;
  Card = require('../build/engine-tests/src/theme/ThemedCard.js').default;
  Text = require('../build/engine-tests/src/theme/ThemedText.js').default;
  Input = require('../build/engine-tests/src/theme/ThemedInput.js').default;
} finally {
  Module._load = originalLoad;
}
const flatten = styles => Object.assign({}, ...styles.filter(Boolean));

test('shared components use the current theme and preserve caller props in all four themes', () => {
  for (theme of Object.values(THEMES)) {
    const onChangeText = () => {};
    const input = Input({ value: 'Alice', onChangeText, style: { padding: 10 } });
    assert.equal(input.props.value, 'Alice');
    assert.equal(input.props.onChangeText, onChangeText);
    assert.equal(input.props.placeholderTextColor, theme.muted);
    assert.equal(input.props.selectionColor, theme.accent);
    assert.equal(input.props.keyboardAppearance, theme.isDark ? 'dark' : 'light');
    assert.equal(flatten(input.props.style).color, theme.foreground);
    assert.equal(flatten(input.props.style).padding, 10);
    const disabled = Input({ editable: false });
    assert.equal(disabled.props.editable, false);
    assert.equal(flatten(disabled.props.style).color, theme.disabledForeground);
    assert.equal(flatten(disabled.props.style).backgroundColor, theme.disabledSurface);

    const text = Text({ children: 'Score', style: { fontSize: 24 } });
    assert.equal(text.props.children, 'Score');
    assert.equal(flatten(text.props.style).color, theme.foreground);
    assert.equal(flatten(text.props.style).fontSize, 24);
    const card = Card({ children: 'Results', style: { borderRadius: 12 } });
    assert.equal(card.props.children, 'Results');
    assert.equal(flatten(card.props.style).backgroundColor, theme.surface);
    assert.equal(flatten(card.props.style).borderRadius, 12);
  }
});

test('shared buttons retain actions and readable disabled states without changing legacy sizing', () => {
  for (theme of Object.values(THEMES)) {
    const onPress = () => {};
    const onLongPress = () => {};
    const button = Button({ label: 'Undo', onPress, onLongPress, legacy: true });
    assert.equal(button.props.onPress, onPress);
    assert.equal(button.props.onLongPress, onLongPress);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.equal(flatten(button.props.style({ pressed: false })).paddingVertical, 12);
    assert.equal(button.props.children.props.style.color, theme.onAccent);
    const disabled = Button({ label: 'Start', onPress, disabled: true });
    assert.equal(disabled.props.disabled, true);
    assert.equal(disabled.props.accessibilityState.disabled, true);
    assert.equal(disabled.props.children.props.style.color, theme.disabledForeground);
    assert.equal(flatten(disabled.props.style({ pressed: false })).backgroundColor, theme.disabledSurface);
  }
});
