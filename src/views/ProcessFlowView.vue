<template>
  <div class="process-flow-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Тестовый блок</div>
        <h1 class="crm-page-title">Операционный процесс</h1>
        <p class="crm-page-subtitle">
          Черновой блок по логической схеме: от заявки клиента до подачи декларации.
          Реестр, документы и API не затрагиваются.
        </p>
      </div>
      <div class="crm-page-actions">
        <span class="crm-stat-badge">
          <BranchesOutlined />
          Этапов:&nbsp;<span class="crm-stat-badge-count">{{ steps.length }}</span>
        </span>
      </div>
    </div>

    <section class="process-hero">
      <div>
        <span class="test-pill">Sandbox</span>
        <h2>Контроль таможенного оформления</h2>
        <p>
          Блок собирает ключевые действия менеджера, декларанта и операционной команды
          в одну последовательность, чтобы быстро видеть, кто и что должен сделать.
        </p>
      </div>
      <div class="process-summary">
        <div v-for="metric in metrics" :key="metric.label" class="metric-card">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </div>
    </section>

    <section class="case-workspace">
      <a-card class="crm-shell-card intake-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileAddOutlined />
            Новая тестовая заявка
          </div>
        </template>

        <div class="intake-grid">
          <label>
            <span>Клиент</span>
            <a-input v-model:value="draft.client" placeholder="Например: TOO Client" />
          </label>
          <label>
            <span>Груз</span>
            <a-input v-model:value="draft.cargo" placeholder="Описание груза" />
          </label>
          <label>
            <span>Направление / пост</span>
            <a-input v-model:value="draft.direction" placeholder="Китай - Алматы, пост" />
          </label>
          <label>
            <span>Транспорт</span>
            <a-select
              v-model:value="draft.transport"
              :options="transportOptions"
              placeholder="Выберите транспорт"
            />
          </label>
          <label>
            <span>Метод оформления</span>
            <a-select
              v-model:value="draft.method"
              :options="methodOptions"
              placeholder="Метод"
            />
          </label>
          <a-button
            type="primary"
            class="create-case-btn"
            :disabled="!canCreateCase"
            @click="createCase"
          >
            <PlusOutlined />
            Создать
          </a-button>
        </div>
      </a-card>

      <a-card class="crm-shell-card cases-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FolderOpenOutlined />
            Тестовые заявки
          </div>
        </template>

        <div class="case-tools">
          <a-input
            v-model:value="caseSearch"
            allow-clear
            placeholder="Поиск по клиенту, грузу, посту"
          >
            <template #prefix>
              <SearchOutlined />
            </template>
          </a-input>
        </div>

        <div v-if="cases.length === 0" class="empty-cases">
          Создай первую тестовую заявку, чтобы пройти процесс по этапам.
        </div>

        <div v-else-if="filteredCases.length === 0" class="empty-cases">
          По такому запросу тестовых заявок нет.
        </div>

        <a-table
          v-else
          :columns="caseColumns"
          :data-source="filteredCases"
          :pagination="filteredCases.length > 5 ? { pageSize: 5, showSizeChanger: false } : false"
          row-key="id"
          size="small"
          class="case-table"
          :row-class-name="getCaseRowClass"
          :scroll="{ x: 720 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'client'">
              <div class="case-client-cell">
                <strong>{{ record.client }}</strong>
                <span>{{ record.cargo }}</span>
              </div>
            </template>

            <template v-else-if="column.key === 'stage'">
              <span class="stage-chip">{{ getStepTitle(record.stageNumber) }}</span>
            </template>

            <template v-else-if="column.key === 'owner'">
              <span>{{ getCurrentOwner(record) }}</span>
            </template>

            <template v-else-if="column.key === 'status'">
              <span class="status-chip" :class="getStatusClass(getCurrentStatus(record))">
                {{ getCurrentStatus(record) }}
              </span>
            </template>

            <template v-else-if="column.key === 'progress'">
              <div class="table-progress">
                <a-progress
                  :percent="getCaseProgress(record)"
                  :show-info="false"
                  stroke-color="#c89535"
                />
                <span>{{ getCaseProgress(record) }}%</span>
              </div>
            </template>

            <template v-else-if="column.key === 'action'">
              <a-button size="small" @click="selectCase(record.id)">
                Открыть
              </a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </section>

    <section v-if="activeCase" class="active-case-panel">
      <div class="active-case-main">
        <span class="test-pill">Активная заявка</span>
        <h2>{{ activeCase.client }}</h2>
        <p>{{ activeCase.cargo }} · {{ activeCase.direction }} · {{ activeCase.transport }}</p>
      </div>
      <div class="active-case-controls">
        <label>
          <span>Текущий этап</span>
          <a-select
            :value="activeCase.stageNumber"
            :options="stageOptions"
            @change="setActiveStage"
          />
        </label>
        <a-progress
          :percent="activeProgress"
          :show-info="false"
          stroke-color="#c89535"
        />
      </div>
    </section>

    <a-card
      v-if="activeCase"
      class="crm-shell-card operations-card"
      :bordered="false"
    >
      <template #title>
        <div class="card-title">
          <AuditOutlined />
          Операционная карточка
        </div>
      </template>

      <div class="operations-grid">
        <label>
          <span>Код ТН ВЭД</span>
          <a-input
            :value="activeCase.tnvedCode"
            placeholder="Например: 8708..."
            @change="updateActiveCaseField('tnvedCode', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span>Цена / инвойс</span>
          <a-input
            :value="activeCase.invoicePrice"
            placeholder="Например: 12 500 USD"
            @change="updateActiveCaseField('invoicePrice', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span>Налоги / пошлина</span>
          <a-input
            :value="activeCase.taxPayment"
            placeholder="Например: 3 200 000 KZT"
            @change="updateActiveCaseField('taxPayment', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span>Номер декларации</span>
          <a-input
            :value="activeCase.declarationNumber"
            placeholder="После подачи"
            @change="updateActiveCaseField('declarationNumber', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span>Дедлайн</span>
          <input
            :value="activeCase.dueDate"
            class="native-input"
            type="date"
            @input="updateActiveCaseField('dueDate', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span>Срочность</span>
          <a-select
            :value="activeCase.priority"
            :options="priorityOptions"
            @change="updateActiveCaseField('priority', $event)"
          />
        </label>
      </div>

      <div class="operations-summary">
        <div
          v-for="item in activeCaseSummary"
          :key="item.label"
          class="summary-item"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value || 'Не заполнено' }}</strong>
        </div>
      </div>
    </a-card>

    <section class="process-timeline" aria-label="Этапы процесса">
      <article
        v-for="step in steps"
        :key="step.number"
        class="process-step"
        :class="{ active: selectedStep.number === step.number }"
        @click="selectStageFromTimeline(step)"
      >
        <div class="step-index">{{ step.number }}</div>
        <div>
          <span>{{ step.kicker }}</span>
          <strong>{{ step.title }}</strong>
        </div>
      </article>
    </section>

    <div class="process-grid">
      <a-card class="crm-shell-card process-detail-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <component :is="selectedStep.icon" />
            {{ selectedStep.title }}
          </div>
        </template>

        <p class="detail-description">{{ selectedStep.description }}</p>

        <div class="detail-block">
          <h3>Что уточняем</h3>
          <ul>
            <li v-for="item in selectedStep.questions" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="detail-block">
          <h3>Результат этапа</h3>
          <ul>
            <li v-for="item in selectedStep.outputs" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div v-if="activeCase" class="stage-control">
          <div class="stage-control-head">
            <div>
              <h3>Контроль выполнения</h3>
              <p>Отмечай пункты по выбранному этапу для активной тестовой заявки.</p>
            </div>
            <span>{{ selectedStageProgress }}%</span>
          </div>

          <div class="stage-checks">
            <label
              v-for="item in selectedStep.questions"
              :key="item"
              class="stage-check"
            >
              <a-checkbox
                :checked="isStageItemChecked(item)"
                @change="toggleStageItem(item)"
              />
              <span>{{ item }}</span>
            </label>
          </div>

          <div class="stage-meta-grid">
            <label>
              <span>Ответственный</span>
              <a-select
                :value="getStageOwner(selectedStep.number)"
                :options="ownerOptions"
                placeholder="Выберите"
                @change="setStageOwner"
              />
            </label>
            <label>
              <span>Статус этапа</span>
              <a-select
                :value="getStageStatus(selectedStep.number)"
                :options="stageStatusOptions"
                placeholder="Выберите"
                @change="setStageStatus"
              />
            </label>
          </div>

          <label class="stage-note">
            <span>Заметка по этапу</span>
            <textarea
              :value="getStageNote(selectedStep.number)"
              rows="3"
              placeholder="Например: ожидаем сканы с границы, клиент подтвердил оплату..."
              @input="setStageNote(($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </div>
      </a-card>

      <aside class="team-panel">
        <a-card
          v-for="member in team"
          :key="member.name"
          class="team-card"
          :bordered="false"
        >
          <div class="team-card-head">
            <div class="team-avatar">{{ member.initials }}</div>
            <div>
              <h3>{{ member.name }}</h3>
              <span>{{ member.role }}</span>
            </div>
          </div>
          <ul>
            <li v-for="task in member.tasks" :key="task">{{ task }}</li>
          </ul>
        </a-card>
      </aside>
    </div>

    <a-card class="crm-shell-card checklist-card" :bordered="false">
      <template #title>
        <div class="card-title">
          <CheckCircleOutlined />
          Контрольный список перед подачей
        </div>
      </template>

      <div class="checklist-grid">
        <label v-for="item in finalChecklist" :key="item" class="check-item">
          <a-checkbox
            :checked="isChecklistChecked(item)"
            :disabled="!activeCase"
            @change="toggleChecklist(item)"
          />
          <span>{{ item }}</span>
        </label>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, type Component } from 'vue'
