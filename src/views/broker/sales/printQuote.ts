import type { SalesQuoteDto } from '@/api/sales'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { formatAmount, formatMoney } from '@/ui/number'
import { formatDay } from '@/views/broker/list'
import atgLogoSvgRaw from '@/assets/atg-logo-group.svg?raw'

// Печать КП (PDF через диалог печати браузера): HTML собирается здесь и открывается в отдельном окне.
// Окно печати — отдельный документ без стилей приложения: токенов там нет, поэтому цвета — hex.
// Все тексты — из i18n текущего языка (раньше по-русски было всё, кроме двух шапок таблиц).

/** Линия под шапкой — фирменный navy. Раньше стояла var(--z-teal), которой в окне печати нет, и линии не было. */
export const PRINT_RULE_COLOR = '#0E1B35'

type T = (key: string, params?: Record<string, unknown>) => string

export interface QuoteHtmlOptions {
  /** data:-адрес логотипа; пусто — без логотипа. */
  logo?: string
  /** Язык документа (атрибут lang). */
  lang?: string
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string | null | undefined): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])

const money = (n: number | null | undefined): string => formatMoney(n ?? 0)

const R = ' style="text-align:right"'
const C = ' style="text-align:center"'

/** HTML документа печати КП. Колонка антидемпинга — только если в КП есть ненулевые суммы. */
export function buildQuoteHtml(q: SalesQuoteDto, t: T, opts: QuoteHtmlOptions = {}): string {
  const no = t('sales.kpNumber', { n: q.number, y: q.year })
  const p = (k: string, params?: Record<string, unknown>) => escapeHtml(t(`broker.sales.print.${k}`, params))
  const hasAntiDumping = q.goodsLines.some((g) => (g.antiDumpingKzt ?? 0) > 0)

  const svcRows = q.serviceLines
    .map((s) => `<tr><td>${escapeHtml(s.name)}</td><td${R}>${formatAmount(s.unitPrice)}</td><td${C}>${escapeHtml(`${s.quantity} ${s.unit ?? ''}`.trim())}</td><td${C}>${s.discountPercent}%</td><td${R}>${money(s.total)}</td></tr>`)
    .join('')
  const svcTable = svcRows
    ? `<h3>${p('services')}</h3><table><thead><tr><th>${p('col.service')}</th><th>${p('col.price')}</th><th>${p('col.qty')}</th><th>${p('col.discount')}</th><th>${p('col.amount')}</th></tr></thead><tbody>${svcRows}</tbody></table>`
    : ''

  const goodsRows = q.goodsLines
    .map((g) => [
      `<tr><td>${escapeHtml(g.description || g.code)}</td><td>${escapeHtml(g.code)}</td>`,
      `<td${R}>${formatAmount(g.importDutyKzt)}</td>`,
      hasAntiDumping ? `<td${R}>${formatAmount(g.antiDumpingKzt)}</td>` : '',
      `<td${R}>${formatAmount(g.exciseKzt)}</td><td${R}>${formatAmount(g.vatKzt)}</td><td${R}>${formatAmount(g.customsFeeKzt)}</td>`,
      `<td${R}>${money(g.tpinTotalKzt)}</td></tr>`,
    ].join(''))
    .join('')
  const goodsTable = goodsRows
    ? [
      `<h3>${p('customs')}</h3><table><thead><tr><th>${p('col.goods')}</th><th>${p('col.code')}</th><th>${p('col.duty')}</th>`,
      hasAntiDumping ? `<th>${p('col.antiDumping')}</th>` : '',
      `<th>${p('col.excise')}</th><th>${p('col.vat')}</th><th>${p('col.fee')}</th><th>${p('col.total')}</th></tr></thead>`,
      `<tbody>${goodsRows}</tbody></table>`,
    ].join('')
    : ''

  const logo = opts.logo ? `<img src="${escapeHtml(opts.logo)}" alt="" style="height:160px;width:auto;display:block">` : ''
  const contact = q.clientContact ? ` · ${escapeHtml(q.clientContact)}` : ''

  return `<!doctype html><html lang="${escapeHtml(opts.lang || 'ru')}"><head><meta charset="utf-8"><title>${p('windowTitle', { no })}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1a2332;padding:40px;max-width:760px;margin:0 auto}
    h1{font-size:22px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
    .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${PRINT_RULE_COLOR};padding-bottom:16px;margin-bottom:20px}
    .brand b{font-size:18px} table{width:100%;border-collapse:collapse;margin:14px 0}
    th,td{border:1px solid #d6dce5;padding:7px 10px;font-size:13px} th{background:#eef3f8;text-align:left}
    h3{font-size:14px;margin:18px 0 6px} .totals{margin-top:18px;text-align:right}
    .totals div{margin:4px 0} .grand{font-size:18px;font-weight:800;color:#1a2332}
    .muted{color:#6b7280} .foot{margin-top:30px;color:#6b7280;font-size:12px}
  </style></head><body>
    <div class="brand">
      <div>${logo}</div>
      <div style="text-align:right"><b>${p('number', { no })}</b><div class="muted">${formatDay(q.createdAtUtc)}</div></div></div>
    <h1>${p('heading')}</h1>
    <div class="sub">${p('forClient')} <b>${escapeHtml(q.clientName)}</b>${contact}</div>
    ${q.comment ? `<p class="muted">${escapeHtml(q.comment)}</p>` : ''}
    ${svcTable}
    ${goodsTable}
    <div class="totals">
      <div>${p('servicesTotal')} <b>${money(q.servicesTotal)}</b></div>
      <div>${p('customsTotal')} <b>${money(q.tpinTotal)}</b></div>
      <div class="grand">${p('grandTotal')} ${money(q.grandTotal)}</div>
    </div>
    <div class="foot">${p('disclaimer')}</div>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`
}

const logoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atgLogoSvgRaw)}`

/** Открыть КП для печати в новом окне на языке интерфейса; всплывающие окна запрещены — предупреждение. */
export function printQuote(q: SalesQuoteDto): void {
  const g = i18n.global
  const t: T = (k, params) => g.t(k, params ?? {})
  const html = buildQuoteHtml(q, t, { logo: logoDataUri, lang: String(g.locale.value) })
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const w = window.open(url, '_blank')
  if (!w) {
    message.warning(t('sales.razreshiteVsplyvayuschieOknaV'))
    URL.revokeObjectURL(url)
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
