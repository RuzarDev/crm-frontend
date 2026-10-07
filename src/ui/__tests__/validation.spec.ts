import { describe, expect, it } from 'vitest'
import { isEmptyValue, rulesForTrigger, validateValue, type ZRule, type ZRuleKey } from '../validation'

// Сообщение по умолчанию — ключ и число, чтобы проверять, какое правило сработало.
const fb = (key: ZRuleKey, n?: number) => (n === undefined ? key : `${key}:${n}`)
const check = (value: unknown, rules: ZRule[]) => validateValue(value, rules, fb)

describe('isEmptyValue', () => {
  it.each([
    [undefined, false, true], [null, false, true], ['', false, true], [[], false, true],
    ['  ', false, false], ['  ', true, true], ['\t\n', true, true],
    [0, false, false], [false, false, false], ['0', false, false], [[0], false, false], [' x ', true, false],
  ])('%j (whitespace=%j) → %j', (value, ws, expected) => {
    expect(isEmptyValue(value, ws)).toBe(expected)
  })
})

describe('validateValue', () => {
  it.each<[unknown, ZRule[], string | null]>([
    // required
    [undefined, [{ required: true }], 'required'],
    [null, [{ required: true }], 'required'],
    ['', [{ required: true }], 'required'],
    [[], [{ required: true }], 'required'],
    ['   ', [{ required: true }], null],
    ['   ', [{ required: true, whitespace: true }], 'required'],
    [0, [{ required: true }], null],
    [false, [{ required: true }], null],
    ['x', [{ required: true }], null],
    // пустое не проверяет остальное
    ['', [{ min: 3 }], null],
    [null, [{ pattern: /^\d+$/ }], null],
    [undefined, [{ type: 'email' }], null],
    // min/max/len: длина строки (по символам, не UTF-16), число элементов, значение числа
    ['ab', [{ min: 3 }], 'min:3'],
    ['abc', [{ min: 3 }], null],
    ['Ақжол', [{ max: 5 }], null],
    ['😀😀', [{ max: 2 }], null],
    ['abcdef', [{ max: 5 }], 'max:5'],
    [[1], [{ min: 2 }], 'min:2'],
    [[1, 2, 3], [{ max: 2 }], 'max:2'],
    [5, [{ min: 10 }], 'min:10'],
    [15, [{ max: 10 }], 'max:10'],
    [10, [{ min: 10, max: 10 }], null],
    ['12345678901', [{ len: 12 }], 'len:12'],
    ['123456789012', [{ len: 12 }], null],
    // pattern (и /g не ломается от lastIndex)
    ['12345', [{ pattern: /^\d{12}$/ }], 'pattern'],
    ['123456789012', [{ pattern: /^\d{12}$/ }], null],
    // email
    ['a@b', [{ type: 'email' }], 'email'],
    ['user@mail.kz', [{ type: 'email' }], null],
    [' user@mail.kz ', [{ type: 'email' }], null],
    ['user @mail.kz', [{ type: 'email' }], 'email'],
    // number / integer — числа и строки, как их вводят в РК
    ['abc', [{ type: 'number' }], 'number'],
    ['1 234,5', [{ type: 'number' }], null],
    [12.5, [{ type: 'number' }], null],
    [Number.NaN, [{ type: 'number' }], 'number'],
    ['12.5', [{ type: 'integer' }], 'integer'],
    ['abc', [{ type: 'integer' }], 'integer'],
    [12, [{ type: 'integer' }], null],
    ['7', [{ type: 'number', min: 10 }], 'min:10'],
  ])('%j %j → %j', async (value, rules, expected) => {
    expect(await check(value, rules)).toBe(expected)
  })

  it('pattern с флагом g проверяется одинаково при повторе', async () => {
    const rule: ZRule = { pattern: /^\d+$/g }
    expect(await check('123', [rule])).toBeNull()
    expect(await check('123', [rule])).toBeNull()
  })

  it('своё сообщение правила — строка или функция (как в LoginView)', async () => {
    expect(await check('', [{ required: true, message: 'Введите логин' }])).toBe('Введите логин')
    expect(await check('', [{ required: true, message: () => 'Логин!' }])).toBe('Логин!')
    expect(await check('ab', [{ min: 8, message: 'Минимум 8 символов' }])).toBe('Минимум 8 символов')
  })

  it('порядок: первое нарушенное правило', async () => {
    const rules: ZRule[] = [{ required: true, message: 'пусто' }, { pattern: /^\d+$/, message: 'цифры' }, { len: 12, message: '12' }]
    expect(await check('', rules)).toBe('пусто')
    expect(await check('12a', rules)).toBe('цифры')
    expect(await check('123', rules)).toBe('12')
    expect(await check('123456789012', rules)).toBeNull()
  })

  it('validator: строка, throw, reject(Error), reject(строка), ок', async () => {
    expect(await check('x', [{ validator: () => 'Не тот БИН' }])).toBe('Не тот БИН')
    expect(await check('x', [{ validator: () => { throw new Error('Ошибка') } }])).toBe('Ошибка')
    expect(await check('x', [{ validator: () => Promise.reject(new Error('Сервер')) }])).toBe('Сервер')
    expect(await check('x', [{ validator: () => Promise.reject('Строкой') }])).toBe('Строкой')
    expect(await check('x', [{ validator: async () => undefined }])).toBeNull()
    expect(await check('x', [{ validator: () => '' }])).toBeNull()
    // без текста — сообщение по умолчанию; message правила важнее текста validator
    expect(await check('x', [{ validator: () => Promise.reject() }])).toBe('pattern')
    expect(await check('x', [{ validator: () => 'свой', message: 'правила' }])).toBe('правила')
  })

  it('validator получает правило и значение; зовётся и для пустого (условная обязательность)', async () => {
    const seen: unknown[] = []
    const rule: ZRule = { validator: (r, v) => { seen.push(r, v); return v ? undefined : 'Нужно при импорте' } }
    expect(await check('', [rule])).toBe('Нужно при импорте')
    expect(seen).toEqual([rule, ''])
  })

  it('rulesForTrigger: без trigger — на оба события; иначе только своё', () => {
    const any: ZRule = { required: true }
    const blur: ZRule = { min: 2, trigger: 'blur' }
    const change: ZRule = { max: 5, trigger: ['change'] }
    const both: ZRule = { len: 3, trigger: ['change', 'blur'] }
    expect(rulesForTrigger([any, blur, change, both], 'blur')).toEqual([any, blur, both])
    expect(rulesForTrigger([any, blur, change, both], 'change')).toEqual([any, change, both])
  })
})
