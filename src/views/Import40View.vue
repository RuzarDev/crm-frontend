<template>
  <div v-if="activeCase" class="import40-page crm-page">
    <input ref="fileInputRef" type="file" style="display: none" @change="onFileSelected" />

    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Импорт 40 · Заявка</div>
        <h1 class="crm-page-title">{{ activeCase.clientName }}</h1>
        <p class="crm-page-subtitle">{{ activeCase.cargo }} · {{ activeCase.post }}</p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="router.push('/import-40')"><LeftOutlined /> К списку</a-button>
        <a-button :loading="loading" @click="reload"><ReloadOutlined /> Обновить</a-button>
      </div>
    </div>

    <section class="case-board">
      <a-card class="crm-shell-card case-card" :bordered="false">
        <div class="case-head">
          <div class="case-status-row">
            <span class="status-chip">{{ statusLabel(activeCase.status) }}</span>
            <span class="case-phase">{{ statusPhase(activeCase.status) }}</span>
            <span v-if="activeCase.isProblem" class="problem-chip">Проблема: {{ activeCase.problemNote }}</span>
          </div>
          <span class="role-chip">{{ roleLabel }}</span>
        </div>

        <div class="case-meta">
          <div class="meta-item"><span>Контейнеров</span><strong>{{ activeCase.containers.length }}</strong></div>
          <div class="meta-item"><span>ДТ</span><strong>{{ declCount }}</strong></div>
          <div class="meta-item"><span>Водитель</span><strong>{{ activeCase.driverName || '—' }}</strong></div>
          <div class="meta-item"><span>Доверенность</span><strong>{{ activeCase.powerOfAttorneyGenerated ? 'есть' : '—' }}</strong></div>
        </div>

        <div class="case-progress">
          <a-progress :percent="progress" :show-info="false" stroke-color="#2BBCD4" />
          <span>Этап {{ activeCase.status }} из 8</span>
        </div>

        <div class="pipeline">
          <div
            v-for="s in statuses"
            :key="s.id"
            class="pipeline-step"
            :class="{ done: activeCase.status > s.id, active: activeCase.status === s.id }"
          >
            <span class="step-dot">
              <CheckOutlined v-if="activeCase.status > s.id" />
              <template v-else>{{ s.id + 1 }}</template>
            </span>
            <span class="step-label">{{ s.short }}</span>
          </div>
        </div>
      </a-card>

      <a-card class="crm-shell-card actions-card" :bordered="false">
        <template #title><div class="card-title"><ThunderboltOutlined /> Действия — {{ roleLabel }}</div></template>
        <p class="actions-help">{{ roleHelp }}</p>
        <div class="quick-actions">
          <a-button
            v-for="a in availableActions"
            :key="a.key"
            :type="a.primary ? 'primary' : 'default'"
            :danger="a.danger"
            :disabled="a.disabled"
            @click="runAction(a.key, a.prompt)"
          >
            {{ a.label }}
          </a-button>
          <span v-if="!availableActions.length" class="no-actions">Сейчас ход за другой ролью</span>
        </div>
      </a-card>
    </section>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane v-for="t in visibleTabs" :key="t.key" :tab="t.label" />
    </a-tabs>

    <!-- Контейнеры / ДТ -->
    <a-card v-if="activeTab === 'containers'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><GoldOutlined /> Контейнеры и ДТ</div></template>

      <div v-if="canEditContent" class="add-container">
        <a-input v-model:value="newContainer.number" placeholder="Номер контейнера" style="max-width: 240px" />
        <a-input v-model:value="newContainer.type" placeholder="Тип (40HC…)" style="max-width: 160px" />
        <a-button type="primary" :disabled="!newContainer.number.trim()" @click="addContainer">
          <PlusOutlined /> Контейнер
        </a-button>
      </div>

      <a-empty v-if="!activeCase.containers.length" description="Контейнеров пока нет" />

      <div v-for="cont in activeCase.containers" :key="cont.id" class="container-block">
        <div class="container-head">
          <div>
            <strong>{{ cont.containerNumber }}</strong>
            <span v-if="cont.containerType" class="container-type">{{ cont.containerType }}</span>
          </div>
          <div class="container-actions">
            <a-button v-if="canEditContent" size="small" @click="openDeclaration(cont.id)">
              <PlusOutlined /> ДТ
            </a-button>
            <a-popconfirm v-if="canEditContent" title="Удалить контейнер?" ok-text="Да" cancel-text="Нет" @confirm="removeContainer(cont.id)">
              <a-button size="small" type="text" danger><DeleteOutlined /></a-button>
            </a-popconfirm>
          </div>
        </div>

        <a-empty v-if="!cont.declarations.length" :image="false" description="ДТ нет" />
        <a-table
          v-else
          :columns="declColumns"
          :data-source="cont.declarations"
          :pagination="false"
          row-key="id"
          size="small"
          :scroll="{ x: 720 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'corridor'">
              <span class="corridor-chip" :class="`corridor-${record.corridor}`">{{ corridorLabel(record.corridor) }}</span>
            </template>
            <template v-else-if="column.key === 'tpin'">
              {{ money(record.dutyAmount) }} / {{ money(record.vatAmount) }} / {{ money(record.feesAmount) }}
            </template>
            <template v-else-if="column.key === 'act'">
              <a-button v-if="canEditDeclaration" size="small" type="link" @click="openDeclaration(cont.id, record)">Изм.</a-button>
              <a-popconfirm v-if="canEditContent" title="Удалить ДТ?" ok-text="Да" cancel-text="Нет" @confirm="removeDeclaration(cont.id, record.id)">
                <a-button size="small" type="link" danger>Удал.</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </div>
    </a-card>

    <!-- Транспорт и доверенность (клиент) -->
    <a-card v-if="activeTab === 'transport'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><CarOutlined /> Транспорт и доверенность</div></template>
      <div class="form-grid">
        <label><span>Машина / прицеп</span><a-input :value="activeCase.vehicleNumber" :disabled="!isClient" @change="updateField('vehicleNumber', $event)" /></label>
        <label><span>Водитель</span><a-input :value="activeCase.driverName" :disabled="!isClient" @change="updateField('driverName', $event)" /></label>
        <label><span>Телефон водителя</span><a-input :value="activeCase.driverPhone" :disabled="!isClient" @change="updateField('driverPhone', $event)" /></label>
      </div>
      <div class="flow-block">
        <div class="flow-block-head">
          <strong>Доверенность</strong>
          <a-tag v-if="activeCase.powerOfAttorneyGenerated" color="success">Загружена</a-tag>
          <a-tag v-else>Не загружена</a-tag>
        </div>
        <FileChips :items="filesBySection('power-of-attorney')" empty="Доверенность не загружена" @download="downloadFile" />
        <a-button v-if="isClient" type="primary" @click="triggerUpload('power-of-attorney')"><UploadOutlined /> Загрузить доверенность</a-button>
      </div>
    </a-card>

    <!-- СВХ / Оплата -->
    <a-card v-if="activeTab === 'finance'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><DollarOutlined /> СВХ и оплата</div></template>
      <div class="flow-blocks">
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Счёт СВХ</strong>
            <a-tag v-if="hasFile('svh-invoice')" color="processing">Выставлен</a-tag>
            <a-tag v-else>Не выставлен</a-tag>
          </div>
          <p v-if="activeCase.svhInvoiceNote" class="flow-sum">Сумма: <strong>{{ activeCase.svhInvoiceNote }}</strong></p>
          <FileChips :items="filesBySection('svh-invoice')" empty="" @download="downloadFile" />
          <a-button v-if="isKpp" @click="triggerUpload('svh-invoice')"><UploadOutlined /> Загрузить счёт СВХ</a-button>
        </div>
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Чек оплаты</strong>
            <a-tag v-if="activeCase.paymentConfirmed" color="success">Оплата подтверждена</a-tag>
            <a-tag v-else-if="hasFile('payment-check')" color="processing">На проверке</a-tag>
            <a-tag v-else>Ожидается</a-tag>
          </div>
          <FileChips :items="filesBySection('payment-check')" empty="" @download="downloadFile" />
          <a-button v-if="isClient && activeCase.status >= 6" type="primary" @click="triggerUpload('payment-check')"><UploadOutlined /> Загрузить чек</a-button>
        </div>
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Закрытая ДТ (штамп)</strong>
            <a-tag v-if="hasFile('declaration-stamp')" color="success">Загружена</a-tag>
            <a-tag v-else>Ожидается</a-tag>
          </div>
          <FileChips :items="filesBySection('declaration-stamp')" empty="" @download="downloadFile" />
          <a-button v-if="isKpp" @click="triggerUpload('declaration-stamp')"><UploadOutlined /> Загрузить штамп ДТ</a-button>
        </div>
      </div>
    </a-card>

    <!-- Документы -->
    <a-card v-if="activeTab === 'documents'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><FileProtectOutlined /> Документы заявки</div></template>
      <a-button v-if="isClient" type="primary" style="margin-bottom: 12px" @click="triggerUpload('documents')">
        <UploadOutlined /> Загрузить документ
      </a-button>
      <a-spin :spinning="filesLoading">
        <a-empty v-if="!files.length" description="Файлов нет" />
        <div v-else class="file-list">
          <div v-for="f in files" :key="f.id" class="file-item">
            <span class="file-section-tag">{{ sectionLabels[f.section] || f.section }}</span>
            <span class="file-name">{{ f.originalFileName }}</span>
            <a-button type="link" size="small" @click="downloadFile(f)"><DownloadOutlined /> Скачать</a-button>
            <a-popconfirm v-if="canDeleteFile(f)" title="Удалить файл?" ok-text="Да" cancel-text="Нет" @confirm="removeFile(f)">
              <a-button type="link" danger size="small"><DeleteOutlined /></a-button>
            </a-popconfirm>
          </div>
        </div>
      </a-spin>
    </a-card>

    <!-- История -->
    <a-card v-if="activeTab === 'history'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><HistoryOutlined /> История заявки</div></template>
      <div class="log-list">
        <div v-for="l in activeCase.logs" :key="l.id" class="log-item">
          <span>{{ formatTime(l.createdAtUtc) }}</span>
          <strong>{{ l.text }}</strong>
        </div>
      </div>
    </a-card>

    <!-- Модалка ДТ -->
    <a-modal v-model:open="declModalOpen" :title="declForm.id ? 'Редактировать ДТ' : 'Новая ДТ'" :confirm-loading="declSaving" @ok="saveDeclaration">
      <div class="decl-form">
        <label><span>Номер ДТ</span><a-input v-model:value="declForm.declarationNumber" placeholder="55301/…" /></label>
        <label><span>Коридор</span><a-select v-model:value="declForm.corridor" :options="corridorOptions" :disabled="!canEditDeclaration" /></label>
        <label><span>Код ТНВЭД</span><a-input v-model:value="declForm.commodityCode" /></label>
        <label><span>Описание</span><a-input v-model:value="declForm.cargoDescription" /></label>
        <label><span>Страна</span><a-input v-model:value="declForm.countryOfOrigin" /></label>
        <label><span>Стоимость / валюта</span>
          <a-input-group compact>
            <a-input-number v-model:value="declForm.invoiceValue" style="width: 70%" :min="0" />
            <a-input v-model:value="declForm.currency" style="width: 30%" placeholder="USD" />
          </a-input-group>
        </label>
        <label><span>Вес, кг</span><a-input-number v-model:value="declForm.weightKg" style="width: 100%" :min="0" /></label>
        <label><span>Пошлина</span><a-input-number v-model:value="declForm.dutyAmount" style="width: 100%" :min="0" /></label>
        <label><span>НДС</span><a-input-number v-model:value="declForm.vatAmount" style="width: 100%" :min="0" /></label>
        <label><span>Сборы</span><a-input-number v-model:value="declForm.feesAmount" style="width: 100%" :min="0" /></label>
        <label><span>СВХ (себест.)</span><a-input-number v-model:value="declForm.svhCost" style="width: 100%" :min="0" /></label>
      </div>
    </a-modal>

    <!-- Модалка ввода значения для действия (вместо window.prompt) -->
    <a-modal v-model:open="promptModal.open" :title="promptModal.title" ok-text="Подтвердить" cancel-text="Отмена" @ok="confirmPromptAction">
      <label class="prompt-field">
        <span>{{ promptModal.label }}</span>
        <a-input v-model:value="promptModal.value" autofocus @press-enter="confirmPromptAction" />
      </label>
    </a-modal>
  </div>

  <a-spin v-else style="display: block; margin: 80px auto" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  CarOutlined,
  CheckOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownloadOutlined,
  FileProtectOutlined,
  GoldOutlined,
  HistoryOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue'
