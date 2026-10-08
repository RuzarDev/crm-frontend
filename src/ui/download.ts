/**
 * Отдать blob браузеру как файл с именем name. Ссылку на объект освобождаем не сразу,
 * а следующей задачей: в части браузеров (Safari, Firefox) немедленный revoke после click()
 * обрывает скачивание.
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
