<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'
import { Translation, useI18n } from 'vue-i18n'
import { PhCaretLeft, PhCheck, PhCircleNotch, PhWarningCircle, PhX } from '@phosphor-icons/vue'
import ZAskBanner from '@/components/z/ZAskBanner.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import StepCargo from '@/views/client/wizard/StepCargo.vue'
import StepTransport from '@/views/client/wizard/StepTransport.vue'
import StepParties from '@/views/client/wizard/StepParties.vue'
import { isBinOk, isCargoOk, useShipmentDraft } from '@/views/client/wizard/useShipmentDraft'
import { stepTitle } from '@/views/client/wizard/wizardUi'
import { import40ContractApi, type ClientCompanyProfileDto } from '@/api/import40Contract'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { buildCountryOptions, normalizeCountryCode } from '@/utils/countries'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import { cn } from '@/ui/cn'

// Мастер «Оформить поставку» клиента (/import-40/new, /import-40/new/:id; редизайн, волна 2a, доски Wizard и
// WizardPhone). Логика — прежнего мастера из Import40ListView: черновик создаётся при уходе с шага «Груз»,
// дальше автосохранение (useShipmentDraft). Шаг «Документы» наполняет задача 8.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const registration = useClientRegistration()
const { confirm } = useConfirm()
const uid = useId()

const shipment = useShipmentDraft()
const { draft, caseId, number, saving, savedAt, saveError } = shipment

const STEPS = ['cargo', 'transport', 'parties', 'docs'] as const
const LAST = STEPS.length - 1

// ---- Состояние экрана ----
type Phase = 'checking' | 'regError' | 'gate' | 'loading' | 'notFound' | 'loadError' | 'ready'
const phase = ref<Phase>('checking')
const step = ref(0)
/** Самый дальний открытый шаг: пройденные до него получают галочку. */
const reached = ref(0)
const advancing = ref(false)
/** Уход уже согласован (Дозаполнить позже / переадресация) — страж не спрашивает. */
let leaving = false

const routeId = () => (typeof route.params.id === 'string' && route.params.id ? route.params.id : null)

// ---- Регистрация: пока не завершена, вместо мастера — панель (раньше черновик открывался без проверки) ----
const gateTarget = computed(() =>
  registration.needNew.value ? `/import-40/company?step=${registration.needNew.value}` : '/import-40/company',
)
const checkRegistration = async () => {
  phase.value = 'checking'
  await registration.refresh()
  if (!registration.loaded.value) {
    phase.value = 'regError'
    return
  }
  if (!registration.complete.value) {
    phase.value = 'gate'
    return
  }
  await open(routeId())
}

// ---- Справочники и профиль ----
const postOptions = ref<ZOption[]>([])
const postsLoading = ref(false)
const loadPosts = async () => {
  if (postOptions.value.length || postsLoading.value) return
  postsLoading.value = true
  try {
    const posts = await referencesApi.listCustomsPosts()
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
  } catch {
    postOptions.value = []
  } finally {
    postsLoading.value = false
  }
}
const countryOptions = computed<ZOption[]>(() => buildCountryOptions(shipment.countries.value).map((o) => ({ ...o })))

const profile = shallowRef<ClientCompanyProfileDto | null>(null)
const loadProfile = async () => {
  if (profile.value || !authStore.userId) return
  try {
    // Страна в профиле может быть буквенной (KZ) — приводим к ОКСМ, поэтому ждём и справочник стран.
    const [p] = await Promise.all([import40ContractApi.getProfile(authStore.userId), shipment.loadCountries()])
    profile.value = p
    shipment.ownerName.value = profile.value.companyName || ''
    prefillReceiver()
  } catch {
    profile.value = null
  }
}
const fillReceiverFromProfile = () => {
  const p = profile.value
  if (!p) return
  draft.receiverName = p.companyName || draft.receiverName
  draft.receiverBin = p.bin || draft.receiverBin
  draft.receiverCountry = normalizeCountryCode(p.legalCountryCode, shipment.countries.value) || draft.receiverCountry || '398'
}
// Получатель по умолчанию — своя компания, если поля ещё пустые (как в прежнем мастере).
const prefillReceiver = () => {
  if (phase.value !== 'ready' || !profile.value) return
  if (draft.receiverName.trim() || draft.receiverBin.trim()) return
  fillReceiverFromProfile()
}

