<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import { import40Api } from '@/api/import40'
import { message } from '@/ui/message'
import type { CaseStepContext } from '../caseContext'
import { dhtText } from '@/utils/import40StageModel'

// «ДХТ — документ хранения товаров» в шаге «Размещение в ЗТК» (01.11.2026, пункт 7 правок 30.10): номер и дата. Правят КПП,
// декларант, РОП, админ (canBorderScans — как сервер, CanPlacementDocs); остальным — строка чтения. Номер и дата уходят в гр.44
// ещё не поданных ДТ заявки (код по транспорту: 09025 / 09026). Скан ДХТ — в «Сканах с границы», вид «ДХТ».
const props = defineProps<{ ctx: CaseStepContext; readonly?: boolean }>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`placement.dht.${key}`, p ?? {})

const kase = computed(() => props.ctx.kase)
const canEdit = computed(() => !props.readonly && props.ctx.perms.canBorderScans)
const line = computed(() => dhtText(kase.value, t))

const number = ref('')
const date = ref<string | null>(null)
const error = ref('')
// Перечитывание заявки не затирает несохранённый ввод: поле обновляется, только если его не трогали.
let synced = { number: '', date: null as string | null }
watch(() => [kase.value.dhtNumber ?? '', kase.value.dhtDate ?? null] as const, ([n, d]) => {
  if (number.value === synced.number && date.value === synced.date) {
    number.value = n
    date.value = d
  }
  synced = { number: n, date: d }
}, { immediate: true })

const dirty = computed(() => number.value.trim() !== (kase.value.dhtNumber ?? '') || (date.value ?? null) !== (kase.value.dhtDate ?? null))
const saving = computed(() => props.ctx.actions.isPending('dht'))

const send = async (n: string, d: string | null, done: string) => {
  const ok = await props.ctx.actions.mutate('dht', async () => {
    props.ctx.setCase(await import40Api.updateDht(kase.value.id, { number: n, date: n ? d : null }))
  }, { reload: false })
  if (ok) message.success(done)
}
const save = async () => {
  error.value = ''
  const n = number.value.trim()
  if (!n) {
    error.value = tx('numberRequired')
    return
  }
  await send(n, date.value, tx('saved'))
}
const clear = async () => {
  error.value = ''
  number.value = ''
  date.value = null
  await send('', null, tx('cleared'))
}
</script>

<template>
  <section class="flex flex-col gap-2" data-dht :data-dht-filled="kase.dhtNumber ? 'yes' : 'no'">
    <h3 class="m-0 text-[13px] font-semibold text-ink">{{ tx('title') }}</h3>
    <template v-if="canEdit">
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
        <ZField :label="tx('number')" :error="error || undefined">
          <ZInput v-model:value="number" mono :maxlength="50" autocomplete="off" class="max-sm:h-11" data-dht-number @press-enter="save" />
        </ZField>
        <ZField :label="tx('date')">
          <ZDate v-model:value="date" allow-clear class="max-sm:h-11" data-dht-date />
        </ZField>
        <div class="flex flex-wrap gap-2">
          <ZButton variant="primary" :disabled="!dirty || ctx.actions.busy()" :loading="saving" class="max-sm:min-h-11 max-sm:flex-1" data-dht-save @click="save">
            {{ tx('save') }}
          </ZButton>
          <ZButton v-if="kase.dhtNumber" :disabled="ctx.actions.busy()" class="max-sm:min-h-11" data-dht-clear @click="clear">
            {{ tx('clear') }}
          </ZButton>
        </div>
      </div>
      <p class="m-0 text-xs text-muted" data-dht-hint>{{ tx('hint', { code: kase.dhtDocCode || (kase.transportMode === 2 ? '09026' : '09025') }) }}</p>
    </template>
    <p v-else class="m-0 text-sm text-ink [overflow-wrap:anywhere]" data-dht-line>{{ line || tx('empty') }}</p>
  </section>
</template>
