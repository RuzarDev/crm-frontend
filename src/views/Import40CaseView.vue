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
        <div class="grid-2">
          <label><span>Груз</span>
            <a-input :value="activeCase.cargo" :disabled="!canEditStep1" @change="(e: any) => saveField({ cargo: e.target.value })" />
          </label>
          <label><span>Пост</span>
            <a-input :value="activeCase.post" :disabled="!canEditStep1" @change="(e: any) => saveField({ post: e.target.value })" />
          </label>
        </div>
        <div class="grid-2">
          <label><span>Вид транспорта</span>
            <a-select :value="activeCase.transportMode" :options="IMPORT40_TRANSPORT_MODES" :disabled="!canEditStep1"
              style="width: 100%" @change="(v: number) => saveField({ transportMode: v })" />
          </label>
        </div>
        <div class="grid-2">
          <template v-if="activeCase.transportMode === 0">
            <label><span>Номер вагона</span><a-input :value="activeCase.wagonNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ wagonNumber: e.target.value })" /></label>
            <label><span>Станция</span><a-input :value="activeCase.station" :disabled="!canEditStep1" @change="(e: any) => saveField({ station: e.target.value })" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 1">
            <label><span>Машина</span><a-input :value="activeCase.vehicleNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ vehicleNumber: e.target.value })" /></label>
            <label><span>Прицеп</span><a-input :value="activeCase.trailerNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ trailerNumber: e.target.value })" /></label>
            <label><span>Водитель</span><a-input :value="activeCase.driverName" :disabled="!canEditStep1" @change="(e: any) => saveField({ driverName: e.target.value })" /></label>
            <label><span>Телефон</span><a-input :value="activeCase.driverPhone" :disabled="!canEditStep1" @change="(e: any) => saveField({ driverPhone: e.target.value })" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 2">
            <label><span>Рейс</span><a-input :value="activeCase.flightNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ flightNumber: e.target.value })" /></label>
            <label><span>AWB</span><a-input :value="activeCase.airWaybill" :disabled="!canEditStep1" @change="(e: any) => saveField({ airWaybill: e.target.value })" /></label>
          </template>
          <template v-else>
            <label><span>Судно</span><a-input :value="activeCase.vesselName" :disabled="!canEditStep1" @change="(e: any) => saveField({ vesselName: e.target.value })" /></label>
            <label><span>Коносамент</span><a-input :value="activeCase.billOfLading" :disabled="!canEditStep1" @change="(e: any) => saveField({ billOfLading: e.target.value })" /></label>
          </template>
        </div>

        <div class="sub-label">Контейнеры</div>
        <div v-for="c in activeCase.containers" :key="c.id" class="container-row">
          <strong>{{ c.containerNumber }}</strong><span class="muted">{{ c.containerType }}</span>
          <a-button v-if="canEditStep1" type="text" danger size="small" @click="removeContainer(c.id)">✕</a-button>
        </div>
        <div v-if="canEditStep1" class="container-add">
          <a-input v-model:value="newContainer.number" placeholder="Номер контейнера" style="max-width: 220px" />
          <a-input v-model:value="newContainer.type" placeholder="Тип (40HC…)" style="max-width: 140px" />
          <a-button :disabled="!newContainer.number.trim()" @click="addContainer">Добавить</a-button>
        </div>

        <div class="sub-label">Документы (инвойс, упаковочный, накладные)</div>
        <Import40FilesBlock
          :files="filesBySection('documents')"
          :can-upload="canEditStep1 || roleMode === 'admin'"
          :can-remove="canEditStep1"
          :uploading="uploading"
          empty-text="Прикрепите минимум один документ для отправки"
          @upload="(f: File) => uploadTo('documents', f)"
          @download="download"
          @remove="removeFile"
        />

        <div v-if="stepState(1) === 'current'" class="step-actions">
          <a-tooltip :title="can('client') ? '' : hintFor('client')">
            <a-button type="primary" :disabled="!can('client')" @click="runAction('submit-for-processing')">
              Отправить на оформление
            </a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="2" title="Граница" :state="stepState(2)" executor="менеджер КПП"
        :summary="stepState(2) === 'done' ? 'пройдена' : undefined">
        <p class="muted">Транспорт: {{ transportSummary }}</p>
        <div v-if="stepState(2) === 'current'" class="step-actions">
          <a-button v-if="roleMode === 'kpp' && !activeCase.assignedKppId" @click="runAction('claim')">Взять в работу</a-button>
          <a-tooltip :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="runAction('border-passed')">Граница пройдена</a-button>
          </a-tooltip>
          <a-tooltip :title="can('kpp') || can('declarant') ? '' : hintFor('kpp')">
            <a-button danger :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">Вернуть клиенту</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="3" title="Декларирование" :state="stepState(3)" executor="декларант"
        :summary="stepState(3) === 'done' ? `ДТ: ${activeCase.declarations.length}` : undefined">
        <div v-if="!activeCase.declarations.length" class="muted">ДТ ещё не создана</div>

        <div v-for="(dt, i) in activeCase.declarations" :key="dt.id" class="dt-row">
          <div class="dt-row-main">
            <strong>{{ dt.declarationNumber || `ДТ ${i + 1}` }}</strong>
            <span class="muted">товаров: {{ dt.goodsItems.length }}</span>
            <a-tag v-if="readiness[dt.id]" :color="readiness[dt.id].missing.length ? 'warning' : 'success'">
              {{ readiness[dt.id].filled }}/{{ readiness[dt.id].total }} полей
            </a-tag>
          </div>
          <div class="dt-row-actions">
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" @click="$router.push(`/import-40/${activeCase.id}/dt/${dt.id}`)">Заполнить</a-button>
            </a-tooltip>
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" :loading="xmlLoading === dt.id" @click="exportXml(dt.id)">XML для КЕДЕН</a-button>
            </a-tooltip>
            <a-popconfirm v-if="can('declarant')" title="Удалить ДТ?" ok-text="Да" cancel-text="Нет" @confirm="removeDt(dt.id)">
              <a-button size="small" type="text" danger>✕</a-button>
            </a-popconfirm>
          </div>
        </div>

        <a-alert v-if="kedenMissing.length" type="warning" show-icon class="keden-missing">
          <template #message>Для XML не хватает данных:</template>
          <template #description><ul><li v-for="m in kedenMissing" :key="m">{{ m }}</li></ul></template>
        </a-alert>

        <div v-if="stepState(3) === 'current'" class="step-actions">
          <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
            <a-button :disabled="!can('declarant')" @click="addDt">Добавить ДТ</a-button>
          </a-tooltip>
          <a-button v-if="roleMode === 'declarant' && !activeCase.assignedDeclarantId" @click="runAction('claim')">Взять в работу</a-button>
          <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
            <a-button type="primary" :disabled="!can('declarant') || !activeCase.declarations.length" @click="runAction('submit-declaration')">Подать ДТ</a-button>
          </a-tooltip>
          <a-tooltip :title="can('kpp') || can('declarant') ? '' : hintFor('declarant')">
            <a-button danger :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">Вернуть клиенту</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="4" title="Выпуск ДТ" :state="stepState(4)" executor="декларант"
        :summary="stepState(4) === 'done' ? 'выпущена' : undefined">
        <p class="muted">ДТ подана в КЕДЕН. После выпуска зафиксируйте его здесь.</p>
        <div v-if="stepState(4) === 'current'" class="step-actions">
          <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
            <a-button type="primary" :disabled="!can('declarant')" @click="runAction('release-declaration')">Зафиксировать выпуск</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="5" title="СВХ и счёт" :state="stepState(5)" executor="менеджер КПП"
        :summary="stepState(5) === 'done' ? (activeCase.svhInvoiceNote ? `счёт: ${activeCase.svhInvoiceNote}` : 'закрыт') : undefined">
        <div class="sub-label">Закрытая ДТ (штамп)</div>
        <Import40FilesBlock :files="filesBySection('declaration-stamp')" :can-upload="stepState(5) === 'current' && can('kpp')"
          :uploading="uploading" empty-text="Штамп не загружен"
          @upload="(f: File) => uploadTo('declaration-stamp', f)" @download="download" />
        <div class="sub-label">Счёт СВХ <a-tag v-if="activeCase.svhInvoiceNote">{{ activeCase.svhInvoiceNote }}</a-tag></div>
        <Import40FilesBlock :files="filesBySection('svh-invoice')" :can-upload="stepState(5) === 'current' && can('kpp')"
          :uploading="uploading" empty-text="Счёт не выставлен"
          @upload="(f: File) => uploadTo('svh-invoice', f)" @download="download" />
        <div v-if="stepState(5) === 'current'" class="step-actions">
          <a-tooltip v-if="activeCase.status === 4" :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="runAction('close-svh')">Закрыть ДТ на СВХ</a-button>
          </a-tooltip>
          <a-tooltip v-if="activeCase.status === 5" :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="promptInvoice">Выставить счёт СВХ</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="6" title="Оплата" :state="stepState(6)" executor="клиент и КПП"
        :summary="stepState(6) === 'done' ? 'оплачена' : undefined">
        <div class="sub-label">Чек оплаты
          <a-tag v-if="activeCase.paymentConfirmed" color="success">подтверждена</a-tag>
          <a-tag v-else-if="filesBySection('payment-check').length" color="processing">на проверке</a-tag>
        </div>
        <Import40FilesBlock :files="filesBySection('payment-check')" :can-upload="stepState(6) === 'current' && can('client')"
          :uploading="uploading" empty-text="Клиент ещё не загрузил чек"
          @upload="(f: File) => uploadTo('payment-check', f)" @download="download" />
        <div v-if="stepState(6) === 'current'" class="step-actions">
          <a-tooltip :title="can('kpp') ? (filesBySection('payment-check').length ? '' : 'Клиент ещё не загрузил чек') : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp') || !filesBySection('payment-check').length"
              @click="runAction('confirm-payment-and-complete')">Подтвердить оплату и завершить</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="7" title="Выполнено" :state="stepState(7)">
        <template v-if="stepState(7) === 'current'">
          <p>Заявка выполнена. Все файлы и история — в секциях ниже.</p>
          <div class="grid-2">
            <div><span class="muted">ДТ:</span> {{ activeCase.declarations.length }}</div>
            <div><span class="muted">Файлов:</span> {{ files.length }}</div>
          </div>
        </template>
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
import { computed, h, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Input, message, Modal } from 'ant-design-vue'
import {
  IMPORT40_TRANSPORT_MODES,
  import40Api,
  type Import40Action,
  type Import40CaseDto,
  type Import40FileDto,
  type Import40FileSection,
  type KedenReadinessDto,
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
  void loadReadiness()
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

const canEditStep1 = computed(() => stepState(1) === 'current' && can('client'))

// Текстовые поля шага 1 сохраняются по blur/@change через saveField
const saveField = async (patch: Record<string, unknown>) => {
  if (!activeCase.value || !canEditStep1.value) return
  try {
    await import40Api.update(activeCase.value.id, patch as never)
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось сохранить')
  }
}

const newContainer = ref({ number: '', type: '' })
const addContainer = async () => {
  if (!activeCase.value) return
  await import40Api.addContainer(activeCase.value.id, {
    containerNumber: newContainer.value.number.trim(),
    containerType: newContainer.value.type.trim() || null,
    notes: null,
  } as never)
  newContainer.value = { number: '', type: '' }
  await reload()
}
const removeContainer = async (containerId: string) => {
  if (!activeCase.value) return
  await import40Api.deleteContainer(activeCase.value.id, containerId)
  await reload()
}

const TRANSPORT_LABELS = ['ЖД', 'Авто', 'Авиа', 'Море']
const transportSummary = computed(() => {
  const c = activeCase.value
  if (!c) return ''
  const kind = TRANSPORT_LABELS[c.transportMode] ?? '—'
  const detail = [c.wagonNumber, c.vehicleNumber, c.flightNumber, c.vesselName].filter(Boolean).join(', ')
  return `${kind}${detail ? ' · ' + detail : ''}`
})

const readiness = ref<Record<string, KedenReadinessDto>>({})
const xmlLoading = ref<string | null>(null)
const kedenMissing = ref<string[]>([])

// readiness виден только сотрудникам (эндпоинт клиенту 404) — молча пропускаем
const loadReadiness = async () => {
  const c = activeCase.value
  if (!c || roleMode.value === 'client' || roleMode.value === 'other') return
  for (const dt of c.declarations) {
    try {
      readiness.value[dt.id] = await import40Api.kedenReadiness(c.id, dt.id)
    } catch {
      /* нет прав или сеть — тег просто не показываем */
    }
  }
}

const addDt = async () => {
  if (!activeCase.value) return
  await import40Api.createDeclaration(activeCase.value.id, {})
  await reload()
}

const removeDt = async (dtId: string) => {
  if (!activeCase.value) return
  await import40Api.deleteDeclaration(activeCase.value.id, dtId)
  await reload()
}

const exportXml = async (dtId: string) => {
  if (!activeCase.value) return
  xmlLoading.value = dtId
  kedenMissing.value = []
  try {
    const res = await import40Api.downloadKedenXml(activeCase.value.id, dtId)
    if ('errors' in res) {
      kedenMissing.value = res.errors
      message.warning('XML не сформирован: заполните обязательные поля')
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success('XML сформирован')
  } finally {
    xmlLoading.value = null
  }
}

const promptReturn = () => {
  let reason = ''
  Modal.confirm({
    title: 'Вернуть заявку клиенту',
    content: h(Input.TextArea, {
      rows: 3,
      placeholder: 'Причина возврата',
      onChange: (e: any) => (reason = e.target.value),
    }),
    okText: 'Вернуть',
    cancelText: 'Отмена',
    onOk: () => runAction('return-to-client', reason),
  })
}

const promptInvoice = () => {
  let amount = ''
  Modal.confirm({
    title: 'Выставить счёт СВХ',
    content: h(Input, {
      placeholder: 'Сумма счёта СВХ',
      onChange: (e: any) => (amount = e.target.value),
    }),
    okText: 'Выставить',
    cancelText: 'Отмена',
    onOk: () => runAction('issue-invoice', amount),
  })
}

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
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin-bottom: 10px;
}
.grid-2 label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--atg-muted);
}
.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-muted);
  margin: 12px 0 6px;
}
.container-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 4px;
}
.container-add {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.muted {
  color: var(--atg-muted);
}
.step-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.dt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--atg-line);
  flex-wrap: wrap;
}
.dt-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dt-row-actions {
  display: flex;
  gap: 6px;
}
.keden-missing {
  margin-top: 10px;
  border-radius: var(--atg-radius-lg);
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
