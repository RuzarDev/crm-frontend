<template>
  <div v-if="chips.length" class="dt-rates-box">
    <span class="dt-rates-title">
      Курсы валют (НБ РК)<template v-if="asOfLabel"> на дату гр.А ({{ asOfLabel }})</template>
    </span>
    <span v-for="c in chips" :key="c.code" class="dt-rates-chip">
      {{ c.code }}: {{ c.rate }} ₸
    </span>
    <a-tooltip
      title="Текущий справочный курс НБ РК; привязка к историческому курсу на дату гр.А — в планах."
    >
      <span class="dt-rates-note">?</span>
    </a-tooltip>
  </div>
  <div v-else-if="asOfLabel !== null && codes.length" class="dt-rates-box">
    <span class="dt-rates-note-muted">нет валют</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'

const props = defineProps<{
  rates: Record<string, { rate: number; date: string }>
  codes: string[]
  asOfDate: string | null
}>()

const rateFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const chips = computed(() =>
  props.codes
    .map((code) => {
      const entry = props.rates[code]
      if (!entry || entry.rate == null) return null
      return { code, rate: rateFormatter.format(entry.rate) }
    })
    .filter((c): c is { code: string; rate: string } => c !== null),
)

const asOfLabel = computed(() =>
  props.asOfDate ? dayjs(props.asOfDate).format('DD.MM.YYYY') : null,
)
</script>

<style scoped>
.dt-rates-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 6px 12px;
  background: var(--z-surface-subtle, #fafafa);
  border: 1px solid var(--z-border, #f0f0f0);
  border-radius: 6px;
  font-size: 12px;
}
.dt-rates-title {
  font-weight: 600;
  color: var(--z-text-secondary, #595959);
}
.dt-rates-chip {
  padding: 1px 8px;
  background: #fff;
  border: 1px solid var(--z-border, #f0f0f0);
  border-radius: 4px;
  white-space: nowrap;
}
.dt-rates-note {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--z-border, #f0f0f0);
  color: var(--z-text-secondary, #595959);
  font-size: 11px;
  cursor: help;
}
.dt-rates-note-muted {
  color: var(--z-text-secondary, #8c8c8c);
}
</style>
