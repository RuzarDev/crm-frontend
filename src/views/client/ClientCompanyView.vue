<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import CompanyDocumentCard from '@/views/client/company/CompanyDocumentCard.vue'
import CompanyRequisitesForm from '@/views/client/company/CompanyRequisitesForm.vue'
import {
  COMPANY_STEPS, companySteps, defaultStep, isCompanyStep, joinList,
  type CompanyStep, type StepState, type StepTone,
} from '@/views/client/company/company'
import { import40Api } from '@/api/import40'
import { import40ContractApi, type ClientCompanyProfileDto, type Import40DocumentDto } from '@/api/import40Contract'
import { referencesApi } from '@/api/references'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { buildCountryOptions } from '@/utils/countries'
import type { ZOption } from '@/ui/options'
import { cn } from '@/ui/cn'

// «Моя компания» клиента (/import-40/company, редизайн, волна 2b, доска Company): три шага регистрации —
// реквизиты, договор, доверенность. Карточка шага выбирает раздел (?step=, replace); по умолчанию — первый
// незавершённый. Логика — прежнего Import40CompanyView (клиентский режим), API те же.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const registration = useClientRegistration()
const uid = useId()

// ---- Данные ----
const clientId = ref('')
const profile = shallowRef<ClientCompanyProfileDto | null>(null)
const contracts = shallowRef<Import40DocumentDto[]>([])
const poas = shallowRef<Import40DocumentDto[]>([])
const status = ref<'loading' | 'error' | 'ready'>('loading')
const reloadError = ref(false)
let seq = 0

const fetchAll = async () => {
  // Как прежний экран: клиент — первый (единственный) из списка клиентов, доступных пользователю.
  if (!clientId.value) {
    const clients = await import40Api.listClients({ silent: true })
    if (!clients.length) throw new Error('no client profile')
    clientId.value = clients[0].id
  }
  const id = clientId.value
  return Promise.all([
    import40ContractApi.getProfile(id, { silent: true }),
    import40ContractApi.listDocuments(id, 'contract', { silent: true }),
    import40ContractApi.listDocuments(id, 'poa', { silent: true }),
  ])
}
const apply = ([p, c, a]: Awaited<ReturnType<typeof fetchAll>>) => {
  profile.value = p
  contracts.value = c
  poas.value = a
}

const load = async () => {
  const my = ++seq
  status.value = 'loading'
  reloadError.value = false
  try {
    const res = await fetchAll()
    if (my !== seq) return
    apply(res)
    pinned.value ??= defaultStep(steps.value)
    status.value = 'ready'
  } catch (e) {
    if (import.meta.env.DEV) console.error(e)
    if (my === seq) status.value = 'error'
  }
}

// После сохранения, формирования и подписи: перечитать профиль и документы (без скелетона) и общее
// состояние регистрации (плашка, меню, «Оформить поставку»).
const reload = async () => {
  const my = ++seq
  reloadError.value = false
  void registration.refresh()
  try {
    const res = await fetchAll()
    if (my === seq) apply(res)
  } catch {
    if (my === seq) reloadError.value = true
  }
}

// ---- Шаги ----
const steps = computed(() => companySteps({
  profileComplete: !!profile.value?.isComplete,
  contracts: contracts.value,
  poas: poas.value,
}))
const complete = computed(() => COMPANY_STEPS.every((s) => steps.value[s].done))
const queryStep = computed<CompanyStep | null>(() => (isCompanyStep(route.query.step) ? route.query.step : null))
// Шаг по умолчанию выбирается один раз, по первой загрузке: после подписи раздел не «уезжает» из-под клиента.
const pinned = ref<CompanyStep | null>(null)
const step = computed<CompanyStep>(() => queryStep.value ?? pinned.value ?? defaultStep(steps.value))
const select = (s: CompanyStep) => {
  if (s === step.value && queryStep.value) return
  void router.replace({ query: { ...route.query, step: s } })
}

