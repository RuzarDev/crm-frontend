<!-- Подсказка под «Страной происхождения» (гр.16/34): антидемпинговые/компенсационные пошлины КЕДЕН
     по коду ТН ВЭД и стране. Только предупреждает — в гр.47 не начисляется: условие часто зависит от
     производителя, решает декларант. -->
<template>
  <div v-if="items.length" class="ad-hint">
    <div v-for="(a, i) in items" :key="i" class="ad-line" :title="a.condition ?? ''">
      {{ t('dt.antiDumpingLine', { rate: a.rate, country: a.country ?? t('dt.antiDumpingAnyCountry'), until: until(a.endDate) }) }}
      <span v-if="a.condition" class="ad-cond">{{ a.condition }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { tnvedApi, type AntiDumpingDto } from '@/api/tnved'

const props = defineProps<{ code?: string | null; country?: string | null }>()
const { t } = useI18n()
const items = ref<AntiDumpingDto[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const until = (d: string | null) => (d ? d.split('-').reverse().join('.') : t('dt.antiDumpingNoEnd'))

watch(
  () => [props.code?.trim() ?? '', props.country?.trim() ?? ''] as const,
  ([code, country]) => {
    clearTimeout(timer)
    if (code.length !== 10 || !country) {
      items.value = []
      return
    }
    const my = ++seq
    timer = setTimeout(async () => {
      try {
        const { data } = await tnvedApi.antiDumping(code, country)
        if (my === seq) items.value = data
      } catch {
        if (my === seq) items.value = []
      }
    }, 300)
  },
  { immediate: true },
)
</script>

<style scoped>
.ad-hint { margin-top: 4px; line-height: 1.4; }
.ad-line { font-size: 12px; color: var(--z-warning, #8a6410); background: var(--z-warning-soft, #fdf1d8); border-radius: var(--r-sm, 6px); padding: 3px 8px; font-weight: 500; }
.ad-line + .ad-line { margin-top: 2px; }
.ad-cond { display: block; font-weight: 400; opacity: 0.85; white-space: normal; }
</style>
