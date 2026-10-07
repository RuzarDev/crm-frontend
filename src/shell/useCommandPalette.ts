import { ref } from 'vue'

// Палитра ⌘K: одно состояние на всё приложение (модульный ref) — горячая клавиша, кнопка «Поиск» в меню
// и сама палитра видят одно и то же open.

/** Пункт группы «Перейти»: раздел или страница, куда ведёт палитра. */
export interface PaletteDestination {
  key: string
  label: string
  /** Вторая строка справа (обычно — раздел); по ней тоже ищется. */
  hint?: string
  to: string
}

const open = ref(false)

export function useCommandPalette() {
  return {
    open,
    show: () => { open.value = true },
    hide: () => { open.value = false },
  }
}

/**
 * ⌘K (Ctrl+K) открывает и закрывает палитру — в любой раскладке. Во время набора через IME и при автоповторе
 * зажатой клавиши не срабатывает. Возвращает функцию снятия обработчика.
 */
export function installPaletteHotkey(): () => void {
  const onKeydown = (e: KeyboardEvent) => {
    // Alt/Shift+⌘K — чужие сочетания (браузер, расширения), их не перехватываем.
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.isComposing || e.repeat) return
    // code — физическая клавиша: в русской и казахской раскладке key = «л».
    if (e.key?.toLowerCase() !== 'k' && e.code !== 'KeyK') return
    e.preventDefault()
    open.value = !open.value
  }
  window.addEventListener('keydown', onKeydown)
  return () => window.removeEventListener('keydown', onKeydown)
}