import {
  AuditOutlined,
  BranchesOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  FileProtectOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FormOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue'

type ProcessStep = {
  number: string
  kicker: string
  title: string
  description: string
  icon: Component
  questions: string[]
  outputs: string[]
}

type TestCase = {
  id: string
  client: string
  cargo: string
  direction: string
  transport: string
  method: string
  stageNumber: string
  checklist: string[]
  stageChecks: Record<string, string[]>
  stageOwners: Record<string, string>
  stageStatuses: Record<string, string>
  stageNotes: Record<string, string>
  tnvedCode: string
  invoicePrice: string
  taxPayment: string
  declarationNumber: string
  dueDate: string
  priority: string
  createdAt: string
}

const steps: ProcessStep[] = [
  {
    number: '01',
    kicker: 'Действие №1',
    title: 'Заявка и груз',
    description:
      'Фиксируем вводные от клиента: что везем, куда оформляем, каким транспортом и по какому методу.',
    icon: FileTextOutlined,
    questions: [
      'Наименование, состав, характеристика и назначение груза',
      'Направление и таможенный пост оформления',
      'Тип транспорта: тент, реф, площадка, трал, вагон или самолет',
      'Метод оформления: 1 или 6',
      'Договор и исходные условия сотрудничества',
    ],
    outputs: [
      'Есть полное описание груза',
      'Понятны маршрут, пост и транспорт',
      'Определен метод оформления',
    ],
  },
  {
    number: '02',
    kicker: 'Действие №2',
    title: 'Расходы и КП',
    description:
      'Собираем расходы, рассчитываем налоги и формируем коммерческое предложение для клиента.',
    icon: CalculatorOutlined,
    questions: [
      'Расходы от Ерсина',
      'Расчет налогов и пошлин',
      'Нетарифные требования и возможная сертификация',
      'Цена клиента и условия оплаты',
    ],
    outputs: [
      'Клиент получил информацию по налогам',
      'Согласована цена',
      'Сформированы требования по нетарифке',
    ],
  },
  {
    number: '03',
    kicker: 'Действие №3',
    title: 'Договор и группа',
    description:
      'После согласования создается рабочая коммуникация с клиентом, бухгалтерией и декларантом.',
    icon: FormOutlined,
    questions: [
      'Договор клиента',
      'Операционист клиента',
      'Бухгалтер клиента',
      'Ответственный декларант',
    ],
    outputs: [
      'Создана WhatsApp-группа',
      'Участники процесса подключены',
      'Обмен информацией идет в одном канале',
    ],
  },
  {
    number: '04',
    kicker: 'Действие №4',
    title: 'Подача декларации',
    description:
      'Финальный операционный этап: сбор документов, контроль оплаты, прохождение контроля и подача декларации.',
    icon: FileProtectOutlined,
    questions: [
      'Сканы документов с границы',
      'Готовность набора в секторе',
      'Оплата налогов клиентом',
      'Виды контроля на посту',
    ],
    outputs: [
      'Документы обработаны',
      'Машина размещена на СВХ',
      'Декларация подана после получения сканов',
    ],
  },
]

const selectedStep = ref(steps[0])

const storageKey = 'atg-process-flow-test-cases'

const draft = reactive({
  client: '',
  cargo: '',
  direction: '',
  transport: undefined as string | undefined,
  method: undefined as string | undefined,
})

const cases = ref<TestCase[]>([])
const activeCaseId = ref<string | null>(null)
const caseSearch = ref('')

const transportOptions = [
  { label: 'Тент', value: 'Тент' },
  { label: 'Реф', value: 'Реф' },
  { label: 'Площадка', value: 'Площадка' },
  { label: 'Трал', value: 'Трал' },
  { label: 'Вагон', value: 'Вагон' },
  { label: 'Самолет', value: 'Самолет' },
]

const methodOptions = [
  { label: 'Метод 1', value: 'Метод 1' },
  { label: 'Метод 6', value: 'Метод 6' },
]

const stageOptions = computed(() =>
  steps.map((step) => ({
    label: `${step.number} · ${step.title}`,
    value: step.number,
  })),
)

const ownerOptions = [
  { label: 'Фурхат', value: 'Фурхат' },
  { label: 'Айнур', value: 'Айнур' },
  { label: 'Ерсин', value: 'Ерсин' },
  { label: 'Менеджер клиента', value: 'Менеджер клиента' },
]

const stageStatusOptions = [
  { label: 'Не начат', value: 'Не начат' },
  { label: 'В работе', value: 'В работе' },
  { label: 'Ожидаем клиента', value: 'Ожидаем клиента' },
  { label: 'Готово', value: 'Готово' },
]

const priorityOptions = [
  { label: 'Обычная', value: 'Обычная' },
  { label: 'Срочная', value: 'Срочная' },
  { label: 'Критичная', value: 'Критичная' },
]

const activeCase = computed(() =>
  cases.value.find((item) => item.id === activeCaseId.value) || null,
)

const filteredCases = computed(() => {
  const query = caseSearch.value.trim().toLowerCase()
  if (!query) return cases.value

  return cases.value.filter((item) =>
    [item.client, item.cargo, item.direction, item.transport, item.method]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

const activeProgress = computed(() => {
  const index = steps.findIndex((step) => step.number === activeCase.value?.stageNumber)
  return index >= 0 ? Math.round(((index + 1) / steps.length) * 100) : 0
})

const selectedStageProgress = computed(() => {
  if (!activeCase.value) return 0
  const checks = activeCase.value.stageChecks?.[selectedStep.value.number] || []
  return Math.round((checks.length / selectedStep.value.questions.length) * 100)
})

const metrics = computed(() => [
  { label: 'Основные этапы', value: String(steps.length) },
  { label: 'Тестовые заявки', value: String(cases.value.length) },
  { label: 'Прогресс', value: activeCase.value ? `${activeProgress.value}%` : 'Тест' },
])

const activeCaseSummary = computed(() => {
  if (!activeCase.value) return []

  return [
    { label: 'ТН ВЭД', value: activeCase.value.tnvedCode },
    { label: 'Инвойс', value: activeCase.value.invoicePrice },
    { label: 'Платеж', value: activeCase.value.taxPayment },
    { label: 'Декларация', value: activeCase.value.declarationNumber },
    { label: 'Дедлайн', value: activeCase.value.dueDate },
    { label: 'Срочность', value: activeCase.value.priority },
  ]
})

const canCreateCase = computed(
  () =>
    draft.client.trim().length > 1 &&
    draft.cargo.trim().length > 1 &&
    draft.direction.trim().length > 1 &&
    Boolean(draft.transport) &&
    Boolean(draft.method),
)

const caseColumns = [
  {
    title: 'Заявка',
    key: 'client',
    width: 220,
  },
  {
    title: 'Этап',
    key: 'stage',
    width: 150,
  },
  {
    title: 'Ответственный',
    key: 'owner',
    width: 140,
  },
  {
    title: 'Статус',
    key: 'status',
    width: 150,
  },
  {
    title: 'Прогресс',
    key: 'progress',
    width: 120,
  },
  {
    title: '',
    key: 'action',
    width: 92,
    align: 'right' as const,
  },
]

const team = [
  {
    name: 'Айнур',
    initials: 'А',
    role: 'Декларант / расчет',
    tasks: [
      'Собирает и обрабатывает документы по грузу',
      'Предоставляет обновленный платеж по налогам',
      'Готовит предварительный набор в секторе',
      'Направляет нулевку и информацию по нетарифке',
    ],
  },
  {
    name: 'Ерсин',
    initials: 'Е',
    role: 'Операционный контроль на границе',
    tasks: [
      'Заранее созванивается с водителем',
      'Проводит машину по видам контроля',
      'Размещает машину на СВХ',
      'Сканирует документы груза и машины',
    ],
  },
  {
    name: 'Фурхат',
    initials: 'Ф',
    role: 'Контроль процесса',
    tasks: [
      'Добивается своевременной оплаты налогов',
      'Контролирует брокера и декларанта',
      'Уточняет виды контроля на посту',
      'Согласовывает дополнительные расходы с клиентом',
    ],
  },
]

const finalChecklist = [
  'Определен код ТН ВЭД',
  'Проверена цена или подготовлена нулевка',
  'Проверены запреты, ограничения и сертификация',
  'Рассчитаны НДС и пошлина',
  'Получены сканы документов с границы',
  'Клиент оплатил налоги',
]

const getStepTitle = (stageNumber: string) =>
  steps.find((step) => step.number === stageNumber)?.title || 'Без этапа'

const getCurrentOwner = (item: TestCase) =>
  item.stageOwners?.[item.stageNumber] || 'Не назначен'

const getCurrentStatus = (item: TestCase) =>
  item.stageStatuses?.[item.stageNumber] || 'Не начат'

const getStatusClass = (status: string) => ({
  'status-new': status === 'Не начат',
  'status-work': status === 'В работе',
  'status-wait': status === 'Ожидаем клиента',
  'status-done': status === 'Готово',
})

const getCaseProgress = (item: TestCase) => {
  const total = finalChecklist.length + steps.reduce((sum, step) => sum + step.questions.length, 0)
  const checked =
    item.checklist.length +
    steps.reduce((sum, step) => sum + (item.stageChecks?.[step.number]?.length || 0), 0)

  return total ? Math.round((checked / total) * 100) : 0
}

const getCaseRowClass = (record: TestCase) =>
  record.id === activeCaseId.value ? 'case-table-row-active' : ''

const saveCases = () => {
  window.localStorage.setItem(storageKey, JSON.stringify(cases.value))
}

const selectCase = (id: string) => {
  activeCaseId.value = id
  const current = activeCase.value
  if (current) {
    selectedStep.value =
      steps.find((step) => step.number === current.stageNumber) || selectedStep.value
  }
}

const createCase = () => {
  if (!canCreateCase.value) return

  const item: TestCase = {
    id: `${Date.now()}`,
    client: draft.client.trim(),
    cargo: draft.cargo.trim(),
    direction: draft.direction.trim(),
    transport: draft.transport || '',
    method: draft.method || '',
    stageNumber: '01',
    checklist: [],
    stageChecks: {},
    stageOwners: {},
    stageStatuses: {},
    stageNotes: {},
    tnvedCode: '',
    invoicePrice: '',
    taxPayment: '',
    declarationNumber: '',
    dueDate: '',
    priority: 'Обычная',
    createdAt: new Date().toISOString(),
  }

  cases.value = [item, ...cases.value]
  selectCase(item.id)

  draft.client = ''
  draft.cargo = ''
  draft.direction = ''
  draft.transport = undefined
  draft.method = undefined
}

const setActiveStage = (stageNumber: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)
  activeCase.value.stageNumber = stageNumber
  selectedStep.value = steps.find((step) => step.number === stageNumber) || selectedStep.value
}

const selectStageFromTimeline = (step: ProcessStep) => {
  selectedStep.value = step
  if (activeCase.value) {
    setActiveStage(step.number)
  }
}

const isChecklistChecked = (item: string) =>
  Boolean(activeCase.value?.checklist.includes(item))

const toggleChecklist = (item: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)

  if (activeCase.value.checklist.includes(item)) {
    activeCase.value.checklist = activeCase.value.checklist.filter((value) => value !== item)
  } else {
    activeCase.value.checklist = [...activeCase.value.checklist, item]
  }
}

const ensureCaseShape = (item: TestCase) => {
  item.stageChecks ||= {}
  item.stageOwners ||= {}
  item.stageStatuses ||= {}
  item.stageNotes ||= {}
  item.checklist ||= []
  item.tnvedCode ||= ''
  item.invoicePrice ||= ''
  item.taxPayment ||= ''
  item.declarationNumber ||= ''
  item.dueDate ||= ''
  item.priority ||= 'Обычная'
}

const updateActiveCaseField = (field: keyof TestCase, value: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)
  ;(activeCase.value[field] as string) = value
}

const isStageItemChecked = (item: string) =>
  Boolean(activeCase.value?.stageChecks?.[selectedStep.value.number]?.includes(item))

const toggleStageItem = (item: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)

  const stageNumber = selectedStep.value.number
  const current = activeCase.value.stageChecks[stageNumber] || []

  activeCase.value.stageChecks[stageNumber] = current.includes(item)
    ? current.filter((value) => value !== item)
    : [...current, item]
}

