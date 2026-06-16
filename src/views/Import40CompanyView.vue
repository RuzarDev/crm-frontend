<template>
  <div class="company-page crm-page">
    <input ref="fileInputRef" type="file" style="display: none" @change="onFileSelected" />

    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Импорт 40</div>
        <h1 class="crm-page-title">Моя компания</h1>
        <p class="crm-page-subtitle">Реквизиты для договора таможенного представителя.</p>
      </div>
    </div>

    <a-spin :spinning="loading">
      <!-- Реквизиты -->
      <a-card class="crm-shell-card" :bordered="false">
        <template #title><div class="card-title"><BankOutlined /> Реквизиты компании</div></template>
        <div class="form-grid">
          <label class="full"><span>Наименование компании *</span><a-input v-model:value="form.companyName" placeholder="ТОО «…»" /></label>
          <label><span>БИН *</span><a-input v-model:value="form.bin" placeholder="12 цифр" /></label>
          <label><span>ФИО руководителя *</span><a-input v-model:value="form.directorName" placeholder="Иванов И.И." /></label>
          <label><span>Действует на основании</span><a-input v-model:value="form.directorBasis" placeholder="устава" /></label>
          <label class="full"><span>Юридический адрес</span><a-input v-model:value="form.legalAddress" /></label>
          <label><span>Банк</span><a-input v-model:value="form.bank" /></label>
          <label><span>ИИК</span><a-input v-model:value="form.iik" /></label>
          <label><span>БИК</span><a-input v-model:value="form.bik" /></label>
          <label><span>Телефон</span><a-input v-model:value="form.phone" /></label>
          <label><span>E-mail</span><a-input v-model:value="form.email" /></label>
        </div>
        <div class="form-footer">
          <a-tag v-if="profile?.isComplete" color="success">Заполнено</a-tag>
          <a-tag v-else color="warning">Заполните обязательные поля (*)</a-tag>
          <a-button type="primary" :loading="saving" @click="saveProfile">Сохранить реквизиты</a-button>
        </div>
      </a-card>

      <!-- Договор -->
      <a-card class="crm-shell-card" :bordered="false" style="margin-top: 18px">
        <template #title><div class="card-title"><FileProtectOutlined /> Договор таможенного представителя</div></template>

        <div v-if="!contract" class="contract-empty">
          <p class="muted">
            Договор формируется автоматически из ваших реквизитов. Заполните реквизиты выше и нажмите «Сформировать договор».
          </p>
          <a-button type="primary" :disabled="!profile?.isComplete" :loading="generating" @click="generate">
            <FileAddOutlined /> Сформировать договор
          </a-button>
        </div>

        <div v-else class="contract-body">
          <div class="contract-head">
            <div>
              <div class="contract-number">№ {{ contract.number }}/ТП/{{ contract.year }}</div>
              <div class="muted">Сформирован {{ formatDate(contract.generatedAtUtc) }}</div>
            </div>
            <a-tag :color="statusColor">{{ statusLabel }}</a-tag>
          </div>

          <div class="contract-actions">
            <a-button @click="download"><DownloadOutlined /> Скачать договор (.docx)</a-button>
          </div>

          <div class="sign-grid">
            <div class="sign-block">
              <div class="sign-head">
                <strong>Ваша подпись</strong>
                <a-tag v-if="contract.clientSigned" color="success">Подписано</a-tag>
                <a-tag v-else color="default">Ожидается</a-tag>
              </div>
              <p class="muted">Скачайте договор, подпишите ЭЦП и загрузите подписанный файл.</p>
              <FileChips :items="filesOf('client-signed')" empty="" @download="downloadSignedFile" />
              <a-button v-if="!contract.clientSigned" type="primary" @click="triggerSign('client')">
                <UploadOutlined /> Загрузить подписанный
              </a-button>
            </div>

            <div class="sign-block">
              <div class="sign-head">
                <strong>Подпись AQNIET</strong>
                <a-tag v-if="contract.providerSigned" color="success">Подписано</a-tag>
                <a-tag v-else color="default">Ожидается</a-tag>
              </div>
              <p class="muted">Подписывает таможенный представитель со своей стороны.</p>
              <FileChips :items="filesOf('provider-signed')" empty="" @download="downloadSignedFile" />
              <a-button v-if="isAdmin && !contract.providerSigned" @click="triggerSign('provider')">
                <UploadOutlined /> Загрузить нашу подпись
              </a-button>
            </div>
          </div>

          <a-alert
            v-if="contract.status === 2"
            type="success"
            show-icon
            message="Договор подписан обеими сторонами. Можно создавать заявки."
            style="margin-top: 14px"
          />
        </div>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  BankOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FileProtectOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue'
