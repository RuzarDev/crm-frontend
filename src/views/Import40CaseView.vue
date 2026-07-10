<template>
  <div v-if="activeCase" class="case-page">
    <!-- Шапка -->
    <a-card class="crm-shell-card" :bordered="false">
      <div class="case-head">
        <div class="case-head-main">
          <h2>{{ activeCase.cargo || 'Заявка Импорт 40' }}</h2>
          <div class="case-meta">
            <span>Клиент: <strong>{{ activeCase.clientName }}</strong></span>
            <span>Пост: <strong>{{ activeCase.post || '—' }}</strong></span>
            <span v-if="activeCase.assignedKppId">КПП: <a-tag>назначен</a-tag></span>
            <span v-if="activeCase.assignedDeclarantId">Декларант: <a-tag>назначен</a-tag></span>
          </div>
        </div>
        <div class="case-head-step">
          <div class="step-counter">Шаг {{ currentStep }} из 7</div>
          <div class="step-name">{{ STEP_TITLES[currentStep - 1] }}</div>
        </div>
      </div>
    </a-card>

    <!-- Баннеры -->
    <a-alert
      v-if="activeCase.isProblem"
      type="error"
      show-icon
      class="case-banner"
      message="Запрос таможни / проблема"
      :description="activeCase.problemNote || undefined"
    >
      <template #action>
        <a-button v-if="can('kpp') || can('declarant')" size="small" @click="runAction('clear-problem')">
          Снять проблему
        </a-button>
      </template>
    </a-alert>
    <a-alert
      v-if="activeCase.returnReason && activeCase.status === 0"
      type="warning"
      show-icon
      class="case-banner"
      message="Заявка возвращена клиенту"
      :description="activeCase.returnReason"
    />

    <!-- Лестница шагов -->
    <div class="steps">
      <Import40Step :index="1" title="Заявка и документы" :state="stepState(1)" executor="клиент" :summary="step1Summary">
        <div class="step-placeholder">Содержимое шага — Task 4</div>
      </Import40Step>
      <Import40Step :index="2" title="Граница" :state="stepState(2)" executor="менеджер КПП">
        <div class="step-placeholder">Содержимое шага — Task 4</div>
      </Import40Step>
      <Import40Step :index="3" title="Декларирование" :state="stepState(3)" executor="декларант"
        :summary="stepState(3) === 'done' ? `ДТ: ${activeCase.declarations.length}` : undefined">
        <div class="step-placeholder">Содержимое шага — Task 5</div>
      </Import40Step>
      <Import40Step :index="4" title="Выпуск ДТ" :state="stepState(4)" executor="декларант">
        <div class="step-placeholder">Содержимое шага — Task 5</div>
      </Import40Step>
      <Import40Step :index="5" title="СВХ и счёт" :state="stepState(5)" executor="менеджер КПП"
        :summary="stepState(5) === 'done' && activeCase.svhInvoiceNote ? `счёт: ${activeCase.svhInvoiceNote}` : undefined">
        <div class="step-placeholder">Содержимое шага — Task 6</div>
      </Import40Step>
      <Import40Step :index="6" title="Оплата" :state="stepState(6)" executor="клиент и КПП">
        <div class="step-placeholder">Содержимое шага — Task 6</div>
      </Import40Step>
      <Import40Step :index="7" title="Выполнено" :state="stepState(7)">
        <div class="step-placeholder">Содержимое шага — Task 6</div>
      </Import40Step>
    </div>

    <!-- Низ: все файлы + история -->
    <a-collapse ghost class="case-bottom">
      <a-collapse-panel key="files" :header="`Все файлы (${files.length})`">
        <Import40FilesBlock :files="files" :can-upload="false" @download="download" />
      </a-collapse-panel>
      <a-collapse-panel key="history" header="История">
        <div v-for="l in activeCase.logs" :key="l.id" class="log-row">
          <span class="log-date">{{ new Date(l.createdAtUtc).toLocaleString('ru-RU') }}</span>
          <span>{{ l.text }}</span>
          <a-tag>{{ l.changedByBusinessRole }}</a-tag>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
  <a-spin v-else class="case-loading" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  import40Api,
  type Import40Action,
  type Import40CaseDto,
  type Import40FileDto,
  type Import40FileSection,
} from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import Import40Step from '@/components/Import40Step.vue'
import Import40FilesBlock from '@/components/Import40FilesBlock.vue'

