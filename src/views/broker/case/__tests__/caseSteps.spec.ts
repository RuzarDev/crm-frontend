import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { formatMoney } from '@/ui/number'
import { STEP_NUMBERS, currentStepOf, stepStateOf, stepSummary, whatsLeft } from '../caseSteps'
import { formatLogStamp, groupFiles, roleLabel, transportSummary } from '../caseFormat'
import { caseDto, declaration, fileDto } from './caseFixture'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string

describe('caseSteps: состояния по статусам 0–9', () => {
  it.each([
    [0, 1, ['current', 'future', 'future', 'future', 'future', 'future']],
    [1, 2, ['done', 'current', 'future', 'future', 'future', 'future']],
    [2, 3, ['done', 'done', 'current', 'future', 'future', 'future']],
    [3, 3, ['done', 'done', 'current', 'future', 'future', 'future']],
    [4, 4, ['done', 'done', 'done', 'current', 'future', 'future']],
    [5, 4, ['done', 'done', 'done', 'current', 'future', 'future']],
    [6, 5, ['done', 'done', 'done', 'done', 'current', 'future']],
    [7, 6, ['done', 'done', 'done', 'done', 'done', 'current']],
    [8, null, ['done', 'done', 'done', 'done', 'done', 'done']],
    [9, null, ['future', 'future', 'future', 'future', 'future', 'future']],
  ])('статус %i → шаг %s', (status, cur, states) => {
    expect(currentStepOf(status)).toBe(cur)
    expect(STEP_NUMBERS.map((n) => stepStateOf(status, n))).toEqual(states)
  })
})

describe('caseSteps: сводки пройденных шагов', () => {
  const files = [fileDto({ id: 'a' }), fileDto({ id: 'b' }), fileDto({ id: 'c' }), fileDto({ id: 'd' }), fileDto({ id: 'x', section: 'svh-invoice' })]
  it('1 — контейнеры и документы клиента (формы числа)', () => {
    expect(stepSummary(1, caseDto(), files, t, 'ru')).toBe('4 файла')
    const containers = [{ id: 'k1', containerNumber: 'MRSU4885849' }, { id: 'k2', containerNumber: 'TGHU3102241' }] as never
    expect(stepSummary(1, caseDto({ containers }), files.slice(0, 1), t, 'ru')).toBe('2 контейнера · 1 файл')
    expect(stepSummary(1, caseDto(), [], t, 'ru')).toBe('0 файлов')
  })
  it('2–6 — как раньше', () => {
    expect(stepSummary(2, caseDto(), [], t, 'ru')).toBe('пройдена')
    expect(stepSummary(3, caseDto({ declarations: [declaration(), declaration({ id: 'd2', isSplitReplaced: true })] }), [], t, 'ru')).toBe('ДТ: 2')
    expect(stepSummary(4, caseDto({ svhInvoiceAmount: 312400.4, svhInvoiceNumber: '1187', svhInvoiceNote: 'СВХ Достык' }), [], t, 'ru'))
      .toBe(`${formatMoney(312400)} · № 1187 · СВХ Достык`)
    expect(stepSummary(4, caseDto({ svhInvoiceNote: 'ждём' }), [], t, 'ru')).toBe('счёт: ждём')
    expect(stepSummary(4, caseDto(), [], t, 'ru')).toBe('закрыт')
    expect(stepSummary(5, caseDto(), [], t, 'ru')).toBe('оплачена')
    expect(stepSummary(6, caseDto(), [], t, 'ru')).toBe('оплачено')
  })
})

