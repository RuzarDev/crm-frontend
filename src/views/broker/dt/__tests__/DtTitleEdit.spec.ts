import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import DtTitleEdit from '../DtTitleEdit.vue'

// Название ДТ с правкой на месте (23.10.2026): своё — обычным цветом, автоназвание — приглушённым; Enter / уход фокуса —
// сохранить, Esc — отмена, пусто — вернуть автоназвание.
let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})
const mountEdit = (props: Record<string, unknown> = {}) => {
  const save = vi.fn(async () => true)
  w = mountWithI18n(DtTitleEdit, {
    props: { title: null, autoTitle: 'Кушетка медицинская · ещё 1', canEdit: true, save, ...props },
    attachTo: document.body,
  })
  return save
}
const input = () => w.get<HTMLInputElement>('[data-dt-title-input]')
const startEdit = async () => {
  await w.get('[data-dt-title-edit]').trigger('click')
  await flushPromises()
}

describe('DtTitleEdit', () => {
  it('автоназвание приглушённое, своё — обычным цветом; без права — без карандаша', () => {
    mountEdit()
    expect(w.get('[data-dt-title]').text()).toBe('Кушетка медицинская · ещё 1')
    expect(w.get('[data-dt-title]').classes()).toContain('text-ink-2')
    expect(w.find('[data-dt-title]').attributes('data-dt-title-auto')).toBe('')
    expect(w.get('[data-dt-title-edit]').attributes('aria-label')).toBe('Дать ДТ название')
    w.unmount()
    mountEdit({ title: ' Партия из Шанхая ', canEdit: false })
    expect(w.get('[data-dt-title]').text()).toBe('Партия из Шанхая')
    expect(w.get('[data-dt-title]').classes()).toContain('text-ink')
    expect(w.find('[data-dt-title]').attributes('data-dt-title-auto')).toBeUndefined()
    expect(w.find('[data-dt-title-edit]').exists()).toBe(false)
  })

  it('карандаш → поле со своим названием (автоназвание — подсказкой); Enter сохраняет обрезанное', async () => {
    const save = mountEdit()
    await startEdit()
    expect(input().element.value).toBe('')
    expect(input().attributes('placeholder')).toBe('Кушетка медицинская · ещё 1')
    expect(document.activeElement).toBe(input().element)
    await input().setValue('  Партия 2  ')
    await input().trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(save).toHaveBeenCalledWith('Партия 2')
    expect(w.find('[data-dt-title-input]').exists()).toBe(false)
  })

  it('пусто — сброс к автоназванию (null); Enter без правки — без запроса', async () => {
    const save = mountEdit({ title: 'Партия 2' })
    await startEdit()
    expect(input().element.value).toBe('Партия 2')
    await input().trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    await startEdit()
    await input().setValue('   ')
    await input().trigger('blur')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(null)
  })

  it('Esc — отмена без сохранения, фокус на карандаш', async () => {
    const save = mountEdit({ title: 'Партия 2' })
    await startEdit()
    await input().setValue('Другое')
    await input().trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(w.find('[data-dt-title-input]').exists()).toBe(false)
    expect(w.get('[data-dt-title]').text()).toBe('Партия 2')
    expect(document.activeElement).toBe(w.get('[data-dt-title-edit]').element)
  })

  it('сохранение не прошло — поле остаётся открытым', async () => {
    const save = vi.fn(async () => false)
    mountEdit({ save })
    await startEdit()
    await input().setValue('Партия 3')
    await input().trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(w.find('[data-dt-title-input]').exists()).toBe(true)
  })
})
