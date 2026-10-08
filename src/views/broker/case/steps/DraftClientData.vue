<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import type { Import40CaseDto } from '@/api/import40'
import { countryName } from '@/utils/countries'

// «Данные от клиента (для ДТ)»: отправитель, получатель, стоимость — только чтение. Блок есть, лишь если клиент что-то указал.
const props = defineProps<{ kase: Import40CaseDto }>()
const { t, locale } = useI18n()

// Справочник стран — только для названия страны; лениво, без тоста.
const countries = ref<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((r) => { countries.value = r }).catch(() => {})
const country = (code: string | null | undefined) => (code ? countryName(code, countries.value) : '')

const INTL: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const rows = computed(() => {
  const c = props.kase
  const out: { key: string; label: string; value: string }[] = []
  const sender = [c.clientSenderName, country(c.clientSenderCountryCode)].filter(Boolean).join(' · ')
  if (sender) out.push({ key: 'sender', label: t('broker.case.info.sender'), value: sender })
  const receiver = [
    c.clientReceiverName,
    c.clientReceiverBin ? t('broker.case.info.bin', { bin: c.clientReceiverBin }) : '',
    country(c.clientReceiverCountryCode),
  ].filter(Boolean).join(' · ')
  if (receiver) out.push({ key: 'receiver', label: t('broker.case.info.receiver'), value: receiver })
  if (c.clientEstimatedValue != null || c.clientCurrencyCode) {
    const value = c.clientEstimatedValue != null ? c.clientEstimatedValue.toLocaleString(INTL[locale.value] ?? 'ru-RU') : '—'
    out.push({ key: 'value', label: t('broker.case.info.value'), value: [value, c.clientCurrencyCode].filter(Boolean).join(' ') })
  }
  return out
})
</script>

<template>
  <section v-if="rows.length" class="rounded-row bg-canvas px-3.5 py-3" data-draft-client-data>
    <h3 class="m-0 mb-2 text-[13px] font-semibold text-ink">{{ t('broker.case.draft.fromClient') }}</h3>
    <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      <template v-for="r in rows" :key="r.key">
        <dt class="text-muted">{{ r.label }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" :data-client-row="r.key">{{ r.value }}</dd>
      </template>
    </dl>
  </section>
</template>
