// Проверка кодов ТН ВЭД товаров ДТ (волна 6б): есть ли код в справочнике (10-значный лист).
// - Результат — по коду, а не флагом в товаре (флаг уходил бы в тело PUT).
// - Кэш — на сессию (модуль), а не на жизнь раздела: повторный вход в «Товары» (или другая ДТ с теми же кодами) не
//   спрашивает уже проверенные коды. Идущий запрос делят. Тихо (без тоста перехватчика).
// - Нет в справочнике: 404 или не лист — тоже ответ, хранится на сессию. Сбой сети/сервера — «не известно»: код не
//   помечается (иначе при сбое весь список покраснел бы) и за один вход в раздел больше не спрашивается — спросим
//   снова при следующем входе (новый createDtTnvedCheck).
// - Раздел «Товары» проверяет РАЗЛИЧНЫЕ коды всех товаров сразу (не только открытого): ошибочный код из КП или
//   Excel виден в списке («нет в справочнике», фильтр «С ошибками»), а не только при расчёте платежей. Не больше
//   4 запросов одновременно; правка кода — после паузы (набор не порождает запрос на каждую цифру).
import { inject, onBeforeUnmount, provide, reactive, watch, type InjectionKey } from 'vue'
import { tnvedApi } from '@/api/tnved'

export interface DtTnvedCheck {
  /** Код проверен, и его нет в справочнике (или это не 10-значный лист). */
  isInvalid: (code: string | null | undefined) => boolean
  /** Ответ по коду уже есть (или за этот вход в раздел запрос уже не удался — повторно не спрашиваем). */
  isKnown: (code: string | null | undefined) => boolean
  validate: (code: string | null | undefined) => Promise<void>
  /** Код выбран в справочнике или найден «Найти» — верный. */
  markValid: (code: string) => void
}

const norm = (code: string | null | undefined) => (code ?? '').trim()
const statusOf = (e: unknown) => (e as { response?: { status?: number } } | null)?.response?.status

type CheckResult = 'ok' | 'bad' | 'failed'

// Кэш сессии. Реактивны только коды «нет в справочнике»: от них зависит статус строк. Верные коды — в обычном
// множестве, иначе каждый ответ (200 кодов — 200 ответов) перерисовывал бы всю таблицу, хотя статус не меняется.
const sessionBad = reactive<Record<string, true>>({})
const sessionOk = new Set<string>()
const sessionPending = new Map<string, Promise<CheckResult>>()
const answered = (c: string) => sessionOk.has(c) || c in sessionBad
const setValid = (c: string) => {
  sessionOk.add(c)
  if (c in sessionBad) delete sessionBad[c]
}
const request = (c: string): Promise<CheckResult> => {
  const running = sessionPending.get(c)
  if (running) return running
  const run = tnvedApi.node(c, { silent: true })
    .then(
      (res): CheckResult => {
        if (res.data.is10) { setValid(c); return 'ok' }
        sessionBad[c] = true
        return 'bad'
      },
      (e): CheckResult => {
        if (statusOf(e) !== 404) return 'failed'
        sessionBad[c] = true
        return 'bad'
      },
    )
    .finally(() => sessionPending.delete(c))
  sessionPending.set(c, run)
  return run
}

/** Сбросить кэш сессии (тесты; смена пользователя не нужна — справочник общий). */
export function resetDtTnvedCheckCache(): void {
  for (const c of Object.keys(sessionBad)) delete sessionBad[c]
  sessionOk.clear()
  sessionPending.clear()
}

/** Проверка на один вход в раздел «Товары»: ответы — из кэша сессии, сбои — повторно не спрашиваются до следующего входа. */
export function createDtTnvedCheck(): DtTnvedCheck {
  const failed = new Set<string>()
  const known = (c: string) => answered(c) || failed.has(c)
  return {
    isInvalid: (code) => {
      const c = norm(code)
      return c !== '' && !!sessionBad[c]
    },
    isKnown: (code) => known(norm(code)),
    validate: async (code) => {
      const c = norm(code)
      if (!c || known(c)) return
      if ((await request(c)) === 'failed') failed.add(c)
    },
    markValid: (code) => {
      const c = norm(code)
      if (c) {
        setValid(c)
        failed.delete(c)
      }
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

/** Проверка раздела (ответы — из кэша сессии); компонент сам по себе (тест) — своя. */
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
