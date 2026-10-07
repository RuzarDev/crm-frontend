// Общие классы страниц входа (вход, регистрация, восстановление пароля, приглашение) — один вид на всех.

/** Подпись поля своей строкой (<label for>): у ZField label добавил бы звёздочку, а на этих страницах её нет. */
export const authLabelClass = 'self-start text-sm font-medium text-ink-2'

/** Текстовая ссылка (в строке текста — ещё и underline: отличие не только цветом, WCAG 1.4.1). */
export const authLinkClass =
  'rounded-[4px] text-zircon-ink outline-hidden transition-colors duration-150 ease-out hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'

/** Переход как главная кнопка (ZButton primary lg block): «Ко входу», «Запросить новую» — это ссылки, не действия. */
export const authPrimaryLinkClass = [
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-navy px-5 font-sans text-[15px] font-semibold text-white no-underline',
  'outline-hidden transition-[background-color,scale] duration-150 ease-out hover:bg-navy-hover hover:text-white focus-visible:shadow-focus',
  'motion-safe:active:scale-[0.98] motion-reduce:transition-none',
].join(' ')
