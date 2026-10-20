import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { VerifyDocument } from '@/api/documentVerify'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/documentVerify', () => ({ documentVerifyApi: api }))

import VerifyDocumentView from '../VerifyDocumentView.vue'

const DOC: VerifyDocument = {
  kind: 'contract', number: '№0012/ТП/2026', generatedAtUtc: '2026-10-08T07:00:00Z', status: 'active', validUntilUtc: null,
  revokedAtUtc: null, clientName: 'ТОО ТЕСТ', clientBin: '123456789012', providerName: 'ТОО AQNIET', providerBin: '210240000000',
  signatures: [
    { side: 'client', method: 'ncalayer', signerName: 'ИВАНОВ ИВАН ИВАНОВИЧ', signerIin: '850101300123', signerBin: '123456789012',
      organization: 'ТОО ТЕСТ', certSerial: '4c1a', certValidFromUtc: '2026-01-01T00:00:00Z', certValidToUtc: '2027-01-01T00:00:00Z',
      signedAtUtc: '2026-10-20T09:30:00Z', verified: true },
    { side: 'provider', method: 'egov', signerName: null, signerIin: null, signerBin: null, organization: null, certSerial: null,
      certValidFromUtc: null, certValidToUtc: null, signedAtUtc: '2026-10-19T09:30:00Z', verified: false },
  ],
}

let w: VueWrapper
const mount = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/verify/:token', component: VerifyDocumentView }] })
  await router.push(path)
  w = mountWithI18n(VerifyDocumentView, { global: { plugins: [router] } })
  await flushPromises()
}
afterEach(() => { w?.unmount(); vi.clearAllMocks() })

describe('VerifyDocumentView', () => {
  it('документ, статус и подписанты; время — Астаны; сторона из QR подсвечена', async () => {
    api.get.mockResolvedValue(DOC)
    await mount('/verify/tok?s=client')
    expect(api.get).toHaveBeenCalledWith('tok')
    expect(w.get('h1').text()).toBe('Договор таможенного представителя №0012/ТП/2026')
    expect(w.get('[data-verify-status]').text()).toBe('Действует')
    const client = w.get('[data-verify-signature="client"]')
    expect(client.text()).toContain('ИВАНОВ ИВАН ИВАНОВИЧ')
    expect(client.text()).toContain('850101300123')
    expect(client.text()).toContain('20.10.2026 14:30 (Астана)')
    expect(client.text()).toContain('Подпись проверена НУЦ РК')
    expect(client.classes()).toContain('border-zircon-ink')
    // подпись до 20.10 — без данных сертификата, с пояснением
    expect(w.get('[data-verify-signature="provider"]').text()).toContain('данные сертификата не сохранялись')
  })

  it('неверная ссылка — «Документ не найден»', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    await mount('/verify/nope')
    expect(w.find('[data-verify-not-found]').exists()).toBe(true)
  })
})
