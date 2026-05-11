// storage.js — localStorage wrapper

const KEY = 'shiftSystem_PRJ001_202506';

export const StorageManager = {
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[storage] save failed:', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[storage] load failed:', e);
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      console.warn('[storage] clear failed:', e);
    }
  },
};