// ---- Открытие: новый черновик или продолжение ----
const stepFilled = (i: number) => {
  if (i === 0) return isCargoOk(draft.cargo)
  if (i === 1) {
    const byMode = [draft.vehicleNumber, draft.trailerNumber, draft.driverPhone, draft.wagonNumber, draft.station,
      draft.flightNumber, draft.airWaybill, draft.vesselName, draft.billOfLading]
    return byMode.some((v) => v.trim()) || draft.containers.length > 0
  }
  if (i === 2) return !!(draft.senderName.trim() && draft.receiverName.trim() && isBinOk(draft.receiverBin))
  return false
}
const firstUnfilled = () => {
  const i = [0, 1, 2].find((k) => !stepFilled(k))
  return i ?? LAST
}

let openSeq = 0
const open = async (id: string | null) => {
  const my = ++openSeq
  void loadPosts()
  void loadProfile()
  if (!id) {
    shipment.reset()
    void shipment.loadCountries()
    step.value = 0
    reached.value = 0
    phase.value = 'ready'
    prefillReceiver()
    return
  }
  phase.value = 'loading'
  try {
    await shipment.load(id)
  } catch (e: unknown) {
    if (my !== openSeq) return
    const code = (e as { response?: { status?: number } })?.response?.status
    phase.value = code === 404 || code === 403 || code === 400 ? 'notFound' : 'loadError'
    return
  }
  if (my !== openSeq) return
  // Уже отправленная поставка — не черновик: мастер ей не нужен, ведём на карточку.
  if (shipment.status.value !== 0) {
    leaving = true
    await router.replace(`/import-40/${id}`)
    return
  }
  step.value = firstUnfilled()
  reached.value = step.value
  phase.value = 'ready'
  prefillReceiver()
}

onMounted(() => { void checkRegistration() })

// Смена адреса без пересоздания экрана: «Оформить поставку» из открытого черновика или переход на другой черновик.
// Свой replace после создания (/new → /new/:id) — тот же черновик, ничего не делаем.
watch(() => route.params.id, () => {
  if (phase.value === 'checking' || phase.value === 'gate' || phase.value === 'regError') return
  const id = routeId()
  if (id && id === caseId.value) return
  if (!id && !caseId.value && phase.value === 'ready') return
  leaving = false
  void open(id)
})

// ---- Автосохранение: каждое изменение — через 800 мс после последнего; смена шага — сразу ----
watch(draft, () => {
  if (phase.value === 'ready') shipment.scheduleSave()
}, { deep: true })

// ---- Шаги ----
const stepOk = (i: number) => (i === 0 ? isCargoOk(draft.cargo) : i === 2 ? isBinOk(draft.receiverBin) : true)
const canOpen = (i: number) => i <= step.value || Array.from({ length: i }, (_, k) => k).every(stepOk)
const stepDone = (i: number) => i !== step.value && i < reached.value && stepOk(i)
const canNext = computed(() => stepOk(step.value))

const rootEl = ref<HTMLElement>()
const stepHost = ref<HTMLElement>()
const focusStep = async () => {
  await nextTick()
  const root = rootEl.value
  if (root && root.getBoundingClientRect().top < 0) root.scrollIntoView?.({ block: 'start' })
  stepHost.value?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
}

