import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dashboardApi, type Import40DashboardDto } from '@/api/dashboard'
import type { DashboardDto } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { message } from 'ant-design-vue'

// Дашборд по услугам: транзитный блок — тем, у кого есть reestr.read (брокер/экспедитор/
// админ/транзит-клиент); блок Импорта 40 — тем, кто им пользуется (админ/декларант/КПП/клиент).
export const useDashboardStore = defineStore('dashboard', () => {
  const auth = useAuthStore()
  const data = ref<DashboardDto | null>(null)
  const import40 = ref<Import40DashboardDto | null>(null)
  const loading = ref(false)

  const showTransit = computed(() => auth.hasPermission('reestr.read'))
  const showImport40 = computed(() => auth.canUseImport40)

  const fetch = async () => {
    loading.value = true
    try {
      const tasks: Promise<unknown>[] = []
      if (showTransit.value) {
        tasks.push(dashboardApi.get().then((r) => { data.value = r.data }))
      } else {
        data.value = null
      }
      if (showImport40.value) {
        tasks.push(dashboardApi.import40().then((r) => { import40.value = r.data }))
      } else {
        import40.value = null
      }
      await Promise.all(tasks)
    } catch {
      message.error('Не удалось загрузить дашборд')
    } finally {
      loading.value = false
    }
  }

  return { data, import40, loading, showTransit, showImport40, fetch }
})
