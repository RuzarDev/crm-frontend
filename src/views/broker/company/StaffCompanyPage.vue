<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCaretLeft, PhCaretRight, PhCheck } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPage from '@/components/z/ZPage.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import CompanyRequisitesForm from '@/views/client/company/CompanyRequisitesForm.vue'
import StaffDocumentsPanel from './StaffDocumentsPanel.vue'
import { import40ContractApi, type ClientCompanyProfileDto, type Import40DocumentDto } from '@/api/import40Contract'
import { import40Api } from '@/api/import40'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { buildCountryOptions } from '@/utils/countries'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import { STAFF_STEPS, defaultStep, missingOf, onboardingOf, parseStep, stepStates, type StaffStep } from './staffCompany'

// «Компания клиента» для сотрудника (/import-40/company, редизайн, волна 7; замена Import40CompanyView):
// выбор клиента (?client=), три шага (?step=requisites|contract|poa) — реквизиты (общая с кабинетом клиента
// форма), договор и доверенность (панель документов сотрудника). Без ?step= открывается первый незавершённый
// шаг клиента — выбирается при загрузке клиента и после действий не «уезжает».
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const uid = useId()

const isAdmin = computed(() => (auth.role || '').toLowerCase() === 'administrator')
// Подпись со стороны AQNIET — администратор или руководитель отдела (как на сервере).
const canSignProvider = computed(() => isAdmin.value || auth.hasBusinessRole('rop'))

// ---- Клиенты ----
type ClientRow = { id: string; username: string; companyName?: string | null }
const clients = shallowRef<ClientRow[]>([])
const clientOptions = computed<ZOption[]>(() => clients.value.map((c) => ({
  value: c.id,
  label: c.companyName ? `${c.companyName} (${c.username})` : c.username,
})))
const queryClient = computed(() => (typeof route.query.client === 'string' ? route.query.client : ''))
// ?client= из «Карточки клиента» / «Документов клиентов»; неизвестный или без него — первый по списку.
const clientId = computed(() => {
  const list = clients.value
  if (!list.length) return ''
  return list.some((c) => c.id === queryClient.value) ? queryClient.value : list[0].id
})
const pickClient = (v: ZOptionValue | ZOptionValue[] | null) => {
  const id = typeof v === 'string' ? v : ''
  if (!id || id === clientId.value) return
  // Шаг — заново первый незавершённый у нового клиента.
  const { step: _drop, ...rest } = route.query
  void router.replace({ query: { ...rest, client: id } })
}

// ---- Данные клиента ----
const status = ref<'loading' | 'error' | 'empty' | 'ready'>('loading')
const profile = shallowRef<ClientCompanyProfileDto | null>(null)
const contracts = shallowRef<Import40DocumentDto[]>([])
const poas = shallowRef<Import40DocumentDto[]>([])
const pinned = ref<StaffStep>('requisites')
const reloadError = ref(false)
let seq = 0

const fetchDocs = (id: string) => Promise.all([
  import40ContractApi.listDocuments(id, 'contract', { silent: true }),
  import40ContractApi.listDocuments(id, 'poa', { silent: true }),
])

const loadClient = async () => {
  const id = clientId.value
  if (!id) return
  const my = ++seq
  status.value = 'loading'
  reloadError.value = false
  try {
    const [p, [c, a]] = await Promise.all([import40ContractApi.getProfile(id, { silent: true }), fetchDocs(id)])
    if (my !== seq) return
    profile.value = p
    contracts.value = c
    poas.value = a
    pinned.value = defaultStep(p.isComplete, onboardingOf(c, a))
    status.value = 'ready'
  } catch (e) {
    if (import.meta.env.DEV) console.error(e)
    if (my === seq) status.value = 'error'
  }
}