const TODO_KEY: Record<string, string> = {
  fill: 'fill', needGenerate: 'generate', afterProfile: 'generate', afterContract: 'generate', needSign: 'sign', awaitingUs: 'awaitingUs',
}
const subtitle = computed(() => {
  if (complete.value) return t('client.company.subtitleDone')
  const items = COMPANY_STEPS
    .filter((s) => !steps.value[s].done)
    .map((s) => t(`client.company.todo.${s}.${TODO_KEY[steps.value[s].key]}`))
  return t('client.company.subtitleTodo', { list: joinList(items, locale.value) })
})

const stepText = (s: StepState) => t(`client.company.stepState.${s.key}`, { date: s.date })
const STATE_FG: Record<StepTone, string> = {
  done: 'text-tone-done-fg',
  action: 'font-medium text-gold-ink',
  waiting: 'text-ink-3',
  later: 'text-muted',
}
const circle = (s: CompanyStep) => {
  const st = steps.value[s]
  if (st.done) return 'bg-tone-done-fg text-white'
  if (s === step.value) return 'bg-navy text-white'
  return 'border-[1.5px] border-solid border-line-strong text-muted'
}

// ---- Реквизиты ----
const editing = ref(false)
const showForm = computed(() => editing.value || !profile.value?.isComplete)
const onSaved = (p: ClientCompanyProfileDto) => {
  const firstTime = !profile.value?.isComplete && p.isComplete
  profile.value = p
  editing.value = false
  // Реквизиты заполнены впервые — следующий шаг договор: ведём к нему.
  if (firstTime && step.value === 'profile') select('contract')
  void reload()
}
const reqRows = computed(() => {
  const p = profile.value
  return [
    { key: 'company', label: t('client.company.req.company'), value: p?.companyName },
    { key: 'bin', label: t('client.company.req.bin'), value: p?.bin, mono: true },
    { key: 'director', label: t('client.company.req.director'), value: p?.directorName },
    { key: 'address', label: t('client.company.req.address'), value: p?.legalAddress },
  ]
})
const goProfile = () => {
  editing.value = true
  select('profile')
}

// Справочник стран — только когда открыта форма; не загрузился — поле покажет код из профиля.
const countryOptions = shallowRef<ZOption[]>([])
let countriesRequested = false
const ensureCountries = () => {
  if (countriesRequested || !showForm.value || status.value !== 'ready') return
  countriesRequested = true
  referencesApi.listCountries({ silent: true })
    .then((list) => { countryOptions.value = buildCountryOptions(list) })
    .catch(() => { countriesRequested = false })
}
watch([showForm, status], ensureCountries)

void load()

