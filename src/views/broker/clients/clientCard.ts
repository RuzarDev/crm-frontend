import type { ClientCardProfile } from '@/api/clientCard'

// Чистая логика карточки клиента (/clients/:id).

/**
 * «Действует на основании»: у клиента без профиля (updatedAtUtc == null) сервер собирает пустой профиль
 * с основанием по умолчанию «устава» — это не данные клиента, показываем «—».
 */
export const directorBasisOf = (p: Pick<ClientCardProfile, 'directorBasis' | 'updatedAtUtc'>): string =>
  p.updatedAtUtc == null ? '—' : p.directorBasis || '—'
