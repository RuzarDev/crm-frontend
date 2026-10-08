import { defineStore } from 'pinia'
import { ref } from 'vue'
import { reestrApi } from '@/api/reestr'
import type { ReestrEntry, ReestrListRequest, ReestrEntryStatus, ReestrUpsertBody } from '@/types/api'
import { message } from '@/ui/message'
import { i18n } from '@/i18n'
import { serverErrorText } from '@/utils/serverError'

export const useReestrStore = defineStore('reestr', () => {
  const entries = ref<ReestrEntry[]>([])
  const loading = ref(false)
  const totalCount = ref(0)
  const currentPage = ref(1)
  // 25 строк — стандарт списков платформы (ZTable без переключателя размера).
  const pageSize = ref(25)
  const totalPages = ref(0)
  const searchQuery = ref('')
  const statusFilter = ref<ReestrEntryStatus | null>(null)
  const clientFilter = ref<string | null>(null)
  const documentDateFrom = ref<string | null>(null)
  const documentDateTo = ref<string | null>(null)
  // Последняя загрузка списка не удалась (экран показывает ошибку с «Повторить»; прежние строки остаются).
  const loadError = ref(false)
  // Время последней удачной загрузки (ISO) — подпись «Обновлено HH:mm».
  const loadedAt = ref<string | null>(null)
  // Номер запроса: ответ устаревшего (фильтр сменили, пока шёл прежний) не затирает свежий.
  let listSeq = 0

  const fetchList = async (params?: ReestrListRequest) => {
    const my = ++listSeq
    loading.value = true
    try {
      const status =
        params?.status !== undefined ? params.status : statusFilter.value
      const response = await reestrApi.getList({
        page: params?.page || currentPage.value,
        pageSize: params?.pageSize || pageSize.value,
        search: params?.search || searchQuery.value,
        status: status ?? undefined,
        clientId:
          params?.clientId !== undefined ? params.clientId ?? undefined : clientFilter.value ?? undefined,
        documentDateFrom:
          params?.documentDateFrom !== undefined
            ? params.documentDateFrom ?? undefined
            : documentDateFrom.value ?? undefined,
        documentDateTo:
          params?.documentDateTo !== undefined
            ? params.documentDateTo ?? undefined
            : documentDateTo.value ?? undefined,
        sortBy: params?.sortBy,
        sortDescending: params?.sortDescending,
      }, { silent: true })
      if (my !== listSeq) return
      entries.value = response.items
      totalCount.value = response.totalCount
      currentPage.value = response.page
      pageSize.value = response.pageSize
      totalPages.value = response.totalPages
      loadError.value = false
      loadedAt.value = new Date().toISOString()
    } catch (error) {
      if (my !== listSeq) return
      console.error('Failed to fetch reestr list:', error)
      loadError.value = true
    } finally {
      if (my === listSeq) loading.value = false
    }
  }

  const getById = async (id: string): Promise<ReestrEntry | null> => {
    try {
      return await reestrApi.getById(id)
    } catch (error) {
      console.error('Failed to fetch reestr entry:', error)
      return null
    }
  }

  // Текст последней ошибки сохранения записи — форма держит его в постоянной плашке, пока сохранение не пройдёт.
  const saveError = ref<string | null>(null)

  const create = async (data: ReestrUpsertBody): Promise<boolean> => {
    try {
      await reestrApi.create(data)
    } catch (error) {
      saveError.value = serverErrorText(error, i18n.global.t('dt.netSvyazi'))
      return false
    }
    saveError.value = null
    message.success(i18n.global.t('transit.zapisUspeshnoSozdana'))
    // Запись уже сохранена: сбой обновления списка не должен выглядеть как несохранение.
    await fetchList().catch(() => undefined)
    return true
  }

  const update = async (id: string, data: ReestrUpsertBody): Promise<boolean> => {
    try {
      await reestrApi.update(id, data)
    } catch (error) {
      saveError.value = serverErrorText(error, i18n.global.t('dt.netSvyazi'))
      return false
    }
    saveError.value = null
    message.success(i18n.global.t('transit.zapisUspeshnoObnovlena'))
    await fetchList().catch(() => undefined)
    return true
  }

  // После удаления: удалили последние строки страницы — шаг на страницу назад (не дальше последней) и перечёт.
  const fetchAfterDelete = async () => {
    await fetchList()
    if (entries.value.length || currentPage.value <= 1 || loadError.value) return
    const last = Math.max(1, Math.ceil(totalCount.value / pageSize.value))
    currentPage.value = Math.min(currentPage.value - 1, last)
    await fetchList()
  }

  const deleteEntry = async (id: string): Promise<boolean> => {
    try {
      await reestrApi.delete(id)
      message.success(i18n.global.t('transit.zapisUspeshnoUdalena'))
      await fetchAfterDelete()
      return true
    } catch (error) {
      return false
    }
  }

  const deleteEntries = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) {
      return false
    }
    try {
      const response = await reestrApi.bulkDelete(ids)
      message.success(i18n.global.t('transit.udalenoZapisey', { n: response.deleted }))
      await fetchAfterDelete()
      return true
    } catch (error) {
      return false
    }
  }

  const uploadFile = async (file: File, clientId?: string): Promise<boolean> => {
    loading.value = true
    try {
      const response = await reestrApi.uploadFile(file, clientId)
      message.success(i18n.global.t('transit.uspeshnoImportirovanoZapisey', { n: response.imported }))
      await fetchList()
      return true
    } catch (error) {
      return false
    } finally {
      loading.value = false
    }
  }

  const changeStatus = async (id: string, status: ReestrEntryStatus): Promise<boolean> => {
    try {
      await reestrApi.changeStatus(id, status)
      message.success(i18n.global.t('transit.statusObnovlen'))
      // Перечёт списка — в фоне (ошибку он показывает сам): страница записи не ждёт его, чтобы перечитать запись.
      void fetchList()
      return true
    } catch {
      return false
    }
  }

  // Смена статуса нескольких записей: по одной, последовательно (сервер проверяет доступ к каждой),
  // один перечёт списка в конце и один тост с итогом. Возвращает число успешных.
  const changeStatuses = async (ids: string[], status: ReestrEntryStatus): Promise<number> => {
    let ok = 0
    for (const id of ids) {
      try {
        await reestrApi.changeStatus(id, status, { silent: true })
        ok++
      } catch {
        // итог — одним тостом ниже
      }
    }
    const text = i18n.global.t('broker.transit.statusesChanged', { ok, n: ids.length })
    if (ok === ids.length) message.success(text)
    else message.warning(text)
    await fetchList()
    return ok
  }

  const setSearch = (query: string) => {
    searchQuery.value = query
    currentPage.value = 1
  }

  const setPage = (page: number) => {
    currentPage.value = page
  }

  const setPageSize = (size: number) => {
    pageSize.value = size
    currentPage.value = 1
  }

  // Смена страницы таблицы: событие пагинации несёт и страницу, и размер. Размер сбрасывает на первую
  // страницу, только если действительно изменился — иначе переход на страницу N тут же возвращал на 1.
  const setPageAndSize = (page: number, size: number) => {
    if (size !== pageSize.value) {
      pageSize.value = size
      currentPage.value = 1
      return
    }
    currentPage.value = page
  }

  return {
    entries,
    loading,
    totalCount,
    currentPage,
    pageSize,
    totalPages,
    searchQuery,
    statusFilter,
    clientFilter,
    documentDateFrom,
    documentDateTo,
    fetchList,
    getById,
    create,
    update,
    saveError,
    deleteEntry,
    deleteEntries,
    uploadFile,
    changeStatus,
    changeStatuses,
    loadError,
    loadedAt,
    setSearch,
    setPage,
    setPageSize,
    setPageAndSize,
  }
})
