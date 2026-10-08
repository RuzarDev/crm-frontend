<script setup lang="ts">
import { computed, nextTick, reactive, type Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/ui/cn'
import CaseActionModals from './CaseActionModals.vue'
import CaseBanners from './CaseBanners.vue'
import CaseHeader from './CaseHeader.vue'
import CaseSide from './CaseSide.vue'
import CaseStepper from './CaseStepper.vue'
import StepBorder from './steps/StepBorder.vue'
import StepDeclaring from './steps/StepDeclaring.vue'
import StepDraft from './steps/StepDraft.vue'
import StepPlaceholder from './steps/StepPlaceholder.vue'
import { casePerms, readinessAvailable } from './casePermissions'
import { STEP_EXECUTOR, STEP_NUMBERS, isCancelled, stepStateOf, stepSummary, type StepNo } from './caseSteps'
import type { CaseStepContext, CaseStepInfo } from './caseContext'
import { useCase } from './useCase'
import { useCaseActions } from './useCaseActions'

// Карточка заявки сотрудника /import-40/:id (редизайн, волна 4а; доски Case и CaseSvh).
// Шапка, полоса шагов, плашки; слева — текущий шаг и «Пройденные шаги», справа — команда, заявка, файлы, история.
// Панели шагов — по контракту caseContext.ts; шаги 4–6 пока StepPlaceholder (Task 5 заменит).
const { t, locale } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const STEP_COMPONENTS: Record<StepNo, Component> = {
  1: StepDraft,
  2: StepBorder,
  3: StepDeclaring,
  4: StepPlaceholder,
  5: StepPlaceholder,
  6: StepPlaceholder,
}

const id = computed(() => String(route.params.id ?? ''))
const { state, kase, files, invoices, readiness, reload, retry, setCase } = useCase(id, { readiness: () => readinessAvailable(auth) })
const { actions, reasonKind } = useCaseActions(() => kase.value?.id ?? null, reload)

const perms = computed(() => (kase.value ? casePerms(auth, kase.value) : null))

const steps = computed<CaseStepInfo[]>(() => {
  const c = kase.value
  if (!c) return []
  return STEP_NUMBERS.map((n) => ({
    n,
    state: stepStateOf(c.status, n),
    title: t(`enum.step.s${n}`),
    executor: STEP_EXECUTOR[n],
    executorLabel: t(`enum.role.${STEP_EXECUTOR[n]}`),
    summary: stepSummary(n, c, files.value, t, locale.value),
  }))
})

const ctxFor = (step: CaseStepInfo): CaseStepContext | null => {
  if (!kase.value || !perms.value) return null
  return {
    kase: kase.value,
    files: files.value,
    invoices: invoices.value,
    readiness: readiness.value,
    perms: perms.value,
    actions,
    setCase,
    step,
  }
}
const current = computed(() => {
  const step = steps.value.find((s) => s.state === 'current')
  const ctx = step ? ctxFor(step) : null
  return step && ctx ? { step, ctx } : null
})
const passed = computed(() => steps.value.filter((s) => s.state === 'done').map((step) => ({ step, ctx: ctxFor(step)! })))

// Пройденные шаги свёрнуты; раскрытие — на экземпляр карточки (смена заявки сбрасывает).
const expanded = reactive<Record<string, boolean>>({})
const expandKey = (n: number) => `${kase.value?.id}:${n}`
const toggle = (n: number) => { expanded[expandKey(n)] = !expanded[expandKey(n)] }

// «Изменить» в правой колонке — к панели текущего шага (черновик).
const focusCurrent = async () => {
  await nextTick()
  const el = document.getElementById('case-step-current')
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el?.focus({ preventScroll: true })
}

const panel = 'rounded-panel border border-line bg-surface'
</script>

<template>
  <div class="flex flex-col gap-[18px]" data-case-view>
    <!-- Загрузка: скелетоны по форме карточки -->
    <div v-if="state === 'loading'" class="flex flex-col gap-[18px]" aria-busy="true" data-case-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="160px" height="13px" />
        <ZSkeleton width="min(380px, 80%)" height="28px" />
        <ZSkeleton width="min(460px, 90%)" height="14px" />
      </div>
      <ZSkeleton height="88px" />
      <div class="flex flex-wrap items-start gap-[18px]">
        <div class="min-w-0 flex-[999_1_480px]"><ZSkeleton height="220px" /></div>
        <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <ZSkeleton height="120px" />
          <ZSkeleton height="160px" />
        </div>
      </div>
    </div>

    <div v-else-if="state === 'notFound'" class="rounded-panel border border-dashed border-line-strong" data-case-not-found>
      <ZEmpty :title="t('broker.case.notFound')" :hint="t('broker.case.notFoundHint')">
        <template #action>
          <RouterLink
            to="/import-40"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('broker.case.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-case-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.case.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-case-retry @click="retry">{{ t('broker.case.retry') }}</ZButton>
    </div>

    <template v-else-if="kase && perms">
      <CaseHeader :kase="kase" :perms="perms" @ask="actions.ask" />
      <CaseStepper :steps="steps" :status="kase.status" />
      <CaseBanners :kase="kase" :perms="perms" :actions="actions" />

      <div class="flex flex-wrap items-start gap-[18px]">
        <div class="flex min-w-0 flex-[999_1_480px] flex-col gap-4" data-case-main>
          <component :is="STEP_COMPONENTS[current.step.n]" v-if="current" :key="`${kase.id}:${current.step.n}`" mode="current" :ctx="current.ctx" />
          <p v-else-if="isCancelled(kase.status)" :class="cn(panel, 'm-0 px-[18px] py-4 text-sm text-ink-3')" data-case-cancelled-note>
            {{ t('broker.case.step.cancelledNote') }}
          </p>

          <section v-if="passed.length" aria-labelledby="case-passed-title" :class="cn(panel, 'overflow-hidden')" data-case-passed>
            <h2 id="case-passed-title" class="m-0 px-[18px] py-3 text-xs font-medium text-muted">{{ t('broker.case.step.passedTitle') }}</h2>
            <div v-for="p in passed" :key="p.step.n" class="border-t border-line" :data-passed-step="p.step.n">
              <h3 class="m-0">
                <button
                  type="button"
                  :aria-expanded="!!expanded[expandKey(p.step.n)]"
                  :aria-controls="`case-passed-${p.step.n}`"
                  class="flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-[18px] py-2.5 text-left font-sans outline-hidden hover:bg-canvas focus-visible:shadow-focus"
                  data-passed-toggle
                  @click="toggle(p.step.n)"
                >
                  <span class="inline-flex size-[22px] shrink-0 items-center justify-center rounded-pill bg-navy text-white" aria-hidden="true">
                    <PhCheck :size="12" weight="bold" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span class="text-sm font-medium text-ink">{{ p.step.title }}</span>
                    <span class="min-w-0 text-[13px] text-muted [overflow-wrap:anywhere]">{{ p.step.summary }}</span>
                  </span>
                  <PhCaretDown
                    :size="16"
                    :class="cn('shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', expanded[expandKey(p.step.n)] && 'rotate-180')"
                    aria-hidden="true"
                  />
                </button>
              </h3>
              <div v-if="expanded[expandKey(p.step.n)]" :id="`case-passed-${p.step.n}`" class="px-[18px] pt-1 pb-4 sm:pl-[52px]" data-passed-body>
                <component :is="STEP_COMPONENTS[p.step.n]" mode="done" :ctx="p.ctx" />
              </div>
            </div>
          </section>
        </div>

        <CaseSide class="flex-[1_1_320px]" :kase="kase" :files="files" :perms="perms" :actions="actions" @edit="focusCurrent" />
      </div>

      <CaseActionModals v-model:kind="reasonKind" :actions="actions" />
    </template>
  </div>
</template>