import {
  import40Api,
  IMPORT40_STATUSES,
  type Import40Action,
  type Import40CaseDto,
  type Import40DeclarationDto,
  type Import40FileDto,
  type Import40FileSection,
} from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import FileChips from '@/components/Import40FileChips.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const statuses = IMPORT40_STATUSES
const activeCase = ref<Import40CaseDto | null>(null)
const files = ref<Import40FileDto[]>([])
const filesLoading = ref(false)
const loading = ref(false)
const activeTab = ref('containers')

type RoleMode = 'client' | 'kpp' | 'declarant' | 'admin'
const roleMode = computed<RoleMode>(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  if (sys === 'administrator') return 'admin'
  if (sys === 'client' || biz === 'client') return 'client'
  if (biz === 'kpp') return 'kpp'
  if (biz === 'declarant') return 'declarant'
  return 'admin'
})
const isClient = computed(() => roleMode.value === 'client')
const isKpp = computed(() => roleMode.value === 'kpp')
const isAdmin = computed(() => roleMode.value === 'admin')

const roleLabel = computed(
  () => ({ client: 'Клиент', kpp: 'Менеджер КПП', declarant: 'Декларант', admin: 'Администратор' })[roleMode.value],
)
const roleHelp = computed(
  () =>
    ({
      client: 'Заполните контейнеры/ДТ, транспорт, доверенность и отправьте заявку. Позже — оплата СВХ.',
      kpp: 'Проверка на границе, закрытие ДТ на СВХ, счёт клиенту, штамп закрытой ДТ.',
      declarant: 'Заполните ДТ (ТНВЭД, стоимость, ТПиН, коридор), подайте и зафиксируйте выпуск.',
      admin: 'Полный доступ ко всем действиям заявки.',
    })[roleMode.value],
)