const reqTitleId = `company-req-${uid}`
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <div class="flex max-w-[920px] flex-col gap-6" data-client-company>
    <div>
      <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.company.title') }}</h1>
      <p v-if="status === 'ready'" class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]" data-company-subtitle>{{ subtitle }}</p>
      <ZSkeleton v-else-if="status === 'loading'" width="min(440px, 90%)" height="15px" class="mt-2" />
    </div>

    <!-- Загрузка -->
    <div v-if="status === 'loading'" class="flex flex-col gap-6" aria-busy="true" data-company-skeleton>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div v-for="i in 3" :key="i" class="flex gap-3 rounded-row border border-line px-4 py-3.5">
          <ZSkeleton width="24px" height="24px" />
          <div class="flex flex-1 flex-col gap-2"><ZSkeleton width="60%" height="14px" /><ZSkeleton width="80%" height="12px" /></div>
        </div>
      </div>
      <div class="flex flex-col gap-4 rounded-panel border border-line px-6 py-[22px]">
        <ZSkeleton width="min(380px, 80%)" height="20px" />
        <ZSkeleton width="min(300px, 60%)" height="13px" />
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2"><ZSkeleton height="120px" /><ZSkeleton height="120px" /></div>
      </div>
    </div>

    <!-- Ошибка загрузки -->
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-company-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('client.company.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-company-retry @click="load">{{ t('home.retry') }}</ZButton>
    </div>

    <template v-else>
      <div v-if="reloadError" role="alert" class="flex flex-wrap items-center gap-3 rounded-row border border-gold-line bg-gold-soft px-4 py-3" data-company-reload-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-gold-ink">{{ t('client.company.reloadError') }}</p>
        <ZButton size="sm" :class="retry" @click="reload">{{ t('home.retry') }}</ZButton>
      </div>

      <ol :aria-label="t('client.company.stepsLabel')" class="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-3" data-company-steps>
        <li v-for="(s, i) in COMPANY_STEPS" :key="s" class="min-w-0">
          <button
            type="button"
            :aria-current="s === step ? 'step' : undefined"
            :data-company-step="s"
            :data-step-tone="steps[s].tone"
            :class="cn(
              'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-row border border-solid bg-surface px-4 py-3.5 text-left font-sans outline-hidden',
              'transition-[border-color,box-shadow] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
              s === step ? 'border-navy shadow-[0_0_0_0.5px_var(--color-navy)]' : 'border-line hover:border-line-strong hover:shadow-raised',
            )"
            @click="select(s)"
          >
            <span :class="cn('flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-semibold tabular-nums', circle(s))" aria-hidden="true">
              <PhCheck v-if="steps[s].done" :size="13" weight="bold" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="min-w-0">
              <span :class="cn('block text-[15px] leading-[22px] font-semibold', steps[s].tone === 'later' ? 'text-ink-2' : 'text-ink')">{{ t(`client.company.step.${s}`) }}</span>
              <span :class="cn('block text-[13px] leading-5', STATE_FG[steps[s].tone])" data-step-state>{{ stepText(steps[s]) }}</span>
            </span>
          </button>
        </li>
      </ol>

      <CompanyDocumentCard
        v-if="step === 'contract'"
        key="contract"
        kind="contract"
        :docs="contracts"
        :client-id="clientId"
        :profile-complete="!!profile?.isComplete"
        @changed="reload"
        @go-profile="goProfile"
      />
      <CompanyDocumentCard
        v-else-if="step === 'poa'"
        key="poa"
        kind="poa"
        :docs="poas"
        :client-id="clientId"
        :profile-complete="!!profile?.isComplete"
        @changed="reload"
        @go-profile="goProfile"
      />

      <!-- Реквизиты: сводка + «Изменить» или форма (незаполненные — форма сразу) -->
      <section :aria-labelledby="reqTitleId" class="flex flex-col gap-3 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4" data-company-requisites>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 :id="reqTitleId" class="m-0 text-md font-semibold text-ink">{{ t('client.company.req.title') }}</h2>
          <ZTag :tone="profile?.isComplete ? 'done' : 'wait'" data-req-tag>
            {{ t(profile?.isComplete ? 'client.company.req.filled' : 'client.company.req.notFilled') }}
          </ZTag>
          <button
            v-if="!showForm"
            type="button"
            class="-mr-2 ml-auto inline-flex min-h-9 cursor-pointer items-center rounded-field border-0 bg-transparent px-2 font-sans text-sm font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11"
            data-req-edit
            @click="editing = true"
          >
            {{ t('client.company.req.edit') }}
          </button>
        </div>
        <p v-if="!profile?.isComplete" class="m-0 text-sm text-ink-3">{{ t('client.company.req.fillHint') }}</p>

        <CompanyRequisitesForm
          v-if="showForm"
          class="pt-2"
          :client-id="clientId"
          :profile="profile"
          :country-options="countryOptions"
          :cancellable="!!profile?.isComplete"
          @saved="onSaved"
          @cancel="editing = false"
        />
        <dl v-else class="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3 text-base" data-req-summary>
          <div v-for="r in reqRows" :key="r.key" class="min-w-0" :data-req-row="r.key">
            <dt class="text-[12.5px] leading-[18px] text-muted">{{ r.label }}</dt>
            <dd :class="cn('m-0 mt-0.5 break-words text-ink', r.mono && 'font-mono text-[13.5px] tabular-nums')">{{ r.value || '—' }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>
