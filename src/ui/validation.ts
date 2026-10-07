import { parseNumber } from './number'

// Правила проверки полей формы — подмножество правил a-form (async-validator), которым пользуются экраны:
// required/min/max/len/pattern/type/whitespace/validator/trigger. Чистые функции без Vue: ZForm/ZField
// только решают, когда звать validateValue, и показывают ответ.

export type ZRuleTrigger = 'change' | 'blur'
/** min/max/len у строки (длина в символах) — свои ключи: «Не меньше 3 символов», у числа и массива — «Не меньше 3». */
export type ZRuleKey = 'required' | 'min' | 'max' | 'len' | 'minChars' | 'maxChars' | 'lenChars' | 'pattern' | 'email' | 'number' | 'integer'

export interface ZRule {
  required?: boolean
  /** Своё сообщение вместо стандартного; функция — для текста, зависящего от языка (как в LoginView). */
  message?: string | (() => string)
  /** Длина строки (в символах) / число элементов массива / значение числа. */
  min?: number
  max?: number
  len?: number
  pattern?: RegExp
  type?: 'email' | 'number' | 'integer'
  /** Строка из одних пробелов — пусто. */
  whitespace?: boolean
  /** Своя проверка: throw/reject(Error | строка) или возврат непустой строки — ошибка. Зовётся и для пустого
   *  значения (условная обязательность: «нужно, если процедура ИМ 40»). */
  validator?: (rule: ZRule, value: unknown) => void | string | Promise<void | string>
  /** Когда проверять до отправки; без trigger — и на change, и на blur. Отправка проверяет все правила. */
  trigger?: ZRuleTrigger | ZRuleTrigger[]
}

export type ZRuleFallback = (key: ZRuleKey, n?: number) => string

/** Пусто: undefined/null/''/[] и массив из одних пустых элементов ([null, null] — пустой диапазон дат); при whitespace — и строка из одних пробелов. 0 и false — не пусто. */
export const isEmptyValue = (value: unknown, whitespace = false): boolean =>
  value === undefined || value === null || value === ''
  || (Array.isArray(value) && value.every((v) => v === undefined || v === null || v === ''))
  || (whitespace && typeof value === 'string' && value.trim() === '')

/** Правила, которые проверяются на этом событии. */
export const rulesForTrigger = (rules: ZRule[], trigger: ZRuleTrigger): ZRule[] =>
  rules.filter((r) => r.trigger === undefined || (Array.isArray(r.trigger) ? r.trigger.includes(trigger) : r.trigger === trigger))

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return parseNumber(value)
  return null
}

// Что сравнивать с min/max/len: число (у числовых правил — и число из строки), длину строки по символам
// (эмодзи и суррогатные пары — один символ, как у async-validator), длину массива.
const measure = (value: unknown, type: ZRule['type']): number | null => {
  if (typeof value === 'number') return value
  if (type === 'number' || type === 'integer') return toNumber(value)
  if (typeof value === 'string') return Array.from(value).length
  if (Array.isArray(value)) return value.length
  return null
}

const errorText = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return ''
}

const checkRule = async (value: unknown, rule: ZRule, fallback: ZRuleFallback): Promise<string | null> => {
  const own = typeof rule.message === 'function' ? rule.message() : rule.message
  const fail = (key: ZRuleKey, n?: number) => own || fallback(key, n)
  const empty = isEmptyValue(value, rule.whitespace)
  if (empty && rule.required) return fail('required')
  if (!empty) {
    if (rule.type === 'email' && !(typeof value === 'string' && EMAIL.test(value.trim()))) return fail('email')
    if (rule.type === 'number' || rule.type === 'integer') {
      const n = toNumber(value)
      if (n === null) return fail(rule.type)
      if (rule.type === 'integer' && !Number.isInteger(n)) return fail('integer')
    }
    const size = measure(value, rule.type)
    if (size !== null) {
      const chars = typeof value === 'string' && rule.type !== 'number' && rule.type !== 'integer'
      if (rule.len !== undefined && size !== rule.len) return fail(chars ? 'lenChars' : 'len', rule.len)
      if (rule.min !== undefined && size < rule.min) return fail(chars ? 'minChars' : 'min', rule.min)
      if (rule.max !== undefined && size > rule.max) return fail(chars ? 'maxChars' : 'max', rule.max)
    }
    if (rule.pattern) {
      rule.pattern.lastIndex = 0 // /g и /y помнят позицию между вызовами
      if (!rule.pattern.test(String(value))) return fail('pattern')
    }
  }
  if (rule.validator) {
    try {
      const res = await rule.validator(rule, value)
      if (typeof res === 'string' && res) return own || res
    } catch (e) {
      return own || errorText(e) || fallback('pattern')
    }
  }
  return null
}

/**
 * Первая ошибка по правилам (по порядку) или null. Непустое значение не проверяет required; пустое
 * не проверяет min/max/len/pattern/type (validator зовётся всегда).
 */
export async function validateValue(value: unknown, rules: ZRule[], fallback: ZRuleFallback): Promise<string | null> {
  for (const rule of rules) {
    const error = await checkRule(value, rule, fallback)
    if (error !== null) return error
  }
  return null
}