const getStageOwner = (stageNumber: string) => activeCase.value?.stageOwners?.[stageNumber]

const getStageStatus = (stageNumber: string) =>
  activeCase.value?.stageStatuses?.[stageNumber] || 'Не начат'

const getStageNote = (stageNumber: string) => activeCase.value?.stageNotes?.[stageNumber] || ''

const setStageOwner = (owner: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)
  activeCase.value.stageOwners[selectedStep.value.number] = owner
}

const setStageStatus = (status: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)
  activeCase.value.stageStatuses[selectedStep.value.number] = status
}

const setStageNote = (note: string) => {
  if (!activeCase.value) return
  ensureCaseShape(activeCase.value)
  activeCase.value.stageNotes[selectedStep.value.number] = note
}

onMounted(() => {
  try {
    const saved = window.localStorage.getItem(storageKey)
    cases.value = saved ? JSON.parse(saved) : []
    cases.value.forEach(ensureCaseShape)
    activeCaseId.value = cases.value[0]?.id || null
    if (activeCase.value) {
      selectedStep.value =
        steps.find((step) => step.number === activeCase.value?.stageNumber) || selectedStep.value
    }
  } catch {
    cases.value = []
  }
})

watch(cases, saveCases, { deep: true })
</script>

<style scoped>
.process-flow-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 20px;
  scroll-margin-top: 84px;
}

