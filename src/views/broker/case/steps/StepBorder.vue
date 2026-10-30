<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import type { Import40BorderControlDto } from '@/api/import40'
import { BORDER_CONTROL_KINDS, BORDER_SCAN_KINDS } from '../borderKinds'
import { useConfirm } from '@/ui/confirm'
import { whenText } from '@/utils/import40StageModel'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { transportSummary } from '../caseFormat'
import BorderArrivalModal from './BorderArrivalModal.vue'
import BorderControlModal from './BorderControlModal.vue'
import DraftContainers from './DraftContainers.vue'

// Шаг 2 «Граница» (статус 1, КПП): сводка транспорта, «Машина прибыла» (время, пост, комментарий; отметку можно отменить),
// чек-лист контролей (каждый — со временем), «Сканы с границы» (грузят КПП и руководитель) и кнопки «Граница пройдена»
// (без сканов — мягкое предупреждение; без отметки прибытия сервер отмечает её тем же действием) и «Вернуть клиенту».
// «Взять в работу» — в правой колонке (CaseTeam). Пройденный шаг (mode done) — то же в режиме чтения.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const summary = computed(() => transportSummary(kase.value, t))
const cargo = computed(() => kase.value.cargo)

const passKey = 'border-passed'
const passing = computed(() => props.ctx.actions.isPending(passKey))
const otherBusy = computed(() => props.ctx.actions.busy() && !passing.value)
// S-24 (30.10.2026): «Граница пройдена» — то же правило, что «Машина прибыла» и контроли (canBorderWork, как сервер):
// раньше декларант по праву import40.kpp проходил границу, не имея возможности отметить прибытие.
const passDisabled = computed(() => !props.ctx.perms.canBorderWork || otherBusy.value)
const canReturn = computed(() => props.ctx.perms.can('kpp') || props.ctx.perms.can('declarant'))
const returnHint = computed(() => (canReturn.value ? '' : hintText({ kind: 'role', role: 'kpp' }, t)))

// ---- Прибытие ----
const arrived = computed(() => kase.value.borderArrivedAtUtc ?? null)
const canWork = computed(() => props.ctx.perms.canBorderWork)
const workHint = computed(() => (canWork.value ? '' : hintText(props.ctx.perms.actionHint('kpp'), t) || hintText({ kind: 'role', role: 'kpp' }, t)))
const arrivalOpen = ref(false)
const arrivalText = computed(() => {
  if (!arrived.value) return ''
  const post = kase.value.borderArrivalPost
  return [t('broker.case.border.arrivedLine', { when: whenText(arrived.value, t) }), post ? t('broker.case.border.postLine', { post }) : '']
    .filter(Boolean).join(' · ')
})
const cancelArrival = async () => {
  const ok = await confirm({
    title: t('broker.case.border.cancelArrivalConfirm'),
    content: t('broker.case.border.cancelArrivalHint'),
    okText: t('broker.case.border.cancelArrivalOk'),
    cancelText: t('broker.case.border.keep'),
    danger: true,
  })
  if (ok) await props.ctx.actions.run('border-arrived-cancel')
}

// ---- Контроли ----
const controls = computed<Import40BorderControlDto[]>(() => kase.value.borderControls ?? [])
const controlName = (c: Import40BorderControlDto) =>
  c.kind === 'other' && c.text ? c.text : t(`broker.case.border.control.${c.kind}`)
const controlsOf = (kind: string) => controls.value.filter((c) => c.kind === kind)
const controlKind = ref<string | null>(null)
const controlOpen = ref(false)
const askControl = (kind: string) => {
  controlKind.value = kind
  controlOpen.value = true
}
const removeControl = async (c: Import40BorderControlDto) => {
  const ok = await confirm({
    title: t('broker.case.border.removeControlConfirm', { name: controlName(c) }),
    okText: t('broker.case.border.removeControlOk'),
    cancelText: t('broker.case.border.keep'),
    danger: true,
  })
  if (ok) await props.ctx.actions.run('border-control-remove', { value: c.id })
}

