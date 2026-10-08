import { cn } from '@/ui/cn'

// Общий вид чипов-фильтров (FilterChip, PeriodChip): рамка у обёртки, внутри — кнопка-триггер и «×».
export const chipFrame = (active: boolean): string =>
  cn(
    'inline-flex h-[34px] max-w-full items-center rounded-field border text-[13px] max-sm:h-11 max-sm:text-sm',
    'transition-colors duration-150 motion-reduce:transition-none',
    active
      ? 'border-zircon bg-zircon-soft font-semibold text-zircon-ink'
      : 'border-dashed border-line-strong bg-surface text-ink-2 hover:border-faint',
  )

export const chipTrigger =
  'inline-flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-[inherit] border-0 bg-transparent px-3 font-[inherit] text-[length:inherit] text-inherit outline-hidden focus-visible:shadow-focus'

export const chipClear =
  'mr-1 -ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-zircon-ink outline-hidden hover:bg-surface focus-visible:shadow-focus max-sm:mr-0 max-sm:ml-0 max-sm:size-11'