.process-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 18px;
  align-items: stretch;
  padding: 22px;
  border: 1px solid rgba(200, 149, 53, 0.3);
  border-radius: var(--atg-radius-lg);
  background:
    linear-gradient(135deg, rgba(17, 20, 19, 0.96), rgba(39, 50, 44, 0.94)),
    var(--atg-ink);
  color: #fff8ea;
  box-shadow: var(--atg-shadow-md);
}

.test-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(245, 211, 141, 0.35);
  border-radius: 999px;
  color: #f5d38d;
  background: rgba(200, 149, 53, 0.12);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.process-hero h2 {
  max-width: 720px;
  margin: 14px 0 8px;
  color: #fff8ea;
  font-size: clamp(26px, 2.4vw, 38px);
  line-height: 1.08;
  font-weight: 800;
}

.process-hero p {
  max-width: 700px;
  margin: 0;
  color: rgba(255, 248, 234, 0.74);
  font-size: 15px;
  line-height: 1.7;
}

.process-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-self: end;
}

.metric-card {
  min-height: 82px;
  padding: 13px;
  border: 1px solid rgba(245, 231, 201, 0.16);
  border-radius: var(--atg-radius);
  background: rgba(255, 248, 234, 0.06);
}

.metric-card span {
  display: block;
  color: rgba(255, 248, 234, 0.62);
  font-size: 12px;
  font-weight: 650;
}

