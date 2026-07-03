<template>
  <div class="import40-list-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Рабочий модуль</div>
        <h1 class="crm-page-title">Импорт 40</h1>
        <p class="crm-page-subtitle">Заявки на таможенное оформление: контейнеры, ДТ, статусы.</p>
      </div>
      <div class="crm-page-actions">
        <a-button :loading="loading" @click="reload">Обновить</a-button>
        <span class="crm-stat-badge">Заявок:&nbsp;<span class="crm-stat-badge-count">{{ cases.length }}</span></span>
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
        <label v-if="!isClientRole">
          <span>Клиент</span>
          <a-select
            v-model:value="draft.clientId"
            show-search
            option-filter-prop="label"
            :options="clientOptions"
            :loading="clientsLoading"
            placeholder="Выберите клиента"
            @change="syncClientName"
          />
        </label>
        <label>
          <span>Груз</span>
          <a-input v-model:value="draft.cargo" placeholder="Описание груза" />
        </label>
        <label>
          <span>Пост / СВХ</span>
          <a-input v-model:value="draft.post" placeholder="Таможенный пост" />
        </label>
        <a-button type="primary" :disabled="!canSubmit" :loading="creating" @click="createCase">Создать</a-button>
      </div>
    </a-card>

    <a-card class="crm-shell-card" :bordered="false">
      <a-tabs v-model:activeKey="tab" @change="reload">
        <a-tab-pane key="my" tab="Мои задачи" />
        <a-tab-pane key="all" tab="Все заявки" />
      </a-tabs>

      <a-input v-model:value="search" allow-clear placeholder="Поиск по клиенту, грузу, посту">
        <template #prefix><SearchOutlined /></template>
      </a-input>

      <a-table
        :columns="columns"
        :data-source="filteredCases"
        :loading="loading"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
        :scroll="{ x: 820 }"
        row-key="id"
        class="import-table"
      >
        <template #emptyText>
          <a-empty :description="tab === 'my' ? 'Заявок, ждущих вас, нет' : 'Заявок пока нет'" />
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
            <span v-if="record.isProblem" class="problem-chip">Проблема</span>
          </template>
          <template v-else-if="column.key === 'containers'">
            {{ record.containers.length }} конт. / {{ declCount(record) }} ДТ
          </template>
          <template v-else-if="column.key === 'progress'">
            <div class="progress-cell">
              <a-progress :percent="progress(record)" :show-info="false" stroke-color="#2BBCD4" />
              <span>{{ progress(record) }}%</span>
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
import { import40Api, IMPORT40_STATUSES, type Import40CaseDto } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const creating = ref(false)
const clientsLoading = ref(false)
const cases = ref<Import40CaseDto[]>([])
const clientOptions = ref<{ value: string; label: string }[]>([])
const search = ref('')
const tab = ref<'my' | 'all'>('my')

const draft = reactive({
  clientId: undefined as string | undefined,
  clientName: '',
  cargo: '',
  post: '',
})

const isClientRole = computed(
  () =>
    (authStore.businessRole || '').toLowerCase() === 'client' ||
    (authStore.role || '').toLowerCase() === 'client',
)
const canCreate = computed(
  () => isClientRole.value || (authStore.role || '').toLowerCase() === 'administrator',
)
const canSubmit = computed(
  () => Boolean(draft.clientId) && draft.cargo.trim().length > 1 && draft.post.trim().length > 1,
)

const columns = [
  { title: 'Заявка', key: 'case', width: 240 },
  { title: 'Статус', key: 'status', width: 200 },
  { title: 'Состав', key: 'containers', width: 140 },
  { title: 'Прогресс', key: 'progress', width: 130 },
  { title: '', key: 'action', width: 100, align: 'right' as const },
]

const statusLabel = (status: number) =>
  IMPORT40_STATUSES.find((s) => s.id === status)?.short || 'Неизвестно'
const declCount = (c: Import40CaseDto) => c.declarations.length
const progress = (c: Import40CaseDto) => Math.round((c.status / 8) * 100)

const metrics = computed(() => [
  { label: 'Всего', value: String(cases.value.length) },
  { label: 'В работе', value: String(cases.value.filter((c) => c.status < 8).length) },
  { label: 'Проблемные', value: String(cases.value.filter((c) => c.isProblem).length) },
  { label: 'Выполнено', value: String(cases.value.filter((c) => c.status === 8).length) },
])

const filteredCases = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return cases.value
  return cases.value.filter((c) =>
    [c.clientName, c.cargo, c.post, statusLabel(c.status)].join(' ').toLowerCase().includes(q),
  )
})

const syncClientName = () => {
  draft.clientName = clientOptions.value.find((o) => o.value === draft.clientId)?.label || ''
}

const reload = async () => {
  loading.value = true
  try {
    cases.value = tab.value === 'my' ? await import40Api.myTasks() : await import40Api.list()
  } finally {
    loading.value = false
  }
}

const loadClients = async () => {
  clientsLoading.value = true
  try {
    const clients = await import40Api.listClients()
    clientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
    if (isClientRole.value && clients.length) {
      draft.clientId = clients[0].id
      draft.clientName = clients[0].username
    }
  } finally {
    clientsLoading.value = false
  }
}

const createCase = async () => {
  if (!canSubmit.value) return
  creating.value = true
  try {
    const created = await import40Api.create({
      clientId: draft.clientId!,
      clientName: draft.clientName,
      cargo: draft.cargo.trim(),
      post: draft.post.trim(),
    })
    message.success('Заявка создана')
    router.push(`/import-40/${created.id}`)
  } catch {
    message.error('Не удалось создать заявку')
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void reload()
  if (canCreate.value) void loadClients()
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
  border: 1px solid var(--atg-line);
  border-top: 3px solid var(--atg-teal);
  background: var(--atg-surface);
  border-radius: var(--atg-radius-lg);
  padding: 16px 20px;
  box-shadow: var(--atg-shadow);
}

.summary-card span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-card strong {
  display: block;
  margin-top: 8px;
  color: var(--atg-ink);
  font-size: 26px;
  font-weight: 800;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.case-cell span {
  color: var(--atg-muted);
  font-size: 12.5px;
}

.status-chip {
  display: inline-flex;
  border-radius: 999px;
  background: var(--atg-teal-soft);
  color: var(--atg-accent-strong);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
}

.problem-chip {
  display: inline-flex;
  margin-left: 6px;
  border-radius: 999px;
  background: rgba(184, 74, 60, 0.12);
  color: #b84a3c;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
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
