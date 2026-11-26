import { browser } from '$app/env';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'ccd:suneung-2026-11';
const initialValue = browser ? window.localStorage.getItem(STORAGE_KEY) !== 'false' : true;

const ccd = writable(initialValue);

ccd.subscribe((value) => {
  if (browser) {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  }
});

export default ccd;
