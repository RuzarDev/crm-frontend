// Проверка кодов ТН ВЭД товаров ДТ (волна 6б): есть ли код в справочнике (10-значный лист).
// - Результат — по коду, а не флагом в товаре (флаг уходил бы в тело PUT).
// - Один запрос на код за жизнь раздела: идущий запрос делят, ответ кэшируется. Тихо (без тоста перехватчика).
// - Нет в справочнике: 404 или не лист. Сбой сети/сервера — «не известно»: код не помечается, спросим снова позже
//   (иначе при сбое весь список покраснел бы).
// - Раздел «Товары» проверяет РАЗЛИЧНЫЕ коды всех товаров сразу (не только открытого): ошибочный код из КП или
//   Excel виден в списке («нет в справочнике», фильтр «С ошибками»), а не только при расчёте платежей. Не больше
//   4 запросов одновременно; правка кода — после паузы (набор не порождает запрос на каждую цифру).
import { inject, onBeforeUnmount, provide, reactive, watch, type InjectionKey } from 'vue'
import { tnvedApi } from '@/api/tnved'

export interface DtTnvedCheck {
  /** Код проверен, и его нет в справочнике (или это не 10-значный лист). */
  isInvalid: (code: string | null | undefined) => boolean
  /** Ответ по коду уже есть. */
  isKnown: (code: string | null | undefined) => boolean
  validate: (code: string | null | undefined) => Promise<void>
  /** Код выбран в справочнике или найден «Найти» — верный. */
  markValid: (code: string) => void
}

const norm = (code: string | null | undefined) => (code ?? '').trim()
const statusOf = (e: unknown) => (e as { response?: { status?: number } } | null)?.response?.status

export function createDtTnvedCheck(): DtTnvedCheck {
  // Реактивны только коды «нет в справочнике»: от них зависит статус строк. Верные коды — в обычном множестве, иначе
  // каждый ответ (200 кодов — 200 ответов) перерисовывал бы всю таблицу, хотя статус не меняется.
  const bad = reactive<Record<string, true>>({})
  const ok = new Set<string>()
  const pending = new Map<string, Promise<void>>()
  const known = (c: string) => ok.has(c) || c in bad
  const setValid = (c: string) => {
    ok.add(c)
    if (c in bad) delete bad[c]
  }
  return {
    isInvalid: (code) => {
      const c = norm(code)
      return c !== '' && !!bad[c]
    },
    isKnown: (code) => known(norm(code)),
    validate: (code) => {
      const c = norm(code)
      if (!c || known(c)) return Promise.resolve()
      const running = pending.get(c)
      if (running) return running
      const run = tnvedApi.node(c, { silent: true })
        .then(
          (res) => { if (res.data.is10) setValid(c); else bad[c] = true },
          (e) => { if (statusOf(e) === 404) bad[c] = true },
        )
        .finally(() => pending.delete(c))
      pending.set(c, run)
      return run
    },
    markValid: (code) => {
      const c = norm(code)
      if (c) setValid(c)
    },
  }
}

const KEY: InjectionKey<DtTnvedCheck> = Symbol('dt-tnved-check')

/** Раздел «Товары» — один кэш на список и редактор. */
export function provideDtTnvedCheck(): DtTnvedCheck {
  const check = createDtTnvedCheck()
  provide(KEY, check)
  return check
}

/** Кэш раздела; компонент сам по себе (тест) — собственный. */
export function useDtTnvedCheck(): DtTnvedCheck {
  return inject(KEY, null) ?? createDtTnvedCheck()
}

/**
 * Проверять различные коды товаров: сразу при монтировании, дальше — новые коды после паузы debounceMs.
 * Уже известные коды не спрашиваются; одновременно — не больше concurrency запросов.
 */
export function useGoodsCodesValidation(
  check: DtTnvedCheck,
  codes: () => readonly (string | null | undefined)[],
  opts: { debounceMs?: number; concurrency?: number } = {},
): void {
  const debounceMs = opts.debounceMs ?? 600
  const concurrency = opts.concurrency ?? 4
  const queue: string[] = []
  const queued = new Set<string>()
  let active = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const pump = () => {
    while (!disposed && active < concurrency && queue.length) {
      const c = queue.shift()!
      queued.delete(c)
      if (check.isKnown(c)) continue
      active++
      void check.validate(c).finally(() => {
        active--
        pump()
      })
    }
  }
  const enqueue = (list: string[]) => {
    for (const c of list) {
      if (check.isKnown(c) || queued.has(c)) continue
      queued.add(c)
      queue.push(c)
    }
    pump()
  }

  let first = true
  watch(
    () => [...new Set(codes().map(norm).filter(Boolean))].sort().join('|'),
    (key) => {
      clearTimeout(timer)
      const list = key ? key.split('|') : []
      if (first || debounceMs <= 0) enqueue(list)
      else timer = setTimeout(() => enqueue(list), debounceMs)
      first = false
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
  })
}