describe('caseSteps: что осталось до подачи', () => {
  const dts = [declaration({ id: 'd1' }), declaration({ id: 'd2', declarationNumber: '55210/031026/0012240' }), declaration({ id: 'd0', isSplitReplaced: true })]
  const readiness = [
    { declarationId: 'd1', declarationNumber: '', isReady: false, missing: ['гр. 31'], filled: 15, total: 22 },
    { declarationId: 'd2', declarationNumber: '55210/031026/0012240', isReady: true, missing: [], filled: 22, total: 22 },
  ]
  it('ДТ, неготовые ДТ, документы, проблема', () => {
    expect(whatsLeft(caseDto({ declarations: dts, isProblem: true }), readiness, [fileDto()], t)).toEqual([
      { id: 'dt', done: true },
      { id: 'fill', done: false, declarationId: 'd1', label: 'ДТ 1', filled: 15, total: 22 },
      { id: 'docs', done: true, count: 1 },
      { id: 'problem', done: false },
    ])
  })
  it('нет ДТ, нет документов, нет сводки; без проблемы пункта о ней нет', () => {
    expect(whatsLeft(caseDto(), null, [], t)).toEqual([{ id: 'dt', done: false }, { id: 'docs', done: false, count: 0 }])
  })
  it('только заменённые ДТ — «ДТ создана» не выполнено; заменённая в сводке не просит заполнения', () => {
    const rd = [{ declarationId: 'd0', declarationNumber: '', isReady: false, missing: [], filled: 1, total: 22 }]
    expect(whatsLeft(caseDto({ declarations: [dts[2]] }), rd, [], t)).toEqual([{ id: 'dt', done: false }, { id: 'docs', done: false, count: 0 }])
  })
  it('номер ДТ в подписи, если есть', () => {
    const rd = [{ ...readiness[1], isReady: false, filled: 20 }]
    expect(whatsLeft(caseDto({ declarations: dts }), rd, [], t)[1]).toMatchObject({ id: 'fill', label: '55210/031026/0012240', filled: 20 })
  })
})

describe('caseFormat', () => {
  it('транспорт с прицепом и без', () => {
    expect(transportSummary(caseDto(), t)).toBe('Авто · 777 KTA 02 / прицеп 12 KZ 3456')
    expect(transportSummary(caseDto({ transportMode: 0, vehicleNumber: '', trailerNumber: '', wagonNumber: '52147896' }), t)).toBe('ЖД · 52147896')
    expect(transportSummary(caseDto({ vehicleNumber: '', trailerNumber: '' }), t)).toBe('Авто')
  })
  it('файлы по разделам; неизвестный раздел — «Прочее»', () => {
    const g = groupFiles([fileDto(), fileDto({ id: 'e', section: 'extraction-batch' as never }), fileDto({ id: 'z', section: 'weird' as never })])
    expect(g.map((x) => [x.key, x.files.length])).toEqual([
      ['documents', 1], ['extraction-batch', 1], ['power-of-attorney', 0], ['declaration-stamp', 0], ['svh-invoice', 0], ['payment-check', 0], ['other', 1],
    ])
  })
  it('время записи истории', () => {
    const now = new Date(2026, 9, 8, 12, 0)
    expect(formatLogStamp(new Date(2026, 9, 8, 10, 40).toISOString(), now, t)).toBe('10:40')
    expect(formatLogStamp(new Date(2026, 9, 7, 17, 5).toISOString(), now, t)).toBe('вчера, 17:05')
    expect(formatLogStamp(new Date(2026, 9, 3, 17, 5).toISOString(), now, t)).toBe('03.10, 17:05')
    expect(formatLogStamp(new Date(2025, 9, 3, 17, 5).toISOString(), now, t)).toBe('03.10.2025, 17:05')
  })
  it('роль автора коротко; неизвестная — как есть', () => {
    expect(roleLabel('declarant', t)).toBe('декларант')
    expect(roleLabel('kpp', t)).toBe('КПП')
    expect(roleLabel('robot', t)).toBe('robot')
    expect(roleLabel('', t)).toBe('')
  })
})

describe('i18n broker.case', () => {
  const keys = (o: unknown, prefix = ''): string[] =>
    typeof o === 'object' && o !== null
      ? Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix]
  it('kk и en — те же ключи, что ru', () => {
    const base = keys(ru.broker.case).sort()
    expect(keys(kk.broker.case).sort()).toEqual(base)
    expect(keys(en.broker.case).sort()).toEqual(base)
  })
})
