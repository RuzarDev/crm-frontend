<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { import40Api, type SvhDelayReason } from '@/api/import40'
import { extractServerText } from '@/api/client'
import type { CaseStepContext } from '../caseContext'
import { isFuture, partsToIso } from './borderTime'

// Окно «СВХ: факт» (21.10.2026): въезд/выезд (дата + время), места и брутто по СВХ, тариф за сутки и бесплатные сутки,
// причина простоя и комментарий (только сотрудникам). PUT /import40/{id}/svh-fact — всё целиком.
const props = defineProps<{ open: boolean; ctx: CaseStepContext }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.case.svhFact.${key}`, p ?? {})

const REASONS: SvhDelayReason[] = ['client', 'customs', 'broker', 'carrier', 'svh', 'other']
const pad = (n: number) => String(n).padStart(2, '0')
const toParts = (iso: string | null | undefined) => {
  if (!iso) return { date: null as string | null, time: '' }
  const d = new Date(iso)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

const form = reactive({
  inDate: null as string | null, inTime: '', outDate: null as string | null, outTime: '',
  packages: null as number | null, gross: null as number | null, tariff: null as number | null, freeDays: null as number | null,
  reason: null as SvhDelayReason | null, note: '',
})
const error = ref('')
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  const f = props.ctx.kase.svhFact
  const a = toParts(f?.enteredAtUtc), b = toParts(f?.leftAtUtc)
  Object.assign(form, {
    inDate: a.date, inTime: a.time, outDate: b.date, outTime: b.time,
    packages: f?.factPackages ?? null, gross: f?.factGrossKg ?? null, tariff: f?.tariffPerDay ?? null, freeDays: f?.freeDays ?? null,
    reason: f?.delayReason ?? null, note: f?.note ?? '',
  })
  error.value = ''
}, { immediate: true })

const reasonOptions = computed(() => REASONS.map((r) => ({ value: r, label: tx(`reason.${r}`) })))

const submit = async () => {
  if (saving.value) return
  const entered = form.inDate ? partsToIso(form.inDate, form.inTime || '00:00') : null
  const left = form.outDate ? partsToIso(form.outDate, form.outTime || '00:00') : null
  if ((form.inDate && !entered) || (form.outDate && !left)) { error.value = tx('badTime'); return }
  if (left && !entered) { error.value = tx('needEntered'); return }
  if (entered && left && new Date(left) < new Date(entered)) { error.value = tx('leftBeforeEntered'); return }
  if (isFuture(entered) || isFuture(left)) { error.value = tx('future'); return }
  saving.value = true
  error.value = ''
  try {
    const updated = await import40Api.updateSvhFact(props.ctx.kase.id, {
      enteredAtUtc: entered, leftAtUtc: left,
      factPackages: form.packages, factGrossKg: form.gross, tariffPerDay: form.tariff, freeDays: form.freeDays,
      delayReason: form.reason, note: form.note.trim() || null,
    })
    props.ctx.setCase(updated)
    emit('update:open', false)
  } catch (e) {
    error.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? tx('saveError')
  } finally {
    saving.value = false
  }
}
const close = () => { if (!saving.value) emit('update:open', false) }
</script>

<template>
  <ZModal
    :open="open"
    :title="tx('title')"
    :ok-text="t('common.save')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    :cancel-button-props="{ disabled: saving }"
    data-svh-fact-modal
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-1">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ZField :label="tx('enteredLabel')">
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,110px)] gap-2">
            <ZDate v-model:value="form.inDate" allow-clear class="w-full max-sm:h-11" data-svh-in-date />
            <ZInput v-model:value="form.inTime" type="time" class="max-sm:h-11" data-svh-in-time />
          </div>
        </ZField>
        <ZField :label="tx('leftLabel')">
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,110px)] gap-2">
            <ZDate v-model:value="form.outDate" allow-clear class="w-full max-sm:h-11" data-svh-out-date />
            <ZInput v-model:value="form.outTime" type="time" class="max-sm:h-11" data-svh-out-time />
          </div>
        </ZField>
        <ZField :label="tx('packagesLabel')">
          <ZNumber v-model:value="form.packages" :min="0" :precision="2" class="w-full max-sm:h-11" data-svh-packages />
        </ZField>
        <ZField :label="tx('grossLabel')">
          <ZNumber v-model:value="form.gross" :min="0" :precision="3" class="w-full max-sm:h-11" data-svh-gross />
        </ZField>
        <ZField :label="tx('tariffLabel')">
          <ZNumber v-model:value="form.tariff" :min="0" :precision="2" class="w-full max-sm:h-11" data-svh-tariff />
        </ZField>
        <ZField :label="tx('freeDaysLabel')">
          <ZNumber v-model:value="form.freeDays" :min="0" :precision="0" class="w-full max-sm:h-11" data-svh-free />
        </ZField>
      </div>
      <ZField :label="tx('reasonLabel')">
        <ZSelect v-model:value="form.reason" :options="reasonOptions" allow-clear :placeholder="tx('reasonPh')" data-svh-reason />
      </ZField>
      <ZField :label="tx('noteLabel')" :extra="tx('noteHint')">
        <ZInput v-model:value="form.note" :maxlength="2000" class="max-sm:h-11" data-svh-note />
      </ZField>
      <p v-if="error" role="alert" class="m-0 text-[13px] text-tone-danger-fg" data-svh-fact-error>{{ error }}</p>
    </div>
  </ZModal>
</template>
