import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

import { message } from '../message'

describe('message (совместимо с AntD)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('строка — как есть, без опций', () => {
    message.success('Сохранено')
    expect(toast.success).toHaveBeenCalledWith('Сохранено', {})
  })
  it('второй аргумент — секунды → миллисекунды', () => {
    message.error('Ошибка', 6)
    expect(toast.error).toHaveBeenCalledWith('Ошибка', { duration: 6000 })
  })
  it('объект: key становится id, duration в мс', () => {
    message.warning({ content: 'Внимание', key: 'net', duration: 8 })
    expect(toast.warning).toHaveBeenCalledWith('Внимание', { id: 'net', duration: 8000 })
  })
  it('duration 0 — не закрывать', () => {
    message.info({ content: 'Висит', duration: 0 })
    expect(toast.info).toHaveBeenCalledWith('Висит', { duration: Infinity })
  })
  it('action — кнопка в плашке', () => {
    const onClick = vi.fn()
    message.error({ content: 'Страница не загрузилась', key: 'chunk-load', duration: 0, action: { label: 'Обновить', onClick } })
    expect(toast.error).toHaveBeenCalledWith('Страница не загрузилась', { id: 'chunk-load', duration: Infinity, action: { label: 'Обновить', onClick } })
  })
})
