import { describe, expect, it } from 'vitest'
import { serverErrorText } from '../serverError'

const err = (status: number | undefined, data?: unknown) => Object.assign(new Error('x'), status ? { response: { status, data } } : {})
const STACK = 'System.InvalidOperationException: Sequence contains no elements\n   at System.Linq.ThrowHelper.ThrowNoElementsException()\n   at CRM.API.Features.DocumentPackages.Endpoints.Update()'

describe('serverErrorText', () => {
  it('без friendly — прежнее поведение: текст сервера, HTTP n, fallback', () => {
    expect(serverErrorText(err(400, { error: 'Номер контейнера обязателен' }), 'нет связи')).toBe('Номер контейнера обязателен')
    expect(serverErrorText(err(400, 'plain text'), 'нет связи')).toBe('plain text')
    expect(serverErrorText(err(400, { errors: ['a', 'b'] }), 'нет связи')).toBe('a; b')
    expect(serverErrorText(err(500, STACK), 'нет связи')).toBe(STACK)
    expect(serverErrorText(err(502), 'нет связи')).toBe('HTTP 502')
    expect(serverErrorText(err(undefined), 'нет связи')).toBe('нет связи')
  })

  it('с friendly: 5xx, трассировка стека или слишком длинный текст — понятный текст вместо сырого', () => {
    const o = { friendly: 'Сервер не смог сохранить партию.' }
    expect(serverErrorText(err(500, STACK), 'нет связи', o)).toBe(o.friendly)
    expect(serverErrorText(err(500, { error: 'NullReferenceException' }), 'нет связи', o)).toBe(o.friendly)
    expect(serverErrorText(err(503), 'нет связи', o)).toBe(o.friendly)
    expect(serverErrorText(err(400, STACK), 'нет связи', o)).toBe(o.friendly)
    expect(serverErrorText(err(400, { detail: 'x'.repeat(301) }), 'нет связи', o)).toBe(o.friendly)
    // Короткий понятный ответ 4xx и отсутствие связи — как раньше.
    expect(serverErrorText(err(400, { error: 'Клиент не найден' }), 'нет связи', o)).toBe('Клиент не найден')
    expect(serverErrorText(err(undefined), 'нет связи', o)).toBe('нет связи')
  })
})
