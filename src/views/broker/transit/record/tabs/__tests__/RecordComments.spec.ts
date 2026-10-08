import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import type { ReestrCommentDto } from '@/types/api'

const api = vi.hoisted(() => ({ listComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import RecordComments from '../RecordComments.vue'

const comment = (o: Partial<ReestrCommentDto> = {}): ReestrCommentDto => ({
  id: 'c1', reestrEntryId: 'r1', authorId: 'me', authorRole: 'importer', authorUsername: 'aigerim', text: 'Принято в работу',
  createdAtUtc: '2026-10-08T09:14:00', editedAtUtc: null, ...o,
})

let w: VueWrapper
const mount = async (role = 'importer', permissions = ['reestr.read'], props: Record<string, unknown> = {}) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = permissions
  auth.userId = 'me'
  w = mountWithI18n(RecordComments, { props: { reestrId: 'r1', ...props }, attachTo: document.body })
  await flushPromises()
}
const area = () => w.get('textarea')
const type = async (text: string) => {
  await area().setValue(text)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  api.listComments.mockResolvedValue([comment(), comment({ id: 'c2', authorId: 'other', authorUsername: 'erlan', authorRole: 'client', text: 'Спасибо' })])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
})

describe('RecordComments', () => {
  it('лента: автор, роль-тег, время, текст; счётчик count после загрузки', async () => {
    await mount()
    const items = w.findAll('[data-comment]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('aigerim')
    expect(items[0].text()).toContain('08.10.2026 09:14')
    expect(items[0].text()).toContain('Принято в работу')
    expect(items[1].get('[data-comment-role]').text()).toBe('Клиент')
    expect(w.emitted('count')?.at(-1)).toEqual([2])
  })

  it('пусто — «Нет комментариев», поле ввода есть', async () => {
    api.listComments.mockResolvedValue([])
    await mount()
    expect(w.text()).toContain('Нет комментариев')
    expect(w.find('textarea').exists()).toBe(true)
    expect(w.emitted('count')?.at(-1)).toEqual([0])
  })

  it('отправка: текст обрезается, комментарий появляется в ленте, поле очищается, count растёт', async () => {
    await mount()
    api.addComment.mockResolvedValue(comment({ id: 'c3', text: 'Новый' }))
    expect(w.get('[data-comment-send]').attributes('disabled')).toBeDefined()
    await type('  Новый  ')
    await w.get('[data-comment-send]').trigger('click')
    await flushPromises()
    expect(api.addComment).toHaveBeenCalledWith('r1', 'Новый')
    expect(w.findAll('[data-comment]')).toHaveLength(3)
    expect((area().element as HTMLTextAreaElement).value).toBe('')
    expect(w.emitted('count')?.at(-1)).toEqual([3])
  })

  it('Ctrl+Enter и ⌘+Enter отправляют, просто Enter — нет; пустой текст не отправляется', async () => {
    await mount()
    api.addComment.mockResolvedValue(comment({ id: 'c3', text: 'A' }))
    await type('A')
    await area().trigger('keydown', { key: 'Enter' })
    expect(api.addComment).not.toHaveBeenCalled()
    await area().trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(api.addComment).toHaveBeenCalledTimes(1)
    await type('B')
    await area().trigger('keydown', { key: 'Enter', metaKey: true })
    await flushPromises()
    expect(api.addComment).toHaveBeenCalledTimes(2)
    await type('   ')
    await area().trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(api.addComment).toHaveBeenCalledTimes(2)
  })

  it('счётчик знаков и предел 2000', async () => {
    await mount()
    expect(area().attributes('maxlength')).toBe('2000')
    await type('abc')
    expect(w.get('[data-comment-count]').text()).toBe('3 / 2000')
  })

  it('ошибка отправки: прежний текст ошибки, текст остаётся в поле', async () => {
    await mount()
    api.addComment.mockRejectedValue(new Error('x'))
    await type('Текст')
    await w.get('[data-comment-send]').trigger('click')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Не удалось отправить комментарий')
    expect((area().element as HTMLTextAreaElement).value).toBe('Текст')
    expect(w.findAll('[data-comment]')).toHaveLength(2)
  })

  it('удалить можно свой (по подтверждению), чужой — нельзя; администратор удаляет любой', async () => {
    await mount()
    const rows = w.findAll('[data-comment]')
    expect(rows[0].find('[data-comment-delete]').exists()).toBe(true)
    expect(rows[1].find('[data-comment-delete]').exists()).toBe(false)
    api.deleteComment.mockResolvedValue(undefined)
    await rows[0].get('[data-comment-delete]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить комментарий?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteComment).toHaveBeenCalledWith('r1', 'c1')
    expect(w.findAll('[data-comment]')).toHaveLength(1)
    expect(w.emitted('count')?.at(-1)).toEqual([1])
    w.unmount()
    await mount('administrator', [])
    expect(w.findAll('[data-comment-delete]')).toHaveLength(2)
  })

  it('отказ в подтверждении и ошибка удаления: комментарий остаётся; ошибка — прежний текст', async () => {
    await mount()
    await w.get('[data-comment-delete]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteComment).not.toHaveBeenCalled()
    api.deleteComment.mockRejectedValue(new Error('x'))
    await w.get('[data-comment-delete]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Не удалось удалить комментарий')
    expect(w.findAll('[data-comment]')).toHaveLength(2)
  })

  it('только чтение: клиент — без поля и без удаления, лента видна; то же при readonly', async () => {
    await mount('client', ['reestr.read'])
    expect(w.findAll('[data-comment]')).toHaveLength(2)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('[data-comment-delete]').exists()).toBe(false)
    w.unmount()
    await mount('importer', ['reestr.read'], { readonly: true })
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('[data-comment-delete]').exists()).toBe(false)
  })
})