const goTo = async (i: number) => {
  if (i === step.value || i < 0 || i > LAST || advancing.value) return
  if (i > step.value && !canOpen(i)) return
  if (i > 0 && !caseId.value) {
    // Заявку создаём при уходе с шага «Груз»: дальше нужен id (автосохранение, документы).
    if (!isCargoOk(draft.cargo)) return
    advancing.value = true
    try {
      await shipment.ensureCreated()
    } catch {
      // Текст ошибки (в т.ч. 403 «завершите регистрацию») уже показал общий перехватчик.
      return
    } finally {
      advancing.value = false
    }
    // Адрес черновика: обновление страницы и «Назад» браузера вернут в него, а не в пустой мастер.
    void router.replace(`/import-40/new/${caseId.value}`)
  }
  void shipment.save()
  step.value = i
  reached.value = Math.max(reached.value, i)
  await focusStep()
}
const next = () => goTo(step.value + 1)
const back = () => goTo(step.value - 1)

const stepLabel = (i: number) => t(`client.wizard.step.${STEPS[i]}`)
const nextLabel = computed(() => (step.value < LAST ? t(`client.wizard.next.${STEPS[step.value + 1]}`) : ''))

// ---- Дозаполнить позже / закрыть ----
const finishing = ref(false)
const finishLater = async () => {
  if (!caseId.value || finishing.value) return
  finishing.value = true
  try {
    const ok = await shipment.save()
    // Не сохранилось — остаёмся: в шапке «Не удалось сохранить — Повторить».
    if (!ok) return
    leaving = true
    message.success(t('client.wizard.laterDone', { number: number.value }))
    await router.push('/import-40')
  } finally {
    finishing.value = false
  }
}
const close = () => (caseId.value ? finishLater() : router.push('/import-40'))

// ---- Уход со страницы: черновик сохраняем без вопроса; спрашиваем, только если сохранить не вышло ----
const isWizardRoute = (r: RouteLocationNormalized) => r.name === 'client-wizard' || r.name === 'client-wizard-draft'
const askLeave = (content: string) => confirm({
  title: t('client.wizard.leave.title'),
  content,
  okText: t('client.wizard.leave.ok'),
  cancelText: t('client.wizard.leave.cancel'),
  danger: true,
})
const confirmLeave = async (): Promise<boolean> => {
  if (leaving || phase.value !== 'ready') return true
  shipment.cancelScheduled()
  if (!caseId.value) return draft.cargo.trim() ? askLeave(t('client.wizard.leave.textNew')) : true
  if (!shipment.dirty.value && !saving.value && !saveError.value) return true
  if (await shipment.save()) return true
  return askLeave(t('client.wizard.leave.text'))
}
// Глобальный страж, а не onBeforeRouteLeave: после replace /new → /new/:id экран остаётся тем же, а страж
// маршрута привязан к записи /new и на уходе с /new/:id не сработал бы.
const removeGuard = router.beforeEach(async (to, from) => {
  if (!isWizardRoute(from)) return true
  const toId = typeof to.params.id === 'string' && to.params.id ? to.params.id : null
  if (isWizardRoute(to) && toId === (caseId.value ?? null)) return true
  return confirmLeave()
})

// Закрытие вкладки или перезагрузка с несохранённым — вопрос браузера; уход в фон (телефон) — сохраняем сразу.
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (phase.value !== 'ready') return
  const pending = caseId.value ? shipment.dirty.value || saving.value : !!draft.cargo.trim()
  if (!pending) return
  if (caseId.value) void shipment.save()
  e.preventDefault()
  e.returnValue = ''
}
const onVisibility = () => {
  if (document.visibilityState === 'hidden' && caseId.value && phase.value === 'ready') void shipment.save()
}
window.addEventListener('beforeunload', onBeforeUnload)
document.addEventListener('visibilitychange', onVisibility)
onBeforeUnmount(() => {
  removeGuard()
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibility)
})

