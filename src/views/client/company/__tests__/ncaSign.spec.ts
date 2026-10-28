import { describe, expect, it, vi } from 'vitest'
import { NcaLayerError } from '@/utils/ncalayer'
import { ncaSignErrorText } from '../ncaSign'

// 29.10.2026: вместо «проверьте связь» — причина: текст NCALayer, ответ сервера или техническая деталь.
const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k)

describe('ncaSignErrorText', () => {
  it('ошибка NCALayer — её текст', () => {
    expect(ncaSignErrorText(new NcaLayerError('failed', 'формат'), t, 'fallback')).toBe('ncalayer.failed:{"msg":"формат"}')
  })
  it('ответ сервера — его текст', () => {
    expect(ncaSignErrorText({ response: { data: { error: 'Подписан другой файл.' } } }, t, 'fallback')).toBe('Подписан другой файл.')
  })
  it('без ответа — общий текст и причина в скобках', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(ncaSignErrorText({ name: 'AxiosError', message: 'Network Error', code: 'ERR_NETWORK' }, t, 'Не удалось'))
      .toBe('Не удалось (ERR_NETWORK: AxiosError: Network Error)')
    expect(ncaSignErrorText(new DOMException('bad', 'InvalidCharacterError'), t, 'Не удалось')).toBe('Не удалось (InvalidCharacterError: bad)')
  })
})
