import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const initialValue = browser ? window.localStorage.getItem('ccd') !== 'false' : true;

const ccd = writable(initialValue);

ccd.subscribe((value) => {
  if (browser) {
    window.localStorage.setItem('ccd', value ? 'true' : 'false');
  }
});

export default ccd;
