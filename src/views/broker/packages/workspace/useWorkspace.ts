// Состояние страницы «Разбор поезда» (редизайн, волна 4в): пакет, загрузка, 404/ошибка и мутации.
// Каждая мутация сервера возвращает пакет целиком — состояние берётся из ответа (как раньше). Загрузка и
// удаление файла пакет не возвращают — после них пакет перечитывается тихо. Ошибки показывает перехватчик
// (api/client.ts), своих тостов на ошибку нет (B13.6). Занятость — по ключу элемента, без общего спиннера.
import { computed, inject, provide, reactive, ref, shallowRef, watch, type InjectionKey, type Ref } from 'vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageContainerDto, DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import { fileTarget, linkBody, type LinkTarget } from './workspace'

export type ContainerInput = { containerNumber: string; secondaryContainerNumber: string | null }

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

/** Ошибка запроса (ответ сервера или нет связи) — её показал перехватчик. Прочее — ошибка кода, её не прячем. */
const isHttpError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && ('response' in e || (e as { isAxiosError?: unknown }).isAxiosError === true)

/** Совпадает ли место привязки — повторная привязка туда же запроса не шлёт. */
export const sameTarget = (a: LinkTarget, b: LinkTarget): boolean => {
  if (a.kind !== b.kind) return false
  if (a.kind === 'container' && b.kind === 'container') return a.containerId === b.containerId
  if (a.kind === 'partia' && b.kind === 'partia') return a.partiaId === b.partiaId
  return true
}

