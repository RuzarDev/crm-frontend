import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import type { TruckCard, TruckListItem } from '@/api/autoTransit'
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, fileUrl, publicFileUrl, publicZipUrl, zipUrl } from '@/api/autoTransit'
import {
  ERROR_CODES, FILTERS, STAGES, errorKey, nextAction, rowTitle, sinceText, stageBar, stageKey, stateTag,
} from '../autoTransit'

const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string

const item = (o: Partial<TruckListItem> = {}): TruckListItem => ({
  id: 't1', plate: 'A 318 KZ 19', trailerPlate: '', driverName: '', title: 'ТОО «Алтын Сауда»', partiesCount: 1,
  placesTotal: 0, grossKgTotal: 0, currentStage: 1, stageSinceUtc: '2026-11-16T04:00:00Z', status: 'inWork',
  problemNote: '', stalled: false, blockerCode: null, submittedCount: 0, tdNumberCount: 0,
  createdAtUtc: '2026-11-16T04:00:00Z', ...o,
})

const card = (o: Partial<TruckCard> = {}): TruckCard => ({
  ...item(),
  plateCountry: 'KZ', trailerCountry: 'KZ', driverDoc: '', carrierName: '', carrierCountry: '', carrierRegNumber: '',
  customsPostCode: '', arrivedAtUtc: null, stageNumber: '', parties: [], files: [], events: [], blockers: [],
  can: { border: true, declare: true, manage: false },
  ...o,
})

describe('autoTransit: этапы', () => {
  it('семь этапов и их ключи', () => {
    expect(STAGES).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(STAGES.map(stageKey)).toEqual([
      'broker.autoTransit.stage.docs', 'broker.autoTransit.stage.stamps', 'broker.autoTransit.stage.transport',
      'broker.autoTransit.stage.inspection', 'broker.autoTransit.stage.declaration', 'broker.autoTransit.stage.tdNumber',
      'broker.autoTransit.stage.warehouse',
    ])
    expect(t(stageKey(3))).toBe('Транспортный контроль')
  })

  it('stageBar: этап 5 из 7', () =>
    expect(stageBar(item({ currentStage: 5 }))).toEqual(['done', 'done', 'done', 'done', 'current', 'todo', 'todo']))
  it('stageBar: блокер красит текущий этап', () =>
    expect(stageBar(item({ currentStage: 2, blockerCode: 'no_stamped_invoice' }))[1]).toBe('warn'))
  it('stageBar: проблема красит текущий этап', () =>
    expect(stageBar(item({ currentStage: 3, status: 'problem' }))[2]).toBe('warn'))
  it('stageBar: «ждёт по определению» (no_files, not_submitted, no_td_number) — не препятствие', () => {
    expect(stageBar(item({ currentStage: 1, blockerCode: 'no_files' }))[0]).toBe('current')
    expect(stageBar(item({ currentStage: 5, blockerCode: 'not_submitted' }))[4]).toBe('current')
    expect(stageBar(item({ currentStage: 6, blockerCode: 'no_td_number' }))[5]).toBe('current')
    expect(stageBar(item({ currentStage: 6, blockerCode: 'no_td_file' }))[5]).toBe('warn')
  })
  it('stageBar: неизвестный код — не препятствие', () =>
    expect(stageBar(item({ currentStage: 2, blockerCode: 'something_new' }))[1]).toBe('current'))
  it('stageBar: выпущена', () =>
    expect(stageBar(item({ currentStage: null, status: 'released' }))).toEqual(Array(7).fill('done')))
})

describe('autoTransit: состояние строки', () => {
  it('проблема, архив, выпуск', () => {
    expect(stateTag(item({ status: 'problem' }))).toEqual({ tone: 'danger', key: 'broker.autoTransit.state.problem' })
    expect(stateTag(item({ status: 'archived' }))).toEqual({ tone: 'neutral', key: 'broker.autoTransit.state.archived' })
    expect(stateTag(item({ status: 'released', currentStage: null }))).toEqual({ tone: 'done', key: 'broker.autoTransit.state.released' })
  })
  it('блокер важнее этапа', () =>
    expect(stateTag(item({ currentStage: 2, blockerCode: 'no_stamped_invoice' })))
      .toEqual({ tone: 'wait', key: 'broker.autoTransit.blocker.no_stamped_invoice' }))
  it('этапы 1, 5, 6 с ожидаемым блокером — обычная подпись этапа', () => {
    expect(stateTag(item({ currentStage: 1, blockerCode: 'no_files' }))).toEqual({ tone: 'wait', key: 'broker.autoTransit.state.waitDocs' })
    expect(stateTag(item({ currentStage: 5, blockerCode: 'not_submitted' }))).toEqual({ tone: 'submitted', key: 'broker.autoTransit.state.waitDeclarant' })
    expect(stateTag(item({ currentStage: 6, blockerCode: 'no_td_number' }))).toEqual({ tone: 'submitted', key: 'broker.autoTransit.state.waitTd' })
    expect(stateTag(item({ currentStage: 7, blockerCode: 'no_warehouse_receipt' })).key).toBe('broker.autoTransit.blocker.no_warehouse_receipt')
  })
  it('неизвестный код блокера — подпись этапа, а не сырой ключ', () =>
    expect(stateTag(item({ currentStage: 2, blockerCode: 'something_new' }))).toEqual({ tone: 'info', key: 'broker.autoTransit.state.control' }))
  it('по этапу', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((s) => stateTag(item({ currentStage: s })).key.split('.').pop())).toEqual(
      ['waitDocs', 'control', 'control', 'control', 'waitDeclarant', 'waitTd', 'warehouse'],
    )
  })
  it('у каждого блокера сервера есть подпись', () => {
    for (const code of ['party_no_recipient', 'party_no_invoice', 'no_stamped_invoice', 'no_td_file', 'no_warehouse_receipt']) {
      const key = stateTag(item({ blockerCode: code })).key
      expect(t(key)).not.toBe(key)
    }
  })
})

