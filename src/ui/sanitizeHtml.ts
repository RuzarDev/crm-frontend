// Очистка HTML с сервера перед v-html (пояснения ТН ВЭД приходят из синхронизации как есть).
// Белый список: таблицы, списки, ссылки, абзацы и простое оформление. Остальное:
// — опасные элементы (script, style, iframe, object, embed, svg, math, form…) удаляются вместе с содержимым;
// — незнакомые (font, span, div…) разворачиваются: текст остаётся, тег — нет;
// — атрибуты — только href у ссылок (http/https/mailto/относительные) и colspan/rowspan у ячеек;
//   обработчики on*, style, class и прочее отбрасываются. Ссылки открываются в новой вкладке с noopener;
// — картинки (формулы в пояснениях ЕЭК, схемы в «Порядке ДТ» с adilet.zan.kz) — только с адресом http:, https:
//   или «//…»: src и alt, ленивая загрузка, без referrer. data:, javascript:, прочие схемы, относительные
//   (на нашем домене их нет) и без src — убираются. http-картинки на https-сайте браузер может не показать
//   (смешанное содержимое) — проксировать их можно позже.

const ALLOWED = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'p', 'br', 'hr', 'div', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'template',
  'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'option', 'link', 'meta', 'base',
  'video', 'audio', 'source', 'track', 'canvas', 'title', 'head',
])

const CELL_ATTRS = new Set(['colspan', 'rowspan'])

/** Ссылка безопасна: http(s), mailto или относительная. Пробелы и управляющие символы внутри схемы не помогают. */
const safeHref = (raw: string): boolean => {
  // eslint-disable-next-line no-control-regex
  const v = raw.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v)
  return !scheme || scheme[1] === 'http' || scheme[1] === 'https' || scheme[1] === 'mailto'
}

/** Адрес картинки без управляющих символов и пробелов (браузер их и так выбрасывает) — проверяем и пишем его. */
// eslint-disable-next-line no-control-regex
const normalizeUrl = (raw: string): string => raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
/** Картинка: только абсолютный адрес http(s) или «//хост/…». */
const safeImgSrc = (url: string): boolean => /^(https?:)?\/\/[^/\\]/i.test(url)

const cleanImg = (src: Element, doc: Document): HTMLElement | null => {
  const url = normalizeUrl(src.getAttribute('src') ?? '')
  if (!safeImgSrc(url)) return null
  const img = doc.createElement('img')
  img.setAttribute('src', url)
  const alt = src.getAttribute('alt')
  if (alt) img.setAttribute('alt', alt)
  img.setAttribute('loading', 'lazy')
  img.setAttribute('referrerpolicy', 'no-referrer')
  return img
}

const cleanAttrs = (src: Element, dst: Element) => {
  const tag = dst.tagName.toLowerCase()
  for (const { name, value } of Array.from(src.attributes)) {
    const n = name.toLowerCase()
    if (tag === 'a' && n === 'href' && safeHref(value)) dst.setAttribute('href', value)
    else if ((tag === 'td' || tag === 'th') && CELL_ATTRS.has(n) && /^\d{1,3}$/.test(value.trim())) dst.setAttribute(n, value.trim())
  }
  if (tag === 'a' && dst.hasAttribute('href')) {
    dst.setAttribute('target', '_blank')
    dst.setAttribute('rel', 'noopener noreferrer')
  }
}

const copyChildren = (from: Node, to: Node, doc: Document) => {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === 3) {
      to.appendChild(doc.createTextNode(child.textContent ?? ''))
    } else if (child.nodeType === 1) {
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      // Элементы из пространств svg/math (в т.ч. вложенные) — целиком прочь.
      if (DROP.has(tag) || (el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml')) continue
      if (tag === 'img') {
        const img = cleanImg(el, doc)
        if (img) to.appendChild(img)
      } else if (ALLOWED.has(tag)) {
        const copy = doc.createElement(tag)
        cleanAttrs(el, copy)
        copyChildren(el, copy, doc)
        to.appendChild(copy)
      } else {
        copyChildren(el, to, doc)
      }
    }
    // Комментарии, processing instructions — пропускаем.
  }
}

/** Безопасный HTML для v-html: только белый список тегов и атрибутов. */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  // Отдельный неактивный документ: при разборе скрипты не выполняются, картинки не грузятся.
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  const out = document.implementation.createHTMLDocument('')
  const box = out.createElement('div')
  copyChildren(doc.body, box, out)
  return box.innerHTML
}