const declCount = computed(
  () => activeCase.value?.containers.reduce((s, c) => s + c.declarations.length, 0) ?? 0,
)
const progress = computed(() => Math.round(((activeCase.value?.status ?? 0) / 8) * 100))

const statusLabel = (s: number) => statuses.find((x) => x.id === s)?.short || '—'
const statusPhase = (s: number) => statuses.find((x) => x.id === s)?.phase || ''

const corridorOptions = [
  { label: 'Зелёный', value: 'green' },
  { label: 'Жёлтый', value: 'yellow' },
  { label: 'Синий', value: 'blue' },
  { label: 'Красный', value: 'red' },
]
const corridorLabel = (c: string) => corridorOptions.find((o) => o.value === c)?.label || c
const money = (v: number | null) => (v == null ? '—' : new Intl.NumberFormat('ru-RU').format(v))

const sectionLabels: Record<Import40FileSection, string> = {
  documents: 'Документ',
  'power-of-attorney': 'Доверенность',
  'svh-invoice': 'Счёт СВХ',
  'payment-check': 'Чек оплаты',
  'declaration-stamp': 'Штамп ДТ',
}

const visibleTabs = computed(() => {
  const tabs = [{ key: 'containers', label: 'Контейнеры и ДТ' }]
  if (isClient.value || isAdmin.value) tabs.push({ key: 'transport', label: 'Транспорт и доверенность' })
  tabs.push({ key: 'finance', label: 'СВХ / Оплата' })
  tabs.push({ key: 'documents', label: 'Документы' })
  tabs.push({ key: 'history', label: 'История' })
  return tabs
})

