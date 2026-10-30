<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { expeditorImport40Api, type ExpeditorClient, type ExpeditorShipment } from '@/api/expeditorImport40'
import { useBlock } from '@/views/home/useBlock'
import { formatDay } from '@/views/broker/list'
import { validDate } from '@/views/client/company/company'
import { cn } from '@/ui/cn'
import {
  CONTRACT_TONE, contractState, filterCounts, filterShipments, shipmentTone, type ShipmentFilter,
} from './expeditorImport40'

// Логист (экспедитор), Импорт 40 своих клиентов — только чтение (17.10): статус груза по поставкам и статус договора и
// доверенности каждого клиента («действует до …»). Ни карточки заявки, ни денег, ни файлов договора (раунд 1, решение
// владельца 30.10.2026) — только то, что нужно логисту, чтобы знать, где груз и можно ли везти.
const { t } = useI18n()
const block = useBlock(true, () => expeditorImport40Api.overview())
void block.load()

const query = ref('')
const filter = ref<ShipmentFilter>('active')
const shipments = computed(() => block.data?.shipments ?? [])
const clients = computed(() => block.data?.clients ?? [])
const counts = computed(() => filterCounts(shipments.value))
const filterOptions = computed(() => (['active', 'done', 'all'] as const).map((k) => ({
  value: k, label: `${t(`expeditor40.filter.${k}`)} · ${counts.value[k]}`,
})))
const shown = computed(() => filterShipments(shipments.value, filter.value, query.value))

const statusText = (s: ExpeditorShipment) =>
  s.customsRequestOpen && s.status < 8 ? t('expeditor40.customsWaiting') : t(`expeditor40.status.s${s.status}`)
const stepText = (s: ExpeditorShipment) => (s.step > 0 ? t('expeditor40.step', { n: s.step }) : '')

const contractTitle = (c: ExpeditorClient) =>
  c.contract ? t('expeditor40.contract.no', { no: `${c.contract.number}/${c.contract.year}` }) : t('expeditor40.contract.none')
const contractMeta = (c: ExpeditorClient): string[] => {
  const k = c.contract
  if (!k) return []
  const parts = [k.clientSigned ? t('expeditor40.contract.clientSigned') : t('expeditor40.contract.clientNotSigned'),
    k.providerSigned ? t('expeditor40.contract.providerSigned') : t('expeditor40.contract.providerNotSigned')]
  if (k.validUntilUtc) parts.push(t('expeditor40.contract.until', { date: validDate(k.validUntilUtc) }))
  return parts
}

// Доверенность (раунд 1, 30.10.2026): «Доверенность № … · действует до …», нет — «Доверенности нет».
const poaLine = (c: ExpeditorClient): string => {
  const p = c.poa
  if (!p) return t('expeditor40.poa.none')
  const no = t('expeditor40.poa.no', { no: `${p.number}/${p.year}` })
  const state = contractState(p)
  return state === 'active' && p.validUntilUtc
    ? `${no} · ${t('expeditor40.contract.until', { date: validDate(p.validUntilUtc) })}`
    : `${no} · ${t(`expeditor40.poa.state.${state}`)}`
}

const card = 'rounded-panel border border-line bg-surface px-4 py-3.5 sm:px-5'
const h2 = 'm-0 text-[17px] leading-6 font-semibold text-ink'
</script>

