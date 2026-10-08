import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import {
  MONTH_SERIES, STAGE_BAR, barHeight, barWidth, chartDescription, delta, deltaText, deltaTone, formatDays, formatPayments, maxOf,
  monthLabel, paymentsTitle, roleShort, stageBar, stageLabel, staffName,
} from '../analytics'
import type { AnalyticsStage } from '@/api/analytics'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
const tIn = (locale: 'ru' | 'kk' | 'en') => (key: string, params?: Record<string, unknown>) =>
  i18n.global.t(key, params ?? {}, { locale }) as string
const t = tIn('ru')
const nb = (s: string) => s.replace(/ /g, ' ')

describe('delta: изменение к прошлым 30 дням', () => {
  it('рост и падение — целые проценты', () => {
    expect(delta(114, 100)).toEqual({ kind: 'pct', pct: 14 })
    expect(delta(95, 100)).toEqual({ kind: 'pct', pct: -5 })
    expect(delta(0, 8)).toEqual({ kind: 'pct', pct: -100 })
  })
  it('раньше не было, теперь есть — «новое»', () => {
    expect(delta(7, 0)).toEqual({ kind: 'new' })
  })
  it('ноль и ноль, одинаковые значения, рост меньше полпроцента — «без изменений»', () => {
    expect(delta(0, 0)).toEqual({ kind: 'flat' })
    expect(delta(12, 12)).toEqual({ kind: 'flat' })
    expect(delta(1001, 1000)).toEqual({ kind: 'flat' })
  })
  it('тон: рост up, падение down, остальное без цвета', () => {
    expect(deltaTone(delta(114, 100))).toBe('up')
    expect(deltaTone(delta(95, 100))).toBe('down')
    expect(deltaTone(delta(7, 0))).toBeNull()
    expect(deltaTone(delta(0, 0))).toBeNull()
  })
  it('текст: знак, суффикс «к прошлым 30 дням», «новое», «без изменений»', () => {
    expect(deltaText(delta(114, 100), t)).toBe('+14%')
    expect(deltaText(delta(114, 100), t, true)).toBe('+14% к прошлым 30 дням')
    expect(deltaText(delta(95, 100), t)).toBe('−5%')
    expect(deltaText(delta(7, 0), t, true)).toBe('новое')
    expect(deltaText(delta(0, 0), t, true)).toBe('без изменений')
  })
})

describe('столбцы и полосы', () => {
  it('высота столбика — доля от максимума ряда, не ниже 4%', () => {
    expect(barHeight(50, 100)).toBe(50)
    expect(barHeight(100, 100)).toBe(100)
    expect(barHeight(1, 100)).toBe(4)
    expect(barHeight(0, 100)).toBe(4)
    expect(barHeight(0, 0)).toBe(4)
  })
  it('ширина полосы: 0 — пусто, малое значение — не уже 3%', () => {
    expect(barWidth(0, 10)).toBe(0)
    expect(barWidth(1, 1000)).toBe(3)
    expect(barWidth(5, 10)).toBe(50)
    expect(barWidth(5, 0)).toBe(0)
  })
  it('максимум не ниже 1', () => {
    expect(maxOf([])).toBe(1)
    expect(maxOf([0, 0])).toBe(1)
    expect(maxOf([3, 9, 4])).toBe(9)
  })
  it('цвета рядов и стадий — токены', () => {
    expect(MONTH_SERIES.map((s) => s.bar)).toEqual(['bg-navy', 'bg-zircon', 'bg-line-strong'])
    expect(Object.values(STAGE_BAR)).toEqual(['bg-faint', 'bg-gold', 'bg-zircon', 'bg-tone-pay-fg', 'bg-tone-submitted-fg', 'bg-tone-done-fg'])
    expect(stageBar('неизвестная')).toBe('bg-faint')
  })
})

