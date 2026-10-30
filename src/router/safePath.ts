// Внутренние адреса возврата (30.10.2026, аудит C-5, S-6/C-15): ?next= после входа и ?from= у «Назад».
// Принимаем только путь этого же сайта «/…»: без схемы, без «//» и «\» (браузер прочёл бы их как другой хост),
// без управляющих символов. Всё прочее — null, и экран ведёт по умолчанию.
const ORIGIN = 'http://zircon.invalid'

export function safeInternalPath(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s.startsWith('/') || s.startsWith('//') || s.length > 2000) return null
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return null
  try {
    if (new URL(s, ORIGIN).origin !== ORIGIN) return null
  } catch {
    return null
  }
  return s
}

// Страницы, куда после входа не возвращаем: сам вход и открытые без входа (регистрация, приглашение, сброс пароля).
const PUBLIC = ['/login', '/register', '/forgot-password', '/reset-password', '/invite', '/verify']
const isPublic = (path: string) => PUBLIC.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))

/** Куда вести после входа: ?next=, если это свой непубличный путь, иначе «/». */
export function afterLoginPath(next: unknown): string {
  const p = safeInternalPath(next)
  return p && !isPublic(p) ? p : '/'
}

/** Адрес входа с возвратом: «/login?next=…»; с Главной и публичных страниц — просто «/login». */
export function loginPath(fullPath: string | null | undefined): string {
  const p = safeInternalPath(fullPath)
  if (!p || p === '/' || p === '/home' || isPublic(p)) return '/login'
  return `/login?next=${encodeURIComponent(p)}`
}