// ---- Статус черновика в шапке ----
const savedTime = computed(() => {
  const d = savedAt.value
  if (!d) return ''
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : locale.value === 'kk' ? 'kk-KZ' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d)
})
type SaveState = 'none' | 'saving' | 'failed' | 'saved' | 'draft'
const saveState = computed<SaveState>(() => {
  if (!caseId.value) return 'none'
  if (saving.value) return 'saving'
  if (saveError.value) return 'failed'
  return savedAt.value ? 'saved' : 'draft'
})
const retrySave = () => { void shipment.save() }

const stepRow = (i: number) => cn(
  'flex w-full items-center gap-2.5 rounded-[9px] border-0 px-2.5 py-2 text-left font-sans text-sm outline-hidden',
  'transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
  i === step.value
    ? 'bg-sunken font-semibold text-ink'
    : canOpen(i)
      ? 'cursor-pointer bg-transparent text-ink-2 hover:bg-sunken hover:text-ink'
      : 'cursor-not-allowed bg-transparent text-muted',
)
const stepDot = (i: number) => cn(
  'inline-flex size-[22px] shrink-0 items-center justify-center rounded-pill text-xs font-semibold tabular-nums',
  i === step.value ? 'bg-navy text-white'
  : stepDone(i) ? 'bg-zircon text-white'
  : 'border-[1.5px] border-solid border-line-strong bg-surface text-muted',
)
const primaryBtn = 'h-[42px] rounded-row px-5 text-[15px] max-sm:h-[50px] max-sm:flex-1 max-sm:rounded-[12px] max-sm:text-base'
const backBtn = 'h-[42px] rounded-row border border-solid border-line-strong bg-surface px-4 text-[15px] font-medium enabled:hover:bg-sunken max-sm:h-[50px] max-sm:rounded-[12px]'
</script>

