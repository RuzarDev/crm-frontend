import { computed, reactive, ref, type Ref } from 'vue'
import { import40Api, type Import40FileDto } from '@/api/import40'
import { isDocKind, type DocKindDef } from '@/views/client/docKinds'

// Документы черновика в мастере (шаг «Документы»): список файлов раздела documents, загрузки и удаления в пути,
// ошибки по строкам чек-листа. Живёт в мастере, а не в шаге: загрузка, начатая на шаге 4, может закончиться,
// когда клиент уже ушёл на шаг назад, — шаг размонтирован, а результат (файл, ошибка, «идёт загрузка» для кнопки
// отправки) не должен потеряться.

/** Строка чек-листа или «Другие документы». */
export type RowKind = DocKindDef['key'] | 'other'

export const DOC_ACCEPT = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']
export const DOC_MAX_MB = 25

/** Вид файла для раскладки: без вида (старый мастер) и неизвестный — в «Других документах». */
export const rowOf = (f: Pick<Import40FileDto, 'docKind'>): RowKind => {
  const k = f.docKind
  return isDocKind(k) && k !== 'other' ? (k as RowKind) : 'other'
}

/**
 * Ошибка в строке. type/size — проверка на клиенте (повтор не поможет), server — отказ или сбой сети:
 * file есть, «Повторить» шлёт тот же File. Текст собирает экран (на языке интерфейса).
 */
export interface RowError {
  id: number
  name: string
  code: 'type' | 'size' | 'server'
  reason: string | null
  file?: File
}

const serverReason = (e: unknown): string | null => {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const c = d.error ?? d.message ?? d.detail
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

/** Причина отказа на клиенте или null — файл можно слать. */
export const rejectReason = (f: File): 'type' | 'size' | null => {
  if (!DOC_ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) return 'type'
  if (f.size > DOC_MAX_MB * 1024 * 1024) return 'size'
  return null
}

export function useShipmentFiles(caseId: Ref<string | null>) {
  const files = ref<Import40FileDto[]>([])
  const loadState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')
  /** Имена файлов в загрузке — по строкам. */
  const pending = reactive<Partial<Record<RowKind, string[]>>>({})
  const errors = reactive<Partial<Record<RowKind, RowError[]>>>({})
  /** id файлов, которые сейчас удаляются. */
  const removing = ref<string[]>([])
  /** Имена последней удачной загрузки — для объявления скринридеру. */
  const attached = ref<string[]>([])

  const busy = computed(() => removing.value.length > 0 || Object.values(pending).some((l) => !!l?.length))
  const filesOf = (kind: RowKind) => files.value.filter((f) => rowOf(f) === kind)

  // Поколение: после reset (другой черновик) результаты прежних запросов отбрасываем.
  let gen = 0
  let errSeq = 0

  const load = async () => {
    const id = caseId.value
    if (!id) return
    const my = gen
    loadState.value = 'loading'
    try {
      const server = (await import40Api.listFiles(id, { silent: true })).filter((f) => f.section === 'documents')
      if (my !== gen) return
      // Загруженное, пока шёл запрос, могло в ответ не попасть — не теряем.
      const known = new Set(server.map((f) => f.id))
      files.value = [...server, ...files.value.filter((f) => !known.has(f.id))]
      loadState.value = 'ready'
    } catch {
      if (my === gen) loadState.value = 'error'
    }
  }

  const addErrors = (kind: RowKind, list: Omit<RowError, 'id'>[]) => {
    if (!list.length) return
    errors[kind] = [...(errors[kind] ?? []), ...list.map((e) => ({ ...e, id: ++errSeq }))]
  }
  /** Файл с этим именем всё же загрузился — его прежняя ошибка в строке больше не нужна. */
  const clearErrorsFor = (kind: RowKind, name: string) => {
    const left = (errors[kind] ?? []).filter((e) => e.name !== name)
    errors[kind] = left
  }

  const upload = async (kind: RowKind, picked: File[]) => {
    const id = caseId.value
    if (!id || !picked.length) return
    const my = gen
    const ok: File[] = []
    const rejected: Omit<RowError, 'id'>[] = []
    for (const f of picked) {
      const why = rejectReason(f)
      if (why) rejected.push({ name: f.name, code: why, reason: null })
      else ok.push(f)
    }
    // Новые ошибки — к прежним: выбор других файлов не стирает ещё не повторённые сбои.
    addErrors(kind, rejected)
    if (!ok.length) return
    pending[kind] = [...(pending[kind] ?? []), ...ok.map((f) => f.name)]
    const done: string[] = []
    await Promise.all(ok.map(async (f) => {
      try {
        const dto = await import40Api.uploadFile(id, 'documents', f, kind, { silent: true })
        if (my !== gen) return
        // Список с сервера мог успеть принести этот файл раньше ответа на загрузку — без дубля.
        if (!files.value.some((x) => x.id === dto.id)) files.value = [...files.value, dto]
        clearErrorsFor(kind, f.name)
        done.push(dto.originalFileName || f.name)
      } catch (e) {
        if (my !== gen) return
        addErrors(kind, [{ name: f.name, code: 'server', reason: serverReason(e), file: f }])
      } finally {
        if (my === gen) {
          const left = [...(pending[kind] ?? [])]
          left.splice(left.indexOf(f.name), 1)
          pending[kind] = left
        }
      }
    }))
    if (my === gen && done.length) attached.value = done
  }

  /** «Повторить»: те же File заново; ошибки проверки на клиенте остаются, пока их не скроют. */
  const retry = (kind: RowKind) => {
    const list = errors[kind] ?? []
    const again = list.flatMap((e) => (e.file ? [e.file] : []))
    errors[kind] = list.filter((e) => !e.file)
    void upload(kind, again)
  }
  const canRetry = (kind: RowKind) => (errors[kind] ?? []).some((e) => !!e.file)
  const dismiss = (kind: RowKind) => { errors[kind] = [] }

  /** Удаление файла (вопрос задаёт экран). true — удалён. */
  const remove = async (f: Import40FileDto): Promise<boolean> => {
    const id = caseId.value
    if (!id || removing.value.includes(f.id)) return false
    const my = gen
    removing.value = [...removing.value, f.id]
    try {
      await import40Api.deleteFile(id, f.id)
      if (my !== gen) return false
      files.value = files.value.filter((x) => x.id !== f.id)
      return true
    } catch {
      // Текст ошибки уже показал общий перехватчик (api/client.ts).
      return false
    } finally {
      if (my === gen) removing.value = removing.value.filter((x) => x !== f.id)
    }
  }

  /** Другой черновик (или новый): всё с нуля, ответы прежних запросов не применяются. */
  const reset = () => {
    gen++
    files.value = []
    loadState.value = 'idle'
    for (const k of Object.keys(pending) as RowKind[]) delete pending[k]
    for (const k of Object.keys(errors) as RowKind[]) delete errors[k]
    removing.value = []
    attached.value = []
  }

  return { files, loadState, pending, errors, removing, attached, busy, filesOf, load, upload, retry, canRetry, dismiss, remove, reset }
}

export type ShipmentFilesApi = ReturnType<typeof useShipmentFiles>
