import { toast } from 'vue-sonner'

// Тот же API, что у message из ant-design-vue (спека §6): перевод ≈300 вызовов — замена импорта.
// duration — в секундах, 0 = не закрывать; key — заменить плашку с тем же ключом (как в AntD).
export interface MessageArgs {
  content: string
  key?: string | number
  duration?: number
}
type Level = 'success' | 'error' | 'warning' | 'info'

const show = (level: Level, arg: string | MessageArgs, duration?: number) => {
  const a: MessageArgs = typeof arg === 'string' ? { content: arg, duration } : arg
  const opts: { id?: string | number; duration?: number } = {}
  if (a.key !== undefined) opts.id = a.key
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
