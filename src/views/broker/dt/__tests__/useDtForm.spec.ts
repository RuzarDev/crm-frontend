import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { Import40CaseDto, Import40DeclarationDto } from '@/api/import40'
import { caseDto, fullDto } from './dtFixture'

const api = vi.hoisted(() => ({ get: vi.fn(), updateDeclaration: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
const confirmFn = vi.hoisted(() => vi.fn())
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: confirmFn }) }))

import { useDtForm, type UseDtFormOptions } from '../useDtForm'
import { formToPayload, dtoToForm } from '../dtPayload'

const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let scope: EffectScope
let server: Import40CaseDto
let stampN = 0
const nextStamp = () => `2026-10-09T12:00:00.${String(++stampN).padStart(6, '0')}Z`

const start = (opts: Partial<UseDtFormOptions> = {}, dtId = 'dt1') => {
  scope = effectScope()
  const canEdit = ref(true)
  const id = ref(dtId)
  const onSaved = vi.fn()
  const onLoaded = vi.fn()
  const f = scope.run(() => useDtForm('case1', () => id.value, { canEdit: () => canEdit.value, onSaved, onLoaded, ...opts }))!
  return { f, canEdit, id, onSaved, onLoaded }
}
const settle = async () => {
  await flushPromises()
  await nextTick()
}
/** Правка пользователя: deep watch видит её на следующем тике. */
const edit = async (fn: () => void) => {
  fn()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  stampN = 0
  server = caseDto({ declarations: [fullDto({ updatedAtUtc: nextStamp() })] })
  api.get.mockImplementation(async () => structuredClone(server))
  api.updateDeclaration.mockImplementation(async (_c: string, _id: string, body: { declarationNumber?: string | null }) => ({
    ...structuredClone(server.declarations[0]),
    declarationNumber: body.declarationNumber ?? '',
    updatedAtUtc: nextStamp(),
    totalCustomsValue: 111,
  }))
  confirmFn.mockResolvedValue(true)
})
afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useDtForm — загрузка', () => {
  it('грузит заявку тихо, ищет ДТ, заполняет форму под флагом applying; автосейв не срабатывает', async () => {
    const { f, onLoaded } = start()
    expect(f.loading.value).toBe(true)
    await settle()
    expect(api.get).toHaveBeenCalledWith('case1', { silent: true })
    expect(f.loading.value).toBe(false)
    expect(f.form.id).toBe('dt1')
    expect(f.form.declarationNumber).toBe('55302/091026/0000123')
    expect(f.form.goodsItems[0].customsValue).toBe(1500.5)
    expect(f.activeCase.value?.id).toBe('case1')
    expect(f.lastServerDto.value?.totalCustomsValue).toBe(750000)
    expect(f.applying.value).toBe(false)
    expect(f.dirty.value).toBe(false)
    expect(f.editVersion.value).toBe(0)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('префилл из данных клиента — при загрузке, без автосейва', async () => {
    server = caseDto({
      clientCurrencyCode: 'EUR',
      declarations: [fullDto({ currency: null, updatedAtUtc: nextStamp() })],
    } as never)
    const { f } = start()
    await settle()
    expect(f.form.currency).toBe('EUR')
    expect(f.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('ДТ нет в заявке или 404/403 → notFound; прочая ошибка → loadError, reload() повторяет', async () => {
    server = caseDto({ declarations: [] })
    const a = start()
    await settle()
    expect(a.f.notFound.value).toBe(true)
    scope.stop()

    api.get.mockRejectedValueOnce(httpError(403))
    const b = start()
    await settle()
    expect(b.f.notFound.value).toBe(true)
    scope.stop()

    server = caseDto({ declarations: [fullDto({ updatedAtUtc: nextStamp() })] })
    api.get.mockRejectedValueOnce(httpError(500))
    const c = start()
    await settle()
    expect(c.f.loadError.value).toBe(true)
    expect(c.f.notFound.value).toBe(false)
    await c.f.reload()
    await settle()
    expect(c.f.loadError.value).toBe(false)
    expect(c.f.form.id).toBe('dt1')
  })

  it('смена id ДТ (переход после разделения) — загрузка новой ДТ', async () => {
    server = caseDto({ declarations: [fullDto({ updatedAtUtc: nextStamp() }), fullDto({ id: 'dt2', declarationNumber: 'VTO', updatedAtUtc: nextStamp() })] })
    const { f, id } = start()
    await settle()
    id.value = 'dt2'
    await settle()
    expect(f.form.id).toBe('dt2')
    expect(f.form.declarationNumber).toBe('VTO')
  })
})

describe('useDtForm — автосейв', () => {
  it('правка → «есть изменения», через 2,5 с тишины PUT всей формы с отметкой блокировки', async () => {
    const { f, onSaved } = start()
    await settle()
    await edit(() => { f.form.declarationNumber = 'NEW' })
    expect(f.dirty.value).toBe(true)
    expect(f.editVersion.value).toBe(1)
    await vi.advanceTimersByTimeAsync(2400)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    await edit(() => { f.form.incotermsPlace = 'X' }) // снова правка — таймер заново
    await vi.advanceTimersByTimeAsync(2400)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    const [caseId, dtId, body] = api.updateDeclaration.mock.calls[0]
    expect([caseId, dtId]).toEqual(['case1', 'dt1'])
    const expected = dtoToForm(server.declarations[0])
    expected.declarationNumber = 'NEW'
    expected.incotermsPlace = 'X'
    expect(body).toEqual(formToPayload(expected, '2026-10-09T12:00:00.000001Z'))
    expect(f.dirty.value).toBe(false)
    expect(f.savedAt.value).toBeInstanceOf(Date)
    expect(f.savedCounter.value).toBe(1)
    expect(f.saveError.value).toBeNull()
    // ответ PUT применяется: серверная гр.12 и отметка блокировки
    expect(f.lastServerDto.value?.totalCustomsValue).toBe(111)
    expect(onSaved).toHaveBeenCalledWith(f.lastServerDto.value)
    expect(toast.success).not.toHaveBeenCalled() // автосейв без тоста
  })

  it('правки во время запроса досохраняются; следующий PUT — с отметкой из ответа предыдущего', async () => {
    const first = deferred<Import40DeclarationDto>()
    api.updateDeclaration.mockImplementationOnce(() => first.promise)
    const { f } = start()
    await settle()
    await edit(() => { f.form.declarationNumber = 'A' })
    await vi.advanceTimersByTimeAsync(2500)
    expect(f.saving.value).toBe(true)
    await edit(() => { f.form.declarationNumber = 'B' })
    first.resolve({ ...structuredClone(server.declarations[0]), declarationNumber: 'A', updatedAtUtc: 'STAMP-A' })
    await settle()
    expect(f.dirty.value).toBe(true) // правка B ещё не сохранена
    await vi.advanceTimersByTimeAsync(2500)
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    const body2 = api.updateDeclaration.mock.calls[1][2]
    expect(body2.declarationNumber).toBe('B')
    expect(body2.expectedUpdatedAtUtc).toBe('STAMP-A')
    expect(f.dirty.value).toBe(false)
  })

  it('сохранения идут по очереди: второе ждёт первое и читает свежую форму и отметку при отправке', async () => {
    const first = deferred<Import40DeclarationDto>()
    api.updateDeclaration.mockImplementationOnce(() => first.promise)
    const { f } = start()
    await settle()
    const p1 = f.save()
    const p2 = f.save(true)
    await flushPromises()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    f.form.declarationNumber = 'LATER'
    first.resolve({ ...structuredClone(server.declarations[0]), updatedAtUtc: 'STAMP-1' })
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    expect(api.updateDeclaration.mock.calls[1][2]).toMatchObject({ declarationNumber: 'LATER', expectedUpdatedAtUtc: 'STAMP-1' })
    expect(toast.success).toHaveBeenCalledTimes(1) // только ручное
  })
})

describe('useDtForm — ошибки', () => {
  it('ошибка → постоянный текст, «не сохранено» и автоповтор через 15 с', async () => {
    api.updateDeclaration.mockRejectedValueOnce(httpError(500, { detail: 'Сбой базы' }))
    const { f } = start()
    await settle()
    expect(await f.save()).toBe(false)
    expect(f.saveError.value).toBe('Сбой базы')
    expect(f.dirty.value).toBe(true)
    await vi.advanceTimersByTimeAsync(14900)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    expect(f.saveError.value).toBeNull()
    expect(f.dirty.value).toBe(false)
  })

  it('право править пропало — автоповтор и плашка гаснут', async () => {
    api.updateDeclaration.mockRejectedValueOnce(httpError(500))
    const { f, canEdit } = start()
    await settle()
    await f.save()
    expect(f.saveError.value).toBe('HTTP 500')
    canEdit.value = false
    await nextTick()
    expect(f.saveError.value).toBeNull()
    expect(f.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(20000)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
  })

  it('409 — конфликт: стоп автосейва и автоповтора, очередь возвращает false; reload() снимает', async () => {
    const conflictErr = httpError(409, { title: 'ДТ изменена в другом окне', detail: 'ДТ изменена в другом окне или другим пользователем. Перезагрузите страницу.' })
    const first = deferred<Import40DeclarationDto>()
    api.updateDeclaration.mockImplementationOnce(() => first.promise)
    const { f } = start()
    await settle()
    const p1 = f.save()
    const p2 = f.save()
    await flushPromises()
    first.reject(conflictErr)
    expect(await p1).toBe(false)
    expect(await p2).toBe(false)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(f.conflict.value).toBe(true)
    expect(f.saveError.value).toContain('ДТ изменена в другом окне')
    await edit(() => { f.form.declarationNumber = 'X' })
    expect(f.dirty.value).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)

    await f.reload()
    await settle()
    expect(f.conflict.value).toBe(false)
    expect(f.saveError.value).toBeNull()
    expect(f.dirty.value).toBe(false)
    expect(f.form.declarationNumber).toBe('55302/091026/0000123')
  })
})

describe('useDtForm — без права править', () => {
  it('save() — no-op, правки не копятся, PUT не уходит никогда', async () => {
    const { f, canEdit } = start()
    canEdit.value = false
    await settle()
    expect(f.editable.value).toBe(false)
    expect(await f.save(true)).toBe(false)
    await edit(() => { f.form.declarationNumber = 'X' })
    expect(f.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('право считается по заявке: canEdit получает загруженную заявку', async () => {
    const seen: (string | null)[] = []
    const { f } = start({ canEdit: (c) => { seen.push(c?.id ?? null); return c?.assignedDeclarantId == null } })
    await settle()
    expect(seen).toContain('case1')
    expect(f.editable.value).toBe(true)
  })

  it('ДТ разделена (заменена ЕТТ и ВТО) — правка закрыта', async () => {
    server = caseDto({ declarations: [fullDto({ isSplitReplaced: true, updatedAtUtc: nextStamp() })] })
    const { f } = start()
    await settle()
    expect(f.editable.value).toBe(false)
    expect(await f.save()).toBe(false)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('saveForAction: в просмотре — сразу «можно» без PUT (печать), при праве — сохранить', async () => {
    const { f, canEdit } = start()
    await settle()
    expect(await f.saveForAction()).toBe(true)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    canEdit.value = false
    await nextTick()
    expect(await f.saveForAction()).toBe(true)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
  })
})

describe('useDtForm — уход со страницы и размонтирование', () => {
  it('beforeunload мешает закрыть вкладку только с несохранённым при праве править', async () => {
    const { f, canEdit } = start()
    await settle()
    const ev = () => {
      const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(ev()).toBe(false)
    await edit(() => { f.form.declarationNumber = 'X' })
    expect(ev()).toBe(true)
    canEdit.value = false
    await nextTick()
    expect(ev()).toBe(false)
  })

  it('уход внутри приложения: без правок — сразу; с правками — подтверждение', async () => {
    const { f } = start()
    await settle()
    expect(await f.confirmLeave()).toBe(true)
    expect(confirmFn).not.toHaveBeenCalled()
    await edit(() => { f.form.declarationNumber = 'X' })
    confirmFn.mockResolvedValueOnce(false)
    expect(await f.confirmLeave()).toBe(false)
    expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ danger: true }))
  })

  it('размонтирование гасит отложенный автосейв и автоповтор, снимает beforeunload', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { f } = start()
    await settle()
    await edit(() => { f.form.declarationNumber = 'X' })
    scope.stop()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })
})
