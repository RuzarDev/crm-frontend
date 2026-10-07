// jsdom не умеет того, на что опираются Reka-примитивы (позиционирование, прокрутка к пункту, pointer capture).
// Часть спеков идёт в среде node (@vitest-environment node) — там DOM нет, заглушки не нужны.
if (typeof Element !== 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.setPointerCapture ??= () => {}
}