const route = useRoute()
const authStore = useAuthStore()

const activeCase = ref<Import40CaseDto | null>(null)
const files = ref<Import40FileDto[]>([])
const uploading = ref(false)

type RoleMode = 'client' | 'kpp' | 'declarant' | 'admin' | 'other'
const roleMode = computed<RoleMode>(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  if (sys === 'administrator') return 'admin'
  if (sys === 'client' || biz === 'client') return 'client'
  if (biz === 'kpp') return 'kpp'
  if (biz === 'declarant' || biz === 'rop') return 'declarant'
  return 'other'
})
const can = (role: RoleMode) => roleMode.value === 'admin' || roleMode.value === role

const ROLE_LABELS: Record<string, string> = { client: 'клиент', kpp: 'менеджер КПП', declarant: 'декларант' }
const hintFor = (role: string) => `Действие выполняет ${ROLE_LABELS[role] ?? role}`

// Шаг ↔ статус (Paid=7 технический → шаг 6)
const stepForStatus = (s: number) =>
  s === 0 ? 1 : s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : s === 4 || s === 5 ? 5 : s === 6 || s === 7 ? 6 : 7
const currentStep = computed(() => (activeCase.value ? stepForStatus(activeCase.value.status) : 1))
const stepState = (n: number): 'done' | 'current' | 'future' =>
  n < currentStep.value ? 'done' : n === currentStep.value ? 'current' : 'future'

const STEP_TITLES = [
  'Заявка и документы',
  'Граница',
  'Декларирование',
  'Выпуск ДТ',
  'СВХ и счёт',
  'Оплата',
  'Выполнено',
]

const step1Summary = computed(() =>
  activeCase.value ? `${activeCase.value.cargo || '—'} · файлов: ${filesBySection('documents').length}` : undefined,
)

const reload = async () => {
  const id = String(route.params.id)
  activeCase.value = await import40Api.get(id)
  files.value = await import40Api.listFiles(id)
}

const filesBySection = (s: Import40FileSection | string) => files.value.filter((f) => f.section === s)

const runAction = async (key: Import40Action, value?: string) => {
  if (!activeCase.value) return
  try {
    await import40Api.action(activeCase.value.id, key, value)
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось выполнить действие')
  }
}

const uploadTo = async (section: Import40FileSection | string, file: File) => {
  if (!activeCase.value) return
  uploading.value = true
  try {
    await import40Api.uploadFile(activeCase.value.id, section as Import40FileSection, file)
    files.value = await import40Api.listFiles(activeCase.value.id)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось загрузить файл')
  } finally {
    uploading.value = false
  }
}

const download = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  const blob = await import40Api.downloadFile(activeCase.value.id, f.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.originalFileName
  a.click()
  URL.revokeObjectURL(url)
}

const removeFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  try {
    await import40Api.deleteFile(activeCase.value.id, f.id)
    files.value = await import40Api.listFiles(activeCase.value.id)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось удалить файл')
  }
}

// Используются в шагах (Tasks 4-6); экспорт заглушает предупреждения об unused до их подключения
void uploadTo
void removeFile
void hintFor

onMounted(() => void reload())
</script>

<style scoped>
.case-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.case-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.case-head-main h2 {
  margin: 0 0 6px;
}
.case-meta {
  display: flex;
  gap: 16px;
  color: var(--atg-muted);
  font-size: 13px;
  flex-wrap: wrap;
}
.case-head-step {
  text-align: right;
}
.step-counter {
  font-size: 20px;
  font-weight: 700;
  color: var(--atg-teal);
}
.step-name {
  color: var(--atg-muted);
  font-size: 13px;
}
.case-banner {
  border-radius: var(--atg-radius-lg);
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.step-placeholder {
  color: var(--atg-muted);
  font-size: 12px;
}
.case-bottom {
  background: transparent;
}
.log-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 4px;
  align-items: baseline;
}
.log-date {
  color: var(--atg-muted);
  font-size: 12px;
  white-space: nowrap;
}
.case-loading {
  display: block;
  margin: 60px auto;
}
</style>
