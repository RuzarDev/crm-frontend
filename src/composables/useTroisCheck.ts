import { inject, onBeforeUnmount, provide, reactive, watch, type InjectionKey } from 'vue'
import { troisApi, type TroisCheckItem } from '@/api/trois'

// Проверка торговых марок товаров ДТ по ТРОИС: один пакетный запрос на все новые названия, с задержкой
// после ввода. Только подсказка — ничего не блокирует и признак ОИС сама не ставит.
export interface TroisCheck {
  /** Результат по названию (как введено, без пробелов по краям); undefined — ещё не проверено/не проверяется. */
  resultFor: (name: string | null | undefined) => TroisCheckItem | undefined
}

const KEY: InjectionKey<TroisCheck> = Symbol('troisCheck')
/** Названий в одном запросе /ref/trois/check. */
const BATCH = 100

export function useTroisCheckProvider(names: () => Array<string | null | undefined>, delayMs = 700): TroisCheck {
  const cache = reactive<Record<string, TroisCheckItem>>({})
  const asked = new Set<string>()
  let timer: number | undefined
  let disposed = false

  const request = async (list: string[]) => {
    try {
      const items = await troisApi.check(list)
      if (disposed) return
      for (const it of items) cache[it.name] = it
    } catch {
      // Не удалось — забываем, что спрашивали: попробуем при следующем изменении.
      for (const n of list) asked.delete(n)
    }
  }

  watch(
    () => [...new Set(names().map((n) => (n ?? '').trim()).filter((n) => n.length >= 2))].sort().join('\u0001'),
    (key) => {
      window.clearTimeout(timer)
      const fresh = key.split('\u0001').filter((n) => n && !asked.has(n))
      if (!fresh.length) return
      timer = window.setTimeout(() => {
        fresh.forEach((n) => asked.add(n))
        // Сервер принимает до 100 названий за раз: остальные — следующими пачками по очереди (раньше марки сверх
        // 100 помечались «спрошенными», но не отправлялись — T3).
        void (async () => {
          for (let i = 0; i < fresh.length && !disposed; i += BATCH) await request(fresh.slice(i, i + BATCH))
        })()
      }, delayMs)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => { disposed = true; window.clearTimeout(timer) })

  const api: TroisCheck = { resultFor: (name) => cache[(name ?? '').trim()] }
  provide(KEY, api)
  return api
}

/** Внутри ДТ Импорта 40 — результат проверки; в других экранах (транзит) провайдера нет, подсказки не показываем. */
export const useTroisCheck = (): TroisCheck | null => inject(KEY, null)
