<template>
  <div class="import40-page crm-page">
    <input ref="fileInputRef" type="file" style="display: none" @change="onFileSelected" />
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Импорт 40 · Заявка</div>
        <h1 class="crm-page-title">{{ activeCase ? activeCase.client : 'Импорт 40' }}</h1>
        <p v-if="activeCase" class="crm-page-subtitle">
          {{ activeCase.cargo }} · {{ activeCase.post }} · {{ activeCase.clientType }}
        </p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="router.push('/import-40')">
          <LeftOutlined />
          К списку
        </a-button>
        <a-button :loading="loading" @click="loadCases">
          <ReloadOutlined />
          Обновить
        </a-button>
      </div>
    </div>

    <section v-if="activeCase" class="case-board">
      <a-card class="crm-shell-card case-card" :bordered="false">
        <div class="case-head">
          <div class="case-status-row">
            <span class="status-chip">{{ currentStatus(activeCase).short }}</span>
            <span class="case-phase">{{ currentStatus(activeCase).phase }}</span>
            <span class="corridor-chip" :class="`corridor-${activeCase.corridor}`">
              {{ corridorLabel(activeCase.corridor) }}
            </span>
          </div>
          <div class="case-controls">
            <label v-if="canEditCorridor" class="side-field">
              <span>Коридор</span>
              <a-select
                :value="activeCase.corridor"
                :options="corridorOptions"
                class="corridor-select"
                @change="setCorridor"
              />
            </label>
            <div class="side-field">
              <span>Ваша роль</span>
              <span class="role-chip">{{ roleLabel }}</span>
            </div>
          </div>
        </div>

        <div class="case-meta">
          <div class="meta-item">
            <span>Груз</span>
            <strong>{{ activeCase.cargo || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>Пост / СВХ</span>
            <strong>{{ activeCase.post || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>Менеджер</span>
            <strong>{{ activeCase.manager || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>Номер ДТ</span>
            <strong>{{ activeCase.declarationNumber || '—' }}</strong>
          </div>
        </div>

        <div class="case-progress">
          <a-progress :percent="caseProgress(activeCase)" :show-info="false" stroke-color="#2BBCD4" />
          <span>Этап {{ activeCase.status }} из {{ statuses.length }}</span>
        </div>

        <div class="pipeline">
          <div
            v-for="status in statuses"
            :key="status.id"
            class="pipeline-step"
            :class="{ done: isStatusDone(status.id), active: activeCase.status === status.id }"
          >
            <span class="step-dot">
              <CheckOutlined v-if="isStatusDone(status.id)" />
              <template v-else>{{ status.id }}</template>
            </span>
            <span class="step-label">{{ status.short }}</span>
          </div>
        </div>
      </a-card>

      <a-card class="crm-shell-card actions-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <ThunderboltOutlined />
            Действия — {{ roleLabel }}
          </div>
        </template>
        <p class="actions-help">{{ roleHelpText }}</p>
        <div class="quick-actions">
          <a-button
            v-for="action in visibleActions"
            :key="action.key"
            :disabled="action.disabled"
            @click="runAction(action.key)"
          >
            <component :is="action.icon" />
            {{ action.label }}
          </a-button>
        </div>
        <div v-if="validationWarnings.length" class="validation-box">
          <strong>Для перехода на следующий этап</strong>
          <ul>
            <li v-for="warning in validationWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </div>
      </a-card>
    </section>

    <a-tabs v-if="activeCase" v-model:activeKey="activeTab" class="import-tabs">
      <a-tab-pane v-for="tab in visibleTabs" :key="tab.key" :tab="tab.label" />
    </a-tabs>

    <section v-if="activeCase" class="detail-grid">
      <a-card v-if="roleMode === 'legs' && activeTab === 'post'" class="crm-shell-card mobile-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <MobileOutlined />
            Мобильный режим “Ноги”
          </div>
        </template>

        <div class="mobile-actions">
          <a-button block @click="runAction('downloadPowerOfAttorney')">
            <DownloadOutlined />
            Скачать доверенность
          </a-button>
          <a-button block @click="runAction('photoControl')">
            <CameraOutlined />
            Фото контроля
          </a-button>
          <a-button block @click="runAction('uploadSvhInvoice')">
            <FileTextOutlined />
            Счет СВХ
          </a-button>
          <a-button block :disabled="activeCase.status < 9" @click="runAction('uploadClosedDeclaration')">
            <FileDoneOutlined />
            Закрытая ДТ
          </a-button>
        </div>
      </a-card>

      <a-card v-if="isClient && activeTab === 'offer'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileDoneOutlined />
            КП и договор
          </div>
        </template>

        <div class="flow-blocks">
          <div class="flow-block">
            <div class="flow-block-head">
              <strong>1. Коммерческое предложение</strong>
              <a-tag v-if="activeCase.clientAcceptedOffer" color="success">КП принято</a-tag>
              <a-tag v-else-if="activeCase.status >= 3" color="processing">Ожидает вашего решения</a-tag>
              <a-tag v-else>Готовится</a-tag>
            </div>
            <p v-if="activeCase.status >= 3 && activeCase.costCalculation" class="flow-sum">
              Стоимость услуг: <strong>{{ activeCase.costCalculation }}</strong>
            </p>
            <p v-else class="flow-hint">МПП готовит расчет стоимости — он появится здесь.</p>
            <FileChips :items="filesBySection('offer')" empty="" @download="downloadCaseFile" />
            <div class="flow-actions">
              <a-button
                type="primary"
                :disabled="activeCase.status < 3 || activeCase.clientAcceptedOffer"
                @click="runAction('acceptOffer')"
              >
                Принять КП
              </a-button>
              <a-button :disabled="!hasFile('offer')" @click="runAction('downloadOffer')">
                <DownloadOutlined />
                Скачать КП
              </a-button>
            </div>
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>2. Договор</strong>
              <a-tag v-if="activeCase.contractSigned" color="success">Заключен</a-tag>
              <a-tag v-else-if="hasFile('contract')" color="processing">Ожидает подписания</a-tag>
              <a-tag v-else>Готовится</a-tag>
            </div>
            <p class="flow-hint">
              Скачайте договор, подпишите и принесите в офис — после заключения менеджер отметит его в системе.
            </p>
            <FileChips :items="filesBySection('contract')" empty="" @download="downloadCaseFile" />
            <div class="flow-actions">
              <a-button :disabled="!hasFile('contract')" @click="runAction('downloadContract')">
                <DownloadOutlined />
                Скачать договор
              </a-button>
            </div>
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>3. Доверенность</strong>
              <a-tag v-if="activeCase.powerOfAttorneyReturned" color="success">Возвращена</a-tag>
              <a-tag v-else-if="activeCase.powerOfAttorneyGenerated" color="processing">Ожидает возврата</a-tag>
              <a-tag v-else>Готовится</a-tag>
            </div>
            <p class="flow-hint">
              Скачайте доверенность, подпишите и верните — нажмите «Вернуть подписанную», когда передадите её менеджеру.
            </p>
            <FileChips :items="filesBySection('power-of-attorney')" empty="" @download="downloadCaseFile" />
            <div class="flow-actions">
              <a-button :disabled="!hasFile('power-of-attorney')" @click="runAction('downloadPowerOfAttorney')">
                <DownloadOutlined />
                Скачать
              </a-button>
              <a-button
                :disabled="!activeCase.powerOfAttorneyGenerated || activeCase.powerOfAttorneyReturned"
                @click="runAction('returnPowerOfAttorney')"
              >
                Вернуть подписанную
              </a-button>
            </div>
          </div>
        </div>
      </a-card>

      <a-card v-if="canSeeCommercial && activeTab === 'commercial'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <CalculatorOutlined />
            Коммерческий блок
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>МПП</span>
            <a-select :value="activeCase.manager" :options="employeeOptions" @change="updateField('manager', $event)" />
          </label>
          <label>
            <span>Декларант</span>
            <a-select :value="activeCase.declarant" :options="employeeOptions" @change="updateField('declarant', $event)" />
          </label>
          <label>
            <span>Расчет стоимости</span>
            <a-input :value="activeCase.costCalculation" placeholder="Например: 850 000 KZT" @change="updateFromInput('costCalculation', $event)" />
          </label>
          <label>
            <span>Риск / комментарий</span>
            <a-input :value="activeCase.riskNote" placeholder="КТС, ГДУ, нетарифка..." @change="updateFromInput('riskNote', $event)" />
          </label>
        </div>

        <div class="flow-block files-inline">
          <div class="flow-block-head">
            <strong>Файл КП для клиента</strong>
          </div>
          <FileChips :items="filesBySection('offer')" empty="КП еще не загружено" @download="downloadCaseFile" />
        </div>
      </a-card>

      <a-card v-if="roleMode === 'rop' && activeTab === 'legal'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileProtectOutlined />
            Договор и доверенность
          </div>
        </template>

        <div class="flow-blocks">
          <div class="flow-block">
            <div class="flow-block-head">
              <strong>Договор</strong>
              <a-tag v-if="activeCase.contractSigned" color="success">Заключен</a-tag>
              <a-tag v-else-if="activeCase.clientAcceptedOffer" color="processing">Клиент принял КП</a-tag>
              <a-tag v-else>Ожидает КП</a-tag>
            </div>
            <p class="flow-hint">
              Загрузите договор — клиент скачает его, подпишет и принесет в офис. После заключения отметьте договор в действиях.
            </p>
            <FileChips :items="filesBySection('contract')" empty="Договор не загружен" @download="downloadCaseFile" />
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>Доверенность</strong>
              <a-tag v-if="activeCase.powerOfAttorneyReturned" color="success">Возвращена клиентом</a-tag>
              <a-tag v-else-if="activeCase.powerOfAttorneyGenerated" color="processing">Передана клиенту</a-tag>
              <a-tag v-else>Не сформирована</a-tag>
            </div>
            <p class="flow-hint">Загрузите доверенность — она станет доступна клиенту и ногам для скачивания.</p>
            <FileChips :items="filesBySection('power-of-attorney')" empty="Доверенность не загружена" @download="downloadCaseFile" />
          </div>
        </div>
      </a-card>

      <a-card v-if="roleMode === 'declarant' && activeTab === 'declare'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <ImportOutlined />
            Декларирование
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>Номер ДТ</span>
            <a-input :value="activeCase.declarationNumber" placeholder="55301/______/_______" @change="updateFromInput('declarationNumber', $event)" />
          </label>
          <label>
            <span>Риск / комментарий</span>
            <a-input :value="activeCase.riskNote" placeholder="КТС, ГДУ, нетарифка..." @change="updateFromInput('riskNote', $event)" />
          </label>
        </div>
        <p class="flow-hint">
          Укажите номер ДТ и подайте её через панель действий. Коридор меняется в шапке заявки.
        </p>
      </a-card>

      <a-card v-if="canSeeTransport && activeTab === 'post'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <CarOutlined />
            Транспорт
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>Машина / прицеп</span>
            <a-input :value="activeCase.vehicleNumber" placeholder="A 123 BC / прицеп" @change="updateFromInput('vehicleNumber', $event)" />
          </label>
          <label>
            <span>Водитель</span>
            <a-input :value="activeCase.driverName" placeholder="ФИО" @change="updateFromInput('driverName', $event)" />
          </label>
          <label>
            <span>Телефон водителя</span>
            <a-input :value="activeCase.driverPhone" placeholder="+7 ___ ___ __ __" @change="updateFromInput('driverPhone', $event)" />
          </label>
          <label>
            <span>Вид транспорта</span>
            <a-select :value="activeCase.transportType" :options="transportOptions" @change="updateField('transportType', $event)" />
          </label>
        </div>
      </a-card>

      <a-card v-if="activeTab === 'documents'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileProtectOutlined />
            {{ isClient ? 'Документы по заявке' : 'Документы и контроль' }}
          </div>
        </template>

        <div v-if="!isClient" class="document-grid">
          <label v-for="doc in documentTypes" :key="doc" class="doc-check">
            <a-checkbox :checked="activeCase.documents.includes(doc)" @change="toggleDocument(doc)" />
            <span>{{ doc }}</span>
          </label>
        </div>

        <div class="files-section">
          <div class="files-section-header">
            <strong>Файлы заявки</strong>
            <a-tag v-if="uploadingSection">Загрузка: {{ sectionLabels[uploadingSection] }}…</a-tag>
          </div>
          <a-spin :spinning="filesLoading">
            <a-empty v-if="!files.length" description="Файлов пока нет" />
            <div v-else class="file-list">
              <div v-for="file in files" :key="file.id" class="file-item">
                <span class="file-section-tag">{{ sectionLabels[file.section] || file.section }}</span>
                <span class="file-name">{{ file.originalFileName }}</span>
                <span class="file-meta">{{ formatLogTime(file.createdAtUtc) }}</span>
                <a-button type="link" size="small" @click="downloadCaseFile(file)">
                  <DownloadOutlined />
                  Скачать
                </a-button>
                <a-popconfirm
                  v-if="canDeleteFile(file)"
                  title="Удалить файл?"
                  ok-text="Да"
                  cancel-text="Нет"
                  @confirm="removeCaseFile(file)"
                >
                  <a-button type="link" danger size="small">
                    <DeleteOutlined />
                  </a-button>
                </a-popconfirm>
              </div>
            </div>
          </a-spin>
        </div>
      </a-card>

      <a-card v-if="isClient && activeTab === 'finance'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <DollarOutlined />
            СВХ и оплата
          </div>
        </template>

        <div class="flow-blocks">
          <div class="flow-block">
            <div class="flow-block-head">
              <strong>1. Счет СВХ</strong>
              <a-tag v-if="hasFile('svh-invoice')" color="processing">Выставлен</a-tag>
              <a-tag v-else>Еще не выставлен</a-tag>
            </div>
            <p v-if="activeCase.svhInvoice" class="flow-sum">
              К оплате: <strong>{{ activeCase.svhInvoice }}</strong>
            </p>
            <p class="flow-hint">Скачайте счет, оплатите его и загрузите чек об оплате.</p>
            <FileChips :items="filesBySection('svh-invoice')" empty="" @download="downloadCaseFile" />
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>2. Чек оплаты</strong>
              <a-tag v-if="activeCase.svhPaymentConfirmed" color="success">Оплата подтверждена</a-tag>
              <a-tag v-else-if="hasFile('payment-check')" color="processing">На проверке</a-tag>
              <a-tag v-else>Ожидается</a-tag>
            </div>
            <FileChips :items="filesBySection('payment-check')" empty="" @download="downloadCaseFile" />
            <div class="flow-actions">
              <a-button
                type="primary"
                :disabled="activeCase.status < 10"
                @click="runAction('confirmPayment')"
              >
                Загрузить чек оплаты
              </a-button>
            </div>
          </div>
        </div>
      </a-card>

      <a-card v-if="!isClient && activeTab === 'finance'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <DollarOutlined />
            СВХ и финансы
          </div>
        </template>

        <div class="flow-blocks">
          <div class="flow-block">
            <div class="flow-block-head">
              <strong>Счет СВХ</strong>
              <a-tag v-if="hasFile('svh-invoice')" color="processing">Выставлен</a-tag>
              <a-tag v-else>Не выставлен</a-tag>
            </div>
            <label v-if="roleMode === 'rop'" class="flow-field">
              <span>Сумма / № счета</span>
              <a-input :value="activeCase.svhInvoice" placeholder="№ счета / сумма" @change="updateFromInput('svhInvoice', $event)" />
            </label>
            <p v-else-if="activeCase.svhInvoice" class="flow-sum">
              Сумма: <strong>{{ activeCase.svhInvoice }}</strong>
            </p>
            <FileChips :items="filesBySection('svh-invoice')" empty="Счет не загружен" @download="downloadCaseFile" />
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>Оплата клиента</strong>
              <a-tag v-if="activeCase.svhPaymentConfirmed" color="success">Подтверждена</a-tag>
              <a-tag v-else-if="hasFile('payment-check')" color="processing">Чек на проверке</a-tag>
              <a-tag v-else>Ожидается</a-tag>
            </div>
            <FileChips :items="filesBySection('payment-check')" empty="Чек не загружен" @download="downloadCaseFile" />
          </div>

          <div class="flow-block">
            <div class="flow-block-head">
              <strong>Закрытая ДТ</strong>
              <a-tag v-if="activeCase.closedDeclarationUploaded" color="success">Загружена</a-tag>
              <a-tag v-else>Ожидается</a-tag>
            </div>
            <FileChips :items="filesBySection('closed-declaration')" empty="Закрытая ДТ не загружена" @download="downloadCaseFile" />
          </div>
        </div>
      </a-card>
    </section>

    <a-card v-if="activeCase && activeTab === 'history'" class="crm-shell-card log-card" :bordered="false">
      <template #title>
        <div class="card-title">
          <HistoryOutlined />
          Лог заявки
        </div>
      </template>

      <div class="log-list">
        <div v-for="item in activeCase.logs" :key="item.id" class="log-item">
          <span>{{ formatLogTime(item.createdAt) }}</span>
          <strong>{{ item.text }}</strong>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  CalculatorOutlined,
  CarOutlined,
  CheckOutlined,
  DollarOutlined,
  DownloadOutlined,
  CameraOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  DeleteOutlined,
  HistoryOutlined,
  ImportOutlined,
  LeftOutlined,
  MobileOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue'
import {
  import40Api,
  type Import40Action,
  type Import40CaseDto,
  type Import40FileDto,
  type Import40FileSection,
} from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import FileChips from '@/components/Import40FileChips.vue'

const route = useRoute()
const router = useRouter()

type ImportStatus = {
  id: number
  short: string
  phase: string
}

type Import40Case = {
  id: string
  clientId: string
  client: string
  clientType: 'Одноразовый' | 'Постоянный'
  cargo: string
  post: string
  manager: string
  declarant: string
  status: number
  corridor: 'green' | 'yellow' | 'blue' | 'red'
  costCalculation: string
  riskNote: string
  vehicleNumber: string
  driverName: string
  driverPhone: string
  transportType: string
  documents: string[]
  svhInvoice: string
  paymentCheck: string
  declarationNumber: string
  finalDeclarationFile: string
  powerOfAttorneyGenerated: boolean
  powerOfAttorneyReturned: boolean
  controlPhotosCount: number
  closedDeclarationUploaded: boolean
  ropApproved: boolean
  clientAcceptedOffer: boolean
  contractSigned: boolean
  svhPaymentConfirmed: boolean
  createdAt: string
  logs: { id: string; createdAt: string; text: string }[]
}

type EditableField =
  | 'client'
  | 'clientType'
  | 'cargo'
  | 'post'
  | 'manager'
  | 'declarant'
  | 'corridor'
  | 'costCalculation'
  | 'riskNote'
  | 'vehicleNumber'
  | 'driverName'
  | 'driverPhone'
  | 'transportType'
  | 'svhInvoice'
  | 'paymentCheck'
  | 'declarationNumber'
  | 'finalDeclarationFile'
type RoleMode = 'client' | 'rop' | 'sales' | 'legs' | 'declarant'
type ActionKey =
  | 'submitCalculation'
  | 'approveOffer'
  | 'acceptOffer'
  | 'signContract'
  | 'downloadPowerOfAttorney'
  | 'downloadContract'
  | 'downloadOffer'
  | 'downloadSvhInvoice'
  | 'returnPowerOfAttorney'
  | 'photoControl'
  | 'submitDeclaration'
  | 'releaseDeclaration'
  | 'uploadSvhInvoice'
  | 'confirmPayment'
  | 'verifyPayment'
  | 'uploadClosedDeclaration'
  | 'uploadOffer'
  | 'uploadContract'
  | 'uploadPowerOfAttorney'

const statuses: ImportStatus[] = [
  { id: 1, short: 'Черновик', phase: 'Коммерческий' },
  { id: 2, short: 'Расчет', phase: 'Коммерческий' },
  { id: 3, short: 'Согласование', phase: 'Коммерческий' },
  { id: 4, short: 'Договор', phase: 'Юридический' },
  { id: 5, short: 'Доверенность', phase: 'Юридический' },
  { id: 6, short: 'Транспорт', phase: 'Логистика' },
  { id: 7, short: 'Груз на посту', phase: 'Пост / СВХ' },
  { id: 8, short: 'Оформление ДТ', phase: 'Декларирование' },
  { id: 9, short: 'ДТ выпущена', phase: 'Декларирование' },
  { id: 10, short: 'Оплата СВХ', phase: 'Финансы' },
  { id: 11, short: 'Проверка оплаты', phase: 'Финансы' },
  { id: 12, short: 'Выполнено', phase: 'Архив' },
]

const cases = ref<Import40Case[]>([])
const activeCaseId = ref<string | null>(null)
const files = ref<Import40FileDto[]>([])
const filesLoading = ref(false)
const uploadingSection = ref<Import40FileSection | null>(null)
const pendingSection = ref<Import40FileSection | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const sectionLabels: Record<Import40FileSection, string> = {
  photo: 'Фото контроля',
  'svh-invoice': 'Счет СВХ',
  'payment-check': 'Чек оплаты',
  'closed-declaration': 'Закрытая ДТ',
  offer: 'Коммерческое предложение',
  contract: 'Договор',
  'power-of-attorney': 'Доверенность',
}
const authStore = useAuthStore()
const roleMode = ref<RoleMode>('rop')
const activeTab = ref('overview')
const loading = ref(false)

const canSeeCommercial = computed(() => ['rop', 'sales'].includes(roleMode.value))
const canSeeTransport = computed(() => ['client', 'legs', 'rop'].includes(roleMode.value))
const isClient = computed(() => roleMode.value === 'client')
const canEditCorridor = computed(() => ['rop', 'declarant'].includes(roleMode.value))
const visibleTabs = computed(() => {
  const tabs: { key: string; label: string }[] = []
  if (isClient.value) {
    tabs.push({ key: 'offer', label: 'КП и договор' })
    tabs.push({ key: 'post', label: 'Транспорт' })
    tabs.push({ key: 'finance', label: 'СВХ / Оплата' })
  } else {
    if (canSeeCommercial.value) tabs.push({ key: 'commercial', label: 'Коммерция' })
    if (roleMode.value === 'rop') tabs.push({ key: 'legal', label: 'Договор и доверенность' })
    if (canSeeTransport.value) tabs.push({ key: 'post', label: roleMode.value === 'legs' ? 'Пост' : 'Транспорт' })
    if (roleMode.value === 'declarant') tabs.push({ key: 'declare', label: 'Декларирование' })
    if (['rop', 'legs'].includes(roleMode.value)) tabs.push({ key: 'finance', label: 'СВХ / Оплата' })
  }
  tabs.push({ key: 'documents', label: 'Документы' })
  tabs.push({ key: 'history', label: 'История' })
  return tabs
})

watch(
  visibleTabs,
  (tabs) => {
    if (tabs.length && !tabs.some((tab) => tab.key === activeTab.value)) {
      activeTab.value = tabs[0].key
    }
  },
  { immediate: true },
)

const applyRoleFromLogin = () => {
  const businessRole = authStore.businessRole?.trim().toLowerCase()
  const systemRole = (authStore.role || '').trim().toLowerCase()
  if (businessRole === 'mpp') roleMode.value = 'sales'
  else if (businessRole === 'legs') roleMode.value = 'legs'
  else if (businessRole === 'declarant') roleMode.value = 'declarant'
  else if (businessRole === 'client') roleMode.value = 'client'
  else if (businessRole === 'rop') roleMode.value = 'rop'
  else if (systemRole === 'administrator') roleMode.value = 'rop'
  else if (systemRole === 'client') roleMode.value = 'client'
  else if (systemRole === 'importer') roleMode.value = 'sales'
}

const employeeOptions = [
  { label: 'Фурхат', value: 'Фурхат' },
  { label: 'Айнур', value: 'Айнур' },
  { label: 'Ерсин', value: 'Ерсин' },
  { label: 'Назначить позже', value: 'Назначить позже' },
]

const transportOptions = [
  { label: 'Тент / Штора', value: 'Тент / Штора' },
  { label: 'Рефрижератор', value: 'Рефрижератор' },
  { label: 'Изотерм', value: 'Изотерм' },
  { label: 'Контейнеровоз', value: 'Контейнеровоз' },
  { label: 'Малотоннажный / Бус', value: 'Малотоннажный / Бус' },
]

const corridorOptions = [
  { label: 'Зеленый', value: 'green' },
  { label: 'Желтый', value: 'yellow' },
  { label: 'Синий', value: 'blue' },
  { label: 'Красный', value: 'red' },
]

const documentTypes = [
  'Договор',
  'Доверенность клиента',
  'Техпаспорт',
  'Обязательство',
  'Фито',
  'Ветеринария',
  'Радиация',
  'Акт досмотра',
  'Счет СВХ',
  'Чек оплаты',
  'Выпущенная ДТ',
  'Закрытая ДТ',
]

const activeCase = computed(() => cases.value.find((item) => item.id === activeCaseId.value) || null)

const roleLabel = computed(
  () =>
    ({
      client: 'Клиент',
      rop: 'РОП',
      sales: 'Менеджер по продажам',
      legs: 'Ноги / пост',
      declarant: 'Декларант',
    })[roleMode.value],
)

const roleHelpText = computed(
  () =>
    ({
      client: 'Загружает транспортные данные, доверенность и чек оплаты.',
      rop: 'Назначает ответственных, утверждает тариф и договор.',
      sales: 'Ведет расчет стоимости, тарифы, риски и первичную коммуникацию.',
      legs: 'Работает с телефона на посту: доверенность, фото контроля, СВХ, закрытая ДТ.',
      declarant: 'Оформляет ДТ, фиксирует коридор, выпуск и итоговые файлы.',
    })[roleMode.value],
)

const validationWarnings = computed(() => {
  if (!activeCase.value || activeCase.value.status >= 12) return []
  return validateStatus(activeCase.value, Math.min(activeCase.value.status + 1, 12))
})

const visibleActions = computed(() => {
  if (!activeCase.value) return []

  const actions: {
    key: ActionKey
    label: string
    icon: object
    disabled?: boolean
  }[] = []

  if (roleMode.value === 'sales') {
    actions.push(
      { key: 'uploadOffer', label: 'Загрузить КП (файл)', icon: FileTextOutlined },
      {
        key: 'submitCalculation',
        label: 'Отправить расчет РОПу',
        icon: CalculatorOutlined,
        disabled: !activeCase.value.costCalculation,
      },
    )
  }

  if (roleMode.value === 'rop') {
    actions.push(
      {
        key: 'approveOffer',
        label: 'Утвердить тариф',
        icon: FileDoneOutlined,
        disabled: !activeCase.value.costCalculation || activeCase.value.ropApproved,
      },
      { key: 'uploadContract', label: 'Загрузить договор', icon: FileTextOutlined },
      {
        key: 'signContract',
        label: 'Отметить договор заключенным',
        icon: FileProtectOutlined,
        disabled: !activeCase.value.clientAcceptedOffer || activeCase.value.contractSigned,
      },
      { key: 'uploadPowerOfAttorney', label: 'Загрузить доверенность', icon: FileTextOutlined },
      {
        key: 'verifyPayment',
        label: 'Проверить оплату',
        icon: DollarOutlined,
        disabled: activeCase.value.status < 11,
      },
    )
  }

  if (roleMode.value === 'client') {
    actions.push(
      {
        key: 'downloadOffer',
        label: 'Скачать КП',
        icon: DownloadOutlined,
        disabled: !hasFile('offer'),
      },
      {
        key: 'acceptOffer',
        label: 'Принять КП',
        icon: FileDoneOutlined,
        disabled: activeCase.value.status < 3 || activeCase.value.clientAcceptedOffer,
      },
      {
        key: 'downloadContract',
        label: 'Скачать договор',
        icon: DownloadOutlined,
        disabled: !hasFile('contract'),
      },
      {
        key: 'downloadPowerOfAttorney',
        label: 'Скачать доверенность',
        icon: DownloadOutlined,
        disabled: !hasFile('power-of-attorney'),
      },
      {
        key: 'returnPowerOfAttorney',
        label: 'Вернуть подписанную',
        icon: FileProtectOutlined,
        disabled: !activeCase.value.powerOfAttorneyGenerated || activeCase.value.powerOfAttorneyReturned,
      },
      {
        key: 'downloadSvhInvoice',
        label: 'Скачать счет СВХ',
        icon: DownloadOutlined,
        disabled: !hasFile('svh-invoice'),
      },
      {
        key: 'confirmPayment',
        label: 'Загрузить чек оплаты',
        icon: DollarOutlined,
        disabled: activeCase.value.status < 10,
      },
    )
  }

  if (roleMode.value === 'legs') {
    actions.push(
      {
        key: 'downloadPowerOfAttorney',
        label: 'Скачать доверенность',
        icon: DownloadOutlined,
        disabled: !hasFile('power-of-attorney'),
      },
      { key: 'photoControl', label: 'Добавить фото контроля', icon: CameraOutlined },
      { key: 'uploadSvhInvoice', label: 'Загрузить счет СВХ', icon: FileTextOutlined },
      {
        key: 'uploadClosedDeclaration',
        label: 'Загрузить закрытую ДТ',
        icon: FileDoneOutlined,
        disabled: activeCase.value.status < 9,
      },
    )
  }

  if (roleMode.value === 'declarant') {
    actions.push(
      {
        key: 'submitDeclaration',
        label: 'Подать ДТ',
        icon: ImportOutlined,
        disabled: !activeCase.value.declarationNumber,
      },
      {
        key: 'releaseDeclaration',
        label: 'Зафиксировать выпуск',
        icon: FileDoneOutlined,
        disabled: activeCase.value.status < 8,
      },
    )
  }

  return actions
})

const filesBySection = (section: Import40FileSection) =>
  files.value.filter((file) => file.section === section)

const hasFile = (section: Import40FileSection) => filesBySection(section).length > 0

const roleBusinessMap: Record<RoleMode, string> = {
  client: 'client',
  rop: 'rop',
  sales: 'mpp',
  legs: 'legs',
  declarant: 'declarant',
}

const canDeleteFile = (file: Import40FileDto) =>
  (authStore.role || '').trim().toLowerCase() === 'administrator' ||
  file.uploadedByBusinessRole === roleBusinessMap[roleMode.value]

const fromDto = (dto: Import40CaseDto): Import40Case => ({
  id: dto.id,
  clientId: dto.clientId,
  client: dto.clientName,
  clientType: dto.clientType,
  cargo: dto.cargo,
  post: dto.post,
  manager: dto.manager,
  declarant: dto.declarant,
  status: dto.status,
  corridor: dto.corridor,
  costCalculation: dto.costCalculation,
  riskNote: dto.riskNote,
  vehicleNumber: dto.vehicleNumber,
  driverName: dto.driverName,
  driverPhone: dto.driverPhone,
  transportType: dto.transportType,
  documents: [],
  svhInvoice: dto.svhInvoice,
  paymentCheck: dto.paymentCheck,
  declarationNumber: dto.declarationNumber,
  finalDeclarationFile: dto.finalDeclarationFile,
  powerOfAttorneyGenerated: dto.powerOfAttorneyGenerated,
  powerOfAttorneyReturned: dto.powerOfAttorneyReturned,
  controlPhotosCount: dto.controlPhotosCount,
  closedDeclarationUploaded: dto.closedDeclarationUploaded,
  ropApproved: dto.ropApproved,
  clientAcceptedOffer: dto.clientAcceptedOffer,
  contractSigned: dto.contractSigned,
  svhPaymentConfirmed: dto.svhPaymentConfirmed,
  createdAt: dto.createdAtUtc,
  logs: dto.logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAtUtc,
    text: log.text,
  })),
})

const replaceCase = (dto: Import40CaseDto) => {
  const item = fromDto(dto)
  const index = cases.value.findIndex((current) => current.id === item.id)
  if (index >= 0) {
    cases.value[index] = item
  } else {
    cases.value = [item, ...cases.value]
  }
  activeCaseId.value = item.id
}

const loadCases = async () => {
  loading.value = true
  try {
    const id = String(route.params.id || '')
    if (id) {
      const item = await import40Api.get(id)
      cases.value = [fromDto(item)]
      activeCaseId.value = id
    } else {
      const items = await import40Api.list()
      cases.value = items.map(fromDto)
      activeCaseId.value = cases.value[0]?.id || null
    }
  } finally {
    loading.value = false
  }
}

const currentStatus = (item: Import40Case) =>
  statuses.find((status) => status.id === item.status) || statuses[0]

const corridorLabel = (corridor: Import40Case['corridor']) =>
  corridorOptions.find((item) => item.value === corridor)?.label || 'Не выбран'

const caseProgress = (item: Import40Case) => Math.round((item.status / statuses.length) * 100)

const setCorridor = async (corridor: Import40Case['corridor']) => {
  if (!activeCase.value || activeCase.value.corridor === corridor) return
  const updated = await import40Api.update(activeCase.value.id, { corridor })
  replaceCase(updated)
}

const toUpdatePayloadKey = (field: EditableField) => {
  if (field === 'client') return 'clientName'
  return field
}

const updateField = async (field: EditableField, value: string) => {
  if (!activeCase.value) return
  ;(activeCase.value[field] as string) = value
  const updated = await import40Api.update(activeCase.value.id, {
    [toUpdatePayloadKey(field)]: value,
  })
  replaceCase(updated)
}

const updateFromInput = (field: EditableField, event: Event) => {
  updateField(field, (event.target as HTMLInputElement).value)
}

const toggleDocument = (documentType: string) => {
  if (!activeCase.value) return

  if (activeCase.value.documents.includes(documentType)) {
    activeCase.value.documents = activeCase.value.documents.filter((item) => item !== documentType)
    addLog(activeCase.value, `Документ снят: ${documentType}`)
  } else {
    activeCase.value.documents = [...activeCase.value.documents, documentType]
    addLog(activeCase.value, `Документ добавлен: ${documentType}`)
  }
}

const actionMap: Partial<Record<ActionKey, Import40Action>> = {
  submitCalculation: 'submit-calculation',
  approveOffer: 'approve-offer',
  acceptOffer: 'accept-offer',
  signContract: 'sign-contract',
  returnPowerOfAttorney: 'return-power-of-attorney',
  submitDeclaration: 'submit-declaration',
  releaseDeclaration: 'release-declaration',
  verifyPayment: 'verify-payment',
}

const uploadSections: Partial<Record<ActionKey, Import40FileSection>> = {
  photoControl: 'photo',
  uploadSvhInvoice: 'svh-invoice',
  confirmPayment: 'payment-check',
  uploadClosedDeclaration: 'closed-declaration',
  uploadOffer: 'offer',
  uploadContract: 'contract',
  uploadPowerOfAttorney: 'power-of-attorney',
}

const downloadSections: Partial<Record<ActionKey, Import40FileSection>> = {
  downloadPowerOfAttorney: 'power-of-attorney',
  downloadContract: 'contract',
  downloadOffer: 'offer',
  downloadSvhInvoice: 'svh-invoice',
}

const runAction = async (action: ActionKey) => {
  if (!activeCase.value) return

  const downloadSection = downloadSections[action]
  if (downloadSection) {
    const latest = filesBySection(downloadSection)[0]
    if (!latest) {
      message.warning(`${sectionLabels[downloadSection]}: файл еще не загружен`)
      return
    }
    await downloadCaseFile(latest)
    return
  }

  const section = uploadSections[action]
  if (section) {
    triggerUpload(section)
    return
  }

  const apiAction = actionMap[action]
  if (!apiAction) return
  const updated = await import40Api.action(activeCase.value.id, apiAction)
  replaceCase(updated)
  message.success('Действие выполнено')
}

const triggerUpload = (section: Import40FileSection) => {
  const input = fileInputRef.value
  if (!input) return
  pendingSection.value = section
  input.accept = section === 'photo' ? 'image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
  input.click()
}

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const section = pendingSection.value
  input.value = ''
  if (!file || !section || !activeCase.value) return

  uploadingSection.value = section
  try {
    await import40Api.uploadFile(activeCase.value.id, section, file)
    message.success(`${sectionLabels[section]}: файл загружен`)
    const updated = await import40Api.get(activeCase.value.id)
    replaceCase(updated)
    await loadFiles()
  } catch {
    message.error('Не удалось загрузить файл')
  } finally {
    uploadingSection.value = null
    pendingSection.value = null
  }
}

const loadFiles = async () => {
  if (!activeCase.value) {
    files.value = []
    return
  }
  filesLoading.value = true
  try {
    files.value = await import40Api.listFiles(activeCase.value.id)
  } finally {
    filesLoading.value = false
  }
}

const downloadCaseFile = async (file: Import40FileDto) => {
  if (!activeCase.value) return
  try {
    const blob = await import40Api.downloadFile(activeCase.value.id, file.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.originalFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    message.error('Не удалось скачать файл')
  }
}

const removeCaseFile = async (file: Import40FileDto) => {
  if (!activeCase.value) return
  try {
    await import40Api.deleteFile(activeCase.value.id, file.id)
    message.success('Файл удалён')
    const updated = await import40Api.get(activeCase.value.id)
    replaceCase(updated)
    await loadFiles()
  } catch {
    message.error('Не удалось удалить файл')
  }
}

const validateStatus = (item: Import40Case, targetStatus: number) => {
  const errors: string[] = []

  if (targetStatus >= 3 && !item.costCalculation) {
    errors.push('нужно заполнить расчет стоимости')
  }
  if (targetStatus >= 4 && !item.ropApproved && !item.clientAcceptedOffer) {
    errors.push('нужно согласовать тариф с РОПом или клиентом')
  }
  if (targetStatus >= 5 && !item.contractSigned) {
    errors.push('нужно отметить подписанный договор')
  }
  if (targetStatus >= 6 && !item.powerOfAttorneyReturned) {
    errors.push('нужно вернуть подписанную доверенность')
  }
  if (targetStatus >= 7 && (!item.vehicleNumber || !item.driverPhone || !item.documents.includes('Техпаспорт') || !item.documents.includes('Обязательство'))) {
    errors.push('нужно заполнить транспорт, телефон, техпаспорт и обязательство')
  }
  if (targetStatus >= 9 && !item.declarationNumber) {
    errors.push('нужно указать номер ДТ')
  }
  if (targetStatus >= 11 && !item.svhInvoice) {
    errors.push('нужно загрузить счет СВХ')
  }
  if (targetStatus >= 12 && (!item.svhPaymentConfirmed || !item.closedDeclarationUploaded)) {
    errors.push('нужно подтвердить оплату и загрузить закрытую ДТ')
  }

  return errors
}

const isStatusDone = (status: number) => Boolean(activeCase.value && activeCase.value.status > status)

const addLog = (item: Import40Case, text: string) => {
  item.logs = [
    { id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), text },
    ...item.logs,
  ]
}

const formatLogTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))

