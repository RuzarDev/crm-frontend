import { describe, expect, it } from 'vitest'
import { afterLoginPath, loginPath, safeInternalPath } from '@/router/safePath'
import { backFrom } from '@/router/backFrom'

// Адреса возврата (30.10.2026, аудит C-5, S-6/C-15): только свой путь, внешний адрес не принимается.
describe('safeInternalPath', () => {
  it('свой путь — как есть (с запросом и якорем)', () => {
    expect(safeInternalPath('/import-40/c1')).toBe('/import-40/c1')
    expect(safeInternalPath('/billing?q=0214%2F2026#x')).toBe('/billing?q=0214%2F2026#x')
    expect(safeInternalPath(['/reestr/r1', '/x'])).toBe('/reestr/r1')
  })
  it('чужой хост, схема, «//», «\\», управляющие символы, не строка — null', () => {
    for (const bad of [
      'https://evil.example/', 'javascript:alert(1)', '//evil.example', '/\\evil.example', '/x\\y', '/a\nb', 'import-40', '', '   ', null, undefined, 42,
    ]) expect(safeInternalPath(bad), String(bad)).toBeNull()
  })
})

describe('afterLoginPath / loginPath', () => {
  it('после входа — свой непубличный путь, иначе «/»', () => {
    expect(afterLoginPath('/import-40/c1')).toBe('/import-40/c1')
    expect(afterLoginPath('/login')).toBe('/')
    expect(afterLoginPath('/login?next=/x')).toBe('/')
    expect(afterLoginPath('/register')).toBe('/')
    expect(afterLoginPath('/invite/t1')).toBe('/')
    expect(afterLoginPath('https://evil.example')).toBe('/')
    expect(afterLoginPath(undefined)).toBe('/')
  })
  it('адрес входа: с возвратом для рабочих страниц, без — для Главной и публичных', () => {
    expect(loginPath('/import-40/c1?tab=docs')).toBe('/login?next=%2Fimport-40%2Fc1%3Ftab%3Ddocs')
    expect(loginPath('/')).toBe('/login')
    expect(loginPath('/home')).toBe('/login')
    expect(loginPath('/login')).toBe('/login')
    expect(loginPath('/reset-password/abc')).toBe('/login')
    expect(loginPath(null)).toBe('/login')
  })
})

describe('backFrom', () => {
  const t = (k: string) => k
  it('заявка — «К заявке» (клиенту «К поставке»), ДТ — «К декларации», прочее — «Назад»', () => {
    expect(backFrom('/import-40/c1', false, t)).toEqual({ to: '/import-40/c1', label: 'common.backToCase' })
    expect(backFrom('/import-40/c1', true, t)).toEqual({ to: '/import-40/c1', label: 'common.backToShipment' })
    expect(backFrom('/import-40/c1/dt/d1', false, t)).toEqual({ to: '/import-40/c1/dt/d1', label: 'common.backToDt' })
    expect(backFrom('/import-40/company', false, t)).toEqual({ to: '/import-40/company', label: 'common.back' })
  })
  it('внешний адрес или пусто — null (экран ведёт по умолчанию)', () => {
    expect(backFrom('https://evil.example', false, t)).toBeNull()
    expect(backFrom(undefined, false, t)).toBeNull()
  })
})
