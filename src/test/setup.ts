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

// Сеть в тестах (26.11.2026): запрос, который спек не подменил заглушкой API, раньше уходил из jsdom на localhost и падал
// с «Error: AggregateError» в выводе (страница ДТ, «Товары» и др. сами запрашивают НДС-зачёт, маркировку, договоры).
// Теперь такой XHR сразу завершается сетевой ошибкой без обращения к сети — поведение для кода то же (axios: Network Error),
// но без шума. Тест, которому нужен ответ, по-прежнему подменяет API явно.
if (typeof XMLHttpRequest !== 'undefined') {
  XMLHttpRequest.prototype.send = function sendOffline(this: XMLHttpRequest) {
    setTimeout(() => {
      this.dispatchEvent(new ProgressEvent('error'))
      this.dispatchEvent(new ProgressEvent('loadend'))
    }, 0)
  }
}
