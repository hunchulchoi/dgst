import { alarmCount } from '$lib/util/store.js';

export const load = ({ url, data }) => {
  const { pathname, search } = url;

  // alarmCount가 null이 아닐 때만 store 업데이트
  if (data.alarmCount !== null) {
    alarmCount.set(data.alarmCount);
  }

  return {
    pathname: `${pathname}${search || ''}`,
    session: data.session,
    alarmCount: data.alarmCount
  };
};
