// Replace only the native storage boundary; use real Zustand and persistence.
const Module = require('node:module');
const originalLoad = Module._load;
const values = new Map();
const storage = {
  getItem: async key => values.get(key) ?? null,
  setItem: async (key, value) => { values.set(key, value); },
  removeItem: async key => { values.delete(key); },
};
Module._load = function (id, ...args) {
  if (id === '@react-native-async-storage/async-storage') return storage;
  return originalLoad.call(this, id, ...args);
};
module.exports = { storage, values, restore: () => { Module._load = originalLoad; } };
