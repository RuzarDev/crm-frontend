// Файлы страницы ДТ: скачать (XML ДТ и ДТС, все документы) и открыть PDF в новой вкладке (бланки ДТ и ДТС).

/** Скачать файл: ссылка добавляется в документ (иначе часть браузеров клик не обрабатывает) и сразу убирается. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** PDF — в новой вкладке; адрес живёт минуту (вкладка успевает загрузить файл). */
export function openPdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
