<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhSparkle } from '@phosphor-icons/vue'
import { BORDER_SCAN_KINDS } from '../borderKinds'
import ZButton from '@/components/z/ZButton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { useConfirm } from '@/ui/confirm'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import DhtCard from './DhtCard.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { countText, whatsLeft, type WhatsLeftItem } from '../caseSteps'
import { splitSourcesWithParts } from '../declarations'
import DeclarationsList from './DeclarationsList.vue'
import SvhFactCard from './SvhFactCard.vue'
import DocCheckSubmitModal from './DocCheckSubmitModal.vue'
import { documentChecksApi } from '@/api/documentChecks'
import { submitSummary, type SubmitSummary } from '../docCheckModel'

// Шаг 3 «Декларирование и выпуск» (статусы 2 и 3, декларант; доска Case).
// Статус 2: плашка «Что осталось до подачи» (caseSteps.whatsLeft — подсказка, «Подать ДТ» ею не блокируется),
// «Подать ДТ» (подтверждение → submit-declaration; выключена без ДТ или права декларанта / шаг ведёт коллега),
// «Вернуть клиенту». Статус 3: «Зафиксировать выпуск» (подтверждение → release-declaration).
// Ниже — список ДТ (DeclarationsList). Пройденный шаг (mode done) — список ДТ только для чтения.
const props = defineProps<CaseStepProps>()
const { t, locale } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const isDeclaring = computed(() => kase.value.status === 2)
const otherBusy = (key: string) => props.ctx.actions.busy() && !props.ctx.actions.isPending(key)
const declHint = computed(() => hintText(props.ctx.perms.actionHint('declarant'), t))

const left = computed(() => whatsLeft(kase.value, props.ctx.readiness, props.ctx.files, t))
const leftText = (it: WhatsLeftItem): string => {
  switch (it.id) {
    case 'dt': return t(it.done ? 'broker.case.declaring.left.dtDone' : 'broker.case.declaring.left.dtTodo')
    case 'fill': return t('broker.case.declaring.left.fill', { label: it.label, filled: it.filled, total: it.total })
    case 'docs': return it.done
      ? t('broker.case.declaring.left.docsDone', { files: countText('files', it.count, t, locale.value) })
      : t('broker.case.declaring.left.docsTodo')
    case 'problem': return t('broker.case.declaring.left.problem')
  }
}
const leftKey = (it: WhatsLeftItem) => (it.id === 'fill' ? `fill:${it.declarationId}` : it.id)

// «Сканы с границы» (18.10): загружает КПП; декларант заполняет по ним ДТ. «Из сканов» — те же «Из документов»
// (DeclarationsList.runBatch) по уже загруженным сканам подходящего формата.
const scans = computed(() => props.ctx.files.filter((f) => f.section === 'border-scans'))
const scanKinds = computed(() => BORDER_SCAN_KINDS.map((k) => ({ value: k, label: t(`broker.case.border.scanKind.${k}`) })))
const PARSEABLE = /\.(pdf|jpe?g|png|docx|xlsx)$/i
const parseable = computed(() => scans.value.filter((f) => PARSEABLE.test(f.originalFileName)))
const listRef = ref<InstanceType<typeof DeclarationsList> | null>(null)
const loadingScans = ref(false)
const canParse = computed(() => isDeclaring.value && !props.ctx.perms.actionDisabled('declarant') && parseable.value.length > 0)
// 19.10.2026: сканы уже в заявке — отдаём их номера, сервер берёт файлы из хранилища (раньше браузер скачивал их и
// загружал обратно, и в заявке появлялись копии).
const parseScans = async () => {
  if (loadingScans.value || props.ctx.actions.busy() || !listRef.value) return
  loadingScans.value = true
  try {
    await listRef.value.runBatch([], parseable.value.map((f) => f.id))
  } finally {
    loadingScans.value = false
  }
}

// «Подать ДТ»
const SUBMIT = 'submit-declaration'
const noDt = computed(() => !kase.value.declarations.length)
// Разделение ЕТТ/ВТО: подаётся один вариант — пока есть и исходная ДТ, и её части, подать нельзя (сервер — 400 с тем же текстом).
const splitPending = computed(() => splitSourcesWithParts(kase.value.declarations).length > 0)
const submitDisabled = computed(() => props.ctx.perms.actionDisabled('declarant') || noDt.value || splitPending.value || otherBusy(SUBMIT))
const submitHint = computed(() => declHint.value
  || (noDt.value ? t('broker.case.declaring.needDt') : splitPending.value ? t('broker.case.declaring.splitChoice') : ''))
