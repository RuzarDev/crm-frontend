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

    <PageHeader
      :kicker="t('company.kicker')"
      :title="t('company.title')"
      :subtitle="t('company.subtitle')"
    >
      <template #actions>
        <a-tag v-if="onboardingComplete" color="success" class="onboarding-badge">
          <CheckCircleOutlined /> {{ t('company.onboardingDone') }}
        </a-tag>
        <a-tooltip v-else :title="missingHint">
          <a-tag color="warning" class="onboarding-badge">
            <ExclamationCircleOutlined /> {{ t('company.onboardingPending') }}
          </a-tag>
        </a-tooltip>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <a-card class="crm-shell-card" :bordered="false">
        <a-steps :current="current" :items="stepItems" @change="(v: number) => (current = v)" />

        <div class="step-body">
          <!-- ① Реквизиты -->
          <div v-if="current === 0">
            <div class="form-grid">
              <label class="full"><span>{{ t('company.companyName') }}</span><a-input v-model:value="form.companyName" placeholder="ТОО «…»" /></label>
              <label><span>{{ t('company.bin') }}</span>
                <div class="bin-row">
                  <a-input v-model:value="form.bin" :placeholder="t('company.binPlaceholder')" />
                  <BinLookupButton :bin="form.bin" size="middle" @found="applyCompanyLookup" />
                </div>
              </label>
              <label><span>{{ t('company.director') }}</span><a-input v-model:value="form.directorName" :placeholder="t('company.directorPlaceholder')" /></label>
              <label><span>{{ t('company.basis') }}</span><a-input v-model:value="form.directorBasis" :placeholder="t('company.basisPlaceholder')" /></label>
              <label class="full"><span>{{ t('company.legalAddress') }}</span><a-input v-model:value="form.legalAddress" /></label>
              <label><span>{{ t('company.bank') }}</span><a-input v-model:value="form.bank" /></label>
              <label><span>{{ t('company.iik') }}</span><a-input v-model:value="form.iik" /></label>
              <label><span>{{ t('company.bik') }}</span><a-input v-model:value="form.bik" /></label>
              <label><span>{{ t('company.phone') }}</span><a-input v-model:value="form.phone" /></label>
              <label><span>{{ t('company.email') }}</span><a-input v-model:value="form.email" /></label>
            </div>

            <div class="form-section-title">{{ t('company.legalStructured') }}</div>
            <div class="form-grid">
              <label>
                <span>{{ t('company.country') }}</span>
                <a-select
                  v-model:value="form.legalCountryCode"
                  show-search
                  allow-clear
                  :options="countryOptions"
                  :filter-option="filterCountry"
                  :placeholder="t('company.countryPlaceholder')"
                />
              </label>
              <label><span>{{ t('company.region') }}</span><a-input v-model:value="form.legalRegion" /></label>
              <label><span>{{ t('company.city') }}</span><a-input v-model:value="form.legalCity" /></label>
              <label class="full"><span>{{ t('company.street') }}</span><a-input v-model:value="form.legalStreet" /></label>
            </div>

            <div class="form-section-title">{{ t('company.requisites') }}</div>
            <div class="form-grid">
              <label><span>{{ t('company.kbe') }}</span><a-input v-model:value="form.kbe" /></label>
              <label><span>{{ t('company.okpo') }}</span><a-input v-model:value="form.okpo" /></label>
              <label><span>{{ t('company.ownership') }}</span><a-input v-model:value="form.ownershipType" /></label>
            </div>

            <div class="form-section-title">{{ t('company.contact') }}</div>
            <div class="form-grid">
              <label><span>{{ t('company.contactName') }}</span><a-input v-model:value="form.contactPersonName" /></label>
              <label><span>{{ t('company.contactPosition') }}</span><a-input v-model:value="form.contactPersonPosition" /></label>
              <label><span>{{ t('company.phone') }}</span><a-input v-model:value="form.contactPhone" /></label>
              <label><span>{{ t('company.email') }}</span><a-input v-model:value="form.contactEmail" /></label>
            </div>

            <div class="form-footer">
              <a-tag v-if="profile?.isComplete" color="success">{{ t('company.filled') }}</a-tag>
              <a-tag v-else color="warning">{{ t('company.fillRequired') }}</a-tag>
              <a-button type="primary" :loading="saving" @click="saveProfile">{{ t('company.saveProfile') }}</a-button>
              <a-button type="link" :disabled="!profile?.isComplete" @click="current = 1">{{ t('company.nextContract') }} <RightOutlined /></a-button>
            </div>
          </div>

          <!-- ② Договор -->
          <DocumentStep
            v-else-if="current === 1"
            :title="t('company.contractTitle')"
            :profile-complete="!!profile?.isComplete"
            :documents="contractDocs"
            :generating="generatingKind === 'contract'"
            :is-admin="isAdmin"
            :is-effective="isDocumentEffective"
            :empty-hint="t('company.contractEmpty')"
            :allow-single-use="true"
            :provider-signature="true"
            @generate="(opts: GenerateOpts) => generate('contract', opts)"
            @download="downloadDoc"
            @revoke="revokeDoc"
            @sign="(doc: Import40DocumentDto, side: 'client' | 'provider') => triggerSign(doc, side)"
            @sigex="(doc: Import40DocumentDto, side: 'client' | 'provider') => openSigex(doc, side)"
          />

          <!-- ③ Доверенность -->
          <DocumentStep
            v-else
            :title="t('company.poaTitle')"
            :profile-complete="!!profile?.isComplete"
            :documents="poaDocs"
            :generating="generatingKind === 'poa'"
            :is-admin="isAdmin"
            :is-effective="isDocumentEffective"
            :empty-hint="t('company.poaEmpty')"
            :allow-single-use="true"
            :provider-signature="false"
            @generate="(opts: GenerateOpts) => generate('poa', opts)"
            @download="downloadDoc"
            @revoke="revokeDoc"
            @sign="(doc: Import40DocumentDto, side: 'client' | 'provider') => triggerSign(doc, side)"
            @sigex="(doc: Import40DocumentDto, side: 'client' | 'provider') => openSigex(doc, side)"
          />

          <div class="step-nav">
            <a-button v-if="current > 0" @click="current -= 1"><LeftOutlined /> {{ t('company.back') }}</a-button>
            <a-button v-if="current < 2" type="link" @click="current += 1">{{ t('company.next') }} <RightOutlined /></a-button>
          </div>
        </div>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'
