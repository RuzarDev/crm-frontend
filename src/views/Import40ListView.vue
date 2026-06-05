<template>
  <div class="import40-list-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Рабочий модуль</div>
        <h1 class="crm-page-title">Импорт 40</h1>
        <p class="crm-page-subtitle">Ваши заявки, задачи и статусы по процессу оформления ИМ 40.</p>
      </div>
      <div class="crm-page-actions">
        <a-button :loading="loading" @click="loadCases">Обновить</a-button>
        <span class="crm-stat-badge">ДТ:&nbsp;<span class="crm-stat-badge-count">{{ cases.length }}</span></span>
      </div>
    </div>

    <section class="import40-summary">
      <div v-for="metric in metrics" :key="metric.label" class="summary-card">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
      </div>
    </section>

    <a-card v-if="canCreate" class="crm-shell-card create-card" :bordered="false">
      <template #title>Новая заявка</template>
      <div class="create-grid">
        <label>
          <span>Клиент</span>
          <a-select
            v-model:value="draft.clientId"
            show-search
            :options="clientOptions"
            :loading="clientsLoading"
            placeholder="Выберите клиента"
            @change="syncDraftClientName"
          />
        </label>
        <label>
          <span>Тип клиента</span>
          <a-select v-model:value="draft.clientType" :options="clientTypeOptions" />
        </label>
        <label>
          <span>Груз</span>
          <a-input v-model:value="draft.cargo" placeholder="Описание груза" />
        </label>
        <label>
          <span>Пост / СВХ</span>
          <a-input v-model:value="draft.post" placeholder="Таможенный пост" />
        </label>
        <a-button type="primary" :disabled="!canSubmit" @click="createCase">Создать</a-button>
      </div>
    </a-card>

    <a-card class="crm-shell-card" :bordered="false">
      <template #title>Мои заявки</template>
      <a-input v-model:value="search" allow-clear placeholder="Поиск по клиенту, грузу, ДТ">
        <template #prefix><SearchOutlined /></template>
      </a-input>
      <a-table
        :columns="columns"
        :data-source="filteredCases"
        :pagination="{ pageSize: 8, showSizeChanger: false }"
        :scroll="{ x: 820 }"
        row-key="id"
        class="import-table"
      >
        <template #emptyText>
          <a-empty description="Заявок пока нет" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'case'">
            <div class="case-cell">
              <strong>{{ record.clientName }}</strong>
              <span>{{ record.cargo }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <span class="status-chip">{{ statusLabel(record.status) }}</span>
          </template>
          <template v-else-if="column.key === 'progress'">
            <div class="progress-cell">
              <a-progress :percent="Math.round((record.status / 12) * 100)" :show-info="false" stroke-color="#2BBCD4" />
              <span>{{ Math.round((record.status / 12) * 100) }}%</span>
            </div>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button size="small" @click="router.push(`/import-40/${record.id}`)">Открыть</a-button>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import { import40Api, type Import40CaseDto } from '@/api/import40'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const clientsLoading = ref(false)
const cases = ref<Import40CaseDto[]>([])
const clientOptions = ref<{ value: string; label: string }[]>([])
const search = ref('')

const draft = reactive({
  clientId: undefined as string | undefined,
  clientName: '',
  clientType: 'Одноразовый' as 'Одноразовый' | 'Постоянный',
  cargo: '',
  post: '',
})

const statuses: Record<number, string> = {
  1: 'Черновик',
  2: 'Расчет',
  3: 'Согласование',
  4: 'Договор',
  5: 'Доверенность',
  6: 'Транспорт',
  7: 'Груз на посту',
  8: 'Оформление ДТ',
  9: 'ДТ выпущена',
  10: 'Оплата СВХ',
  11: 'Проверка оплаты',
  12: 'Выполнено',
}

const canCreate = computed(() => ['rop', 'mpp', 'client'].includes((authStore.businessRole || '').toLowerCase()))
const canSubmit = computed(() => Boolean(draft.clientId) && draft.cargo.trim().length > 1 && draft.post.trim().length > 1)
const clientTypeOptions = [
  { label: 'Одноразовый', value: 'Одноразовый' },
  { label: 'Постоянный', value: 'Постоянный' },
]
const columns = [
  { title: 'Заявка', key: 'case', width: 260 },
  { title: 'Статус', key: 'status', width: 160 },
  { title: 'Пост', dataIndex: 'post', key: 'post', width: 160 },
  { title: 'Менеджер', dataIndex: 'manager', key: 'manager', width: 130 },
  { title: 'Прогресс', key: 'progress', width: 130 },
  { title: '', key: 'action', width: 100, align: 'right' as const },
]

const metrics = computed(() => [
  { label: 'Всего', value: String(cases.value.length) },
  { label: 'В работе', value: String(cases.value.filter((item) => item.status < 12).length) },
  { label: 'На посту', value: String(cases.value.filter((item) => item.status >= 7 && item.status < 9).length) },
  { label: 'Выполнено', value: String(cases.value.filter((item) => item.status === 12).length) },
])

const filteredCases = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return cases.value
  return cases.value.filter((item) =>
    [item.clientName, item.cargo, item.post, item.declarationNumber, statusLabel(item.status)]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

const statusLabel = (status: number) => statuses[status] || 'Неизвестно'
const syncDraftClientName = () => {
  draft.clientName = clientOptions.value.find((item) => item.value === draft.clientId)?.label || ''
}

const loadCases = async () => {
  loading.value = true
  try {
    cases.value = await import40Api.list()
  } finally {
    loading.value = false
  }
}

const loadClients = async () => {
  clientsLoading.value = true
  try {
    const clients = await reestrApi.listClientsForCreate()
    clientOptions.value = clients.map((client) => ({ value: client.id, label: client.username }))
  } finally {
    clientsLoading.value = false
  }
}

const createCase = async () => {
  if (!canSubmit.value) return
  const created = await import40Api.create({
    clientId: draft.clientId!,
    clientName: draft.clientName,
    clientType: draft.clientType,
    cargo: draft.cargo.trim(),
    post: draft.post.trim(),
    manager: authStore.username || 'Назначить позже',
  })
  message.success('Заявка создана')
  router.push(`/import-40/${created.id}`)
}

onMounted(() => {
  void loadCases()
  if (canCreate.value) {
    void loadClients()
  }
})
</script>

<style scoped>
.import40-list-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.import40-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid rgba(43, 188, 212, 0.18);
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.summary-card span {
  color: #64748b;
  font-size: 13px;
}
.summary-card strong {
  display: block;
  margin-top: 6px;
  color: #0f172a;
  font-size: 24px;
}
.create-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}
.create-grid label,
.case-cell,
.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.create-grid label span {
  color: #334155;
  font-weight: 700;
}
.case-cell span {
  color: #64748b;
  font-size: 13px;
}
.status-chip {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(43, 188, 212, 0.12);
  color: #0f6f7f;
  padding: 4px 10px;
  font-weight: 800;
}
.progress-cell {
  min-width: 100px;
}
@media (max-width: 900px) {
  .import40-summary,
  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