const load = async () => {
  const my = ++seq
  status.value = 'loading'
  try {
    // silent: ошибку показывает сама страница («Не удалось загрузить» и «Повторить»), без тоста перехватчика.
    clients.value = await import40Api.listClients({ silent: true })
  } catch (e) {
    if (import.meta.env.DEV) console.error(e)
    if (my === seq) status.value = 'error'
    return
  }
  if (my !== seq) return
  if (!clients.value.length) {
    status.value = 'empty'
    return
  }
  await loadClient()
}
// Смена клиента в адресе (выбор в шапке, переход по ссылке) — профиль и документы именно его.
watch(clientId, (id, prev) => { if (id && prev) void loadClient() })
void load()

// После формирования, отзыва и подписи — перечитать документы (без скелетона). Свой номер запроса, как у
// остальных загрузок: ответ более раннего перечитывания (или другого клиента) не затрёт свежий.
const reloadDocs = async () => {
  const id = clientId.value
  const my = ++seq
  reloadError.value = false
  try {
    const [c, a] = await fetchDocs(id)
    if (my !== seq) return
    contracts.value = c
    poas.value = a
  } catch {
    if (my === seq) reloadError.value = true
  }
}

// Справочник стран для формы реквизитов — один раз; не загрузился — поле покажет код из профиля.
const countryOptions = shallowRef<ZOption[]>([])
referencesApi.listCountries({ silent: true })
  .then((list) => { countryOptions.value = buildCountryOptions(list) })
  .catch(() => {})

// ---- Регистрация и шаги ----
const onboarding = computed(() => onboardingOf(contracts.value, poas.value))
const profileComplete = computed(() => !!profile.value?.isComplete)
const states = computed(() => stepStates(profileComplete.value, onboarding.value))
const missingHint = computed(() => {
  const list = missingOf(profileComplete.value, onboarding.value).map((m) => t(`broker.company.missing.${m}`))
  return list.length ? t('broker.company.missingHint', { list: list.join(', ') }) : ''
})

const step = computed<StaffStep>(() => parseStep(route.query.step) ?? pinned.value)
const stepIndex = computed(() => STAFF_STEPS.indexOf(step.value))
const select = (s: StaffStep) => {
  if (s === step.value && parseStep(route.query.step)) return
  void router.replace({ query: { ...route.query, step: s } })
}

const onSaved = (p: ClientCompanyProfileDto) => { profile.value = p }

const panelId = `staff-company-panel-${uid}`
const pickerId = `staff-company-client-${uid}`
const circle = (s: StaffStep) => {
  if (states.value[s].done) return 'bg-tone-done-fg text-white'
  if (s === step.value) return 'bg-navy text-white'
  return 'border-[1.5px] border-solid border-line-strong text-muted'
}
</script>