.metric-card strong {
  display: block;
  margin-top: 10px;
  color: #f5d38d;
  font-size: 24px;
  line-height: 1;
}

.case-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 18px;
  align-items: start;
}

.intake-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.intake-grid label,
.active-case-controls label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.intake-grid label span,
.active-case-controls label span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 760;
}

.create-case-btn {
  min-height: 40px;
  border-color: var(--atg-ink) !important;
  background: var(--atg-ink) !important;
  font-weight: 750;
}

.create-case-btn:not(:disabled):hover {
  border-color: var(--atg-accent-strong) !important;
  background: var(--atg-accent-strong) !important;
}

.create-case-btn:disabled {
  color: rgba(17, 20, 19, 0.34) !important;
  border-color: var(--atg-line-strong) !important;
  background: var(--atg-surface-muted) !important;
  box-shadow: none !important;
}

.cases-card :deep(.ant-card-body) {
  padding: 14px;
}

.case-tools {
  margin-bottom: 12px;
}

.empty-cases {
  min-height: 134px;
  display: grid;
  place-items: center;
  padding: 18px;
  border: 1px dashed var(--atg-line-strong);
  border-radius: var(--atg-radius);
  color: var(--atg-muted);
  text-align: center;
  line-height: 1.5;
}

.case-table {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  overflow: hidden;
}

