import type { UpdateProfileRequest } from '@/types/api'

// Форма «Личные данные». Поля компании/БИН уходят только когда они показаны (брокер/экспедитор):
// очищенное поле — '' (сервер очищает), а не null (= «не менять»). Остальным ролям (клиент транзита,
// импортёр, продажи) компанию не передаём вовсе, иначе пустая строка стёрла бы её.
export const buildCompanyFormPayload = (form: {
  displayName: string | null
  phone: string | null
  companyName: string | null
  innBin: string | null
}, withCompany: boolean): UpdateProfileRequest => ({
  displayName: form.displayName || null,
  phone: form.phone || null,
  ...(withCompany ? { companyName: (form.companyName ?? '').trim(), innBin: (form.innBin ?? '').trim() } : {}),
})
