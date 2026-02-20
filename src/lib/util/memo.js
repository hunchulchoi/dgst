import { writable } from 'svelte/store';

function createMemo() {
  const { subscribe, set, update } = writable(false);

  let isOpen = false;

  const memoModal = (memo) => {};
}
