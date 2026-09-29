import { ref } from 'vue'
import { referencesApi } from '@/api/references'

export interface Alpha2Option {
  value: string
  label: string
}

// Страны по двухбуквенному коду (классификатор стран ЕЭК 2021) — национальность ТС (гр.18/21),
// страна места товаров (гр.30), страна документа гр.44: в КЕДЕН они уходят буквами (KZ/CN), а не
// цифровым ОКСМ. Источник — справочник стран на сервере (249 шт.), грузим один раз на сессию.
const options = ref<Alpha2Option[]>([])
let pending: Promise<void> | null = null

function load(): Promise<void> {
  pending ??= referencesApi
    .listCountries()
    .then((items) => {
      options.value = items
        .filter((c) => c.alpha2)
        .map((c) => ({ value: c.alpha2!, label: `${c.alpha2} — ${c.name}` }))
        .sort((a, b) => a.value.localeCompare(b.value))
    })
    .catch(() => {
      pending = null // повторим при следующем открытии формы
    })
  return pending
}

export function useCountryAlpha2Options() {
  void load()
  return options
}