export function useWorkspace(pkgId: () => string) {
  const pkg = shallowRef<DocumentPackageDto | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)

  // Номер загрузки: ответ по прежнему пакету (ушли на другой) не подменяет новый.
  let seq = 0
  /** false — не удалось (тихое перечитывание: на экране остаётся прежнее). */
  const load = async (opts: { quiet?: boolean } = {}): Promise<boolean> => {
    const id = pkgId()
    const my = ++seq
    if (!opts.quiet) {
      loading.value = true
      notFound.value = false
      loadError.value = false
    }
    try {
      const d = await documentPackagesApi.getById(id, { silent: true })
      if (my !== seq) return true
      pkg.value = d
      notFound.value = false
      loadError.value = false
      return true
    } catch (e) {
      if (my !== seq) return true
      if (opts.quiet) return false // тихое перечитывание: остаётся то, что на экране
      const s = statusOf(e)
      if (s === 404 || s === 403 || s === 400) notFound.value = true
      else loadError.value = true
      return false
    } finally {
      if (my === seq && !opts.quiet) loading.value = false
    }
  }
  watch(pkgId, () => {
    pkg.value = null
    void load()
  }, { immediate: true })

  /** «Обновить»: тихое перечитывание (экспедитор загружает файлы, пока брокер держит страницу открытой). */
  const refreshing = ref(false)
  const refresh = async (): Promise<boolean> => {
    if (refreshing.value) return true
    refreshing.value = true
    try {
      return await load({ quiet: true })
    } finally {
      refreshing.value = false
    }
  }

  /** Ответ мутации — новый пакет, если он про тот пакет, что открыт сейчас. */
  const apply = (d: DocumentPackageDto) => {
    if (d.id === pkgId()) {
      seq++ // начатая раньше загрузка старее ответа мутации
      pkg.value = d
    }
  }

  // ---- Занятость по ключу элемента ----
  const pending = reactive(new Set<string>())
  const isPending = (key: string) => pending.has(key)
  /**
   * Запрос под ключом; повторный под тем же ключом, пока идёт первый, не уходит. false — не вышло (тост показал перехватчик).
   * Гасится только ошибка запроса; ошибка кода уходит наверх.
   */
  const run = async <T>(key: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (pending.has(key)) return { ok: false }
    pending.add(key)
    try {
      return { ok: true, value: await fn() }
    } catch (e) {
      if (!isHttpError(e)) throw e
      return { ok: false }
    } finally {
      pending.delete(key)
    }
  }
  const mutate = async (key: string, fn: (id: string) => Promise<DocumentPackageDto>): Promise<boolean> => {
    const r = await run(key, () => fn(pkgId()))
    if (r.ok) apply(r.value)
    return r.ok
  }

  // ---- Файлы ----
  const linkFile = async (file: DocumentPackageFileDto, target: LinkTarget): Promise<boolean> => {
    if (sameTarget(fileTarget(file, pkg.value), target)) return false
    return mutate(`link:${file.id}`, (id) => documentPackagesApi.linkFile(id, file.id, linkBody(target, file)))
  }

  /** Файлы — по очереди; не принятые сервером пропускаются, остальные идут дальше. Итог — сколько загрузилось. */
  const uploadFiles = async (files: File[]): Promise<{ done: number; total: number } | null> => {
    const id = pkgId()
    const r = await run('upload', async () => {
      let done = 0
      for (const f of files) {
        try {
          await documentPackagesApi.uploadFile(id, f)
          done++
        } catch (e) {
          if (!isHttpError(e)) throw e // тост об ошибке запроса показал перехватчик
        }
      }
      return done
    })
    if (!r.ok) return null
    if (r.value > 0 && id === pkgId()) await load({ quiet: true })
    return { done: r.value, total: files.length }
  }

  const deleteFile = async (file: DocumentPackageFileDto): Promise<boolean> => {
    const id = pkgId()
    const r = await run(`file-delete:${file.id}`, () => documentPackagesApi.deleteFile(id, file.id))
    if (r.ok && id === pkgId()) await load({ quiet: true })
    return r.ok
  }

  // ---- Контейнеры и партии ----
  const saveContainer = (container: DocumentPackageContainerDto | null, data: ContainerInput) =>
    container
      ? mutate(`container:${container.id}`, (id) => documentPackagesApi.updateContainer(id, container.id, data))
      : mutate('container:new', (id) => documentPackagesApi.createContainer(id, data))
  const deleteContainer = (containerId: string) =>
    mutate(`container-delete:${containerId}`, (id) => documentPackagesApi.deleteContainer(id, containerId))
  const deletePartia = (containerId: string, partiaId: string) =>
    mutate(`partia-delete:${partiaId}`, (id) => documentPackagesApi.deleteClientConsolidation(id, containerId, partiaId))

  /** Сформировать строки реестра: число созданных или null (ошибка — тост перехватчика). */
  const generateRows = async (): Promise<number | null> => {
    const id = pkgId()
    const r = await run('generate', () => documentPackagesApi.generateRows(id))
    if (!r.ok) return null
    // Сервер переводит пакет в «Обработан» при любом успешном вызове — даже без новых строк.
    if (id === pkgId()) await load({ quiet: true })
    return r.value.generatedRowsCount
  }

  return {
    pkg, loading, notFound, loadError, refreshing,
    load: () => load(), refresh, apply, isPending,
    linkFile, uploadFiles, deleteFile, saveContainer, deleteContainer, deletePartia, generateRows,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>

// ---- Перетаскивание файла на дерево ----
// Цель — ключ: 'none' (фон дерева: «не распределять»), 'c:<id>' (контейнер), 'p:<id>' (партия).
// Обработчики цели останавливают всплытие: партия лежит внутри контейнера, а контейнер — внутри фона,
// и брошенный файл иначе привязывался бы ко всем по очереди (B13.1). Подсвечена одна цель — та, над которой курсор.
export type DropKey = 'none' | `c:${string}` | `p:${string}`

export interface WorkspaceDnd {
  enabled: Ref<boolean>
  dragging: Ref<DocumentPackageFileDto | null>
  over: Ref<DropKey | null>
  start: (e: DragEvent, file: DocumentPackageFileDto) => void
  end: () => void
  /** Слушатели элемента-цели (v-on). Без перетаскивания строки — только защита от файла с компьютера. */
  target: (key: DropKey, to: LinkTarget) => Record<string, (e: DragEvent) => void>
}

const DND: InjectionKey<WorkspaceDnd> = Symbol('workspace-dnd')

export function provideWorkspaceDnd(enabled: Ref<boolean>, onDrop: (file: DocumentPackageFileDto, to: LinkTarget) => void): WorkspaceDnd {
  const dragging = shallowRef<DocumentPackageFileDto | null>(null)
  const over = ref<DropKey | null>(null)
  const active = computed(() => enabled.value && dragging.value !== null)

  const start = (e: DragEvent, file: DocumentPackageFileDto) => {
    if (!enabled.value) {
      e.preventDefault()
      return
    }
    dragging.value = file
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      // Firefox не начинает перетаскивание без данных.
      e.dataTransfer.setData('text/plain', file.originalFileName)
    }
  }
  const end = () => {
    dragging.value = null
    over.value = null
  }
  /**
   * Файл с компьютера над деревом: браузер по умолчанию открыл бы его во вкладке вместо страницы. Отменяем
   * действие по умолчанию и показываем «нельзя» (dropEffect none) — загрузка только через панель файлов.
   */
  const blockOsFile = (e: DragEvent) => {
    if (dragging.value || !Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
  }
  const target = (key: DropKey, to: LinkTarget) => ({
    dragenter: (e: DragEvent) => {
      if (!active.value) return blockOsFile(e)
      e.preventDefault()
      e.stopPropagation()
      over.value = key
    },
    dragover: (e: DragEvent) => {
      if (!active.value) return blockOsFile(e)
      e.preventDefault()
      e.stopPropagation()
      over.value = key
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    },
    dragleave: (e: DragEvent) => {
      if (!active.value) return
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement | null
      const to = e.relatedTarget as Node | null
      if (el && to && el.contains(to)) return // ушли на дочерний элемент той же цели
      if (over.value === key) over.value = null
    },
    drop: (e: DragEvent) => {
      const file = dragging.value
      if (!enabled.value || !file) return blockOsFile(e) // файлы с компьютера и чужое перетаскивание — не привязка
      e.preventDefault()
      e.stopPropagation()
      end()
      onDrop(file, to)
    },
  })

  const api: WorkspaceDnd = { enabled, dragging, over, start, end, target }
  provide(DND, api)
  return api
}

export const useWorkspaceDnd = (): WorkspaceDnd | null => inject(DND, null)