<template>
  <div ref="rootEl" class="scroll-mt-20" data-client-wizard>
    <!-- Проверка регистрации / загрузка черновика -->
    <div v-if="phase === 'checking' || phase === 'loading'" class="flex flex-col gap-6" aria-busy="true" data-wz-skeleton>
      <ZSkeleton width="min(280px, 70%)" height="28px" />
      <div class="flex flex-wrap gap-10">
        <div class="flex flex-[0_0_220px] flex-col gap-3 max-sm:hidden">
          <ZSkeleton v-for="i in 4" :key="i" height="22px" />
        </div>
        <div class="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <ZSkeleton width="min(320px, 80%)" height="22px" />
          <ZSkeleton height="64px" />
          <ZSkeleton height="40px" />
        </div>
      </div>
    </div>

    <!-- Регистрация не завершена -->
    <div v-else-if="phase === 'gate'" class="flex max-w-[720px] flex-col gap-5" data-wz-gate>
      <h1 class="m-0 text-[23px] leading-8 font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{{ t('client.wizard.title') }}</h1>
      <ZAskBanner
        :title="t('client.wizard.gate.title')"
        :description="registration.reason.value || t('client.wizard.gate.text')"
        :action-text="t('client.wizard.gate.action')"
        data-wz-gate-banner
        @action="router.push(gateTarget)"
      />
      <RouterLink
        to="/import-40"
        class="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-field px-2 text-sm text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-9"
      >
        <PhCaretLeft :size="15" aria-hidden="true" />{{ t('client.wizard.toList') }}
      </RouterLink>
    </div>

    <!-- Не удалось проверить регистрацию / загрузить черновик -->
    <div
      v-else-if="phase === 'regError' || phase === 'loadError'"
      class="flex flex-wrap items-center gap-3 rounded-panel border border-solid border-line bg-surface px-5 py-4"
      data-wz-error
    >
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">
        {{ phase === 'regError' ? t('client.wizard.regError') : t('client.wizard.loadError') }}
      </p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-wz-retry @click="phase === 'regError' ? checkRegistration() : open(routeId())">
        {{ t('home.retry') }}
      </ZButton>
    </div>

    <!-- Черновик не найден -->
    <div v-else-if="phase === 'notFound'" class="rounded-panel border border-dashed border-line-strong" data-wz-not-found>
      <ZEmpty :title="t('client.wizard.notFound')" :hint="t('client.wizard.notFoundHint')">
        <template #action>
          <RouterLink
            to="/import-40"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('client.card.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <!-- Мастер -->
    <template v-else>
      <!-- Телефон (доска WizardPhone): закрыть, название, «Шаг N из 4» и полоса из четырёх сегментов -->
      <div class="-mx-4 -mt-5 mb-1 sm:hidden" data-wz-phone-head>
        <div class="flex h-14 items-center gap-1.5 border-0 border-b border-solid border-line px-3">
          <button
            type="button"
            :aria-label="t('client.wizard.close')"
            class="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink outline-hidden focus-visible:shadow-focus"
            data-wz-close
            @click="close"
          >
            <PhX :size="20" aria-hidden="true" />
          </button>
          <h1 class="m-0 min-w-0 truncate text-[15px] leading-6 font-semibold text-ink">{{ t('client.wizard.title') }}</h1>
          <span class="ml-auto shrink-0 pr-1.5 text-[13px] text-muted tabular-nums" data-wz-step-of>
            {{ t('client.wizard.stepOf', { n: step + 1, total: STEPS.length }) }}
          </span>
        </div>
        <div aria-hidden="true" class="flex gap-1 px-4 pt-2.5">
          <span
            v-for="(_, i) in STEPS"
            :key="i"
            :class="cn('h-1 flex-1 rounded-pill transition-colors duration-200 ease-out motion-reduce:transition-none', i <= step ? 'bg-navy' : 'bg-line')"
            data-wz-segment
          />
        </div>
      </div>

      <!-- Компьютер: путь назад и статус черновика -->
      <div class="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 max-sm:hidden">
        <RouterLink
          to="/import-40"
          class="-ml-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-field px-1.5 text-[13.5px] text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus"
          data-wz-to-list
        >
          <PhCaretLeft :size="15" aria-hidden="true" />{{ t('client.wizard.toList') }}
        </RouterLink>
        <div v-if="saveState !== 'none'" class="ml-auto flex min-h-8 items-center gap-1.5 text-[13px] text-muted" data-wz-status>
          <template v-if="saveState === 'saving'">
            <PhCircleNotch :size="14" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span>{{ t('client.wizard.status.saving') }}</span>
          </template>
          <template v-else-if="saveState === 'failed'">
            <PhWarningCircle :size="15" weight="bold" class="text-danger" aria-hidden="true" />
            <span class="text-ink-2">{{ t('client.wizard.status.failed') }}</span>
            <span aria-hidden="true">—</span>
            <button
              type="button"
              class="cursor-pointer rounded-field border-0 bg-transparent p-0 px-0.5 font-sans text-[13px] font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus"
              data-wz-save-retry
              @click="retrySave"
            >{{ t('client.wizard.status.retry') }}</button>
          </template>
          <template v-else-if="saveState === 'saved'">
            <PhCheck :size="14" weight="bold" class="text-tone-done-fg" aria-hidden="true" />
            <Translation keypath="client.wizard.status.saved" tag="span" scope="global">
              <template #number><span class="font-mono text-ink-2">{{ number }}</span></template>
              <template #time><span class="tabular-nums">{{ savedTime }}</span></template>
            </Translation>
          </template>
          <Translation v-else keypath="client.wizard.status.draft" tag="span" scope="global">
            <template #number><span class="font-mono text-ink-2">{{ number }}</span></template>
          </Translation>
        </div>
      </div>
      <!-- Сбой сохранения — объявляем один раз; «Сохраняем…» на каждую паузу в наборе не озвучиваем. -->
      <p class="sr-only" role="status">{{ saveState === 'failed' ? t('client.wizard.status.failed') : '' }}</p>

      <div class="flex flex-col gap-x-10 gap-y-6 lg:flex-row">
        <!-- Шаги (доска Wizard): пройденные — с галочкой и кликабельны, будущие — когда предыдущие заполнены -->
        <div class="max-sm:hidden lg:w-[220px] lg:shrink-0">
          <h1 class="m-0 mb-4 text-2xl leading-8 font-semibold tracking-[-0.02em] text-ink lg:mb-5">{{ t('client.wizard.title') }}</h1>
          <nav :aria-label="t('client.wizard.stepsLabel')" data-wz-steps>
          <ol class="m-0 flex list-none flex-wrap gap-1 p-0 lg:flex-col">
            <li v-for="(key, i) in STEPS" :key="key">
              <button
                type="button"
                :class="stepRow(i)"
                :aria-current="i === step ? 'step' : undefined"
                :disabled="!canOpen(i) || undefined"
                :data-wz-step="key"
                @click="goTo(i)"
              >
                <span :class="stepDot(i)" aria-hidden="true">
                  <PhCheck v-if="stepDone(i)" :size="12" weight="bold" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                {{ stepLabel(i) }}
              </button>
            </li>
          </ol>
          </nav>
        </div>

        <div class="flex min-w-0 max-w-[720px] flex-1 flex-col gap-7 sm:gap-8">
          <div ref="stepHost">
            <StepCargo v-if="step === 0" :draft="draft" :post-options="postOptions" :posts-loading="postsLoading" />
            <StepTransport v-else-if="step === 1" :draft="draft" />
            <StepParties
              v-else-if="step === 2"
              :draft="draft"
              :country-options="countryOptions"
              :can-fill-from-profile="!!profile"
              @fill-from-profile="fillReceiverFromProfile"
            />
            <!-- Шаг «Документы» — задача 8 -->
            <section v-else :aria-labelledby="`${uid}-docs`" data-step="docs">
              <h2 :id="`${uid}-docs`" tabindex="-1" :class="stepTitle">{{ t('client.wizard.docs.title') }}</h2>
            </section>
          </div>

          <!-- Нижняя панель: на компьютере — строкой под шагом, на телефоне — липкая снизу (доска WizardPhone) -->
          <div
            class="flex flex-col gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-[5] max-sm:-mx-4 max-sm:-mb-5 max-sm:border-0 max-sm:border-t max-sm:border-solid max-sm:border-line max-sm:bg-surface max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(16px,env(safe-area-inset-bottom))]"
            data-wz-footer
          >
            <div class="flex flex-wrap items-center gap-3 max-sm:flex-nowrap max-sm:gap-2.5">
              <ZButton v-if="step > 0" :class="backBtn" data-wz-back @click="back">{{ t('client.wizard.back') }}</ZButton>
              <button
                v-if="caseId"
                type="button"
                :aria-busy="finishing || undefined"
                class="cursor-pointer rounded-field border-0 bg-transparent px-1 py-2 font-sans text-sm font-medium text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus aria-busy:cursor-progress max-sm:hidden"
                data-wz-later
                @click="finishLater"
              >{{ t('client.wizard.later') }}</button>
              <ZButton
                v-if="step < LAST"
                variant="primary"
                :disabled="!canNext"
                :loading="advancing"
                :class="cn(primaryBtn, 'sm:ml-auto')"
                data-wz-next
                @click="next"
              >{{ nextLabel }}</ZButton>
            </div>
            <p v-if="saveState === 'failed'" class="m-0 flex items-center justify-center gap-1.5 text-[12.5px] text-ink-2 sm:hidden" data-wz-phone-failed>
              <PhWarningCircle :size="14" weight="bold" class="text-danger" aria-hidden="true" />
              {{ t('client.wizard.status.failed') }} —
              <button
                type="button"
                class="inline-flex min-h-11 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-[12.5px] font-semibold text-zircon-ink outline-hidden focus-visible:shadow-focus"
                @click="retrySave"
              >{{ t('client.wizard.status.retry') }}</button>
            </p>
            <p v-else class="m-0 text-center text-[12.5px] text-muted sm:hidden">{{ t('client.wizard.autosaveHint') }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
