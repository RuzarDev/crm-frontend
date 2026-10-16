import { describe, expect, it } from 'vitest'
import type { Import40SplitState } from '@/api/import40'
import { i18n } from '@/i18n'
import { splitChangeNotes, splitDuplicateRoles, splitPartVersions, splitUnchanged } from '../splitChange'

const t = (k: string, p?: Record<string, unknown>) => i18n.global.t(k, p ?? {}) as string

const state = (o: Partial<Import40SplitState> = {}): Import40SplitState => ({
  sourceDeclarationId: 'src',
  parts: [
    { id: 'e1', role: 'ETT', declarationNumber: 'E-1', goodsCount: 2, hasPayments: true, factPaymentsCount: 1, hasChildren: false,
      updatedAtUtc: '2026-10-16T10:00:00.123456Z', uploadedToKeden: false },
    { id: 'v1', role: 'VTO', declarationNumber: '', goodsCount: 1, hasPayments: true, factPaymentsCount: 1, hasChildren: false,
      updatedAtUtc: '2026-10-16T10:00:01.654321Z', uploadedToKeden: false },
  ],
  vtoSortOrders: [1],
  goodsCarryOver: true,
  addedGoods: [],
  returnedSortOrders: [],
  expensesFromSource: false,
  manualPaymentSortOrders: [],
  blockedReason: null,
  ...o,
})

describe('«Изменить разделение»: что изменится', () => {
  it('тот же выбор без потерь — менять нечего; добавленные или вернувшиеся товары — есть что менять', () => {
    expect(splitUnchanged(state(), [1])).toBe(true)
    expect(splitUnchanged(state(), [1, 2])).toBe(false)
    expect(splitUnchanged(state({ returnedSortOrders: [0] }), [1])).toBe(false)
    expect(splitUnchanged(state({ goodsCarryOver: false }), [1])).toBe(false)
  })

  it('перенос правок, пересчёт платежей; все товары в ВТО — часть ЕТТ удаляется', () => {
    const notes = splitChangeNotes(state(), [0, 1, 2], 3, t)
    expect(notes[0]).toContain('Сохранятся: номер, шапка')
    expect(notes).toContain('Часть ЕТТ E-1 будет удалена — в ней не останется товаров.')
    expect(notes.some((n) => n.startsWith('Платежи гр.47 пересчитаются'))).toBe(true)
  })

  it('ручные строки гр.47 — только у товаров, сменивших ЕТТ↔ВТО; добавленные пропадают, удалённые возвращаются', () => {
    const notes = splitChangeNotes(state({
      manualPaymentSortOrders: [0, 1, 2],
      addedGoods: [{ declarationId: 'e1', role: 'ETT', sortOrder: 2, description: null, tnvedCode: '9999999999' }],
      returnedSortOrders: [3],
      expensesFromSource: true,
    }), [0, 1], 4, t)
    expect(notes).toContain('Ручные строки гр.47 останутся у товаров № 1, которые меняют ЕТТ↔ВТО, — проверьте суммы.')
    expect(notes).toContain('Пропадут товары, добавленные в части вручную: 9999999999.')
    expect(notes).toContain('Вернутся из исходной ДТ товары, удалённые из частей: № 4.')
    expect(notes).toContain('Расходы возьмутся из исходной ДТ — правки расходов в частях пропадут.')
    expect(notes.some((n) => n.includes('будет удалена'))).toBe(false)
  })

  it('ДТ разделена до 16.10 — правки товаров не переносятся; нет части ЕТТ — будет создана', () => {
    const notes = splitChangeNotes(state({ goodsCarryOver: false, expensesFromSource: true, parts: [state().parts[1]] }), [1], 3, t)
    expect(notes[0]).toContain('ДТ разделена до 16.10')
    expect(notes).toContain('Будет создана новая часть ЕТТ: шапка (вместе с гр.А, гр.48, гр.52, гр.54) — из другой части, номер — пустой.')
    // Предвыбор старого разделения угадан — просим проверить.
    expect(notes[1]).toBe('Разделение сделано до 16.10: отметки текущей ВТО угаданы по коду ТН ВЭД и наименованию — проверьте их перед заменой.')
    expect(notes.some((n) => n.startsWith('Расходы возьмутся'))).toBe(false) // уже сказано в первой строке
  })

  // Ревью I5: какие товары меняют часть — номером и наименованием.
  it('перечисляет товары, переходящие ЕТТ↔ВТО', () => {
    const names = new Map<number, string | null>([[0, 'Ноутбук'], [1, 'Сумка'], [2, null]])
    const notes = splitChangeNotes(state(), [0, 2], 3, t, names)
    expect(notes).toContain('Перейдут из ЕТТ в ВТО: № 1 «Ноутбук», № 3.')
    expect(notes).toContain('Перейдут из ВТО в ЕТТ: № 2 «Сумка».')
    expect(splitChangeNotes(state(), [1, 2], 3, t).some((n) => n.startsWith('Перейдут из ВТО'))).toBe(false)
    // Новое разделение — без строки «угаданы».
    expect(notes.some((n) => n.includes('угаданы'))).toBe(false)
  })

  // Ревью I4: часть уже в КЕДЕН — старый черновик там останется.
  it('часть уже выгружалась в КЕДЕН — предупреждение про старый черновик', () => {
    const st = state()
    st.parts[1].uploadedToKeden = true
    const notes = splitChangeNotes(st, [1, 2], 3, t)
    expect(notes).toContain('Часть ВТО без номера уже выгружалась в КЕДЕН. После изменения следующий XML создаст в КЕДЕН новый черновик, а старый (с прежним составом) останется — удалите его в КЕДЕН вручную.')
    expect(notes.filter((n) => n.includes('КЕДЕН'))).toHaveLength(1)
  })

  // Ревью I2: несколько частей одной роли; I1: отметки частей — строкой, как пришли.
  it('несколько частей одной роли; отметки частей для запроса', () => {
    expect(splitDuplicateRoles(state())).toBe(false)
    const dup = state()
    dup.parts.push({ ...dup.parts[1], id: 'v2' })
    expect(splitDuplicateRoles(dup)).toBe(true)
    expect(splitPartVersions(state())).toEqual([
      { id: 'e1', updatedAtUtc: '2026-10-16T10:00:00.123456Z' },
      { id: 'v1', updatedAtUtc: '2026-10-16T10:00:01.654321Z' },
    ])
  })
})
