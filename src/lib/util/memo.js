import { writable } from 'svelte/store';

export function createMemo() {
  return writable(false);
}
