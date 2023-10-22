export const load = ({ url, data, setHeaders }) => {
  const { pathname, search } = url;

  console.log('layout alarmCount', data.alarmCount)
  
  setHeaders({
    'cache-control': 'max-age: 30'
  })

  return {
    pathname: `${pathname}${search || ''}`,
    session: data.session,
    alarmCount: data.alarmCount
  };
};