.case-table :deep(.ant-table-thead > tr > th) {
  background: #f2eee6;
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 800;
}

.case-table :deep(.case-table-row-active > td) {
  background: #fff8ea !important;
}

.case-client-cell {
  min-width: 0;
}

.case-client-cell strong,
.case-client-cell span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-client-cell strong {
  color: var(--atg-ink);
  font-size: 13px;
  font-weight: 800;
}

.case-client-cell span {
  margin-top: 3px;
  color: var(--atg-muted);
  font-size: 12px;
}

.stage-chip,
.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.stage-chip {
  border: 1px solid rgba(200, 149, 53, 0.28);
  background: var(--atg-accent-soft);
  color: var(--atg-accent-strong);
}

.status-new {
  background: var(--atg-surface-muted);
  color: var(--atg-muted);
}

.status-work {
  background: #e3edf8;
  color: var(--atg-blue);
}

.status-wait {
  background: #fff1d6;
  color: #966100;
}

.status-done {
  background: var(--atg-green-soft);
  color: var(--atg-green);
}

.table-progress {
  display: grid;
  grid-template-columns: minmax(68px, 1fr) 38px;
  gap: 8px;
  align-items: center;
}

.table-progress span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 760;
}

.active-case-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.42fr);
  gap: 20px;
  align-items: center;
  padding: 18px;
  border: 1px solid var(--atg-line);
  border-left: 4px solid var(--atg-accent);
  border-radius: var(--atg-radius-lg);
  background: linear-gradient(135deg, #fffdfa, #f2eee6);
  box-shadow: var(--atg-shadow);
}

