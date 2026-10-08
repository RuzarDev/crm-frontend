import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'

// «Документы клиента» в разделе документов записи и в «Моих документах» — без {name} (не admin.dokumentyKlienta).
describe('transit.dokumentyKlienta', () => {
  it('есть на трёх языках и без подстановки имени', () => {
    expect(ru.transit.dokumentyKlienta).toBe('Документы клиента')
    expect(kk.transit.dokumentyKlienta).toBe('Клиент құжаттары')
    expect(en.transit.dokumentyKlienta).toBe('Client documents')
  })
})