// Сверка документов перед подачей (01.11.2026, D5): нерешённое «Исправить» или файл другой поставки — окно со списком
// вместо обычного подтверждения (одно окно, не два); подать можно. Сверку читает только тот, кто работает с ДТ; сбой
// чтения подачу не задерживает — обычное подтверждение.
const checking = ref(false)
const docCheck = ref<SubmitSummary | null>(null)
const loadSummary = async (): Promise<SubmitSummary | null> => {
  if (!props.ctx.perms.can('declarant')) return null
  try {
    return submitSummary(await documentChecksApi.list(kase.value.id), kase.value.declarations)
  } catch {
    return null
  }
}
const submit = async () => {
  if (checking.value) return
  checking.value = true
  const summary = await loadSummary().finally(() => { checking.value = false })
  if (summary?.show) {
    docCheck.value = summary
    return
  }
  const ok = await confirm({
    title: t('broker.case.declaring.confirmSubmit'),
    content: t('broker.case.declaring.confirmSubmitHint'),
    okText: t('broker.case.declaring.confirmSubmitOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run(SUBMIT)
}
const submitAnyway = async () => {
  docCheck.value = null
  await props.ctx.actions.run(SUBMIT)
}
const backToCheck = () => {
  docCheck.value = null
  document.querySelector('[data-case-doccheck]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// «Вернуть клиенту» — только на статусе 2 (с «ДТ подана» сервер возврат не принимает).
const canReturn = computed(() => props.ctx.perms.can('kpp') || props.ctx.perms.can('declarant'))
const returnHint = computed(() => (canReturn.value ? '' : hintText({ kind: 'role', role: 'declarant' }, t)))

// «Зафиксировать выпуск»
const RELEASE = 'release-declaration'
const releaseDisabled = computed(() => props.ctx.perms.actionDisabled('declarant') || otherBusy(RELEASE))
const release = async () => {
  const ok = await confirm({
    title: t('import40Case.confirmRelease'),
    content: t('import40Case.confirmReleaseHint'),
    okText: t('broker.case.declaring.confirmReleaseOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run(RELEASE)
}
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="isDeclaring ? '' : t('broker.case.declaring.metaSubmitted')" flush>
    <template #actions>
      <template v-if="isDeclaring">
        <ZTooltip :title="returnHint">
          <span class="inline-flex max-sm:flex-1" :tabindex="returnHint ? 0 : undefined">
            <ZButton variant="ghost" :disabled="!canReturn || otherBusy('return-to-client')" class="max-sm:w-full" data-declaring-return @click="ctx.actions.ask('return')">
              {{ t('import40Case.returnToClient') }}
            </ZButton>
          </span>
        </ZTooltip>
        <ZTooltip :title="submitDisabled ? submitHint : ''">
          <span class="inline-flex max-sm:flex-1" :tabindex="submitDisabled && submitHint ? 0 : undefined">
            <ZButton
              variant="primary"
              :disabled="submitDisabled"
              :loading="ctx.actions.isPending(SUBMIT) || checking"
              class="max-sm:w-full"
              data-declaring-submit
              @click="submit"
            >{{ t('import40Case.submitDt') }}</ZButton>
          </span>
        </ZTooltip>
      </template>
      <ZTooltip v-else :title="releaseDisabled ? declHint : ''">
        <span class="inline-flex max-sm:w-full" :tabindex="releaseDisabled && declHint ? 0 : undefined">
          <ZButton
            variant="primary"
            :disabled="releaseDisabled"
            :loading="ctx.actions.isPending(RELEASE)"
            class="max-sm:w-full"
            data-declaring-release
            @click="release"
          >{{ t('import40Case.fixRelease') }}</ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="px-[18px] pb-3.5">
      <section
        v-if="isDeclaring"
        aria-labelledby="case-whats-left-title"
        class="rounded-row border border-gold-line bg-gold-soft px-4 py-3.5"
        data-whats-left
      >
        <h3 id="case-whats-left-title" class="m-0 mb-2 text-[13px] font-semibold text-gold-ink">{{ t('broker.case.declaring.left.title') }}</h3>
        <ul role="list" class="m-0 grid list-none grid-cols-1 gap-x-[18px] gap-y-1.5 p-0 text-[13.5px] text-ink sm:grid-cols-2">
          <li v-for="it in left" :key="leftKey(it)" class="flex min-w-0 items-start gap-2" :data-left-item="it.id" :data-left-done="it.done">
            <PhCheck v-if="it.done" :size="15" weight="bold" class="mt-[3px] shrink-0 text-tone-done-fg" aria-hidden="true" />
            <span v-else class="mt-[3px] size-[15px] shrink-0 rounded-pill border-[1.5px] border-gold" aria-hidden="true" />
            <span class="min-w-0 [overflow-wrap:anywhere]">
              {{ leftText(it) }}<span class="sr-only"> — {{ t(it.done ? 'broker.case.declaring.left.stateDone' : 'broker.case.declaring.left.stateTodo') }}</span>
            </span>
          </li>
        </ul>
      </section>
      <p v-else class="m-0 text-[13px] text-muted" data-declaring-submitted>{{ t('import40Case.status3Note') }}</p>

      <!-- ДХТ и сканы шага размещения декларант вносит и здесь (01.11.2026, пункт 9 правок 30.10): документы иногда присылает СВХ. -->
      <DhtCard class="mt-3.5" :ctx="ctx" />
      <CaseDocsSlot
        class="mt-3.5"
        :ctx="ctx"
        section="border-scans"
        :label="t('broker.case.border.scans')"
        :can-upload="ctx.perms.canBorderScans"
        :can-remove="ctx.perms.canBorderScans"
        multiple
        with-kind
        :kinds="scanKinds"
        :empty-text="t('broker.case.declaring.scansEmpty')"
        data-declaring-scans
      >
        <template #label-extra>
          <ZButton
            v-if="canParse"
            variant="ghost"
            size="sm"
            class="max-sm:min-h-11"
            :disabled="ctx.actions.busy() || loadingScans"
            :loading="loadingScans || ctx.actions.isPending('dt-batch')"
            data-scans-parse
            @click="parseScans"
          >
            <PhSparkle :size="15" aria-hidden="true" />{{ t('broker.case.declaring.scansParse') }}
          </ZButton>
        </template>
      </CaseDocsSlot>
    </div>

    <DeclarationsList ref="listRef" :ctx="ctx" mode="current" />
    <SvhFactCard :ctx="ctx" class="mt-4" />
    <DocCheckSubmitModal :open="!!docCheck" :summary="docCheck" @back="backToCheck" @submit="submitAnyway" @cancel="docCheck = null" />
  </CaseStepPanel>

  <DeclarationsList v-else :ctx="ctx" mode="done" />
</template>
