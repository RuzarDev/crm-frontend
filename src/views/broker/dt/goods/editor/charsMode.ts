// Вид строк гр. 31 — «Таблица» или «Карточки»: выбор помнится у пользователя (localStorage, ключ с id пользователя из
// входа). Хранилище недоступно (приватный режим, запрет) — по умолчанию таблица, без ошибок.
export type CharsMode = 'table' | 'cards'

const PREFIX = 'zircon.dt.charsMode'

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
/** Ключ пользователя: id из входа (stores/auth хранит его в localStorage «userId»); без входа — общий. */
export function charsModeKey(): string {
  try {
    const user = storage()?.getItem('userId')
    return user ? `${PREFIX}:${user}` : PREFIX
  } catch {
    return PREFIX
  }
}

export function readCharsMode(): CharsMode {
  try {
    return storage()?.getItem(charsModeKey()) === 'cards' ? 'cards' : 'table'
  } catch {
    return 'table'
  }
}

export function writeCharsMode(mode: CharsMode): void {
  try {
    storage()?.setItem(charsModeKey(), mode)
  } catch {
    /* хранилище недоступно — выбор живёт до перезагрузки */
  }
}
