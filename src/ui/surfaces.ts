import { cn } from './cn'

// Слои: окна Z — как у AntD (1000), всплывающие элементы — выше, чтобы ZSelect работал и внутри a-modal
// на время сосуществования (спека §6).
export const Z_LAYER_MODAL = 'z-[1000]'
export const Z_LAYER_FLOATING = 'z-[1100]'

/** Рамка поля ввода: одна на все Z-поля (ZInput, ZNumber, ZSelect, ZCombobox, ZDate).
 *  lg (42px, 15px) — только страницы входа/регистрации (спека §4); многострочного lg нет — как md. */
export const fieldShell = (o: { size?: 'sm' | 'md' | 'lg'; invalid?: boolean; disabled?: boolean; multiline?: boolean }): string =>
  cn(
    'inline-flex w-full items-center gap-2 rounded-field border border-line-strong bg-surface px-3 text-ink',
    'transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
    'focus-within:border-zircon focus-within:shadow-focus',
    // hover:not-focus-within — в собранном CSS hover идёт после focus-within и перебил бы рамку фокуса.
    !o.invalid && !o.disabled && 'hover:not-focus-within:border-faint',
    o.multiline
      ? (o.size === 'sm' ? 'min-h-7 py-0.5 flex-wrap text-xs' : 'min-h-9 py-1 flex-wrap text-sm')
      : (o.size === 'sm' ? 'h-7 text-xs' : o.size === 'lg' ? 'h-[42px] rounded-[9px] text-[15px]/[22px]' : 'h-9 text-sm'),
    o.invalid && 'border-danger focus-within:border-danger',
    o.disabled && 'cursor-not-allowed bg-sunken text-ink-3',
  )

/** Всплывающая поверхность: выпадающий список, календарь, меню, подтверждение. */
export const floatingSurface = cn(
  Z_LAYER_FLOATING,
  'rounded-row border border-line bg-surface p-1 text-sm text-ink shadow-float outline-hidden',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out motion-reduce:animate-none',
)

/** Затемнение под окном (ZModal, ZDrawer). */
export const modalBackdrop = cn(
  Z_LAYER_MODAL,
  'fixed inset-0 bg-ink/30',
  'data-[state=open]:animate-fade-in data-[state=closed]:animate-pop-out motion-reduce:animate-none',
)

/** Крестик закрытия окна (ZModal, ZDrawer): в правом верхнем углу, последним в порядке фокуса. */
export const modalCloseButton = cn(
  'absolute right-4 top-4 flex size-8 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0',
  'text-muted outline-hidden transition-colors duration-150 ease-out motion-reduce:transition-none',
  'hover:bg-sunken hover:text-ink focus-visible:shadow-focus',
)

/**
 * Escape пришёл из поля с несохранённым черновиком (ZDate ставит data-z-draft) — окно не закрываем:
 * этот Escape откатывает черновик, следующий закроет окно.
 */
export const isDraftEscape = (e: Event): boolean => {
  const target = e.target
  return target instanceof Element && !!target.closest('[data-z-draft]')
}

const FOCUSABLE = [
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])', 'textarea:not([disabled])',
  'button:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Элемент можно получить фокусом с Tab и он виден: не tabindex=-1 (метки-крестики ZSelect, скрытые кнопки),
// не внутри aria-hidden/inert/hidden, не display:none / visibility:hidden.
const isTabbable = (el: HTMLElement): boolean => {
  if (el.tabIndex < 0 || el.closest('[aria-hidden="true"], [inert], [hidden]')) return false
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

/**
 * Фокус при открытии окна (open-auto-focus Reka): первый элемент, доступный с Tab, но без выделения текста —
 * Reka выделяет значение поля, и первый же символ стёр бы его. Без доступных элементов — само окно.
 */
export const focusFirstInside = (e: Event): void => {
  const root = e.target
  if (!(root instanceof HTMLElement)) return
  e.preventDefault()
  if (!focusFirstTabbable(root)) root.focus({ preventScroll: true })
}

/** Фокус на первый элемент внутри root, доступный с Tab; false — такого нет (фокус не тронут). */
export const focusFirstTabbable = (root: HTMLElement): boolean => {
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (!isTabbable(el)) continue
    el.focus({ preventScroll: true })
    if (document.activeElement === el) return true // не взял фокус (скрыт предком и т. п.) — идём дальше
  }
  return false
}

/** Ширина окна: число — px (как у AntD), строка — как есть ('80%', '40rem'). */
export const cssSize = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v)

/** Пункт списка/меню. */
export const listItem = cn(
  'relative flex cursor-pointer select-none items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-sm text-ink outline-hidden',
  'data-[highlighted]:bg-sunken data-[state=checked]:font-semibold',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
)
