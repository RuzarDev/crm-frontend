import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { StageNorm } from '@/api/stages'
import { useAuthStore } from '@/stores/auth'

const api = vi.hoisted(() => ({ norms: vi.fn(), saveNorms: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/stages', () => ({ stagesApi: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StageNormsPage from '../StageNormsPage.vue'

const NORMS: StageNorm[] = [
  { key: 'step1', hours: 4, defaultHours: 4 }, { key: 'step2', hours: 48, defaultHours: 48 }, { key: 'step3', hours: 8, defaultHours: 8 },
  { key: 'step4', hours: 24, defaultHours: 24 }, { key: 'step5', hours: 72, defaultHours: 72 }, { key: 'step6', hours: 72, defaultHours: 72 },
  { key: 'rework', hours: 24, defaultHours: 24 },
]

let w: VueWrapper
const mountAs = async (perms: string[]) => {
  const auth = useAuthStore()
  auth.role = 'importer'
  auth.permissions = perms
  w = mountWithI18n(StageNormsPage, { attachTo: document.body })
  await flushPromises()
}
const input = (key: string) => w.get(`[data-norm-input="${key}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  api.norms.mockResolvedValue(structuredClone(NORMS))
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('StageNormsPage', () => {
  it('шаги 1–6 и доработка у клиента с нормами по умолчанию', async () => {
    await mountAs(['import40.assign'])
    const rows = w.findAll('[data-norm]')
    expect(rows.map((r) => r.attributes('data-norm'))).toEqual(['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'rework'])
    expect(rows[0]!.text()).toContain('1. Заявка и документы')
    expect(rows[3]!.text()).toContain('4. Закрытие на СВХ')
    expect(rows[1]!.text()).toContain('по умолчанию 48 ч')
    expect(rows[6]!.text()).toContain('Доработка у клиента')
    expect((input('step2').element as HTMLInputElement).value).toBe('48')
  })

  it('руководитель меняет норму и сохраняет только изменённые', async () => {
    await mountAs(['import40.assign'])
    api.saveNorms.mockResolvedValue(NORMS.map((n) => (n.key === 'step3' ? { ...n, hours: 12 } : n)))
    expect(w.get('[data-norms-save]').attributes('disabled')).toBeDefined()
    await input('step3').setValue('12')
    await input('step3').trigger('blur')
    await w.get('[data-norms-form]').trigger('submit')
    await flushPromises()
    expect(api.saveNorms).toHaveBeenCalledWith([{ key: 'step3', hours: 12 }])
    expect(msg.success).toHaveBeenCalledWith('Нормы сохранены')
  })

  it('без права — только чтение, без кнопок сохранения', async () => {
    await mountAs(['import40.read'])
    expect(w.get('[data-norms-readonly]').text()).toContain('руководитель отдела или администратор')
    expect(w.find('[data-norms-save]').exists()).toBe(false)
    expect(input('step1').attributes('disabled')).toBeDefined()
  })

  it('ошибка загрузки — сообщение и «Повторить»', async () => {
    api.norms.mockRejectedValueOnce(new Error('500'))
    await mountAs(['import40.assign'])
    expect(w.get('[data-norms-error]').text()).toContain('Не удалось загрузить нормы')
    await w.get('[data-norms-retry]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-norm]')).toHaveLength(7)
  })
})