// ---- Сканы ----
const scans = computed(() => props.ctx.files.filter((f) => f.section === 'border-scans'))
const scanKinds = computed(() => BORDER_SCAN_KINDS.map((k) => ({ value: k, label: t(`broker.case.border.scanKind.${k}`) })))
const canScans = computed(() => props.ctx.perms.canBorderScans)

const pass = async () => {
  const ok = scans.value.length
    ? await confirm({
      title: t('broker.case.border.confirm'),
      content: arrived.value ? undefined : t('broker.case.border.confirmMarksArrival'),
      okText: t('broker.case.border.confirmOk'),
      cancelText: t('common.cancel'),
    })
    // Сканов нет — мягкое предупреждение: декларант ждёт их, чтобы заполнять ДТ.
    : await confirm({
      title: t('broker.case.border.noScansWarn'),
      content: arrived.value ? undefined : t('broker.case.border.confirmMarksArrival'),
      okText: t('broker.case.border.continueAnyway'),
      cancelText: t('common.cancel'),
    })
  if (ok) await props.ctx.actions.run('border-passed')
}

const rowCls = 'flex min-h-11 items-center gap-2.5 rounded-row border border-line bg-canvas px-3 py-1.5 sm:min-h-10'
const iconBtn = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none max-sm:size-11'
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="t('broker.case.border.meta')">
    <template #actions>
      <ZTooltip :title="returnHint">
        <span class="inline-flex max-sm:w-full" :tabindex="returnHint ? 0 : undefined">
          <ZButton :disabled="!canReturn || otherBusy" class="max-sm:w-full" data-border-return @click="ctx.actions.ask('return')">
            {{ t('import40Case.returnToClient') }}
          </ZButton>
        </span>
      </ZTooltip>
      <ZTooltip v-if="!arrived" :title="workHint">
        <span class="inline-flex max-sm:w-full" :tabindex="workHint ? 0 : undefined">
          <ZButton :disabled="!canWork || otherBusy" class="max-sm:w-full" data-border-arrived @click="arrivalOpen = true">
            {{ t('broker.case.border.arrived') }}
          </ZButton>
        </span>
      </ZTooltip>
      <ZTooltip :title="workHint">
        <span class="inline-flex max-sm:w-full" :tabindex="workHint ? 0 : undefined">
          <ZButton variant="primary" :disabled="passDisabled" :loading="passing" class="max-sm:w-full" data-border-passed @click="pass">
            {{ t('import40Case.borderPassed') }}
          </ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="flex flex-col gap-4" data-border-body>
      <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt class="text-muted">{{ t('broker.case.draft.transport') }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" data-border-transport>{{ summary }}</dd>
        <template v-if="cargo">
          <dt class="text-muted">{{ t('broker.case.draft.cargo') }}</dt>
          <dd class="m-0 text-ink [overflow-wrap:anywhere]">{{ cargo }}</dd>
        </template>
      </dl>
      <DraftContainers v-if="ctx.kase.containers.length" :ctx="ctx" />

      <section class="flex flex-col gap-1.5" data-border-arrival :data-arrived="arrived ? 'yes' : 'no'">
        <h3 class="m-0 text-[13px] font-semibold text-ink">{{ t('broker.case.border.arrivalTitle') }}</h3>
        <div v-if="arrived" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="text-sm text-ink [overflow-wrap:anywhere]" data-arrival-text>{{ arrivalText }}</span>
          <button
            v-if="canWork"
            type="button"
            class="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-tone-danger-fg underline-offset-2 hover:underline focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0"
            :disabled="ctx.actions.busy()"
            data-arrival-cancel
            @click="cancelArrival"
          >
            {{ t('broker.case.border.cancelArrival') }}
          </button>
          <p v-if="ctx.kase.borderArrivalNote" class="m-0 basis-full text-[13px] text-muted [overflow-wrap:anywhere]" data-arrival-note>
            {{ ctx.kase.borderArrivalNote }}
          </p>
        </div>
        <p v-else class="m-0 text-[13px] text-muted" data-arrival-empty>{{ t('broker.case.border.arrivalEmpty') }}</p>
      </section>

      <section class="flex flex-col gap-2" data-border-controls>
        <h3 class="m-0 text-[13px] font-semibold text-ink">{{ t('broker.case.border.controlsTitle') }}</h3>
        <ul role="list" class="m-0 flex list-none flex-col gap-1.5 p-0">
          <li v-for="kind in BORDER_CONTROL_KINDS" :key="kind" :class="rowCls" :data-control-row="kind" :data-done="controlsOf(kind).length ? 'yes' : 'no'">
            <PhCheckCircle
              :size="18"
              :weight="controlsOf(kind).length ? 'fill' : 'regular'"
              :class="controlsOf(kind).length ? 'shrink-0 text-tone-done-fg' : 'shrink-0 text-ink-3'"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-ink">{{ t(`broker.case.border.control.${kind}`) }}</div>
              <div v-for="c in controlsOf(kind)" :key="c.id" class="flex items-center gap-1 text-xs text-muted" data-control-done>
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {{ [kind === 'other' ? c.text : '', whenText(c.atUtc, t), c.userName].filter(Boolean).join(' · ') }}
                </span>
                <button
                  v-if="canWork"
                  type="button"
                  :class="iconBtn"
                  :disabled="ctx.actions.busy()"
                  :aria-label="t('broker.case.border.removeControlAria', { name: controlName(c) })"
                  data-control-remove
                  @click="removeControl(c)"
                >
                  <PhTrash :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>
            <ZButton
              v-if="canWork && (kind === 'other' || !controlsOf(kind).length)"
              size="sm"
              :disabled="ctx.actions.busy()"
              class="shrink-0 max-sm:min-h-11"
              data-control-mark
              @click="askControl(kind)"
            >
              {{ t('broker.case.border.controlMark') }}
            </ZButton>
          </li>
        </ul>
      </section>

      <CaseDocsSlot
        :ctx="ctx"
        section="border-scans"
        :label="t('broker.case.border.scans')"
        :hint="t('broker.case.border.scansHint')"
        :can-upload="canScans"
        :can-remove="canScans"
        multiple
        with-kind
        :kinds="scanKinds"
        :empty-text="t('broker.case.border.scansEmpty')"
      />
    </div>

    <BorderArrivalModal v-model:open="arrivalOpen" :ctx="ctx" />
    <BorderControlModal v-model:open="controlOpen" :ctx="ctx" :kind="controlKind" />
  </CaseStepPanel>

  <div v-else class="flex flex-col gap-3" data-border-done>
    <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-muted">{{ t('broker.case.draft.transport') }}</dt>
      <dd class="m-0 text-ink [overflow-wrap:anywhere]">{{ summary }}</dd>
      <template v-if="arrived">
        <dt class="text-muted">{{ t('broker.case.border.arrivalTitle') }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" data-arrival-text>{{ arrivalText }}</dd>
      </template>
      <template v-if="controls.length">
        <dt class="text-muted">{{ t('broker.case.border.controlsTitle') }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" data-done-controls>
          {{ controls.map((c) => `${controlName(c)} (${whenText(c.atUtc, t)})`).join(', ') }}
        </dd>
      </template>
    </dl>
    <DraftContainers v-if="ctx.kase.containers.length" :ctx="ctx" />
    <CaseDocsSlot
      v-if="scans.length"
      :ctx="ctx"
      section="border-scans"
      :label="t('broker.case.border.scans')"
      with-kind
      :kinds="scanKinds"
    />
  </div>
</template>
