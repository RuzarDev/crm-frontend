<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import { import40Api, type Import40CopySource } from '@/api/import40'
import { cn } from '@/ui/cn'
import { formatDateText } from '@/ui/date'
import { formatMoney } from '@/ui/number'
import { defaultCopySource, filterCopySources } from './copyDt'
import { clipLabel } from '../dtTitle'

// «Копировать ДТ» (20.10.2026, просьба декларанта): тот же груз по тому же контракту — новая ДТ по образцу ДТ этой или
// прошлой заявки клиента. Список — с сервера при каждом открытии; товары копируются по галочке (по умолчанию да).
// 23.10.2026: своё название ДТ рядом с номером (если сервер его отдаёт); копия название не наследует.
const props = defineProps<{ open: boolean; caseId: string; busy?: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [payload: { sourceDeclarationId: string; includeGoods: boolean }] }>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.case.declaring.copy.${key}`, p ?? {})

const rows = ref<Import40CopySource[]>([])
const loading = ref(false)
const failed = ref(false)
const query = ref('')
const selected = ref<string | null>(null)
const includeGoods = ref(true)

watch(() => props.open, async (open) => {
  if (!open) return
  query.value = ''
  includeGoods.value = true
  failed.value = false
  loading.value = true
  try {
    rows.value = await import40Api.copySources(props.caseId)
    selected.value = defaultCopySource(rows.value, props.caseId)
  } catch {
    rows.value = []
    selected.value = null
    failed.value = true
  } finally {
    loading.value = false
  }
}, { immediate: true })

const shown = computed(() => filterCopySources(rows.value, query.value))
const caseLine = (r: Import40CopySource) =>
  r.caseId === props.caseId ? `${r.caseNumber} · ${tx('thisCase')}` : `${r.caseNumber} · ${formatDateText(r.caseCreatedAtUtc)}`
const metaLine = (r: Import40CopySource) => [
  r.senderName,
  tx('goods', { n: r.goodsCount }) + (r.firstGoodsDescription ? ` — ${r.firstGoodsDescription}` : ''),
  r.totalInvoiceValue != null ? formatMoney(r.totalInvoiceValue, r.currency || '').trim() : null,
].filter(Boolean).join(' · ')

const submit = () => {
  if (!selected.value || props.busy) return
  emit('submit', { sourceDeclarationId: selected.value, includeGoods: includeGoods.value })
}
</script>

<template>
  <ZModal
    :open="open"
    :title="tx('title')"
    :width="640"
    :ok-text="tx('ok')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="busy"
    :ok-button-props="{ disabled: !selected }"
    data-copy-dt-modal
    @update:open="emit('update:open', $event)"
    @ok="submit()"
  >
    <div class="flex flex-col gap-3 pb-2 text-[13px]">
      <p class="m-0 text-ink-2">{{ tx('lead') }}</p>
      <ZSpin v-if="loading" />
      <p v-else-if="failed" class="m-0 rounded-row bg-tone-danger-bg px-3 py-2 text-tone-danger-fg" data-copy-failed>{{ tx('failed') }}</p>
      <p v-else-if="!rows.length" class="m-0 rounded-row bg-sunken px-3 py-2 text-muted" data-copy-empty>{{ tx('empty') }}</p>
      <template v-else>
        <ZInput v-if="rows.length > 5" v-model:value="query" type="search" allow-clear :placeholder="tx('search')" :aria-label="tx('search')" data-copy-search />
        <p v-if="!shown.length" class="m-0 text-muted">{{ tx('nothingFound') }}</p>
        <ul v-else role="radiogroup" :aria-label="tx('title')" class="m-0 flex max-h-[340px] list-none flex-col gap-1 overflow-y-auto p-0" data-copy-list>
          <li v-for="r in shown" :key="r.id">
            <label
              :class="cn('flex cursor-pointer items-start gap-2.5 rounded-row border px-3 py-2', selected === r.id ? 'border-zircon-ink bg-sunken' : 'border-line hover:bg-sunken')"
              :data-copy-source="r.id"
            >
              <input v-model="selected" type="radio" name="copy-dt-source" :value="r.id" class="mt-1 accent-zircon-ink" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-ink [overflow-wrap:anywhere]">
                  <span class="font-mono">{{ r.declarationNumber || tx('noNumber') }}</span>
                  <span v-if="r.title" data-copy-title> · {{ clipLabel(r.title) }}</span>
                </span>
                <span class="block text-xs text-ink-3">{{ caseLine(r) }}</span>
                <span v-if="metaLine(r)" class="block break-words text-xs text-muted">{{ metaLine(r) }}</span>
              </span>
            </label>
          </li>
        </ul>
        <div>
          <ZCheckbox v-model:checked="includeGoods" data-copy-with-goods>{{ tx('withGoods') }}</ZCheckbox>
          <p class="m-0 mt-0.5 pl-6 text-xs text-muted">{{ tx('withGoodsHint') }}</p>
        </div>
      </template>
    </div>
  </ZModal>
</template>
