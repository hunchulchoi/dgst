import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<number | null>} */
export const alarmCount = writable(null);

/** 자유게시판 탭 클릭 시 목록 remount·blur 트리거 */
/** @type {import('svelte/store').Writable<number>} */
export const boardListReloadKey = writable(0);

/** invalidate('board-list') 진행 중 — blur 유지 */
/** @type {import('svelte/store').Writable<boolean>} */
export const boardListReloading = writable(false);
