import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'

describe('подписи брокерских списков', () => {
  it('kk: вкладка «Мои» — «Менікі», как в подзаголовке «Распределения»', () => {
    expect(kk.broker.requests.tab.my).toBe('Менікі')
    expect(kk.broker.manage.subtitle).toContain('«Менікі»')
  })
  it('короткие роли панели «Загрузка» на трёх языках', () => {
    expect(ru.broker.manage.role).toEqual({ declarant: 'декларант', kpp: 'КПП' })
    expect(kk.broker.manage.role).toEqual({ declarant: 'декларант', kpp: 'ӨБП' })
    expect(en.broker.manage.role).toEqual({ declarant: 'declarant', kpp: 'checkpoint' })
  })
})