.active-case-main h2 {
  margin: 12px 0 5px;
  color: var(--atg-ink);
  font-size: 24px;
  line-height: 1.18;
  font-weight: 820;
}

.active-case-main p {
  margin: 0;
  color: var(--atg-muted);
  font-size: 14px;
  line-height: 1.55;
}

.active-case-controls {
  display: grid;
  gap: 12px;
}

.operations-card :deep(.ant-card-body) {
  padding: 18px;
}

.operations-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.operations-grid label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.operations-grid label span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 760;
}

.native-input {
  width: 100%;
  height: 40px;
  padding: 4px 11px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: var(--atg-text);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition:
    border-color var(--atg-transition),
    box-shadow var(--atg-transition);
}

.native-input:focus {
  border-color: var(--atg-accent);
  box-shadow: 0 0 0 2px rgba(200, 149, 53, 0.14);
}

.operations-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.summary-item {
  min-height: 68px;
  padding: 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: linear-gradient(135deg, #fffdfa, #f4f0e8);
}

.summary-item span,
.summary-item strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-item span {
  color: var(--atg-muted);
  font-size: 11px;
  font-weight: 760;
  text-transform: uppercase;
}

.summary-item strong {
  margin-top: 7px;
  color: var(--atg-ink);
  font-size: 13px;
  font-weight: 820;
}

.process-timeline {
  position: sticky;
  top: 76px;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 10px 0;
  background:
    linear-gradient(180deg, rgba(246, 245, 241, 0.98), rgba(246, 245, 241, 0.9)),
    var(--atg-bg);
  backdrop-filter: blur(10px);
}

.process-step {
  display: flex;
  gap: 12px;
  min-height: 96px;
  padding: 14px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
  box-shadow: var(--atg-shadow);
  cursor: pointer;
  transition:
    transform var(--atg-transition),
    border-color var(--atg-transition),
    box-shadow var(--atg-transition);
}

.process-step:hover,
.process-step.active {
  transform: translateY(-2px);
  border-color: rgba(200, 149, 53, 0.55);
  box-shadow: var(--atg-shadow-md);
}

.step-index {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--atg-ink);
  color: #f5d38d;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}

.process-step span {
  display: block;
  color: var(--atg-accent-strong);
  font-size: 11px;
  font-weight: 760;
  text-transform: uppercase;
}

.process-step strong {
  display: block;
  margin-top: 5px;
  color: var(--atg-ink);
  font-size: 15px;
  line-height: 1.35;
}

.process-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--atg-ink);
  font-weight: 780;
}

