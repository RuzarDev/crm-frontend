import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dashboardApi, type Import40ClientDashboardDto, type Import40DashboardDto } from '@/api/dashboard'
import type { DashboardDto } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { message } from 'ant-design-vue'

// Дашборд по услугам: транзитный блок — тем, у кого есть reestr.read (брокер/экспедитор/
// админ/транзит-клиент); блок Импорта 40 — тем, кто им пользуется (админ/декларант/КПП/клиент).
export const useDashboardStore = defineStore('dashboard', () => {
  const auth = useAuthStore()
  const data = ref<DashboardDto | null>(null)
  const import40 = ref<Import40DashboardDto | null>(null)
  // Клиент — свой дашборд (аудит 5.7): другая форма ответа, метрики сотрудника ему не нужны.
  const clientDashboard = ref<Import40ClientDashboardDto | null>(null)
  const loading = ref(false)

  const isClient = computed(() => (auth.role || '').toLowerCase() === 'client')
  const showTransit = computed(() => auth.hasPermission('reestr.read'))
  const showImport40 = computed(() => auth.canUseImport40 && !isClient.value)

  const fetch = async () => {
    loading.value = true
    try {
      const tasks: Promise<unknown>[] = []
      if (showTransit.value) {
        tasks.push(dashboardApi.get().then((r) => { data.value = r.data }))
      } else {
        data.value = null
      }
      if (isClient.value && auth.canUseImport40) {
        tasks.push(dashboardApi.client().then((r) => { clientDashboard.value = r.data }))
        import40.value = null
      } else if (showImport40.value) {
        tasks.push(dashboardApi.import40().then((r) => { import40.value = r.data }))
        clientDashboard.value = null
      } else {
        import40.value = null
        clientDashboard.value = null
      }
      await Promise.all(tasks)
    } catch {
      message.error('Не удалось загрузить дашборд')
    } finally {
      loading.value = false
    }
  }

  return { data, import40, clientDashboard, loading, isClient, showTransit, showImport40, fetch }
})
