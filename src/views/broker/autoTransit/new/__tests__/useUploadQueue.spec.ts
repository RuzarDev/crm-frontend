import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { card, httpError } from '../../truck/__tests__/truckFixtures'

const api = vi.hoisted(() => ({ uploadFile: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))

import { useUploadQueue, type UploadQueue, type UploadQueueOptions } from '../useUploadQueue'

let w: VueWrapper | undefined
let q: UploadQueue
const truckId = ref<string | null>('t1')
const mountQueue = (o: UploadQueueOptions = {}) => {
  w = mount(defineComponent({
    setup() {
      q = useUploadQueue(() => truckId.value, o)
      return () => h('div')
    },
  }))
}
const files = (...names: string[]) => names.map((n) => new File(['x'], n))
const states = () => q.items.value.map((i) => i.state)
/** Обещание, которое тест разрешает сам. */
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => {
  w?.unmount()
  w = undefined
  truckId.value = 't1'
  vi.clearAllMocks()
})

describe('useUploadQueue', () => {
  it('по одному файлу; второй падает (сеть) — первый и третий done, второй failed; retry переводит его в done', async () => {
    const onCard = vi.fn()
    mountQueue({ onCard })
    const order: string[] = []
    let active = 0
    api.uploadFile.mockImplementation(async (_id: string, f: File) => {
      active++
      expect(active).toBe(1)
      order.push(f.name)
      await Promise.resolve()
      active--
      if (f.name === 'b.jpg') throw new Error('Network Error')
      return card({ id: 't1' })
    })
    q.add(files('a.jpg', 'b.jpg', 'c.pdf'))
    expect(q.pending.value).toBe(3)
    expect(api.uploadFile).not.toHaveBeenCalled()
    const sum = await q.start()
    expect(order).toEqual(['a.jpg', 'b.jpg', 'c.pdf'])
    expect(states()).toEqual(['done', 'failed', 'done'])
    expect(q.items.value[1]!.errorKey).toBe('broker.autoTransit.upload.failed')
    expect(sum).toEqual({ done: 2, failed: ['b.jpg'], stopCode: null, failedNow: 1 })
    expect(onCard).toHaveBeenCalledTimes(2)
    expect(q.failedCount.value).toBe(1)
    expect(q.doneCount.value).toBe(2)
    expect(q.pending.value).toBe(0)

    api.uploadFile.mockResolvedValue(card())
    await q.retry(1)
    expect(states()).toEqual(['done', 'done', 'done'])
    expect(q.items.value[1]!.errorKey).toBeNull()
    expect(api.uploadFile).toHaveBeenCalledTimes(4)
  })

  it('ход загрузки 0–100; 5xx — общий текст; 400 — первый текст сервера', async () => {
    mountQueue()
    api.uploadFile.mockImplementationOnce(async (_id: string, _f: File, _o: unknown, onProgress: (x: number) => void) => {
      onProgress(0.42)
      expect(q.items.value[0]!.progress).toBe(42)
      expect(q.items.value[0]!.state).toBe('uploading')
      return card()
    })
    api.uploadFile.mockRejectedValueOnce(httpError(502, {}))
    api.uploadFile.mockRejectedValueOnce(httpError(400, { errors: { file: ['Файл повреждён'] } }))
    q.add(files('a.jpg', 'b.jpg', 'c.png'))
    await q.start()
    expect(q.items.value[0]).toMatchObject({ state: 'done', progress: 100 })
    expect(q.items.value[1]).toMatchObject({ state: 'failed', errorKey: 'broker.autoTransit.upload.failed', errorText: null })
    expect(q.items.value[2]).toMatchObject({ state: 'failed', errorKey: null, errorText: 'Файл повреждён' })
  })

  it('409 archived — очередь встаёт, остальные failed с тем же кодом', async () => {
    const onIdle = vi.fn()
    mountQueue({ onIdle })
    api.uploadFile.mockResolvedValueOnce(card())
    api.uploadFile.mockRejectedValueOnce(httpError(409, { code: 'archived' }))
    q.add(files('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'))
    const sum = await q.start()
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(states()).toEqual(['done', 'failed', 'failed', 'failed'])
    expect(q.items.value.slice(1).every((i) => i.errorKey === 'broker.autoTransit.error.archived')).toBe(true)
    expect(sum.stopCode).toBe('archived')
    expect(onIdle).toHaveBeenCalledWith({ done: 1, failed: ['b.jpg', 'c.jpg', 'd.jpg'], stopCode: 'archived', failedNow: 3 })
  })

  it('при выборе отклоняет файлы больше лимита и недопустимого типа — в очередь они не попадают', () => {
    mountQueue()
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 })
    const rejected = q.add([big, ...files('virus.exe', 'ok.HEIC', 'list.xlsx')])
    expect(rejected).toEqual([{ name: 'big.pdf', reason: 'tooBig' }, { name: 'virus.exe', reason: 'badType' }])
    expect(q.items.value.map((i) => i.name)).toEqual(['ok.HEIC', 'list.xlsx'])
  })

  it('start — ничего, пока идёт проход и пока нет машины; убрать можно только не начатый', async () => {
    truckId.value = null
    mountQueue()
    q.add(files('a.jpg', 'b.jpg', 'c.jpg'))
    await q.start()
    expect(api.uploadFile).not.toHaveBeenCalled()

    truckId.value = 't9'
    const first = deferred<ReturnType<typeof card>>()
    api.uploadFile.mockReturnValueOnce(first.promise).mockResolvedValue(card())
    const run = q.start()
    expect(q.running.value).toBe(true)
    void q.start()
    q.remove(0) // загружается — не убирается
    q.remove(2)
    expect(q.items.value.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg'])
    first.resolve(card())
    await run
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(api.uploadFile.mock.calls[0]![0]).toBe('t9')
    expect(q.running.value).toBe(false)
  })

  it('retryAll — все упавшие снова в очередь', async () => {
    mountQueue()
    api.uploadFile.mockRejectedValue(new Error('Network Error'))
    q.add(files('a.jpg', 'b.jpg'))
    await q.start()
    expect(q.failedCount.value).toBe(2)
    api.uploadFile.mockResolvedValue(card())
    await q.retryAll()
    expect(states()).toEqual(['done', 'done'])
  })

  it('после размонтирования новые загрузки не начинаются, состояние не трогается', async () => {
    const onCard = vi.fn()
    const onIdle = vi.fn()
    mountQueue({ onCard, onIdle })
    const first = deferred<ReturnType<typeof card>>()
    api.uploadFile.mockReturnValueOnce(first.promise)
    q.add(files('a.jpg', 'b.jpg'))
    const run = q.start()
    await flushPromises()
    w!.unmount()
    w = undefined
    first.resolve(card())
    await run
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(states()).toEqual(['uploading', 'queued'])
    expect(onCard).not.toHaveBeenCalled()
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('без общего тоста: uploadFile зовётся с { silent: true }', async () => {
    mountQueue()
    api.uploadFile.mockResolvedValue(card())
    q.add(files('a.jpg'))
    await q.start()
    expect(api.uploadFile.mock.calls[0]![4]).toEqual({ silent: true })
  })

  it('после 409 archived упавшие не повторяются', async () => {
    mountQueue()
    api.uploadFile.mockRejectedValueOnce(httpError(409, { code: 'archived' }))
    q.add(files('a.jpg', 'b.jpg'))
    await q.start()
    expect(q.items.value.every((i) => !i.retryable)).toBe(true)
    await q.retryAll()
    await q.retry(0)
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(states()).toEqual(['failed', 'failed'])
  })

  it('сменилась машина во время загрузки — файлы новой машины уходят следующим проходом, а не висят в очереди', async () => {
    mountQueue()
    const first = deferred<ReturnType<typeof card>>()
    api.uploadFile.mockReturnValueOnce(first.promise).mockResolvedValue(card({ id: 't2' }))
    q.add(files('old.jpg'))
    const run1 = q.start()
    await flushPromises()
    truckId.value = 't2'
    q.add(files('new.jpg'))
    const run2 = q.start()
    expect(run2).not.toBe(run1)
    first.resolve(card())
    await run2
    expect(api.uploadFile.mock.calls.map((c) => [c[0], (c[1] as File).name])).toEqual([['t1', 'old.jpg'], ['t2', 'new.jpg']])
    expect(states()).toEqual(['done', 'done'])
    expect(q.running.value).toBe(false)
  })
})

