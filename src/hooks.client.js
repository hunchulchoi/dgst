import { version } from '$app/environment';
import {
  createClientErrorFingerprint,
  createClientErrorId,
  reportClientError
} from '$lib/util/reportClientPageError.js';
import { isInterruptedFetchError } from '$lib/util/fetchErrors.js';
import {
  getClientEventTrace,
  getClientNavigationContext,
  installClientNavigationDiagnostics
} from '$lib/util/clientNavigationContext.js';

installClientNavigationDiagnostics();

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, event, status, message }) {
  const routeId = event.route?.id ?? undefined;
  const navigation = getClientNavigationContext({
    currentPath: typeof location !== 'undefined' ? location.pathname : undefined,
    targetPath: event.url?.pathname,
    routeId
  });
  const operation = navigation.operation ?? 'sveltekit-navigation-render';
  const component = routeId ? `route:${routeId}` : 'sveltekit-router';
  const errorId = createClientErrorId();
  const fingerprint = createClientErrorFingerprint(error, {
    routeId,
    phase: 'client-handle-error',
    component,
    operation
  });
  const interruptedFetch = isInterruptedFetchError(error);
  const clientEventTrace = interruptedFetch ? getClientEventTrace() : undefined;

  reportClientError(error, {
    type: interruptedFetch ? 'navigation-fetch-interrupted' : 'sveltekit-client-error',
    message: interruptedFetch
      ? 'Client navigation fetch interrupted'
      : 'SvelteKit client navigation/render error',
    level: interruptedFetch ? 'warn' : 'error',
    status: interruptedFetch ? undefined : status,
    pathname: event.url?.pathname,
    routeId,
    errorId,
    fingerprint,
    phase: 'client-handle-error',
    component,
    operation,
    currentPath: navigation.currentPath,
    previousPath: navigation.previousPath,
    details: {
      ...navigation,
      ...(clientEventTrace ? { clientEventTrace } : {}),
      svelteKitMessage: message,
      buildVersion: version
    }
  });

  return {
    message: interruptedFetch
      ? '연결이 일시적으로 중단되었습니다. 다시 시도합니다.'
      : status >= 500
        ? 'Internal Error'
        : message,
    errorId,
    fingerprint,
    ...(interruptedFetch && { interruptedFetch: true })
  };
}