// клиент редактирует контент только в черновике
const canEditContent = computed(
  () => isAdmin.value || (isClient.value && (activeCase.value?.status ?? 0) === 0),
)
const canEditDeclaration = computed(
  () => isAdmin.value || roleMode.value === 'declarant' || canEditContent.value,
)

const declColumns = [
  { title: 'Номер ДТ', dataIndex: 'declarationNumber', key: 'num', width: 160 },
  { title: 'ТНВЭД', dataIndex: 'commodityCode', key: 'code', width: 110 },
  { title: 'Коридор', key: 'corridor', width: 110 },
  { title: 'Пошлина/НДС/Сборы', key: 'tpin', width: 220 },
  { title: '', key: 'act', width: 130 },
]

const availableActions = computed(() => {
  const c = activeCase.value
  if (!c) return []
  const r = roleMode.value
  const list: { key: Import40Action; label: string; primary?: boolean; danger?: boolean; disabled?: boolean; prompt?: string }[] = []
  const can = (role: RoleMode) => r === 'admin' || r === role

  if (can('client') && c.status === 0)
    list.push({ key: 'submit-for-processing', label: 'Отправить на оформление', primary: true })
  if (can('kpp') && c.status === 1)
    list.push({ key: 'border-passed', label: 'Граница пройдена', primary: true })
  if (can('declarant') && c.status === 2)
    list.push({ key: 'submit-declaration', label: 'Подать ДТ', primary: true })
  if (can('declarant') && c.status === 3)
    list.push({ key: 'release-declaration', label: 'Зафиксировать выпуск', primary: true })
  if (can('kpp') && c.status === 4)
    list.push({ key: 'close-svh', label: 'Закрыть ДТ на СВХ', primary: true })
  if (can('kpp') && c.status === 5)
    list.push({ key: 'issue-invoice', label: 'Выставить счёт СВХ', primary: true, prompt: 'Сумма счёта СВХ' })
  if (can('client') && c.status === 6)
    list.push({ key: 'confirm-payment', label: 'Подтвердить оплату', primary: true })
  if (can('kpp') && c.status === 7)
    list.push({ key: 'complete', label: 'Груз выпущен (завершить)', primary: true })

  // проблема — КПП/декларант/админ, на активной заявке
  if ((r === 'kpp' || r === 'declarant' || r === 'admin') && c.status < 8) {
    if (c.isProblem) list.push({ key: 'clear-problem', label: 'Снять проблему' })
    else list.push({ key: 'set-problem', label: 'Запрос таможни / проблема', danger: true, prompt: 'Опишите проблему' })
  }
  return list
})

