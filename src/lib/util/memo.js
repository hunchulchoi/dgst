import { writable } from 'svelte/store';

function createMemo() {
  const { subscribe, set, update } = writable(false);

  let isOpen = false;

  /** @param {unknown} memo */
  const memoModal = (memo) => {};
}
