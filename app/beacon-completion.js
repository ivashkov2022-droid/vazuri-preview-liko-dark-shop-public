/**
 * Nightshift shows its panel as soon as the rendered arrow is complete.
 * Forward input from the same finishing gesture keeps that automatic panel
 * visible. Input quiet only arms dismissal; it never delays or hides the panel.
 *
 * @param {{isOpen: () => boolean, isBlocked: () => boolean, open: () => void, close: () => void, isEndingZone: () => boolean}} callbacks
 * @returns {{check: () => void, requestCheck: () => void, dismiss: () => void, toggle: () => void, destroy: () => void}}
 */
export function createCaseCompletionLifecycle({ isOpen, isBlocked, open, close, isEndingZone }) {
  const pageWindow = window;
  const pageDocument = document;
  const listeners = [];
  const contacts = new Set();
  let activeTouches = 0;
  let automaticShown = false;
  let finishingGesture = false;
  let gestureTimer = 0;
  let panelScrollTop = null;
  let destroyed = false;
  const top = () => Math.max(0, pageWindow.scrollY || 0, (pageDocument.scrollingElement || pageDocument.documentElement).scrollTop || 0);
  const blocked = () => isBlocked() || pageDocument.hidden === true;
  const inside = event => Boolean(event.target?.closest?.('.v2-console'));
  const stopGesture = () => {
    if (gestureTimer) pageWindow.clearTimeout(gestureTimer);
    gestureTimer = 0;
    finishingGesture = false;
  };
  const continueGesture = () => {
    if (!finishingGesture || destroyed) return;
    if (gestureTimer) pageWindow.clearTimeout(gestureTimer);
    gestureTimer = pageWindow.setTimeout(() => {
      gestureTimer = 0;
      if (contacts.size || activeTouches) continueGesture();
      else finishingGesture = false;
    }, 600);
  };
  const dismiss = () => {
    if (destroyed || blocked()) return;
    stopGesture();
    panelScrollTop = null;
    if (isOpen()) close();
  };
  const check = () => {
    if (destroyed || blocked()) return;
    const currentTop = top();
    const completed = isEndingZone();
    if (!completed) automaticShown = false;
    if (isOpen()) {
      if (panelScrollTop === null) panelScrollTop = currentTop;
      else if (currentTop < panelScrollTop - 1) dismiss();
      else if (currentTop > panelScrollTop + 1) {
        if (finishingGesture) { panelScrollTop = currentTop; continueGesture(); }
        else dismiss();
      }
    } else panelScrollTop = null;
    if (!automaticShown && completed) {
      automaticShown = true;
      if (!isOpen()) {
        panelScrollTop = currentTop;
        finishingGesture = true;
        open();
        continueGesture();
      }
    }
  };
  const toggle = () => {
    if (destroyed || blocked()) return;
    if (isOpen()) { dismiss(); return; }
    stopGesture();
    if (isEndingZone()) automaticShown = true;
    panelScrollTop = top();
    open();
  };
  const onWheel = event => {
    if (destroyed || blocked()) return;
    if (isOpen() && finishingGesture && event.deltaY > 0) continueGesture();
    else dismiss();
    check();
  };
  const onResize = () => {
    if (isOpen()) panelScrollTop = top();
    check();
  };
  const onPointerDown = event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') contacts.add(event.pointerId);
    if (!inside(event)) dismiss();
    check();
  };
  const onPointerEnd = event => {
    contacts.delete(event.pointerId);
    continueGesture();
    check();
  };
  const onTouchStart = event => {
    activeTouches = event.touches?.length || 1;
    if (!inside(event)) dismiss();
    check();
  };
  const onTouchEnd = event => {
    activeTouches = event.touches?.length || 0;
    continueGesture();
    check();
  };
  const onKeyDown = event => {
    if (destroyed || blocked()) return;
    if (event.key === 'Escape') { dismiss(); return; }
    if (inside(event) || event.target?.closest?.('input,textarea,select,[contenteditable]')) return;
    const forward = ['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'].includes(event.key);
    if (!forward && !['ArrowUp', 'PageUp', 'Home'].includes(event.key)) return;
    if (forward && isOpen() && finishingGesture) continueGesture();
    else dismiss();
    check();
  };
  const clearContacts = () => { contacts.clear(); activeTouches = 0; };
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  };
  const capture = { passive: true, capture: true };
  listen(pageWindow, 'scroll', check, { passive: true });
  listen(pageWindow, 'wheel', onWheel, capture);
  listen(pageWindow, 'scrollend', check, { passive: true });
  listen(pageWindow, 'resize', onResize, { passive: true });
  for (const type of ['pageshow', 'load', 'focus']) listen(pageWindow, type, check, { passive: true });
  listen(pageWindow, 'blur', clearContacts, { passive: true });
  listen(pageDocument, 'pointerdown', onPointerDown, capture);
  for (const type of ['pointerup', 'pointercancel']) listen(pageDocument, type, onPointerEnd, capture);
  listen(pageDocument, 'touchstart', onTouchStart, capture);
  for (const type of ['touchend', 'touchcancel']) listen(pageDocument, type, onTouchEnd, capture);
  listen(pageDocument, 'keydown', onKeyDown, true);
  listen(pageDocument, 'visibilitychange', () => { if (pageDocument.hidden) clearContacts(); else check(); });
  if (pageWindow.visualViewport) {
    listen(pageWindow.visualViewport, 'resize', onResize, { passive: true });
    listen(pageWindow.visualViewport, 'scroll', check, { passive: true });
  }
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopGesture();
    clearContacts();
    listeners.splice(0).forEach(remove => remove());
  };
  check();
  return { check, requestCheck: check, dismiss, toggle, destroy };
}