<template>
  <ZPage :title="t('broker.company.title')" :subtitle="t('broker.company.subtitle')" data-staff-company>
    <template v-if="status === 'ready'" #meta>
      <ZTag v-if="onboarding.complete" tone="done" data-onboarding="done">{{ t('broker.company.onboardingDone') }}</ZTag>
      <ZTooltip v-else :title="missingHint">
        <span tabindex="0" class="rounded-pill outline-hidden focus-visible:shadow-focus" :aria-label="missingHint" data-onboarding="pending">
          <ZTag tone="wait">{{ t('broker.company.onboardingPending') }}</ZTag>
        </span>
      </ZTooltip>
    </template>

    <!-- Клиент -->
    <div v-if="clients.length" class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label :for="pickerId" class="text-sm font-medium text-ink-2">{{ t('broker.company.client') }}</label>
      <ZSelect
        :id="pickerId"
        :value="clientId"
        :options="clientOptions"
        show-search
        class="w-[360px] max-sm:h-11 max-sm:w-full"
        data-client-picker
        @update:value="pickClient"
      />
    </div>

    <!-- Загрузка -->
    <div v-if="status === 'loading'" class="flex flex-col gap-4" aria-busy="true" data-company-skeleton>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <ZSkeleton v-for="i in 3" :key="i" height="60px" />
      </div>
      <ZSkeleton height="240px" />
    </div>

    <!-- Ошибка загрузки -->
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-company-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.company.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-company-retry @click="clients.length ? loadClient() : load()">{{ t('home.retry') }}</ZButton>
    </div>

    <!-- Клиентов нет -->
    <ZEmpty v-else-if="status === 'empty'" :title="t('broker.company.noClients')" :hint="t('broker.company.noClientsHint')" data-company-empty />

    <template v-else>
      <div v-if="reloadError" role="alert" class="flex flex-wrap items-center gap-3 rounded-row border border-gold-line bg-gold-soft px-4 py-3" data-company-reload-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-gold-ink">{{ t('broker.company.reloadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" @click="reloadDocs">{{ t('home.retry') }}</ZButton>
      </div>

      <!-- Шаги -->
      <nav :aria-label="t('broker.company.stepsLabel')">
        <ol class="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-3" data-company-steps>
          <li v-for="(s, i) in STAFF_STEPS" :key="s" class="min-w-0">
            <button
              type="button"
              :aria-current="s === step ? 'step' : undefined"
              :aria-controls="panelId"
              :data-company-step="s"
              :data-step-done="states[s].done ? '' : undefined"
              :class="cn(
                'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-row border border-solid bg-surface px-4 py-3 text-left font-sans outline-hidden',
                'transition-[border-color,box-shadow] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
                s === step ? 'border-navy shadow-[0_0_0_0.5px_var(--color-navy)]' : 'border-line hover:border-line-strong hover:shadow-raised',
              )"
              @click="select(s)"
            >
              <span :class="cn('flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-semibold tabular-nums', circle(s))" aria-hidden="true">
                <PhCheck v-if="states[s].done" :size="13" weight="bold" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="min-w-0">
                <span class="block text-[15px] leading-[22px] font-semibold text-ink">{{ t(`broker.company.step.${s}`) }}</span>
                <span :class="cn('block text-[13px] leading-5', states[s].done ? 'text-tone-done-fg' : 'text-ink-3')" data-step-state>
                  {{ t(`broker.company.stepState.${states[s].key}`) }}
                </span>
              </span>
            </button>
          </li>
        </ol>
      </nav>

      <div :id="panelId" class="flex flex-col gap-5 rounded-panel border border-line bg-surface px-6 py-5 max-sm:px-4" data-company-panel>
        <template v-if="step === 'requisites'">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 class="m-0 text-md font-semibold text-ink">{{ t('broker.company.step.requisites') }}</h2>
            <ZTag :tone="profileComplete ? 'done' : 'wait'" data-req-tag>
              {{ t(profileComplete ? 'broker.company.stepState.filled' : 'broker.company.fillRequired') }}
            </ZTag>
          </div>
          <CompanyRequisitesForm
            :key="clientId"
            :client-id="clientId"
            :profile="profile"
            :country-options="countryOptions"
            @saved="onSaved"
          />
        </template>
        <StaffDocumentsPanel
          v-else
          :key="`${clientId}:${step}`"
          :kind="step"
          :docs="step === 'contract' ? contracts : poas"
          :client-id="clientId"
          :profile-complete="profileComplete"
          :is-admin="isAdmin"
          :can-sign-provider="canSignProvider"
          :refresh="reloadDocs"
        />

        <div class="flex flex-wrap items-center justify-between gap-2 border-0 border-t border-solid border-line pt-4">
          <ZButton v-if="stepIndex > 0" variant="ghost" class="h-9 max-sm:h-11" data-step-back @click="select(STAFF_STEPS[stepIndex - 1])">
            <PhCaretLeft :size="14" aria-hidden="true" />{{ t('broker.company.back') }}
          </ZButton>
          <span v-else />
          <ZButton
            v-if="stepIndex < STAFF_STEPS.length - 1"
            variant="ghost"
            class="h-9 max-sm:h-11"
            data-step-next
            @click="select(STAFF_STEPS[stepIndex + 1])"
          >
            {{ t(step === 'requisites' ? 'broker.company.nextContract' : 'broker.company.next') }}<PhCaretRight :size="14" aria-hidden="true" />
          </ZButton>
        </div>
      </div>
    </template>
  </ZPage>
</template>
