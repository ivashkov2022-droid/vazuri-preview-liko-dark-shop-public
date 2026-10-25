/**
 * One completion prompt per page instance, independent from the cube animation.
 * All case consoles use `.v2-console` as their interaction boundary.
 * `isOpen` must reflect desired state synchronously after `open` / `close`;
 * use the generic aria state or a React ref rather than a pending rendered class.
 * Importing this module has no DOM side effects.
 *
 * @param {{isOpen: () => boolean, isBlocked: () => boolean, open: () => void, close: () => void}} callbacks
 * @returns {{check: () => void, requestCheck: () => void, dismiss: () => void, toggle: () => void, destroy: () => void}}
 */
export function createCaseCompletionLifecycle({ isOpen, isBlocked, open, close }) {
  const pageWindow = window;
  const pageDocument = document;
  const quietMs = 180;
  const activePointers = new Set();
  const listeners = [];
  let activeTouches = 0;
  let consumed = false;
  let destroyed = false;
  let inputSequence = 0;
  let quietTimer = 0;
  let stableFrame = 0;
  let lastActivityAt = pageWindow.performance.now();
  let panelScrollTop = null;

  const geometry = () => {
    const scrolling = pageDocument.scrollingElement || pageDocument.documentElement;
    const viewportHeight = scrolling.clientHeight || pageWindow.innerHeight;
    const available = Math.max(scrolling.scrollHeight - viewportHeight, 1);
    const rawTop = Math.max(pageWindow.scrollY || 0, scrolling.scrollTop || 0);
    const scrollTop = Math.max(0, Math.min(available, rawTop));
    return {
      available, viewportHeight, scrollTop, actualScrollTop: Math.max(0, rawTop),
      atEnd: available > Math.max(220, viewportHeight * .35)
        && scrollTop > 0
        && available - scrollTop <= Math.max(32, viewportHeight * .04),
    };
  };
  let observedScrollTop = geometry().actualScrollTop;
  const blocked = () => isBlocked() || pageDocument.hidden === true;
  const touching = () => activeTouches > 0 || activePointers.size > 0;
  const insideConsole = event => {
    const target = event.target;
    return Boolean(target && typeof target.closest === 'function' && target.closest('.v2-console'));
  };

  const clearPending = () => {
    if (quietTimer) pageWindow.clearTimeout(quietTimer);
    if (stableFrame) pageWindow.cancelAnimationFrame(stableFrame);
    quietTimer = 0;
    stableFrame = 0;
  };
  const noteActivity = () => {
    lastActivityAt = pageWindow.performance.now();
    inputSequence++;
    clearPending();
  };

  const dismiss = () => {
    if (destroyed) return;
    clearPending();
    if (blocked() || !isOpen()) return;
    panelScrollTop = null;
    close();
  };

  const planEndCheck = current => {
    if (destroyed || consumed || blocked() || touching() || !current.atEnd) {
      clearPending();
      return;
    }
    if (isOpen()) {
      // A manually visible prompt at the end already fulfils the end reveal.
      consumed = true;
      clearPending();
      return;
    }
    if (quietTimer || stableFrame) return;
    const sequence = inputSequence;
    const delay = Math.max(0, quietMs - (pageWindow.performance.now() - lastActivityAt));
    quietTimer = pageWindow.setTimeout(() => {
      quietTimer = 0;
      if (destroyed || sequence !== inputSequence || consumed || blocked() || touching()) return;
      const before = geometry();
      if (!before.atEnd) return;
      const remainingQuiet = quietMs - (pageWindow.performance.now() - lastActivityAt);
      if (remainingQuiet > 0) {
        planEndCheck(before);
        return;
      }
      stableFrame = pageWindow.requestAnimationFrame(() => {
        stableFrame = 0;
        if (destroyed || sequence !== inputSequence || consumed || blocked() || touching()) return;
        const after = geometry();
        if (!after.atEnd) return;
        if (Math.abs(before.scrollTop - after.scrollTop) > 1
          || Math.abs(before.available - after.available) > 1
          || Math.abs(before.viewportHeight - after.viewportHeight) > 1) {
          noteActivity();
          planEndCheck(after);
          return;
        }
        if (isOpen()) {
          consumed = true;
          return;
        }
        consumed = true;
        panelScrollTop = after.actualScrollTop;
        open();
      });
    }, delay);
  };

  const check = () => {
    if (destroyed) return;
    const current = geometry();
    if (Math.abs(current.actualScrollTop - observedScrollTop) > .01) noteActivity();
    observedScrollTop = current.actualScrollTop;
    if (blocked()) {
      clearPending();
      return;
    }
    if (!isOpen()) panelScrollTop = null;
    else if (panelScrollTop === null) panelScrollTop = current.actualScrollTop;
    else if (Math.abs(current.actualScrollTop - panelScrollTop) > 1) dismiss();
    planEndCheck(current);
  };

  const toggle = () => {
    if (destroyed || blocked()) return;
    if (isOpen()) {
      // Explicitly closing the toggle at the end is distinct from the input
      // which moves a previously manual panel to the end and dismisses it.
      if (geometry().atEnd) consumed = true;
      dismiss();
      return;
    }
    clearPending();
    const current = geometry();
    if (current.atEnd) consumed = true;
    panelScrollTop = current.actualScrollTop;
    open();
  };

  const onScroll = () => {
    if (destroyed) return;
    noteActivity();
    check();
  };
  const onWheel = () => {
    if (destroyed) return;
    noteActivity();
    // Wheel intent matters even when the page is already at its boundary.
    dismiss();
    check();
  };
  const onResize = () => {
    if (destroyed) return;
    // Mobile browser panels can resize/clamp the document without a new gesture.
    const current = geometry();
    observedScrollTop = current.actualScrollTop;
    if (isOpen()) panelScrollTop = current.actualScrollTop;
    clearPending();
    check();
  };
  const onPointerDown = event => {
    if (destroyed) return;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') activePointers.add(event.pointerId);
    noteActivity();
    if (!insideConsole(event)) dismiss();
    check();
  };
  const onPointerEnd = event => {
    activePointers.delete(event.pointerId);
    noteActivity();
    check();
  };
  const onTouchStart = event => {
    if (destroyed) return;
    activeTouches = event.touches ? event.touches.length : 1;
    noteActivity();
    if (!insideConsole(event)) dismiss();
    check();
  };
  const onTouchEnd = event => {
    activeTouches = event.touches ? event.touches.length : 0;
    noteActivity();
    check();
  };
  const onKeyDown = event => {
    if (destroyed || blocked()) return;
    if (event.key === 'Escape') {
      noteActivity();
      dismiss();
      return;
    }
    const target = event.target;
    const editable = target && typeof target.closest === 'function'
      && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    const scrollKey = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(event.key);
    if (!scrollKey || editable || insideConsole(event)) return;
    noteActivity();
    dismiss();
    check();
  };
  const clearContacts = () => {
    activePointers.clear();
    activeTouches = 0;
    clearPending();
  };
  const onVisibility = () => {
    if (pageDocument.hidden) clearContacts();
    else check();
  };
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  const passiveCapture = { passive: true, capture: true };
  listen(pageWindow, 'scroll', onScroll, { passive: true });
  listen(pageWindow, 'wheel', onWheel, passiveCapture);
  listen(pageWindow, 'scrollend', check, { passive: true });
  listen(pageWindow, 'resize', onResize, { passive: true });
  listen(pageWindow, 'pageshow', check, { passive: true });
  listen(pageWindow, 'load', check, { passive: true });
  listen(pageWindow, 'scrollslides:final-slide', check);
  listen(pageWindow, 'vazuri:case-complete', check);
  listen(pageWindow, 'focus', check, { passive: true });
  listen(pageWindow, 'blur', clearContacts, { passive: true });
  listen(pageDocument, 'pointerdown', onPointerDown, passiveCapture);
  listen(pageDocument, 'pointerup', onPointerEnd, passiveCapture);
  listen(pageDocument, 'pointercancel', onPointerEnd, passiveCapture);
  listen(pageDocument, 'touchstart', onTouchStart, passiveCapture);
  listen(pageDocument, 'touchend', onTouchEnd, passiveCapture);
  listen(pageDocument, 'touchcancel', onTouchEnd, passiveCapture);
  listen(pageDocument, 'keydown', onKeyDown, true);
  listen(pageDocument, 'visibilitychange', onVisibility, { passive: true });
  if (pageWindow.visualViewport) {
    listen(pageWindow.visualViewport, 'resize', onResize, { passive: true });
    // A visual viewport scroll is not necessarily document movement.
    listen(pageWindow.visualViewport, 'scroll', check, { passive: true });
  }
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    clearPending();
    activePointers.clear();
    activeTouches = 0;
    listeners.splice(0).forEach(remove => remove());
  };
  check();
  return { check, requestCheck: check, dismiss, toggle, destroy };
}
