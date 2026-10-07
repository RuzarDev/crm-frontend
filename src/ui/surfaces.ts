import { cn } from './cn'

// Слои: окна Z — как у AntD (1000), всплывающие элементы — выше, чтобы ZSelect работал и внутри a-modal
// на время сосуществования (спека §6).
export const Z_LAYER_MODAL = 'z-[1000]'
export const Z_LAYER_FLOATING = 'z-[1100]'

/** Рамка поля ввода: одна на все Z-поля (ZInput, ZNumber, ZSelect, ZCombobox, ZDate). */
export const fieldShell = (o: { size?: 'sm' | 'md'; invalid?: boolean; disabled?: boolean; multiline?: boolean }): string =>
  cn(
    'inline-flex w-full items-center gap-2 rounded-field border border-line-strong bg-surface px-3 text-ink',
    'transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
    'focus-within:border-zircon focus-within:shadow-focus',
    // hover:not-focus-within — в собранном CSS hover идёт после focus-within и перебил бы рамку фокуса.
    !o.invalid && !o.disabled && 'hover:not-focus-within:border-faint',
    o.multiline ? (o.size === 'sm' ? 'min-h-7 py-0.5 flex-wrap text-xs' : 'min-h-9 py-1 flex-wrap text-sm') : (o.size === 'sm' ? 'h-7 text-xs' : 'h-9 text-sm'),
    o.invalid && 'border-danger focus-within:border-danger',
    o.disabled && 'cursor-not-allowed bg-sunken text-ink-3',
  )

/** Всплывающая поверхность: выпадающий список, календарь, меню, подтверждение. */
export const floatingSurface = cn(
  Z_LAYER_FLOATING,
  'rounded-row border border-line bg-surface p-1 text-sm text-ink shadow-float outline-hidden',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out motion-reduce:animate-none',
)

/** Пункт списка/меню. */
export const listItem = cn(
  'relative flex cursor-pointer select-none items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-sm text-ink outline-hidden',
  'data-[highlighted]:bg-sunken data-[state=checked]:font-semibold',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
)
