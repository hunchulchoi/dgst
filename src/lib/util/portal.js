/**
 * DOM 노드를 document.body로 옮겨 overflow/z-index 클리핑을 피한다.
 * @param {HTMLElement} node
 */
export function portal(node) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
