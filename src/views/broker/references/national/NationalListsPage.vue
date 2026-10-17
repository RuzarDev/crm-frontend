<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZTabs from '@/components/z/ZTabs.vue'
import KzListTab from './KzListTab.vue'
import NationalMeasuresTab from './NationalMeasuresTab.vue'
import UtilizationRatesTab from './UtilizationRatesTab.vue'
import { NATIONAL_TABS, P, parseTab, type NationalTab } from './national'

// «Справочники → ТН ВЭД → Национальные перечни» (17.10): временные меры РК (запрет ввоза пшеницы, яиц — ведёт
// сотрудник с tnved.manage), перечень маркировки (Приказ МТИ № 199-НҚ), перечень товаров с минимальным уровнем цен
// (Приказ МФ № 658 — база НДС при ввозе из ЕАЭС, не ДТ), ставки утильсбора с отметкой «сверено». Вкладка — ?tab=.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const tab = computed<NationalTab>(() => parseTab(route.query.tab))
const tabItems = computed(() => NATIONAL_TABS.map((k) => ({ key: k, label: t(`${P}.tabs.${k}`) })))
const onTab = (k: string) => {
  const query = { ...route.query }
  if (k === 'measures') delete query.tab
  else query.tab = k
  void router.replace({ query })
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5" data-national-page>
    <div class="min-w-0">
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t(`${P}.title`) }}</h1>
      <p class="m-0 mt-1 max-w-[52rem] text-sm text-muted text-pretty">{{ t(`${P}.subtitle`) }}</p>
    </div>
    <ZTabs :active-key="tab" :items="tabItems" variant="line" data-national-tabs @update:active-key="onTab" />
    <KeepAlive>
      <NationalMeasuresTab v-if="tab === 'measures'" />
      <KzListTab v-else-if="tab === 'marking'" key="marking" list-key="marking" />
      <KzListTab v-else-if="tab === 'muc'" key="muc" list-key="muc" />
      <UtilizationRatesTab v-else-if="tab === 'utilization'" />
    </KeepAlive>
  </div>
</template>