<template>
  <div class="flex flex-col gap-6" data-expeditor40>
    <div>
      <h1 class="m-0 text-[22px] leading-7 font-semibold text-ink">{{ t('expeditor40.title') }}</h1>
      <p class="m-0 mt-1 text-sm text-ink-3">{{ t('expeditor40.subtitle') }}</p>
    </div>

    <div v-if="block.loading && !block.data" class="flex flex-col gap-3" aria-busy="true" data-expeditor40-skeleton>
      <ZSkeleton v-for="i in 4" :key="i" height="64px" />
    </div>
    <div v-else-if="block.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-expeditor40-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('expeditor40.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-expeditor40-retry @click="block.load()">{{ t('home.retry') }}</ZButton>
    </div>
    <div v-else-if="!clients.length" class="rounded-panel border border-dashed border-line-strong" data-expeditor40-empty>
      <ZEmpty :title="t('expeditor40.noClients')" :hint="t('expeditor40.noClientsHint')" />
    </div>

    <template v-else>
      <!-- Статус груза -->
      <section aria-labelledby="exp40-shipments" class="flex flex-col gap-3" data-expeditor40-shipments>
        <h2 id="exp40-shipments" :class="h2">{{ t('expeditor40.shipmentsTitle') }}</h2>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ListSearch :value="query" :placeholder="t('expeditor40.search')" class="sm:max-w-80 sm:flex-1" @update:value="query = $event" />
          <ZSegmented
            :value="filter"
            :options="filterOptions"
            :aria-label="t('expeditor40.filterLabel')"
            class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
            data-expeditor40-filter
            @update:value="filter = $event as ShipmentFilter"
          />
        </div>
        <p v-if="!shown.length" class="m-0 text-sm text-ink-3" data-expeditor40-no-shipments>{{ t('expeditor40.noShipments') }}</p>
        <ul v-else role="list" class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="s in shown"
            :key="s.id"
            :class="cn(card, 'flex flex-col gap-1.5 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4')"
            :data-expeditor40-shipment="s.id"
          >
            <div class="min-w-0">
              <div class="font-medium text-ink [overflow-wrap:anywhere]">{{ s.cargo || t('expeditor40.noCargo') }}</div>
              <div class="text-[13px] text-ink-3 [overflow-wrap:anywhere]">
                <span class="font-mono">{{ s.number }}</span> · {{ s.clientName }}
              </div>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <ZTag :tone="shipmentTone(s)" data-expeditor40-status>{{ statusText(s) }}</ZTag>
              <span v-if="stepText(s)" class="text-xs text-ink-3">{{ stepText(s) }}</span>
            </div>
            <div class="min-w-0 text-[13px] text-ink-2 [overflow-wrap:anywhere]">
              <div v-if="s.post">{{ t('expeditor40.post', { post: s.post }) }}</div>
              <div v-if="s.declarationNumbers.length" class="font-mono text-[12.5px]" data-expeditor40-dt>{{ s.declarationNumbers.join(', ') }}</div>
              <div v-if="s.releasedAtUtc" data-expeditor40-released>{{ t('expeditor40.released', { date: formatDay(s.releasedAtUtc) }) }}</div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Договоры клиентов -->
      <section aria-labelledby="exp40-contracts" class="flex flex-col gap-3" data-expeditor40-contracts>
        <h2 id="exp40-contracts" :class="h2">{{ t('expeditor40.contractsTitle') }}</h2>
        <ul role="list" class="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
          <li v-for="c in clients" :key="c.clientId" :class="cn(card, 'flex flex-col gap-2')" :data-expeditor40-client="c.clientId">
            <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div class="min-w-0 flex-1">
                <div class="font-medium text-ink [overflow-wrap:anywhere]">{{ c.name }}</div>
                <div v-if="c.innBin" class="text-xs text-ink-3">{{ t('expeditor40.bin', { bin: c.innBin }) }}</div>
              </div>
              <ZTag :tone="CONTRACT_TONE[contractState(c.contract)]" data-expeditor40-contract-state>
                {{ t(`expeditor40.contract.state.${contractState(c.contract)}`) }}
              </ZTag>
            </div>
            <div class="text-sm text-ink" data-expeditor40-contract>{{ contractTitle(c) }}</div>
            <p v-if="contractMeta(c).length" class="m-0 text-xs text-ink-3">{{ contractMeta(c).join(' · ') }}</p>
            <p class="m-0 text-sm text-ink" data-expeditor40-poa>{{ poaLine(c) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
