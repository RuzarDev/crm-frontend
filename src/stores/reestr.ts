import { defineStore } from 'pinia'
import { ref } from 'vue'
import { reestrApi } from '@/api/reestr'
import type { ReestrEntry, ReestrListRequest, ReestrEntryStatus, ReestrUpsertBody } from '@/types/api'
import { message } from 'ant-design-vue'

export const useReestrStore = defineStore('reestr', () => {
  const entries = ref<ReestrEntry[]>([])
  const loading = ref(false)
  const totalCount = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const totalPages = ref(0)
  const searchQuery = ref('')
  const statusFilter = ref<ReestrEntryStatus | null>(null)
  const clientFilter = ref<string | null>(null)
  const documentDateFrom = ref<string | null>(null)
  const documentDateTo = ref<string | null>(null)

  const fetchList = async (params?: ReestrListRequest) => {
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
      })
      entries.value = response.items
      totalCount.value = response.totalCount
      currentPage.value = response.page
      pageSize.value = response.pageSize
      totalPages.value = response.totalPages
    } catch (error) {
      console.error('Failed to fetch reestr list:', error)
    } finally {
      loading.value = false
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

  const create = async (data: ReestrUpsertBody): Promise<boolean> => {
    try {
      await reestrApi.create(data)
      message.success('Запись успешно создана')
      await fetchList()
      return true
    } catch (error) {
      return false
    }
  }

  const update = async (id: string, data: ReestrUpsertBody): Promise<boolean> => {
    try {
      await reestrApi.update(id, data)
      message.success('Запись успешно обновлена')
      await fetchList()
      return true
    } catch (error) {
      return false
    }
  }

  const deleteEntry = async (id: string): Promise<boolean> => {
    try {
      await reestrApi.delete(id)
      message.success('Запись успешно удалена')
      await fetchList()
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
      message.success(`Удалено записей: ${response.deleted}`)
      await fetchList()
      return true
    } catch (error) {
      return false
    }
  }

  const uploadFile = async (file: File, clientId?: string): Promise<boolean> => {
    loading.value = true
    try {
      const response = await reestrApi.uploadFile(file, clientId)
      message.success(`Успешно импортировано записей: ${response.imported}`)
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
      message.success('Статус обновлён')
      await fetchList()
      return true
    } catch {
      return false
    }
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
    deleteEntry,
    deleteEntries,
    uploadFile,
    changeStatus,
    setSearch,
    setPage,
    setPageSize,
  }
})
