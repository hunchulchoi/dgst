export const load = ({ url, data }) => {
  const { pathname } = url;
  
  console.log('layout alarmCount', data.alarmCount)

  return {
    pathname,
    session: data.session,
    alarmCount: data.alarmCount
  };
};
