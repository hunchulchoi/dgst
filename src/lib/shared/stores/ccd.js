import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const initialValue = browser ? window.localStorage.getItem('ccd') || true : true;

const ccd = writable(initialValue);

ccd.subscribe((value) => {
  if (browser) {
    window.localStorage.setItem('ccd', value);
  }
});

export default ccd;
