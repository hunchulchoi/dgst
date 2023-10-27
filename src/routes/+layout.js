export const load = ({ url, data}) => {
  const { pathname, search } = url;

  console.log('layout alarmCount', data.alarmCount)

  return {
    pathname: `${pathname}${search || ''}`,
    session: data.session,
    alarmCount: data.alarmCount
  };
};