import {
  import40ContractApi,
  type ClientCompanyProfileDto,
  type Import40ContractDto,
  type Import40ContractFileDto,
} from '@/api/import40Contract'
import { import40Api } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import FileChips from '@/components/Import40FileChips.vue'

const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const clientId = ref('')
const profile = ref<ClientCompanyProfileDto | null>(null)
const contract = ref<Import40ContractDto | null>(null)

const isAdmin = computed(() => (authStore.role || '').toLowerCase() === 'administrator')

const form = reactive({
  companyName: '',
  bin: '',
  directorName: '',
  directorBasis: 'устава',
  legalAddress: '',
  bank: '',
  iik: '',
  bik: '',
  phone: '',
  email: '',
})

const statusLabel = computed(() =>
  contract.value?.status === 2 ? 'Активен' : contract.value?.status === 1 ? 'Ожидает подписей' : 'Черновик',
)
const statusColor = computed(() =>
  contract.value?.status === 2 ? 'success' : contract.value?.status === 1 ? 'processing' : 'default',
)

const formatDate = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v))

const filesOf = (section: string) => contract.value?.files.filter((f) => f.section === section) ?? []

const applyProfile = (p: ClientCompanyProfileDto) => {
  profile.value = p
  form.companyName = p.companyName
  form.bin = p.bin
  form.directorName = p.directorName
  form.directorBasis = p.directorBasis || 'устава'
  form.legalAddress = p.legalAddress
  form.bank = p.bank
  form.iik = p.iik
  form.bik = p.bik
  form.phone = p.phone
  form.email = p.email
}

const load = async () => {
  loading.value = true
  try {
    const clients = await import40Api.listClients()
    if (!clients.length) {
      message.error('Не найден профиль клиента')
      return
    }
    clientId.value = clients[0].id
    applyProfile(await import40ContractApi.getProfile(clientId.value))
    contract.value = await import40ContractApi.getContract(clientId.value)
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    applyProfile(await import40ContractApi.saveProfile(clientId.value, { ...form }))
    message.success('Реквизиты сохранены')
  } catch {
    message.error('Не удалось сохранить')
  } finally {
    saving.value = false
  }
}

const generate = async () => {
  generating.value = true
  try {
    contract.value = await import40ContractApi.generate(clientId.value)
    message.success('Договор сформирован')
  } catch {
    message.error('Не удалось сформировать договор')
  } finally {
    generating.value = false
  }
}

const download = async () => {
  const blob = await import40ContractApi.download(clientId.value)
  triggerDownload(blob, `Договор-${contract.value?.number}-ТП-${contract.value?.year}.docx`)
}

const downloadSignedFile = async (f: Import40ContractFileDto) => {
  const blob = await import40ContractApi.downloadSignedFile(clientId.value, f.id)
  triggerDownload(blob, f.originalFileName)
}

const triggerDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// загрузка подписанного
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingSide = ref<'client' | 'provider' | null>(null)
const triggerSign = (side: 'client' | 'provider') => {
  pendingSide.value = side
  fileInputRef.value?.click()
}
const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const side = pendingSide.value
  input.value = ''
  if (!file || !side) return
  try {
    contract.value = await import40ContractApi.sign(clientId.value, side, file)
    message.success('Подписанный файл загружен')
  } catch {
    message.error('Не удалось загрузить файл')
  } finally {
    pendingSide.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.company-page { display: flex; flex-direction: column; gap: 18px; }
.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.form-grid label { display: flex; flex-direction: column; gap: 6px; }
.form-grid label.full { grid-column: 1 / -1; }
.form-grid label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.form-footer { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.muted { color: var(--atg-muted); font-size: 13px; line-height: 1.55; }
.contract-empty { display: grid; gap: 12px; justify-items: start; }
.contract-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.contract-number { font-size: 18px; font-weight: 800; color: var(--atg-ink); }
.contract-actions { margin: 14px 0; }
.sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.sign-block { display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); align-content: start; }
.sign-head { display: flex; align-items: center; gap: 10px; }
.sign-head strong { color: var(--atg-ink); font-size: 13.5px; font-weight: 800; }
.sign-block .ant-btn { justify-self: start; }
@media (max-width: 900px) {
  .form-grid, .sign-grid { grid-template-columns: 1fr; }
}
</style>
