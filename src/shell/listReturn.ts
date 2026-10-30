// Последний адрес списка (30.10.2026, аудит S-20): крошка «Заявки» в карточке заявки и на странице ДТ ведёт
// туда, откуда пришли, — с вкладкой и фильтрами (они живут в адресе списка), а не в «Мои» с пустыми фильтрами.
// В памяти вкладки: после перезагрузки — адрес по умолчанию. При выходе забывается (resetSession).
const last = new Map<string, string>()

export const rememberListPath = (key: string, fullPath: string): void => { last.set(key, fullPath) }
export const listPath = (key: string, fallback: string): string => last.get(key) ?? fallback
export const resetListPaths = (): void => { last.clear() }
