import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import type { SalesQuoteDto } from '@/api/sales'

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { PRINT_RULE_COLOR, buildQuoteHtml, escapeHtml, printQuote } from '../printQuote'

const tFor = (locale: 'ru' | 'en' | 'kk') => {
  const i18n = createI18n({ legacy: false, locale, messages: { ru, en, kk } as never })
  return (k: string, p?: Record<string, unknown>) => i18n.global.t(k, p ?? {})
}

const quote = (o: Partial<SalesQuoteDto> = {}): SalesQuoteDto => ({
  id: 'q1', number: '0037', year: 2026, clientName: 'TOO Kazakhmys Trade', clientContact: 'Arman', comment: '',
  status: 1, servicesTotal: 79500, tpinTotal: 1673990, grandTotal: 1753490, createdByName: 'mpp', createdAtUtc: '2026-10-08T05:00:00Z',
  serviceLines: [{ name: 'Customs declaration', unit: 'pcs', unitPrice: 45000, quantity: 1, discountPercent: 0, total: 45000 }],
  goodsLines: [{
    description: 'Laptops', code: '8471300000', codeName: null, customsValueKzt: 12000000, importDutyKzt: 0, exciseKzt: 0,
    customsFeeKzt: 20000, vatKzt: 1488810, tpinTotalKzt: 1508810, error: null,
  }],
  ...o,
})
const nb = (s: string) => s.replace(/\u00a0/g, ' ')

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

describe('печать КП', () => {
  it('(баг) линия шапки — фирменный hex, без неопределённой var(--z-teal)', () => {
    const html = buildQuoteHtml(quote(), tFor('ru'))
    expect(html).not.toContain('var(--z-teal)')
    expect(html).not.toContain('var(--')
    expect(html).toContain(`border-bottom:3px solid ${PRINT_RULE_COLOR}`)
    expect(PRINT_RULE_COLOR).toBe('#0E1B35')
  })

  it('(баг) колонка антидемпинга — только если есть ненулевые суммы', () => {
    const without = buildQuoteHtml(quote(), tFor('ru'))
    expect(without).not.toContain('Антидемп.')
    expect(without.match(/<th>/g)).toHaveLength(5 + 7)

    const withAd = buildQuoteHtml(quote({
      goodsLines: [
        { ...quote().goodsLines[0], antiDumpingKzt: 0 },
        { ...quote().goodsLines[0], code: '7208100000', antiDumpingKzt: 54321 },
      ],
    }), tFor('ru'))
    expect(withAd).toContain('<th>Антидемп.</th>')
    expect(withAd.match(/<th>/g)).toHaveLength(5 + 8)
    expect(nb(withAd)).toContain('<td style="text-align:right">54 321</td>')
  })

  it('(баг) тексты — на языке интерфейса, без смешения: en', () => {
    const html = buildQuoteHtml(quote(), tFor('en'), { lang: 'en' })
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>CO 0037/CO/2026</title>')
    expect(html).toContain('<b>CO No. 0037/CO/2026</b>')
    expect(html).toContain('<h1>Commercial offer</h1>')
    expect(html).toContain('For: <b>TOO Kazakhmys Trade</b> · Arman')
    expect(html).toContain('<h3>Services</h3>')
    expect(html).toContain('<h3>Customs payments</h3>')
    expect(html).toContain('This offer is preliminary.')
    expect(nb(html)).toContain('Total: 1 753 490 ₸')
    // Ни одной кириллической буквы: данные КП латиницей, всё остальное — из en.
    expect(html).not.toMatch(/[А-Яа-яЁёҚқҰұҮүӘәІіҢңҒғӨөҺһ]/)
  })

  it('ru и kk — свои подписи; дата ДД.ММ.ГГГГ; суммы и строки', () => {
    const ruHtml = nb(buildQuoteHtml(quote({ comment: 'две партии' }), tFor('ru')))
    expect(ruHtml).toContain('<b>КП № 0037/КП/2026</b><div class="muted">08.10.2026</div>')
    expect(ruHtml).toContain('<h1>Коммерческое предложение</h1>')
    expect(ruHtml).toContain('<p class="muted">две партии</p>')
    expect(ruHtml).toContain('<tr><td>Customs declaration</td><td style="text-align:right">45 000</td><td style="text-align:center">1 pcs</td><td style="text-align:center">0%</td><td style="text-align:right">45 000 ₸</td></tr>')
    expect(ruHtml).toContain('Услуги: <b>79 500 ₸</b>')
    expect(ruHtml).toContain('Таможенные платежи: <b>1 673 990 ₸</b>')
    const kkHtml = buildQuoteHtml(quote(), tFor('kk'))
    expect(kkHtml).toContain('<h1>Коммерциялық ұсыныс</h1>')
    expect(kkHtml).toContain('КҰ № 0037/КҰ/2026')
    expect(kkHtml).not.toContain('Коммерческое')
  })

  it('без строк услуг и товаров — без таблиц', () => {
    const html = buildQuoteHtml(quote({ serviceLines: [], goodsLines: [] }), tFor('ru'))
    expect(html).not.toContain('<table>')
  })

  it('экранирование данных КП', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    expect(escapeHtml(null)).toBe('')
    const html = buildQuoteHtml(quote({
      clientName: '<script>alert(1)</script>', clientContact: '"x"', comment: 'A & B',
      serviceLines: [{ name: '<b>', unit: '<i>', unitPrice: 1, quantity: 1, discountPercent: 0, total: 1 }],
    }), tFor('ru'))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain(' · &quot;x&quot;')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('<td>&lt;b&gt;</td>')
    expect(html).toContain('1 &lt;i&gt;')
  })

  it('printQuote: открывает окно с документом; всплывающие запрещены — предупреждение', () => {
    const create = vi.fn(() => 'blob:q')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    printQuote(quote())
    expect(create).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('blob:q', '_blank')
    expect(toast.warning).not.toHaveBeenCalled()

    open.mockReturnValue(null)
    printQuote(quote())
    expect(toast.warning).toHaveBeenCalledWith('Разрешите всплывающие окна в браузере для печати КП')
    expect(revoke).toHaveBeenCalledWith('blob:q')
  })
})