const reload = async () => {
  loading.value = true
  try {
    const id = String(route.params.id || '')
    activeCase.value = await import40Api.get(id)
    await loadFiles()
  } finally {
    loading.value = false
  }
}

const loadFiles = async () => {
  if (!activeCase.value) return
  filesLoading.value = true
  try {
    files.value = await import40Api.listFiles(activeCase.value.id)
  } finally {
    filesLoading.value = false
  }
}

const filesBySection = (s: Import40FileSection) => files.value.filter((f) => f.section === s)
const hasFile = (s: Import40FileSection) => filesBySection(s).length > 0

const roleBiz: Record<RoleMode, string> = { client: 'client', kpp: 'kpp', declarant: 'declarant', admin: '' }
const canDeleteFile = (f: Import40FileDto) =>
  isAdmin.value || f.uploadedByBusinessRole === roleBiz[roleMode.value]

const promptModal = reactive({
  open: false,
  title: '',
  label: '',
  value: '',
  action: null as Import40Action | null,
})

const runAction = async (action: Import40Action, prompt?: string) => {
  if (!activeCase.value) return
  if (prompt) {
    // действия, требующие ввода — через CRM-модалку, не window.prompt
    promptModal.action = action
    promptModal.title = prompt
    promptModal.label = prompt
    promptModal.value = ''
    promptModal.open = true
    return
  }
  await executeAction(action)
}

const confirmPromptAction = async () => {
  if (!promptModal.action) return
  const action = promptModal.action
  const value = promptModal.value.trim()
  promptModal.open = false
  await executeAction(action, value || undefined)
}

const executeAction = async (action: Import40Action, value?: string) => {
  if (!activeCase.value) return
  try {
    activeCase.value = await import40Api.action(activeCase.value.id, action, value)
    await loadFiles()
    message.success('Готово')
  } catch {
    message.error('Действие недоступно')
  }
}

const updateField = async (field: 'vehicleNumber' | 'driverName' | 'driverPhone', e: Event) => {
  if (!activeCase.value) return
  const value = (e.target as HTMLInputElement).value
  activeCase.value = await import40Api.update(activeCase.value.id, { [field]: value })
}

