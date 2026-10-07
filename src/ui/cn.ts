import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge знает только шкалы Tailwind по умолчанию. Наши имена из tokens.css добавляем,
// иначе text-md посчитался бы цветом и «съел» text-ink, а rounded-field не слился бы с rounded-panel.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['md'],
      radius: ['field', 'row', 'panel', 'pill'],
      shadow: ['raised', 'float', 'focus'],
    },
  },
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
