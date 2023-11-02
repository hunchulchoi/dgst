export const load = ({ url, data, }) => {
  const { pathname, search } = url;

  return {
    pathname: `${pathname}${search || ''}`,
    session: data.session,
    alarmCount: data.alarmCount
  };
};
