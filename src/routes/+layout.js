export const load = ({ url, data }) => {
  const { pathname } = url;

  return {
    pathname,
    session: data.session,
    alarms: data.alarms
  };
};
