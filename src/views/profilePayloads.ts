import type { UpdateProfileRequest } from '@/types/api'

// Сохранение карточки декларанта обновляет только личные данные аккаунта (ФИО, телефон).
// companyName/innBin НЕ передаём: сервер оставит их как есть (раньше null стирал компанию и БИН).
export const buildDeclarantAccountPayload = (decl: { fullName: string | null; phone: string | null }): UpdateProfileRequest => ({
  displayName: decl.fullName || null,
  phone: decl.phone || null,
})

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