describe('autoTransit: заголовок строки', () => {
  it('консолидация, один получатель, получатель не указан', () => {
    expect(rowTitle(item({ partiesCount: 3, title: null }), t)).toBe('Консолидация · 3')
    expect(rowTitle(item({ partiesCount: 1, title: 'ИП «Сейткали»' }), t)).toBe('ИП «Сейткали»')
    expect(rowTitle(item({ partiesCount: 1, title: null }), t)).toBe('Получатель не указан')
    expect(rowTitle(item({ partiesCount: 1, title: '  ' }), t)).toBe('Получатель не указан')
  })
})

describe('autoTransit: время на этапе', () => {
  it('sinceText', () => {
    expect(sinceText('2026-11-16T04:00:00Z', new Date('2026-11-16T05:10:00Z'), t)).toBe('1 ч 10 мин')
    expect(sinceText('2026-11-16T04:00:00Z', new Date('2026-11-16T04:15:30Z'), t)).toBe('15 мин')
    expect(sinceText('2026-11-16T04:00:00Z', new Date('2026-11-16T06:00:00Z'), t)).toBe('2 ч')
    expect(sinceText('2026-11-16T04:00:00Z', new Date('2026-11-16T04:00:20Z'), t)).toBe('0 мин')
    expect(sinceText('2026-11-14T04:00:00Z', new Date('2026-11-16T07:00:00Z'), t)).toBe('2 д 3 ч')
  })
  it('часы спешат — не уходим в минус', () =>
    expect(sinceText('2026-11-16T05:00:00Z', new Date('2026-11-16T04:00:00Z'), t)).toBe('0 мин'))
})

