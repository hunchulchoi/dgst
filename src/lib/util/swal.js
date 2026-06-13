/** @type {Promise<import('sweetalert2').default> | null} */
let swalModule = null;

/** sweetalert2 지연 로드 (초기 번들 축소, 싱글톤 캐시) */
export async function getSwal() {
  if (!swalModule) {
    swalModule = import('sweetalert2').then((m) => m.default);
  }
  return swalModule;
}

/**
 * @param {import('sweetalert2').SweetAlertOptions} options
 */
export async function swalFire(options) {
  const Swal = await getSwal();
  return Swal.fire(options);
}