.card-title :deep(.anticon) {
  color: var(--atg-accent-strong);
}

.detail-description {
  margin: 0 0 18px;
  color: var(--atg-muted);
  font-size: 14px;
  line-height: 1.65;
}

.detail-block + .detail-block {
  margin-top: 18px;
}

.detail-block h3 {
  margin: 0 0 10px;
  color: var(--atg-charcoal);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

.detail-block ul,
.team-card ul {
  margin: 0;
  padding-left: 18px;
  color: var(--atg-text);
}

.detail-block li,
.team-card li {
  margin: 8px 0;
  line-height: 1.55;
}

.stage-control {
  margin-top: 22px;
  padding: 16px;
  border: 1px solid rgba(200, 149, 53, 0.26);
  border-radius: var(--atg-radius);
  background: linear-gradient(135deg, #fff8ea, #fffdfa);
}

.stage-control-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.stage-control-head h3 {
  margin: 0;
  color: var(--atg-ink);
  font-size: 15px;
  font-weight: 820;
}

.stage-control-head p {
  margin: 4px 0 0;
  color: var(--atg-muted);
  font-size: 12.5px;
  line-height: 1.45;
}

.stage-control-head > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--atg-ink);
  color: #f5d38d;
  font-size: 13px;
  font-weight: 850;
}

.stage-checks {
  display: grid;
  gap: 8px;
}

.stage-check {
  display: flex;
  gap: 10px;
  min-height: 42px;
  padding: 10px;
  border: 1px solid rgba(226, 221, 212, 0.9);
  border-radius: var(--atg-radius-sm);
  background: rgba(255, 255, 255, 0.65);
  color: var(--atg-text);
  line-height: 1.45;
}

.stage-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.stage-meta-grid label,
.stage-note {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.stage-meta-grid span,
.stage-note span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 760;
}

.stage-note {
  margin-top: 12px;
}

.stage-note textarea {
  width: 100%;
  min-height: 92px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: var(--atg-text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  transition:
    border-color var(--atg-transition),
    box-shadow var(--atg-transition);
}

.stage-note textarea:focus {
  border-color: var(--atg-accent);
  box-shadow: 0 0 0 2px rgba(200, 149, 53, 0.14);
}

.team-panel {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.team-card {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  box-shadow: var(--atg-shadow);
}

.team-card :deep(.ant-card-body) {
  padding: 16px;
}

.team-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.team-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--atg-accent-soft);
  border: 1px solid rgba(200, 149, 53, 0.28);
  color: var(--atg-accent-strong);
  font-size: 16px;
  font-weight: 850;
}

.team-card h3 {
  margin: 0;
  color: var(--atg-ink);
  font-size: 16px;
  line-height: 1.25;
}

.team-card span {
  display: block;
  margin-top: 3px;
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 650;
}

.checklist-card {
  margin-bottom: 4px;
}

.checklist-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.check-item {
  display: flex;
  gap: 10px;
  min-height: 48px;
  padding: 12px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
  color: var(--atg-text);
  line-height: 1.45;
}

@media (max-width: 1100px) {
  .process-hero,
  .case-workspace,
  .active-case-panel,
  .process-grid {
    grid-template-columns: 1fr;
  }

  .intake-grid,
  .operations-grid,
  .process-timeline,
  .checklist-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .operations-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .process-hero {
    padding: 18px;
  }

  .process-timeline {
    position: static;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .process-summary,
  .intake-grid,
  .operations-grid,
  .operations-summary,
  .stage-meta-grid,
  .process-timeline,
  .checklist-grid {
    grid-template-columns: 1fr;
  }

  .process-step {
    min-height: auto;
  }
}
</style>