import {
  import40ContractApi,
  isDocumentEffective,
  isDocumentActive,
  type ClientCompanyProfileDto,
  type Import40DocumentDto,
} from '@/api/import40Contract'
import { import40Api } from '@/api/import40'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import DocumentStep, { type GenerateOpts } from '@/components/Import40DocumentStep.vue'
import SigexSignModal from '@/components/SigexSignModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import BinLookupButton from '@/components/BinLookupButton.vue'
import { parseKzAddress } from '@/utils/kzAddress'
import type { CompanyLookupDto } from '@/api/companyLookup'

const { t } = useI18n()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const generatingKind = ref<'contract' | 'poa' | null>(null)
const clientId = ref('')
const profile = ref<ClientCompanyProfileDto | null>(null)
const contractDocs = ref<Import40DocumentDto[]>([])
const poaDocs = ref<Import40DocumentDto[]>([])
const current = ref(0)
const countryOptions = ref<{ value: string; label: string }[]>([])

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
  legalCountryCode: '398' as string | null,
  legalRegion: '' as string | null,
  legalCity: '' as string | null,
  legalStreet: '' as string | null,
  kbe: '' as string | null,
  okpo: '' as string | null,
  ownershipType: '' as string | null,
  contactPersonName: '' as string | null,
  contactPersonPosition: '' as string | null,
  contactPhone: '' as string | null,
  contactEmail: '' as string | null,
})