onMounted(async () => {
  applyRoleFromLogin()
  await loadCases()
  void loadFiles()
})

watch(() => authStore.username, applyRoleFromLogin)
watch(() => authStore.businessRole, applyRoleFromLogin)
watch(activeCaseId, () => {
  void loadFiles()
})
</script>

<style scoped>
.import40-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--atg-ink);
  font-weight: 800;
}

.card-title :deep(.anticon) {
  color: var(--atg-accent-strong);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.form-grid label span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 700;
}

.status-chip,
.corridor-chip {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.status-chip {
  color: var(--atg-accent-strong);
  background: var(--atg-accent-soft);
}

.corridor-green {
  color: #286b4b;
  background: #dcebe3;
}

.corridor-yellow {
  color: #8a6500;
  background: #fff1c7;
}

.corridor-blue {
  color: #255f8f;
  background: #e3edf8;
}

.corridor-red {
  color: #fff;
  background: #b84a3c;
}

.case-board {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr);
  gap: 18px;
  align-items: start;
}

.case-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.case-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.case-phase {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.case-controls {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.side-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 130px;
}

.side-field > span:first-child {
  color: var(--atg-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 2px 12px;
  border-radius: 999px;
  border: 1px solid rgba(43, 188, 212, 0.4);
  background: rgba(43, 188, 212, 0.1);
  color: var(--atg-accent-strong);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.case-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface-muted, #f6f8fb);
}

.meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.meta-item span {
  color: var(--atg-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.meta-item strong {
  color: var(--atg-ink);
  font-size: 13.5px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.case-progress :deep(.ant-progress) {
  flex: 1;
  margin: 0;
}

.case-progress span {
  flex-shrink: 0;
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 700;
}

.pipeline {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.step-dot {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--atg-surface-muted, #eef1f6);
  color: var(--atg-muted);
  font-size: 11px;
  font-weight: 800;
}

.step-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 700;
}

.pipeline-step.done {
  border-color: rgba(43, 188, 212, 0.35);
  background: rgba(43, 188, 212, 0.06);
}

.pipeline-step.done .step-dot {
  background: var(--atg-accent);
  color: #fff;
}

.pipeline-step.done .step-label {
  color: var(--atg-ink);
}

.pipeline-step.active {
  border-color: var(--atg-accent);
  box-shadow: 0 0 0 3px rgba(43, 188, 212, 0.15);
}

.pipeline-step.active .step-dot {
  background: var(--atg-accent);
  color: #fff;
}

.pipeline-step.active .step-label {
  color: var(--atg-ink);
  font-weight: 800;
}

.actions-card {
  position: sticky;
  top: 76px;
}

.actions-help {
  margin: 0 0 12px;
  color: var(--atg-muted);
  font-size: 13px;
  line-height: 1.55;
}

.actions-card .quick-actions {
  flex-direction: column;
  align-items: stretch;
}

.actions-card .quick-actions .ant-btn {
  justify-content: flex-start;
}

.validation-box {
  margin-top: 14px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-actions .ant-btn {
  min-height: 38px;
  font-weight: 700;
}

.validation-box {
  grid-column: 1 / -1;
  padding: 12px 14px;
  border: 1px solid rgba(184, 74, 60, 0.22);
  border-radius: var(--atg-radius);
  background: rgba(184, 74, 60, 0.07);
}

.validation-box strong {
  display: block;
  margin-bottom: 6px;
  color: var(--atg-red);
  font-size: 13px;
  font-weight: 800;
}

.validation-box ul {
  margin: 0;
  padding-left: 18px;
  color: var(--atg-text);
}

.validation-box li {
  margin: 4px 0;
  line-height: 1.45;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.flow-blocks {
  display: grid;
  gap: 14px;
}

.flow-block {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface, #fff);
}

.flow-block.files-inline {
  margin-top: 14px;
}

.flow-block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.flow-block-head strong {
  color: var(--atg-ink);
  font-size: 13.5px;
  font-weight: 800;
}

.flow-hint {
  margin: 0;
  color: var(--atg-muted);
  font-size: 12.5px;
  line-height: 1.55;
}

.flow-sum {
  margin: 0;
  color: var(--atg-ink);
  font-size: 14px;
}

.flow-sum strong {
  font-weight: 800;
}

.flow-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flow-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flow-field span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 700;
}

.mobile-card {
  border-top-color: var(--atg-gold);
  background: linear-gradient(135deg, #ffffff, #f7fbfd);
}

.mobile-actions {
  display: grid;
  gap: 10px;
}

.mobile-actions .ant-btn {
  min-height: 46px;
  justify-content: flex-start;
  font-weight: 800;
}

.document-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.doc-check {
  display: flex;
  gap: 10px;
  min-height: 42px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
  color: var(--atg-text);
}

.log-list {
  display: grid;
  gap: 8px;
}

.log-item {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
}

.log-item span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 700;
}

.log-item strong {
  color: var(--atg-ink);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1180px) {
  .case-board,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .actions-card {
    position: static;
  }

  .pipeline {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .case-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.files-section {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.files-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(17, 20, 19, 0.08);
  border-radius: 10px;
  background: rgba(17, 20, 19, 0.02);
}

.file-section-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(37, 95, 143, 0.08);
  border: 1px solid rgba(37, 95, 143, 0.2);
  color: var(--atg-blue, #255f8f);
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.file-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--atg-muted, #8a8f8d);
}

@media (max-width: 720px) {
  .hero-metrics,
  .role-strip,
  .create-grid,
  .form-grid,
  .active-controls,
  .document-grid,
  .status-timeline {
    grid-template-columns: 1fr;
  }

  .status-timeline {
    position: static;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .file-item {
    flex-wrap: wrap;
  }
}
</style>
