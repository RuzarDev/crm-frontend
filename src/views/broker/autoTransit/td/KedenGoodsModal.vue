<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { TotalsCheck } from '@/api/autoTransit'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import {
  kedenGoodsCheck, kedenGoodsFileName, kedenGoodsRows, kedenGoodsTsv, kedenGoodsXlsx, type KedenGoodsSource, type KedenIssue,
} from './kedenGoods'

// «Товары для КЕДЕН» (этап 4, спека 2026-11-26): таблица товаров СОХРАНЁННОЙ ПИ / ТД для «Импорта из файла» списка
// товаров ПИ в КЕДЕН. Ошибки проверки блокируют обе кнопки, предупреждения — нет. Несохранённые правки в таблицу
// не попадают — окно об этом предупреждает (stale). В базу ничего не пишется.
const props = defineProps<{
  open: boolean
  /** Сохранённая форма: товары, места, контейнеры. */
  source: KedenGoodsSource
  totals?: TotalsCheck | null
  plate?: string | null
  partyNumber?: number | string | null
  /** ТД не сохраняли или в форме есть несохранённые правки. */
  stale: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t, te } = useI18n()
const K = 'broker.autoTransit.td.kedenGoods'

const check = computed(() => kedenGoodsCheck(props.source, props.totals))
const blocked = computed(() => check.value.errors.length > 0)
const count = computed(() => props.source.goods.length)

const issueText = (i: KedenIssue): string => {
  const k = `${K}.issue.${i.key}`
  if (!te(k)) return i.text
  const numbers = i.numbers ? i.numbers.slice(0, 15).join(', ') + (i.numbers.length > 15 ? ` … (${i.numbers.length})` : '') : ''
  const totalsLabel = i.totalsKey ? t(`${K}.totalsKey.${i.totalsKey}`) : ''
  return t(k, { numbers, n: count.value, max: 1000, what: totalsLabel })
}

const busy = ref(false)
const onXlsx = async () => {
  if (blocked.value || busy.value) return
  busy.value = true
  try {
    const blob = await kedenGoodsXlsx(kedenGoodsRows(props.source))
    saveBlob(blob, kedenGoodsFileName(props.plate, props.partyNumber))
  } catch {
    message.error(t(`${K}.xlsxFailed`))
  } finally {
    busy.value = false
  }
}
const onCopy = async () => {
  if (blocked.value) return
  try {
    await navigator.clipboard.writeText(kedenGoodsTsv(kedenGoodsRows(props.source)))
    message.success(t(`${K}.copied`, { n: count.value }))
  } catch {
    message.error(t(`${K}.copyFailed`))
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t(`${K}.title`)"
    :width="560"
    data-td-keden-modal
    @update:open="emit('update:open', $event)"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <p class="m-0 text-sm text-ink-2" data-td-keden-hint>{{ t(`${K}.hint`) }}</p>
      <ZAlert v-if="stale" type="warning" show-icon data-td-keden-stale>{{ t(`${K}.stale`) }}</ZAlert>
      <ZAlert v-if="check.errors.length" type="error" show-icon :message="t(`${K}.errorsTitle`)" data-td-keden-errors>
        <ul role="list" class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          <li v-for="e in check.errors" :key="e.key" class="[overflow-wrap:anywhere]" data-td-keden-error>{{ issueText(e) }}</li>
        </ul>
      </ZAlert>
      <ZAlert v-if="check.warnings.length" type="warning" show-icon :message="t(`${K}.warningsTitle`)" data-td-keden-warnings>
        <ul role="list" class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          <li v-for="(w, i) in check.warnings" :key="`${w.key}${i}`" class="[overflow-wrap:anywhere]" data-td-keden-warning>{{ issueText(w) }}</li>
        </ul>
      </ZAlert>
      <p v-if="!blocked" class="m-0 text-sm text-ink" data-td-keden-count>{{ t(`${K}.count`, { n: count }) }}</p>
    </div>
    <template #footer>
      <div class="flex min-w-0 flex-wrap justify-end gap-2 max-sm:flex-col">
        <ZButton class="max-sm:h-11" @click="emit('update:open', false)">{{ t(`${K}.close`) }}</ZButton>
        <ZButton :disabled="blocked" class="max-sm:h-11" data-td-keden-copy @click="onCopy">{{ t(`${K}.copy`) }}</ZButton>
        <ZButton variant="primary" :disabled="blocked" :loading="busy" class="max-sm:h-11" data-td-keden-xlsx @click="onXlsx">{{ t(`${K}.xlsx`) }}</ZButton>
      </div>
    </template>
  </ZModal>
</template>
