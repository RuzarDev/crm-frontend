<template>
  <div class="company-page crm-page">
    <input ref="fileInputRef" type="file" style="display: none" @change="onFileSelected" />

    <SigexSignModal
      :open="sigexOpen"
      :client-id="clientId"
      :doc-id="sigexDoc?.id ?? null"
      :side="sigexSide"
      @cancel="sigexOpen = false"
      @signed="onSigexSigned"
    />

    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Импорт 40</div>
        <h1 class="crm-page-title">Моя компания</h1>
        <p class="crm-page-subtitle">Реквизиты, договор и доверенность таможенного представителя.</p>
      </div>
      <a-tag v-if="onboardingComplete" color="success" class="onboarding-badge">
        <CheckCircleOutlined /> Онбординг завершён
      </a-tag>
      <a-tooltip v-else :title="missingHint">
        <a-tag color="warning" class="onboarding-badge">
          <ExclamationCircleOutlined /> Онбординг не завершён
        </a-tag>
      </a-tooltip>
    </div>

    <a-spin :spinning="loading">
      <a-card class="crm-shell-card" :bordered="false">
        <a-steps :current="current" :items="stepItems" @change="(v: number) => (current = v)" />

        <div class="step-body">
          <!-- ① Реквизиты -->
          <div v-if="current === 0">
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
              <a-button type="link" :disabled="!profile?.isComplete" @click="current = 1">Далее: договор →</a-button>
            </div>
          </div>

          <!-- ② Договор -->
          <DocumentStep
            v-else-if="current === 1"
            title="Договор таможенного представителя"
            :profile-complete="!!profile?.isComplete"
            :documents="contractDocs"
            :generating="generatingKind === 'contract'"
            :is-admin="isAdmin"
            :is-effective="isDocumentEffective"
            empty-hint="Договор формируется автоматически из ваших реквизитов. Заполните реквизиты и нажмите «Сформировать»."
            @generate="(opts: GenerateOpts) => generate('contract', opts)"
            @download="downloadDoc"
            @sign="(doc: Import40DocumentDto, side: 'client' | 'provider') => triggerSign(doc, side)"
            @sigex="(doc: Import40DocumentDto, side: 'client' | 'provider') => openSigex(doc, side)"
          />

          <!-- ③ Доверенность -->
          <DocumentStep
            v-else
            title="Доверенность"
            :profile-complete="!!profile?.isComplete"
            :documents="poaDocs"
            :generating="generatingKind === 'poa'"
            :is-admin="isAdmin"
            :is-effective="isDocumentEffective"
            empty-hint="Доверенность формируется автоматически из ваших реквизитов. Заполните реквизиты и нажмите «Сформировать»."
            @generate="(opts: GenerateOpts) => generate('poa', opts)"
            @download="downloadDoc"
            @sign="(doc: Import40DocumentDto, side: 'client' | 'provider') => triggerSign(doc, side)"
            @sigex="(doc: Import40DocumentDto, side: 'client' | 'provider') => openSigex(doc, side)"
          />

          <div class="step-nav">
            <a-button v-if="current > 0" @click="current -= 1">← Назад</a-button>
            <a-button v-if="current < 2" type="link" @click="current += 1">Далее →</a-button>
          </div>
        </div>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons-vue'
import {
  import40ContractApi,
  type ClientCompanyProfileDto,
  type Import40DocumentDto,
} from '@/api/import40Contract'
import { import40Api } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import DocumentStep, { type GenerateOpts } from '@/components/Import40DocumentStep.vue'
import SigexSignModal from '@/components/SigexSignModal.vue'

const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const generatingKind = ref<'contract' | 'poa' | null>(null)
const clientId = ref('')
const profile = ref<ClientCompanyProfileDto | null>(null)
const contractDocs = ref<Import40DocumentDto[]>([])
const poaDocs = ref<Import40DocumentDto[]>([])
const current = ref(0)

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

// документ считается ДЕЙСТВУЮЩИМ, если он активен, не истёк по сроку
// и (для разовых) ещё не израсходован на заявку
const isDocumentEffective = (doc: Import40DocumentDto | null | undefined): boolean => {
  if (!doc) return false
  if (doc.status !== 2) return false
  if (doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()) return false
  if (doc.isSingleUse && doc.consumedByCaseId) return false
  return true
}

