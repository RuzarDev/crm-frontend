import { onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import { tnvedEecApi, type EecSyncStatus } from '@/api/tnvedEec'
import { runActive } from './eec'

/** Пауза между опросами статуса идущего прогона. */
export const POLL_MS = 3000

/**
 * Состояние синка ЕЭК: последний прогон, запуск «Обновить из ЕЭК» и опрос статуса, пока прогон идёт.
 * Сервер отвечает на запуск сразу (202), прогон идёт в фоне — опрашиваем GET tnved/eec/sync/status раз в 3 с.
 * onFinished — прогон, который шёл при нас, закончился (обновить список редакций).
 */
export function useEecSync(onFinished: (s: EecSyncStatus) => void) {
  const status = shallowRef<EecSyncStatus | null>(null)
  const loading = ref(true)
  const error = ref(false)
  const starting = ref(false)
  /** Уже шёл, когда нажали «Обновить из ЕЭК» (сервер не начал второй). */
  const alreadyRunning = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0
  let watching = false
  /** Какой прогон опрашивать: из ответа на запуск или идущий при открытии; null — последний. */
  let watchRunId: number | null = null
  let disposed = false

  const schedule = () => {
    clearTimeout(timer)
    if (disposed) return
    timer = setTimeout(() => { void poll() }, POLL_MS)
  }
  const accept = (s: EecSyncStatus) => {
    status.value = s
    if (runActive(s)) {
      watching = true
      if (watchRunId == null && s.run?.status === 'running') watchRunId = s.run.id
      schedule()
    } else if (watching) {
      watching = false
      watchRunId = null
      alreadyRunning.value = false
      onFinished(s)
    }
  }
  const poll = async () => {
    const my = ++seq
    try {
      const { data } = await tnvedEecApi.syncStatus(watchRunId)
      if (my !== seq || disposed) return
      error.value = false
      accept(data)
    } catch {
      if (my !== seq || disposed) return
      // Сбой опроса не останавливает наблюдение: пробуем снова.
      if (watching) schedule()
      else error.value = true
    }
  }
  const load = async () => {
    const my = ++seq
    loading.value = true
    error.value = false
    try {
      const { data } = await tnvedEecApi.syncStatus()
      if (my !== seq || disposed) return
      accept(data)
    } catch {
      if (my === seq) error.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  const start = async () => {
    if (starting.value || runActive(status.value)) return
    starting.value = true
    try {
      const { data } = await tnvedEecApi.startSync()
      alreadyRunning.value = !data.started
      watching = true
      watchRunId = data.runId ?? null
      seq += 1
      // Прогона может ещё не быть в базе (runId null первые мгновения): опрос без runId — последний прогон,
      // а isRunning (флаг процесса) держит наблюдение, пока прежний завершённый ещё считается последним.
      status.value = { isRunning: true, run: data.run ?? null }
      if (data.run && data.run.status !== 'running') accept({ isRunning: data.isRunning, run: data.run })
      else schedule()
    } catch { /* текст ошибки показал общий перехватчик */ } finally {
      starting.value = false
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
  })

  return reactive({ status, loading, error, starting, alreadyRunning, load, start })
}
