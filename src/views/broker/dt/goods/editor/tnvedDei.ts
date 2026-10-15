// ДЕИ (гр. 41) по коду ТН ВЭД — тем же правилом, что сервер при сохранении ДТ (TnvedAdditionalUnits): ставки ТН ВЭД,
// для кодов из КЕДЕН — дерево КЕДЕН. Ответ по коду кэшируется на сессию (справочник общий), идущий запрос делят, тихо.
// Значение: единица; null — у кода нет ДЕИ; нет в кэше (undefined) — ещё не известно, код не найден или сбой сети.
// Код не найден (404) запоминается на сессию — открытие товара и уход из поля не повторяют запрос; сбой сети — нет.
import { reactive } from 'vue'
import { tnvedApi } from '@/api/tnved'
import { okeiCode } from './okei'

export interface TnvedDei {
  code: string
  name: string | null
  shortName: string | null
}

const known = reactive<Record<string, TnvedDei | null>>({})
const pending = new Map<string, Promise<TnvedDei | null | undefined>>()
const notFound = new Set<string>()

const norm = (code: string | null | undefined) => (code ?? '').replace(/\s+/g, '')
const isLeafCode = (c: string) => /^\d{10}$/.test(c)

/** ДЕИ по коду из кэша: единица, null — нет ДЕИ, undefined — не известно. */
export function deiOf(tnvedCode: string | null | undefined): TnvedDei | null | undefined {
  const c = norm(tnvedCode)
  return c in known ? known[c] : undefined
}

/** Узнать ДЕИ по коду (10 знаков); ответ — как у deiOf. */
export function loadDei(tnvedCode: string | null | undefined): Promise<TnvedDei | null | undefined> {
  const c = norm(tnvedCode)
  if (!isLeafCode(c)) return Promise.resolve(undefined)
  if (c in known) return Promise.resolve(known[c])
  if (notFound.has(c)) return Promise.resolve(undefined)
  const running = pending.get(c)
  if (running) return running
  const run = tnvedApi.rates(c, { silent: true })
    .then((res) => {
      const d = res.data
      const unit = okeiCode(d.unitCode)
      known[c] = unit ? { code: unit, name: d.unitName?.trim() || null, shortName: d.unitShortName?.trim() || null } : null
      return known[c]
    })
    .catch((e: { response?: { status?: number } }): undefined => {
      // Код не найден (404) или сбой — «не известно»: поле показывает сохранённую единицу.
      if (e?.response?.status === 404) notFound.add(c)
      else console.error('Failed to look up TNVED unit', e)
      return undefined
    })
    .finally(() => pending.delete(c))
  pending.set(c, run)
  return run
}

/** Для тестов. */
export function resetTnvedDeiCache(): void {
  for (const c of Object.keys(known)) delete known[c]
  pending.clear()
  notFound.clear()
}