const effectiveContract = computed(() => contractDocs.value.find(isDocumentEffective) ?? null)
const effectivePoa = computed(() => poaDocs.value.find(isDocumentEffective) ?? null)
const onboardingComplete = computed(() => !!effectiveContract.value && !!effectivePoa.value)

const missingHint = computed(() => {
  const missing: string[] = []
  if (!profile.value?.isComplete) missing.push('реквизиты')
  if (!effectiveContract.value) missing.push('действующий договор')
  if (!effectivePoa.value) missing.push('действующая доверенность')
  return missing.length ? `Не хватает: ${missing.join(', ')}` : ''
})

const stepStatus = (done: boolean, index: number): 'finish' | 'process' | 'wait' =>
  done ? 'finish' : current.value === index ? 'process' : 'wait'

const stepItems = computed(() => [
  {
    title: 'Реквизиты',
    description: profile.value?.isComplete ? 'Заполнено' : 'Не заполнено',
    status: stepStatus(!!profile.value?.isComplete, 0),
  },
  {
    title: 'Договор',
    description: effectiveContract.value ? 'Действует' : 'Требуется',
    status: stepStatus(!!effectiveContract.value, 1),
  },
  {
    title: 'Доверенность',
    description: effectivePoa.value ? 'Действует' : 'Требуется',
    status: stepStatus(!!effectivePoa.value, 2),
  },
])

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

const loadDocuments = async () => {
  const [contracts, poas] = await Promise.all([
    import40ContractApi.listDocuments(clientId.value, 'contract'),
    import40ContractApi.listDocuments(clientId.value, 'poa'),
  ])
  contractDocs.value = contracts
  poaDocs.value = poas
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
    await loadDocuments()
    // открываем первый незавершённый шаг
    if (!profile.value?.isComplete) current.value = 0
    else if (!effectiveContract.value) current.value = 1
    else if (!effectivePoa.value) current.value = 2
    else current.value = 2
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

const generate = async (kind: 'contract' | 'poa', opts: GenerateOpts) => {
  generatingKind.value = kind
  try {
    await import40ContractApi.generateDocument(clientId.value, {
      kind,
      isSingleUse: opts.isSingleUse,
      validUntilUtc: opts.validUntilUtc,
    })
    await loadDocuments()
    message.success(kind === 'contract' ? 'Договор сформирован' : 'Доверенность сформирована')
  } catch {
    message.error('Не удалось сформировать документ')
  } finally {
    generatingKind.value = null
  }
}

const downloadDoc = async (doc: Import40DocumentDto) => {
  const blob = await import40ContractApi.downloadDocument(clientId.value, doc.id)
  const ext = doc.kind === 'contract' ? 'Договор' : 'Доверенность'
  triggerDownload(blob, `${ext}-${doc.number}-${doc.year}.docx`)
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

// загрузка подписанного файла
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingDoc = ref<Import40DocumentDto | null>(null)
const pendingSide = ref<'client' | 'provider' | null>(null)
const triggerSign = (doc: Import40DocumentDto, side: 'client' | 'provider') => {
  pendingDoc.value = doc
  pendingSide.value = side
  fileInputRef.value?.click()
}
const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const doc = pendingDoc.value
  const side = pendingSide.value
  input.value = ''
  if (!file || !doc || !side) return
  try {
    await import40ContractApi.signDocument(clientId.value, doc.id, side, file)
    await loadDocuments()
    message.success('Подписанный файл загружен')
  } catch {
    message.error('Не удалось загрузить файл')
  } finally {
    pendingDoc.value = null
    pendingSide.value = null
  }
}

// eGov Sigex (QR)
const sigexOpen = ref(false)
const sigexDoc = ref<Import40DocumentDto | null>(null)
const sigexSide = ref<'client' | 'provider'>('client')

const openSigex = (doc: Import40DocumentDto, side: 'client' | 'provider') => {
  sigexDoc.value = doc
  sigexSide.value = side
  sigexOpen.value = true
}

const onSigexSigned = async () => {
  sigexOpen.value = false
  message.success('Документ подписан через eGov!')
  await loadDocuments()
}

onMounted(load)
</script>

<style scoped>
.company-page { display: flex; flex-direction: column; gap: 18px; }
.crm-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.onboarding-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 12px; margin-top: 4px; }
.step-body { margin-top: 24px; }
.step-nav { display: flex; justify-content: space-between; margin-top: 20px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.form-grid label { display: flex; flex-direction: column; gap: 6px; }
.form-grid label.full { grid-column: 1 / -1; }
.form-grid label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.form-footer { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
