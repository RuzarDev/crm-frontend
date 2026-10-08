/** Отметка (мс) последней перезагрузки из-за недогруженного чанка — в sessionStorage этой вкладки. */
export const CHUNK_RELOAD_KEY = 'zircon-chunk-reload-at'
/** Вторая ошибка чанка в этом окне после перезагрузки — уже не устаревшая сборка: не перезагружаем по кругу. */
const LOOP_WINDOW_MS = 60_000

interface Deps {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  now: () => number
}

/**
 * vite:preloadError — после выкладки старая вкладка просит чанк, которого на сервере уже нет. Перезагружаем
 * страницу один раз (новый index.html знает новые чанки). Защита от цикла — отметка времени в sessionStorage;
 * без sessionStorage (приватный режим, запрет) не перезагружаем: ошибка идёт дальше как есть.
 */
export function reloadOnceOnChunkError(e: Event, deps: Deps): boolean {
  const { storage, reload, now } = deps
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY)) || 0
    if (now() - last < LOOP_WINDOW_MS) return false
    storage.setItem(CHUNK_RELOAD_KEY, String(now()))
  } catch {
    return false
  }
  e.preventDefault()
  reload()
  return true
}

export function installChunkReload(win: Window = window): void {
  win.addEventListener('vite:preloadError', (e) => {
    let storage: Storage
    try { storage = win.sessionStorage } catch { return }
    reloadOnceOnChunkError(e, { storage, reload: () => win.location.reload(), now: Date.now })
  })
}
