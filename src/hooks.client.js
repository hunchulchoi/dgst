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
  const clientEventTrace = isInterruptedFetchError(error) ? getClientEventTrace() : undefined;

  reportClientError(error, {
    type: 'sveltekit-client-error',
    message: 'SvelteKit client navigation/render error',
    status,
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
    message: status >= 500 ? 'Internal Error' : message,
    errorId,
    fingerprint
  };
}
