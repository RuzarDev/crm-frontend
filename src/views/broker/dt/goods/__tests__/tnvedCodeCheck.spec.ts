import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ node: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import { createDtTnvedCheck, resetDtTnvedCheckCache, useGoodsCodesValidation } from '../tnvedCodeCheck'

const notFound = () => Object.assign(new Error('404'), { response: { status: 404 } })

beforeEach(() => {
  vi.useRealTimers()
  resetDtTnvedCheckCache()
  api.node.mockReset().mockImplementation(async (code: string) => {
    if (code.startsWith('0')) throw notFound()
    return { data: { code, is10: code.length === 10 } }
  })
})

describe('createDtTnvedCheck', () => {
  it('лист — верный; не лист и 404 — «нет в справочнике»; сбой сети — не известно (за вход — один раз, снова — при следующем)', async () => {
    const check = createDtTnvedCheck()
    await Promise.all([check.validate('8471300000'), check.validate('847130'), check.validate('0000000000')])
    expect(check.isInvalid('8471300000')).toBe(false)
    expect(check.isInvalid('847130')).toBe(true)
    expect(check.isInvalid('0000000000')).toBe(true)
    expect(api.node).toHaveBeenCalledWith('8471300000', { silent: true })

    api.node.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await check.validate('9999999999')
    expect(check.isInvalid('9999999999')).toBe(false)
    // За этот вход в раздел сбойный код больше не спрашиваем (повторный blur, перепроверка списка).
    expect(check.isKnown('9999999999')).toBe(true)
    await check.validate('9999999999')
    expect(api.node).toHaveBeenCalledTimes(4)
    // Следующий вход в раздел — новая проверка: сбойный код спрашивается снова (один раз), остальные — из кэша сессии.
    const next = createDtTnvedCheck()
    expect(next.isKnown('9999999999')).toBe(false)
    expect(next.isInvalid('847130')).toBe(true)
    await Promise.all(['8471300000', '847130', '0000000000', '9999999999'].map((c) => next.validate(c)))
    expect(api.node).toHaveBeenCalledTimes(5)
    expect(next.isKnown('9999999999')).toBe(true)
  })

  it('кэш — на сессию: новая проверка (повторный вход в раздел) не спрашивает проверенные коды; «верный» снимает ошибку', async () => {
    await createDtTnvedCheck().validate('847130')
    const again = createDtTnvedCheck()
    await again.validate('847130')
    expect(api.node).toHaveBeenCalledTimes(1)
    expect(again.isInvalid('847130')).toBe(true)
    again.markValid('847130')
    expect(createDtTnvedCheck().isInvalid('847130')).toBe(false)
  })

  it('один запрос на код (кэш и идущий запрос делятся)', async () => {
    const check = createDtTnvedCheck()
    await Promise.all([check.validate(' 8471300000 '), check.validate('8471300000')])
    await check.validate('8471300000')
    expect(api.node).toHaveBeenCalledTimes(1)
  })
})

describe('useGoodsCodesValidation', () => {
  it('различные коды всех товаров — по одному запросу, не больше 4 одновременно; новый код — после паузы', async () => {
    vi.useFakeTimers()
    let running = 0
    let peak = 0
    api.node.mockImplementation(async (code: string) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return { data: { code, is10: true } }
    })
    const goods = reactive(Array.from({ length: 200 }, (_, i) => ({ tnvedCode: `84713${String(i % 12).padStart(5, '0')}` as string | null })))
    const check = createDtTnvedCheck()
    mount(defineComponent({
      setup() {
        useGoodsCodesValidation(check, () => goods.map((g) => g.tnvedCode), { debounceMs: 600 })
        return () => h('div')
      },
    }))
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(api.node).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(4)
    goods[3].tnvedCode = '0101210000'
    await nextTick()
    expect(api.node).toHaveBeenCalledTimes(12)
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    expect(api.node).toHaveBeenCalledTimes(13)
    vi.useRealTimers()
  })
})
