<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhInfo } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import type { VatOffsetMatchRow } from '@/api/vatOffset'

// Подсказка у строки 5060 (НДС): код товара в перечне для зачёта НДС (ПП РК № 1199 / Приказ МСХ РК № 302) — НДС можно
// уплатить методом зачёта (СП «ЗН»), если импортёр вправе. Только подсказка: СП сама не меняется — право на зачёт
// зависит от импортёра (НК РК ст. 508–509), «Поставить ЗН» — одним нажатием по решению декларанта. СП уже «ЗН» или
// кода нет в перечнях — подсказки нет. «Только: …» — товар в перечне не весь код, а по наименованию.
const props = defineProps<{ rows: readonly VatOffsetMatchRow[]; feature: string | null | undefined; editable: boolean }>()
const emit = defineEmits<{ setZn: [] }>()
const { t } = useI18n()
const tv = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.payments.vatOffset.${key}`, p ?? {})

const show = computed(() => props.rows.length > 0 && (props.feature ?? '').trim() !== 'ЗН')
const act = computed(() => [...new Set(props.rows.map((r) => r.hintLabel))].join(', '))
const only = computed(() => props.rows.filter((r) => r.partial).map((r) => tv('only', { list: r.hintLabel, number: r.number, name: r.name })))
const conditions = computed(() => [...new Set(props.rows.map((r) => r.condition).filter((c): c is string => !!c))])
</script>

<template>
  <div v-if="show" class="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-row bg-tone-info-bg px-2.5 py-2 text-[13px] leading-5 text-ink-2" role="note" data-vat-offset-hint>
    <PhInfo :size="16" class="mt-0.5 shrink-0 text-zircon-ink" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-ink">{{ tv('hint', { act }) }}</span>
      <span v-for="(o, i) in only" :key="i" class="line-clamp-2 text-xs text-muted" :title="o" data-vat-offset-only>{{ o }}</span>
      <span v-for="(c, i) in conditions" :key="`c${i}`" class="line-clamp-2 text-xs text-muted" :title="c" data-vat-offset-condition>{{ c }}</span>
    </div>
    <ZButton v-if="editable" size="sm" variant="secondary" class="shrink-0 max-sm:h-11" data-vat-offset-set-zn @click="emit('setZn')">{{ tv('setZn') }}</ZButton>
  </div>
</template>