describe('autoTransit: следующее действие', () => {
  it('nextAction: КПП на этапе 5 ждёт декларанта', () =>
    expect(nextAction(card({ currentStage: 5, can: { border: true, declare: false, manage: false } })))
      .toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.declarant' }))
  it('nextAction: декларант на этапе 5 подаёт ТД', () =>
    expect(nextAction(card({ currentStage: 5, can: { border: false, declare: true, manage: false } })))
      .toEqual({ kind: 'stage', stage: 5 }))
  it('nextAction: проблема блокирует', () =>
    expect(nextAction(card({ currentStage: 3, status: 'problem' })))
      .toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.problem' }))
  it('nextAction: архив и выпуск', () => {
    expect(nextAction(card({ status: 'archived' }))).toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.archived' })
    expect(nextAction(card({ status: 'released', currentStage: null }))).toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.released' })
  })
  it('nextAction: машинные этапы — у границы', () => {
    for (const s of [2, 3, 4, 7]) {
      expect(nextAction(card({ currentStage: s, can: { border: true, declare: false, manage: false } }))).toEqual({ kind: 'stage', stage: s })
      expect(nextAction(card({ currentStage: s, can: { border: false, declare: true, manage: false } })))
        .toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.border' })
    }
  })
  it('nextAction: документы и номер ТД — граница или декларант', () => {
    for (const s of [1, 6]) {
      expect(nextAction(card({ currentStage: s, can: { border: true, declare: false, manage: false } }))).toEqual({ kind: 'stage', stage: s })
      expect(nextAction(card({ currentStage: s, can: { border: false, declare: true, manage: false } }))).toEqual({ kind: 'stage', stage: s })
    }
    expect(nextAction(card({ currentStage: 6, can: { border: false, declare: false, manage: true } })))
      .toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.declarant' })
    expect(nextAction(card({ currentStage: 1, can: { border: false, declare: false, manage: false } })))
      .toEqual({ kind: 'none', reasonKey: 'broker.autoTransit.wait.border' })
  })
})

describe('autoTransit: фильтры и ошибки', () => {
  it('семь фильтров в порядке показа', () => {
    expect(FILTERS.map((f) => f.id)).toEqual(['all', 'waitDocs', 'control', 'waitDeclaration', 'warehouse', 'releasedToday', 'problem'])
    expect(FILTERS.map((f) => f.key)).toEqual(FILTERS.map((f) => `broker.autoTransit.filter.${f.id}`))
  })
  it('errorKey: известный код и неизвестный', () => {
    expect(errorKey('conflict')).toBe('broker.autoTransit.error.conflict')
    expect(errorKey('duplicate_plate')).toBe('broker.autoTransit.error.duplicate_plate')
    expect(errorKey('something_new')).toBe('broker.autoTransit.error.unknown')
    expect(errorKey('')).toBe('broker.autoTransit.error.unknown')
  })
  it('у каждого кода 409 есть текст', () => {
    expect(ERROR_CODES).toEqual(expect.arrayContaining([
      'stage_order', 'td_number_missing', 'party_submitted', 'nothing_to_undo', 'problem', 'archived', 'released',
      'inspection_required', 'already_submitted', 'not_submitted', 'td_number_set', 'last_party', 'not_in_problem',
      'not_in_work', 'duplicate_plate', 'conflict',
      'pi_already_submitted', 'pi_not_submitted', 'pi_number_locked', 'short_number_locked',
    ]))
    for (const code of [...ERROR_CODES, 'unknown']) {
      const key = `broker.autoTransit.error.${code}`
      expect(t(key)).not.toBe(key)
    }
  })
})

describe('autoTransit: адреса файлов', () => {
  it('файлы машины — через API с входом, получателя — открытые', () => {
    expect(fileUrl('t 1', 'f/2')).toBe('/auto-transit/t%201/files/f%2F2/download')
    expect(zipUrl('t1')).toBe('/auto-transit/t1/files/all.zip')
    expect(publicFileUrl('tok', 'f1')).toBe('/api/public/auto-transit/tok/files/f1')
    expect(publicZipUrl('tok')).toBe('/api/public/auto-transit/tok/all.zip')
  })
  it('допустимые файлы и лимит', () => {
    expect(UPLOAD_ACCEPT.split(',')).toEqual(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.docx', '.xlsx'])
    expect(UPLOAD_MAX_BYTES).toBe(30 * 1024 * 1024)
  })
})

// Все подписи модуля — на трёх языках: одинаковый набор ключей, казахский и английский — не копия русского.
type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, prefix = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) =>
    typeof v === 'string' ? { ...acc, [prefix + k]: v } : { ...acc, ...flat(v, `${prefix}${k}.`) }, {})

describe('autoTransit: переводы', () => {
  const r = flat(ru.broker.autoTransit as unknown as Tree)
  const k = flat(kk.broker.autoTransit as unknown as Tree)
  const e = flat(en.broker.autoTransit as unknown as Tree)
  it('одинаковые ключи на трёх языках', () => {
    expect(Object.keys(k).sort()).toEqual(Object.keys(r).sort())
    expect(Object.keys(e).sort()).toEqual(Object.keys(r).sort())
  })
  it('английский и казахский переведены', () => {
    // Числовые шаблоны вида «{n} мин» и коды могут совпадать по форме; осмысленные тексты — нет.
    const same = (o: Record<string, string>) => Object.keys(r).filter((key) => /[А-Яа-яЁё]{4,}/.test(r[key]!) && o[key] === r[key])
    // По-казахски эти слова пишутся так же: «Авто-транзит» (как группа прав), «Декларация», «{n} партия» (без склонения),
    // «Инвойс», «Журнал», «Валюта», «Брутто, кг» (задача 9), «Файл» (кнопка «+ файл» партии); очередь 3 — заголовок
    // настроек «Авто-транзит», вид файла «Инвойс», «Брутто, кг» в плашке итогов; этап 2 — «Брутто, кг», «Валюта»,
    // «инвойс» в сверке документов и «Инвойс» на странице ссылки загрузки.
    expect(same(k).sort()).toEqual([
      'file.kind.invoice', 'journal.title', 'list.parties.one', 'list.title', 'party.addFile', 'party.fields.currency', 'party.fields.grossKg',
      'party.invoice', 'settings.fileKinds.invoice', 'settings.title', 'stage.declaration', 'td.fromDocs.check.grossKg',
      'td.fromDocs.fields.transit_docCurrencyCode', 'td.fromDocs.slot.invoice', 'td.totals.grossKg', 'uploadLink.kinds.invoice',
    ])
    expect(same(e)).toEqual([])
    expect(Object.values(e).filter((v) => /[А-Яа-яЁё]/.test(v))).toEqual([])
  })
  it('пункт меню', () => {
    expect(ru.shell.nav.autoTransit).toBe('Авто-транзит')
    expect(kk.shell.nav.autoTransit).toBeTruthy()
    expect(en.shell.nav.autoTransit).toBe('Auto transit')
  })
})
