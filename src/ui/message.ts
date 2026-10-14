import { toast } from 'vue-sonner'

// Плашки-уведомления поверх vue-sonner: message.success/error/warning/info(текст | { content, key, duration }).
// duration — в секундах, 0 = не закрывать; key — заменить плашку с тем же ключом.
export interface MessageArgs {
  content: string
  key?: string | number
  duration?: number
  /** Кнопка в плашке (например «Обновить»). */
  action?: { label: string; onClick: () => void }
}
type Level = 'success' | 'error' | 'warning' | 'info'

const show = (level: Level, arg: string | MessageArgs, duration?: number) => {
  const a: MessageArgs = typeof arg === 'string' ? { content: arg, duration } : arg
  const opts: { id?: string | number; duration?: number; action?: { label: string; onClick: () => void } } = {}
  if (a.key !== undefined) opts.id = a.key
  if (a.action) opts.action = a.action
  const sec = a.duration ?? (typeof arg === 'string' ? undefined : duration)
  if (sec !== undefined) opts.duration = sec === 0 ? Infinity : sec * 1000
  return toast[level](a.content, opts)
}

export const message = {
  success: (arg: string | MessageArgs, duration?: number) => show('success', arg, duration),
  error: (arg: string | MessageArgs, duration?: number) => show('error', arg, duration),
  warning: (arg: string | MessageArgs, duration?: number) => show('warning', arg, duration),
  info: (arg: string | MessageArgs, duration?: number) => show('info', arg, duration),
}