// контейнеры
const newContainer = reactive({ number: '', type: '' })
const addContainer = async () => {
  if (!activeCase.value || !newContainer.number.trim()) return
  activeCase.value = await import40Api.addContainer(activeCase.value.id, {
    containerNumber: newContainer.number.trim(),
    containerType: newContainer.type.trim(),
  })
  newContainer.number = ''
  newContainer.type = ''
}
const removeContainer = async (cid: string) => {
  if (!activeCase.value) return
  activeCase.value = await import40Api.deleteContainer(activeCase.value.id, cid)
}

// ДТ модалка
const declModalOpen = ref(false)
const declSaving = ref(false)
const declContainerId = ref('')
const declForm = reactive<Record<string, unknown>>({})
const blankDecl = () => ({
  id: '',
  declarationNumber: '',
  corridor: 'green',
  commodityCode: '',
  cargoDescription: '',
  countryOfOrigin: '',
  invoiceValue: null,
  currency: '',
  weightKg: null,
  dutyAmount: null,
  vatAmount: null,
  feesAmount: null,
  svhCost: null,
})
const openDeclaration = (containerId: string, decl?: Import40DeclarationDto) => {
  declContainerId.value = containerId
  Object.assign(declForm, blankDecl(), decl ?? {})
  declModalOpen.value = true
}
const saveDeclaration = async () => {
  if (!activeCase.value) return
  declSaving.value = true
  try {
    const payload = {
      declarationNumber: declForm.declarationNumber as string,
      corridor: declForm.corridor as string,
      commodityCode: declForm.commodityCode as string,
      cargoDescription: declForm.cargoDescription as string,
      countryOfOrigin: declForm.countryOfOrigin as string,
      invoiceValue: declForm.invoiceValue as number | null,
      currency: declForm.currency as string,
      weightKg: declForm.weightKg as number | null,
      dutyAmount: declForm.dutyAmount as number | null,
      vatAmount: declForm.vatAmount as number | null,
      feesAmount: declForm.feesAmount as number | null,
      svhCost: declForm.svhCost as number | null,
    }
    if (declForm.id) {
      activeCase.value = await import40Api.updateDeclaration(
        activeCase.value.id,
        declContainerId.value,
        declForm.id as string,
        payload,
      )
    } else {
      activeCase.value = await import40Api.addDeclaration(activeCase.value.id, declContainerId.value, payload)
    }
    declModalOpen.value = false
  } catch {
    message.error('Не удалось сохранить ДТ')
  } finally {
    declSaving.value = false
  }
}
const removeDeclaration = async (containerId: string, declarationId: string) => {
  if (!activeCase.value) return
  activeCase.value = await import40Api.deleteDeclaration(activeCase.value.id, containerId, declarationId)
}

// файлы
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingSection = ref<Import40FileSection | null>(null)
const triggerUpload = (section: Import40FileSection) => {
  pendingSection.value = section
  fileInputRef.value?.click()
}
const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const section = pendingSection.value
  input.value = ''
  if (!file || !section || !activeCase.value) return
  try {
    await import40Api.uploadFile(activeCase.value.id, section, file)
    message.success(`${sectionLabels[section]}: загружено`)
    activeCase.value = await import40Api.get(activeCase.value.id)
    await loadFiles()
  } catch {
    message.error('Не удалось загрузить файл')
  } finally {
    pendingSection.value = null
  }
}
const downloadFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  const blob = await import40Api.downloadFile(activeCase.value.id, f.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = f.originalFileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
const removeFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  await import40Api.deleteFile(activeCase.value.id, f.id)
  await loadFiles()
}

const formatTime = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(v))

watch(visibleTabs, (tabs) => {
  if (tabs.length && !tabs.some((t) => t.key === activeTab.value)) activeTab.value = tabs[0].key
})

onMounted(reload)
</script>

<style scoped>
.import40-page { display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }

