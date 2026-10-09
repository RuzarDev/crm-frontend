// Подсказка ставок по товару ДТ (волна 6б): ставка по стране (ЗСТ), виды акциза, антидемпинг и ставки пошлины из КЕДЕН
// по коду ТН ВЭД и стране происхождения — НА ДАТУ гр. А (расчёт платежей идёт на неё же; прежняя подсказка спрашивала
// «на сегодня» — ошибка T1).
// - Кэш на сессию по (код, страна, дата): один и тот же код у многих товаров и повторное открытие товара — без запроса;
//   запросы идут только для открытого товара (редактор монтирует один товар), а не на каждый товар списка (T2).
// - Тихо (silent): сбой не даёт тоста перехватчика (раньше — по тосту на товар), подсказка показывает его сама с «Повторить».
// - Правка кода/страны — с задержкой (промежуточные коды при наборе не запрашиваются); открытие товара — сразу.
import { onBeforeUnmount, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { tnvedApi, type TariffOptionsDto } from '@/api/tnved'

export interface TariffSource {
  code: string | null | undefined
  country: string | null | undefined
  /** Дата гр. А, 'YYYY-MM-DD'; пусто — сервер берёт сегодня. */
  onDate: string | null | undefined
}

export interface TariffOptionsState {
  data: ShallowRef<TariffOptionsDto | null>
  loading: Ref<boolean>
  failed: Ref<boolean>
  /** Повторить после сбоя. */
  retry: () => void
}

const norm = (s: string | null | undefined) => (s ?? '').trim()
const keyOf = (code: string, country: string, date: string) => `${code}|${country}|${date}`

// Идущие и завершённые запросы: идущий делят все, кто спросил тот же ключ; ответ — в resolved (синхронно при открытии).
const pending = new Map<string, Promise<TariffOptionsDto>>()
const resolved = new Map<string, TariffOptionsDto>()

/** Ставки по (код, страна, дата) из кэша сессии или одним запросом. Сбой — отклонённое обещание, в кэше не остаётся. */
export function fetchTariffOptions(code: string, country: string, onDate: string): Promise<TariffOptionsDto> {
  const k = keyOf(code, country, onDate)
  const done = resolved.get(k)
  if (done) return Promise.resolve(done)
  let run = pending.get(k)
  if (!run) {
    run = tnvedApi.tariffOptions(code, country || null, onDate || null, { silent: true })
      .then((res) => {
        resolved.set(k, res.data)
        return res.data
      })
      .finally(() => pending.delete(k))
    pending.set(k, run)
  }
  return run
}

/** Для тестов: сбросить кэш сессии. */
export function clearTariffCache(): void {
  pending.clear()
  resolved.clear()
}

export function useTariffOptions(source: () => TariffSource, opts: { debounceMs?: number } = {}): TariffOptionsState {
  const debounceMs = opts.debounceMs ?? 300
  const data = shallowRef<TariffOptionsDto | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  const args = () => {
    const s = source()
    return [norm(s.code), norm(s.country), norm(s.onDate)] as const
  }

  const load = (code: string, country: string, date: string) => {
    const my = ++seq
    loading.value = true
    failed.value = false
    fetchTariffOptions(code, country, date).then(
      (d) => { if (my === seq) data.value = d },
      () => {
        if (my !== seq) return
        data.value = null
        failed.value = true
      },
    ).finally(() => { if (my === seq) loading.value = false })
  }

  const run = ([code, country, date]: readonly [string, string, string], immediate: boolean) => {
    clearTimeout(timer)
    seq++
    if (!/^\d{10}$/.test(code)) {
      data.value = null
      loading.value = false
      failed.value = false
      return
    }
    const cached = resolved.get(keyOf(code, country, date))
    if (cached) {
      data.value = cached
      loading.value = false
      failed.value = false
      return
    }
    if (immediate || debounceMs <= 0) load(code, country, date)
    else {
      loading.value = true
      timer = setTimeout(() => load(code, country, date), debounceMs)
    }
  }

  // Ключ строкой: тот же код/страна/дата после посторонней правки товара — без повторного запуска.
  let first = true
  watch(() => args().join('|'), () => {
    run(args(), first)
    first = false
  }, { immediate: true })

  onBeforeUnmount(() => {
    clearTimeout(timer)
    seq++
  })

  return { data, loading, failed, retry: () => run(args(), true) }
}
