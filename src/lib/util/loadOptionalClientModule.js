import { reportClientError } from '$lib/util/reportClientPageError.js';

/**
 * Keep optional UI features usable when a lazy module cannot load.
 * @template T
 * @param {() => Promise<T>} load
 * @param {import('./reportClientPageError.js').ClientErrorContext & { importTarget: string }} context
 * @returns {Promise<T | null>}
 */
export async function loadOptionalClientModule(load, context) {
  try {
    return await load();
  } catch (error) {
    reportClientError(error, {
      ...context,
      type: 'module-import-error',
      message: 'Optional client module failed to load',
      phase: 'module-import'
    });
    return null;
  }
}
