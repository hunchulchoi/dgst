/**
 * Browser pinch zoom can shrink visualViewport.width while CSS layout still uses innerWidth.
 * Layout clamps should follow the CSS viewport, not the zoomed visual viewport.
 *
 * @param {{ innerWidth?: number; visualViewportWidth?: number }} viewport
 */
export function computeMobileLayoutWidth(viewport) {
  const innerWidth = Math.floor(viewport.innerWidth || 0);
  if (innerWidth > 0) return innerWidth;

  return Math.floor(viewport.visualViewportWidth || 0);
}
