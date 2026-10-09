import type { UpdateProfileRequest } from '@/types/api'

// Сохранение карточки декларанта обновляет только личные данные аккаунта (ФИО, телефон).
// companyName/innBin НЕ передаём: сервер оставит их как есть (раньше null стирал компанию и БИН).
export const buildDeclarantAccountPayload = (decl: { fullName: string | null; phone: string | null }): UpdateProfileRequest => ({
  displayName: decl.fullName || null,
  phone: decl.phone || null,
})

// Встроенная форма брокера/экспедитора: очищенное поле уходит как '' (сервер очищает), а не null (= «не менять»).
export const buildCompanyFormPayload = (form: {
  displayName: string | null
  phone: string | null
  companyName: string | null
  innBin: string | null
}): UpdateProfileRequest => ({
  displayName: form.displayName || null,
  phone: form.phone || null,
  companyName: (form.companyName ?? '').trim(),
  innBin: (form.innBin ?? '').trim(),
})