const filterCountry = (input: string, option: { label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())

// Онбординг = подписанные и не истёкшие договор + доверенность. Расход разовой доверенности
// заявкой онбординг не «отменяет» — для следующей заявки просто нужна новая доверенность.
const effectiveContract = computed(() => contractDocs.value.find(isDocumentEffective) ?? contractDocs.value.find(isDocumentActive) ?? null)
const activePoa = computed(() => poaDocs.value.find(isDocumentActive) ?? null)
const effectivePoa = computed(() => poaDocs.value.find(isDocumentEffective) ?? null)
const onboardingComplete = computed(() => !!effectiveContract.value && !!activePoa.value)
const poaConsumed = computed(() => !!activePoa.value && !effectivePoa.value)

const missingHint = computed(() => {
  const missing: string[] = []
  if (!profile.value?.isComplete) missing.push(t('company.missingProfile'))
  if (!effectiveContract.value) missing.push(t('company.missingContract'))
  if (!activePoa.value) missing.push(t('company.missingPoa'))
  return missing.length ? t('company.missing', { list: missing.join(', ') }) : ''
})

const stepStatus = (done: boolean, index: number): 'finish' | 'process' | 'wait' =>
  done ? 'finish' : current.value === index ? 'process' : 'wait'

const stepItems = computed(() => [
  {
    title: t('company.stepProfile'),
    description: profile.value?.isComplete ? t('company.filled') : t('company.notFilled'),
    status: stepStatus(!!profile.value?.isComplete, 0),
  },
  {
    title: t('company.stepContract'),
    description: effectiveContract.value ? t('company.effective') : t('company.required'),
    status: stepStatus(!!effectiveContract.value, 1),
  },
  {
    title: t('company.stepPoa'),
    description: effectivePoa.value ? t('company.effective') : poaConsumed.value ? t('company.poaConsumed') : t('company.required'),
    status: stepStatus(!!activePoa.value, 2),
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
  form.legalCountryCode = p.legalCountryCode ?? '398'
  form.legalRegion = p.legalRegion ?? ''
  form.legalCity = p.legalCity ?? ''
  form.legalStreet = p.legalStreet ?? ''
  form.kbe = p.kbe ?? ''
  form.okpo = p.okpo ?? ''
  form.ownershipType = p.ownershipType ?? ''
  form.contactPersonName = p.contactPersonName ?? ''
  form.contactPersonPosition = p.contactPersonPosition ?? ''
  form.contactPhone = p.contactPhone ?? ''
  form.contactEmail = p.contactEmail ?? ''
}

// «Найти по БИН» (ГБД ЮЛ, data.egov.kz): наименование/руководитель/юр-адрес —
// перезаписываем (пользователь явно запросил), структурные части адреса — только
// если пусты (разбор адресной строки эвристический, см. parseKzAddress).
const applyCompanyLookup = (c: CompanyLookupDto) => {
  if (c.nameRu || c.nameKz) form.companyName = c.nameRu ?? c.nameKz ?? form.companyName
  if (c.director) form.directorName = c.director
  const address = c.addressRu ?? c.addressKz
  if (address) {
    form.legalAddress = address
    const parsed = parseKzAddress(address)
    if (!form.legalRegion && parsed.region) form.legalRegion = parsed.region
    if (!form.legalCity && parsed.city) form.legalCity = parsed.city
    if (!form.legalStreet && parsed.street) form.legalStreet = parsed.street
  }
  form.legalCountryCode = form.legalCountryCode || '398'
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
      message.error(t('company.noProfile'))
      return
    }
    clientId.value = clients[0].id
    applyProfile(await import40ContractApi.getProfile(clientId.value))
    await loadDocuments()
    if (!countryOptions.value.length) {
      const countries = await referencesApi.listCountries()
      countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
    }
    // открываем первый незавершённый шаг
    if (!profile.value?.isComplete) current.value = 0
    else if (!effectiveContract.value) current.value = 1
    else if (!activePoa.value) current.value = 2
    else current.value = 2
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    applyProfile(await import40ContractApi.saveProfile(clientId.value, { ...form }))
    message.success(t('company.saved'))
  } catch {
    message.error(t('company.saveError'))
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
    message.success(kind === 'contract' ? t('company.contractGenerated') : t('company.poaGenerated'))
  } catch {
    message.error(t('company.generateError'))
  } finally {
    generatingKind.value = null
  }
}

const revokeDoc = async (doc: Import40DocumentDto) => {
  try {
    await import40ContractApi.revokeDocument(clientId.value, doc.id)
    await loadDocuments()
    message.success(t('company.revoked'))
  } catch { message.error(t('company.revokeError')) }
}

const downloadDoc = async (doc: Import40DocumentDto) => {
  const blob = await import40ContractApi.downloadDocument(clientId.value, doc.id)
  const ext = doc.kind === 'contract' ? t('company.fileContract') : t('company.filePoa')
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
.onboarding-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 12px; }
.step-body { margin-top: 24px; }
.step-nav { display: flex; justify-content: space-between; margin-top: 20px; }
.form-section-title { margin-top: 20px; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: var(--atg-charcoal); text-transform: uppercase; letter-spacing: 0.02em; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.form-grid label { display: flex; flex-direction: column; gap: 6px; }
.form-grid label.full { grid-column: 1 / -1; }
.bin-row { display: flex; gap: 8px; align-items: center; }
.bin-row .ant-input { flex: 1; }
.form-grid label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.form-footer { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
