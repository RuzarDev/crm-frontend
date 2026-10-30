import { describe, it, expect } from 'vitest'
import { blockReasonOf, registrationBannerState, shouldRedirectToRegistration } from '@/shell/registrationBanner'

const reg = (o = {}) => ({ isClient: true, loaded: true, complete: false, nextStep: 'contract' as const, doneCount: 1, needNew: null, ...o })

describe('registrationBannerState', () => {
  it('не клиенту, до загрузки, после завершения и на странице компании — нет', () => {
    expect(registrationBannerState(reg({ isClient: false }), '/home')).toBeNull()
    expect(registrationBannerState(reg({ loaded: false }), '/home')).toBeNull()
    expect(registrationBannerState(reg({ complete: true }), '/home')).toBeNull()
    expect(registrationBannerState(reg(), '/import-40/company')).toBeNull()
    expect(registrationBannerState(reg(), '/import-40/company/x')).toBeNull()
  })
  it('ждём AQNIET', () => {
    expect(registrationBannerState(reg({ nextStep: null }), '/home')).toEqual({ kind: 'waiting' })
  })
  it('следующий шаг и ссылка с needNew', () => {
    expect(registrationBannerState(reg({ needNew: 'poa' }), '/billing')).toEqual({ kind: 'todo', done: 1, next: 'contract', to: '/import-40/company?step=poa' })
    expect(registrationBannerState(reg(), '/billing')).toEqual({ kind: 'todo', done: 1, next: 'contract', to: '/import-40/company' })
  })
})

describe('shouldRedirectToRegistration', () => {
  it('один раз, только с /home', () => {
    expect(shouldRedirectToRegistration(reg(), '/home', false)).toBe(true)
    expect(shouldRedirectToRegistration(reg(), '/home', true)).toBe(false)
    expect(shouldRedirectToRegistration(reg(), '/billing', false)).toBe(false)
    expect(shouldRedirectToRegistration(reg({ nextStep: null }), '/home', false)).toBe(false)
  })
  it('не клиенту и после завершения — нет', () => {
    expect(shouldRedirectToRegistration(reg({ isClient: false }), '/home', false)).toBe(false)
    expect(shouldRedirectToRegistration(reg({ complete: true }), '/home', false)).toBe(false)
  })
  it('состояние не загрузилось (ошибка can-create) — не уводим, даже если шаги выглядят несделанными', () => {
    expect(shouldRedirectToRegistration(reg({ loaded: false, nextStep: 'profile', doneCount: 0 }), '/home', false)).toBe(false)
  })
})

// I-1 ревью (30.10.2026): «ждём AQNIET — от вас ничего не нужно» только если доверенность уже действует.
describe('blockReasonOf', () => {
  const cc = (o = {}) => ({ canCreate: false, reason: null, needNew: 'contract' as const, profileComplete: true, contractOk: false, poaOk: true, ...o })
  it('код сервера — как есть; можно создавать — null', () => {
    expect(blockReasonOf(cc({ reasonCode: 'busy' }), false)).toBe('busy')
    expect(blockReasonOf(cc({ canCreate: true }), true)).toBeNull()
    expect(blockReasonOf(null, true)).toBeNull()
  })
  it('без кода: договор у AQNIET и доверенность есть — ждём AQNIET; доверенности нет — missing', () => {
    expect(blockReasonOf(cc(), true)).toBe('awaitingAqniet')
    expect(blockReasonOf(cc({ poaOk: false }), true)).toBe('missing')
    expect(blockReasonOf(cc({ profileComplete: false }), true)).toBe('profile')
  })
})