.case-board { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr); gap: 18px; align-items: start; }
.case-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.case-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.case-phase { color: var(--atg-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.status-chip { display: inline-flex; min-height: 24px; align-items: center; padding: 2px 10px; border-radius: 999px; color: var(--atg-accent-strong); background: var(--atg-accent-soft, rgba(43,188,212,0.12)); font-size: 12px; font-weight: 800; }
.problem-chip { display: inline-flex; padding: 2px 10px; border-radius: 999px; background: rgba(184,74,60,0.12); color: #b84a3c; font-size: 12px; font-weight: 700; }
.role-chip { display: inline-flex; align-items: center; min-height: 32px; padding: 2px 12px; border-radius: 999px; border: 1px solid rgba(43,188,212,0.4); background: rgba(43,188,212,0.1); color: var(--atg-accent-strong); font-size: 13px; font-weight: 800; }

.case-meta { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 16px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); background: var(--atg-surface-muted, #f6f8fb); }
.meta-item { display: grid; gap: 4px; min-width: 0; }
.meta-item span { color: var(--atg-muted); font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
.meta-item strong { color: var(--atg-ink); font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.case-progress { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.case-progress :deep(.ant-progress) { flex: 1; margin: 0; }
.case-progress span { flex-shrink: 0; color: var(--atg-muted); font-size: 12px; font-weight: 700; }

.pipeline { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.pipeline-step { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); background: #fff; }
.step-dot { display: grid; place-items: center; flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; background: var(--atg-surface-muted, #eef1f6); color: var(--atg-muted); font-size: 11px; font-weight: 800; }
.step-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--atg-muted); font-size: 12px; font-weight: 700; }
.pipeline-step.done .step-dot, .pipeline-step.active .step-dot { background: var(--atg-accent); color: #fff; }
.pipeline-step.done .step-label, .pipeline-step.active .step-label { color: var(--atg-ink); }
.pipeline-step.active { border-color: var(--atg-accent); box-shadow: 0 0 0 3px rgba(43,188,212,0.15); }

.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
.actions-card { position: sticky; top: 76px; }
.actions-help { margin: 0 0 12px; color: var(--atg-muted); font-size: 13px; line-height: 1.55; }
.quick-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.quick-actions .ant-btn { justify-content: flex-start; }
.no-actions { color: var(--atg-muted); font-size: 13px; }

.add-container { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.container-block { border: 1px solid var(--atg-line); border-radius: var(--atg-radius); padding: 12px 14px; margin-bottom: 12px; }
.container-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.container-head strong { font-size: 14px; font-weight: 800; color: var(--atg-ink); }
.container-type { margin-left: 8px; color: var(--atg-muted); font-size: 12px; }
.container-actions { display: flex; gap: 6px; }

.corridor-chip { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; }
.corridor-green { color: #286b4b; background: #dcebe3; }
.corridor-yellow { color: #8a6500; background: #fff1c7; }
.corridor-blue { color: #255f8f; background: #e3edf8; }
.corridor-red { color: #fff; background: #b84a3c; }

.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-bottom: 16px; }
.form-grid label, .decl-form label { display: flex; flex-direction: column; gap: 6px; }
.form-grid label span, .decl-form label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }

.flow-blocks { display: grid; gap: 14px; }
.flow-block { display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.flow-block-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.flow-block-head strong { color: var(--atg-ink); font-size: 13.5px; font-weight: 800; }
.flow-sum { margin: 0; font-size: 14px; color: var(--atg-ink); }
.flow-block .ant-btn { justify-self: start; }

.decl-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.prompt-field { display: flex; flex-direction: column; gap: 6px; }
.prompt-field span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }

.file-list { display: grid; gap: 8px; }
.file-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.file-section-tag { font-size: 11px; font-weight: 800; color: var(--atg-accent-strong); background: var(--atg-accent-soft, rgba(43,188,212,0.1)); padding: 2px 8px; border-radius: 6px; }
.file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

.log-list { display: grid; gap: 8px; }
.log-item { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 9px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.log-item span { color: var(--atg-muted); font-size: 12px; font-weight: 700; }
.log-item strong { color: var(--atg-ink); font-size: 13px; font-weight: 700; }

@media (max-width: 1180px) {
  .case-board { grid-template-columns: 1fr; }
  .actions-card { position: static; }
  .pipeline { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .case-meta, .form-grid, .decl-form { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
</style>
