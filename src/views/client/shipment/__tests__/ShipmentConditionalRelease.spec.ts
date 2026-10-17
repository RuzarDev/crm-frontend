import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ConditionalReleaseDto } from '@/api/conditionalRelease'

const api = vi.hoisted(() => ({ upload: vi.fn(), set: vi.fn(), resolve: vi.fn() }))
vi.mock('@/api/conditionalRelease', async (orig) => ({ ...(await orig<object>()), conditionalReleaseApi: api }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import ShipmentConditionalRelease from '../ShipmentConditionalRelease.vue'

const year = new Date().getFullYear()
const cr = (o: Partial<ConditionalReleaseDto> = {}): ConditionalReleaseDto => ({
  docKind: 'origin', note: null, deadline: `${year}-12-15`, setAtUtc: null, fileId: null, fileName: null,
  uploadedAtUtc: null, resolvedAtUtc: null, overdue: false, daysLeft: 30, ...o,
})

afterEach(() => vi.clearAllMocks())

describe('ShipmentConditionalRelease', () => {
  it('показывает только открытые: «до ДД.ММ загрузите …», закрытые и без отметки — нет', () => {
    const w = mountWithI18n(ShipmentConditionalRelease, {
      props: {
        caseId: 'c1',
        declarations: [
          { id: 'd1', declarationNumber: '55302/1', conditionalRelease: cr() },
          { id: 'd2', declarationNumber: '55302/2', conditionalRelease: cr({ resolvedAtUtc: '2026-10-01T00:00:00Z' }) },
          { id: 'd3', declarationNumber: '55302/3', conditionalRelease: null },
        ],
      },
    })
    const blocks = w.findAll('[data-ship-condrel]')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].attributes('data-condrel-state')).toBe('open')
    expect(blocks[0].get('[data-condrel-text]').text()).toBe('55302/1 выпущена условно. До 15.12 загрузите сертификат происхождения.')
  })

  it('просрочено — «срок истёк»; загрузка отправляет файл и сообщает родителю', async () => {
    api.upload.mockResolvedValue(cr({ overdue: true, uploadedAtUtc: '2026-10-17T05:00:00Z', fileName: 'st1.pdf', fileId: 'f1' }))
    const w = mountWithI18n(ShipmentConditionalRelease, {
      props: { caseId: 'c1', declarations: [{ id: 'd1', declarationNumber: null, conditionalRelease: cr({ overdue: true }) }] },
    })
    expect(w.get('[data-condrel-text]').text()).toContain('Срок истёк 15.12')
    const input = w.get('input[type="file"]')
    const file = new File(['x'], 'st1.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(api.upload).toHaveBeenCalledWith('c1', 'd1', file)
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.get('[data-ship-condrel]').attributes('data-condrel-state')).toBe('uploaded')
    expect(w.get('[data-condrel-uploaded]').text()).toContain('st1.pdf')
  })
})
