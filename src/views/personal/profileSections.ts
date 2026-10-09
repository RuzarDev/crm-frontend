// Какие карточки видит пользователь на странице «Профиль» (редизайн, волна 5б, доска Profile).
//   personal  — «Личные данные»: имя для документов, телефон; компания и БИН только брокеру и экспедитору.
//               Клиенту Импорта 40 формы нет: его контакты ведутся в «Моя компания».
//   company   — клиент Импорта 40: ссылка в /import-40/company вместо полей компании.
//   declarant — «Профиль декларанта · графа 54»: по праву import40.declarant, а не по основной бизнес-роли
//               (мультироли: «МПП + декларант» получает карточку через вторую роль). Клиенту — никогда.
//   language  — всем.
//   password  — всем; при временном пароле идёт первой, остальные закрыты до смены.
export type ProfileCard = 'personal' | 'company' | 'declarant' | 'language' | 'password'

export interface ProfileAccess {
  /** Системная роль аккаунта (administrator, broker, expeditor, client, …). */
  role: string
  hasPermission: (permission: string) => boolean
  clientHasModule: (module: 'import40' | 'transit') => boolean
  mustChangePassword: boolean
  /** Ссылка ?tab=password: карточка пароля первой, но остальные не закрыты (флага временного пароля нет). */
  passwordFirst?: boolean
}

export interface ProfileSections {
  /** Карточки по порядку на странице. */
  cards: ProfileCard[]
  /** Временный пароль: карточки кроме пароля недоступны. */
  locked: boolean
  /** В «Личных данных» есть поля компании и БИН (брокер, экспедитор). */
  companyFields: boolean
}

export function profileSections(a: ProfileAccess): ProfileSections {
  const role = (a.role || '').trim().toLowerCase()
  const isClient = role === 'client'
  const importClient = isClient && a.clientHasModule('import40')

  const rest: ProfileCard[] = []
  if (!importClient) rest.push('personal')
  if (importClient) rest.push('company')
  if (!isClient && a.hasPermission('import40.declarant')) rest.push('declarant')
  rest.push('language')

  return {
    cards: a.mustChangePassword || a.passwordFirst ? ['password', ...rest] : [...rest, 'password'],
    locked: a.mustChangePassword,
    companyFields: role === 'broker' || role === 'expeditor',
  }
}
