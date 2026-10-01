<template>
  <div class="keden-list-page crm-page">
    <PageHeader :kicker="t('transit.isKeden')" :title="t('transit.deklaraciiKeden')" :subtitle="t('transit.statusyDeklaraciySinhronizirovannyeS')">
      <template #actions>
        <a-button :loading="loading" @click="reload">{{ t('transit.obnovit') }}</a-button>
        <span class="crm-stat-badge">{{ t('transit.vsegoNbsp') }}<span class="crm-stat-badge-count">{{ total }}</span></span>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <ZFilterBar class="filters-row">
        <a-select
          v-model:value="typeFilter"
          allow-clear
          :placeholder="t('transit.tipDeklaracii')"
          :options="typeOptions"
          @change="reload"
        />
        <a-input
          v-model:value="search"
          allow-clear
          :placeholder="t('transit.poiskPoNomeruDeklarantu')"
          style="max-width: 360px"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
      </ZFilterBar>

      <ZTable
        :columns="columns"
        :data-source="filteredItems"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: false }"
        :scroll="{ x: 960 }"
        row-key="id"
      >
        <template #emptyText>
          <a-empty :description="t('transit.deklaraciyPokaNet')" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            {{ typeLabel(record.declarationType) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <span class="status-chip" :class="statusClass(record.statusCode)">
              {{ record.statusName || '—' }}
            </span>
          </template>
          <template v-else-if="column.key === 'statusDate'">
            {{ formatDate(record.statusDateTimeUtc) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button size="small" @click="router.push(`/keden/${record.id}`)">{{ t('transit.otkryt') }}</a-button>
          </template>
        </template>
      </ZTable>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { SearchOutlined } from '@ant-design/icons-vue'
import { kedenApi, KEDEN_DECLARATION_TYPES, type KedenDeclarationListItemDto } from '@/api/keden'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

const router = useRouter()
const loading = ref(false)
const items = ref<KedenDeclarationListItemDto[]>([])
const total = ref(0)
const search = ref('')
const typeFilter = ref<string | undefined>(undefined)

const typeOptions = KEDEN_DECLARATION_TYPES.map((t) => ({ value: t.key, label: t.label }))
const typeLabel = (type: string) => KEDEN_DECLARATION_TYPES.find((t) => t.key === type)?.label || type

const columns = computed(() => ([

  { title: t('transit.nomer'), dataIndex: 'registrationNumber', key: 'registrationNumber', width: 220 },
  { title: t('transit.tip'), key: 'type', width: 160 },
  { title: t('transit.deklarant'), dataIndex: 'declarantName', key: 'declarantName', width: 200 },
  { title: t('transit.status'), key: 'status', width: 180 },
  { title: t('transit.dataStatusa'), key: 'statusDate', width: 160 },
  { title: '', key: 'action', width: 100, align: 'right' as const },
]))
const formatDate = (iso: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—')

const statusClass = (code: string | null) => {
  switch (code) {
    case 'ACCEPTED':
    case 'RELEASED':
      return 'status-ok'
    case 'DRAFT':
      return 'status-draft'
    default:
      return ''
  }
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    [i.registrationNumber, i.declarantName, i.statusName, i.shortName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const reload = async () => {
  loading.value = true
  try {
    const response = await kedenApi.list({ type: typeFilter.value })
    items.value = response.items
    total.value = response.total
  } finally {
    loading.value = false
  }
}

onMounted(() => void reload())
</script>

<style scoped>
.keden-list-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.filters-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.status-chip {
  display: inline-flex;
  border-radius: 999px;
  background: var(--z-teal-soft);
  color: var(--z-teal-d);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
}

.status-chip.status-ok {
  background: rgba(43, 188, 148, 0.12);
  color: #1f8f6f;
}

.status-chip.status-draft {
  background: rgba(160, 160, 160, 0.15);
  color: #6b6b6b;
}
</style>