describe('подписи месяцев', () => {
  it('на трёх языках, с годом из двух цифр (как раньше)', () => {
    expect(['2026-01', '2026-05', '2026-09', '2025-12'].map((m) => monthLabel(m, tIn('ru')))).toEqual(['янв 26', 'май 26', 'сен 26', 'дек 25'])
    expect(['2026-01', '2026-05', '2026-09', '2025-12'].map((m) => monthLabel(m, tIn('kk')))).toEqual(['қаң 26', 'мам 26', 'қыр 26', 'жел 25'])
    expect(['2026-01', '2026-05', '2026-09', '2025-12'].map((m) => monthLabel(m, tIn('en')))).toEqual(['Jan 26', 'May 26', 'Sep 26', 'Dec 25'])
  })
  it('мусор возвращается как есть', () => {
    expect(monthLabel('bad', t)).toBe('bad')
    expect(monthLabel('2026-13', t)).toBe('2026-13')
  })
})

describe('числа', () => {
  it('платежи: от миллиона — «млн ₸» с запятой, меньше — полной суммой', () => {
    expect(nb(formatPayments(18_240_000, 'ru', t))).toBe('18,2 млн ₸')
    expect(nb(formatPayments(2_000_000, 'ru', t))).toBe('2 млн ₸')
    expect(nb(formatPayments(450_000, 'ru', t))).toBe('450 000 ₸')
    expect(nb(formatPayments(0, 'ru', t))).toBe('0 ₸')
    expect(nb(formatPayments(18_240_000, 'en', tIn('en')))).toBe('18.2M ₸')
  })
  it('срок оформления: «4,6 дн.» или «—»', () => {
    expect(nb(formatDays(4.6, 'ru', t))).toBe('4,6 дн.')
    expect(nb(formatDays(12, 'ru', t))).toBe('12 дн.')
    expect(formatDays(null, 'ru', t)).toBe('—')
  })
})

describe('люди', () => {
  it('роль: короткая у декларанта и КПП, у остальных общая подпись, пусто — пустая строка', () => {
    const te = (k: string) => i18n.global.te(k)
    expect(roleShort('declarant', t, te)).toBe('декларант')
    expect(roleShort('KPP', t, te)).toBe('КПП')
    expect(roleShort('rop', t, te)).toBe('Руководитель отдела')
    expect(roleShort('', t, te)).toBe('')
  })
  it('имя сотрудника: справочник, иначе логин, иначе «—»', () => {
    const s = { userId: 'u1', username: 'aigerim', role: 'declarant', activeCases: 1, doneCases: 2 }
    expect(staffName(s, { u1: 'Айгерим Касымова' })).toBe('Айгерим Касымова')
    expect(staffName(s, {})).toBe('aigerim')
    expect(staffName({ ...s, username: '' }, {})).toBe('—')
  })
  it('описание графика содержит значения по месяцам и платежи, если были', () => {
    const d = chartDescription([
      { month: '2026-09', cases: 33, declarations: 41, paymentsKzt: 18_200_000, transitEntries: 16 },
      { month: '2026-10', cases: 9, declarations: 11, paymentsKzt: 0, transitEntries: 4 },
    ], t, 'ru')
    expect(nb(d)).toContain('сен 26: заявки 33, ДТ 41, транзит 16, платежи гр. B 18,2 млн ₸')
    expect(nb(d)).toContain('окт 26: заявки 9, ДТ 11, транзит 4')
    expect(d).not.toContain('транзит 4, платежи')
  })
  it('полная сумма для подсказки — только у значений «млн ₸»', () => {
    expect(paymentsTitle(450_000)).toBeUndefined()
    expect(nb(paymentsTitle(18_206_900)!)).toBe('18 206 900 ₸')
  })
  it('стадия draft — «Заявка и документы»', () => {
    expect(stageLabel({ key: 'draft', count: 1 } as AnalyticsStage, t)).toBe('Заявка и документы')
    expect(stageLabel({ key: 'border', count: 1 } as AnalyticsStage, t)).toBe('На границе')
  })
})
