<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { clientDeclarationsApi, type ClientDeclaration } from '@/api/clientDeclarations'
import { import40Api } from '@/api/import40'
import { localDate } from '@/views/client/company/company'
import { DECL_FILTERS, STATUS_TONE, isDeclFilter, matchesDecl, passesDeclFilter, type DeclFilter } from '@/views/client/declarations/declarations'
import { saveBlob } from '@/ui/download'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import { useBlock } from '@/views/home/useBlock'
import { cn } from '@/ui/cn'

// «Мои декларации» клиента (/declarations, 02.11.2026, пакет K; владелец: «где мои декларации как клиента?»):
// ДТ всех поставок, поданные в КЕДЕН, новые сверху. Фильтр по статусу (?status=) и поиск (?q=) живут в адресе —
// replace: «Назад» уводит со страницы, а не листает буквы. Бланк PDF — тот же, что в карточке поставки.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const decls = useBlock(true, () => clientDeclarationsApi.list())
void decls.load()

// ---- Поиск (?q=, replace) ----
const queryQ = () => (typeof route.query.q === 'string' ? route.query.q : '')
const q = ref(queryQ())
// Свои переходы ещё в пути: промежуточный ответ (после «a», когда набрано уже «ab») не должен откатывать поле.
let ownReplaces = 0
watch(() => route.query.q, () => {
  if (ownReplaces) return
  const v = queryQ()
  if (v !== q.value) q.value = v
})
const onSearch = async (v: string) => {
  q.value = v
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, q: v.trim() ? v : undefined } })
  } finally {
    ownReplaces -= 1
  }
}

// ---- Фильтр по статусу (?status=, по умолчанию «Все» — без параметра) ----
const filter = computed<DeclFilter>(() => (isDeclFilter(route.query.status) ? route.query.status : 'all'))
const setFilter = (f: DeclFilter) => {
  if (f === filter.value) return
  void router.replace({ query: { ...route.query, status: f === 'all' ? undefined : f } })
}

const all = computed(() => decls.data ?? [])
const rows = computed(() => all.value.filter((d) => passesDeclFilter(d, filter.value) && matchesDecl(d, q.value)))
const emptyKey = computed(() => {
  if (!all.value.length) return 'none'
  if (q.value.trim()) return 'search'
  return 'filter'
})

const thisYear = new Date().getFullYear()
const dateOf = (d: ClientDeclaration) => localDate(d.date, new Date(d.date).getFullYear() !== thisYear)
const caseTo = (d: ClientDeclaration) => `/import-40/${encodeURIComponent(d.caseId)}`
const statusText = (d: ClientDeclaration) => t(`clientDeclarations.status.${d.status}`)
const numberLabel = (d: ClientDeclaration) => d.number || t('clientDeclarations.noNumberShort')

// ---- Скачать PDF: по одной ДТ; HTTP-ошибку показывает общий перехватчик, здесь — только сбой без ответа ----
const busyId = ref<string | null>(null)
const download = async (d: ClientDeclaration) => {
  if (busyId.value) return
  busyId.value = d.id
  try {
    const r = await import40Api.blankPdf(d.caseId, d.id)
    saveBlob(r.blob, r.fileName)
  } catch (e: unknown) {
    if (!(e as { response?: unknown })?.response) message.error(t('clientDeclarations.downloadError'))
  } finally {
    busyId.value = null
  }
}

const TABLE_SKELETON = ['52%', '64%', '44%', '58%']
const th = 'border-0 border-b border-solid border-line px-[18px] py-3 text-left text-[12.5px] leading-5 font-semibold text-ink-3'
const td = 'border-0 border-t border-solid border-sunken px-[18px] py-3 align-middle'
const caseLink = 'rounded-[4px] font-mono text-[13.5px] text-zircon-ink no-underline outline-hidden hover:text-ink hover:underline focus-visible:shadow-focus'
// «Повторить» — sm на компьютере, на телефоне — палец (44px).
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-declarations>
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('clientDeclarations.title') }}</h1>
        <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('clientDeclarations.subtitle') }}</p>
      </div>
      <ZInput
        v-if="all.length"
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('clientDeclarations.search')"
        :aria-label="t('clientDeclarations.searchLabel')"
        class="w-full max-sm:h-11 sm:ml-auto sm:w-[320px]"
        data-decl-search
        @update:value="onSearch"
      />
    </div>

    <!-- Загрузка -->
    <div v-if="decls.loading" class="flex flex-col gap-4 rounded-panel border border-line px-[18px] py-4" aria-busy="true" data-decl-skeleton>
      <div v-for="(w, i) in TABLE_SKELETON" :key="i" class="flex items-center gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-2"><ZSkeleton :width="w" height="14px" /><ZSkeleton width="38%" height="11px" /></div>
        <ZSkeleton width="96px" height="22px" class="max-sm:hidden" />
        <ZSkeleton width="72px" height="13px" />
      </div>
    </div>

    <!-- Ошибка -->
    <div v-else-if="decls.error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-decl-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('clientDeclarations.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-decl-retry @click="decls.load()">{{ t('home.retry') }}</ZButton>
    </div>

    <template v-else>
      <div
        v-if="all.length"
        role="group"
        :aria-label="t('clientDeclarations.filterLabel')"
        class="inline-flex w-fit rounded-field bg-sunken p-0.5 max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:gap-0.5"
      >
        <button
          v-for="f in DECL_FILTERS"
          :key="f"
          type="button"
          :aria-pressed="f === filter"
          :class="cn(
            'inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] border-0 px-3 font-sans text-sm outline-hidden max-sm:h-11',
            'transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
            f === filter ? 'bg-surface font-semibold text-ink shadow-raised' : 'bg-transparent text-ink-3 hover:text-ink',
          )"
          :data-decl-filter="f"
          @click="setFilter(f)"
        >{{ t(`clientDeclarations.filter.${f}`) }}</button>
      </div>

      <div v-if="!rows.length" class="rounded-panel border border-dashed border-line-strong" :data-decl-empty="emptyKey">
        <ZEmpty v-if="emptyKey === 'none'" :title="t('clientDeclarations.empty')">
          <template #action>
            <RouterLink
              to="/import-40"
              class="inline-flex h-10 items-center rounded-row bg-sunken px-4 text-sm font-semibold text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:h-11"
            >{{ t('clientDeclarations.toShipments') }}</RouterLink>
          </template>
        </ZEmpty>
        <ZEmpty
          v-else-if="emptyKey === 'search'"
          :title="t('clientDeclarations.nothing', { q: q.trim() })"
          :hint="t('clientDeclarations.nothingHint')"
        />
        <ZEmpty v-else :title="t('clientDeclarations.emptyFilter')" />
      </div>

      <template v-else>
        <!-- Компьютер и планшет: таблица -->
        <div class="overflow-x-auto rounded-panel border border-line max-md:hidden">
          <table class="w-full min-w-[720px] border-collapse text-sm text-ink" :aria-label="t('clientDeclarations.tableLabel')">
            <thead>
              <tr>
                <th scope="col" :class="th">{{ t('clientDeclarations.col.number') }}</th>
                <th scope="col" :class="th">{{ t('clientDeclarations.col.shipment') }}</th>
                <th scope="col" :class="th">{{ t('clientDeclarations.col.status') }}</th>
                <th scope="col" :class="cn(th, 'text-right')">{{ t('clientDeclarations.col.payments') }}</th>
                <th scope="col" :class="th"><span class="sr-only">{{ t('clientDeclarations.col.action') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in rows" :key="d.id" :data-decl-row="d.id">
                <td :class="cn(td, i === 0 && 'border-t-0', 'max-w-[360px]')">
                  <span v-if="d.number" class="block font-mono text-[13.5px] font-medium [overflow-wrap:anywhere]" data-decl-number>{{ d.number }}</span>
                  <span v-else class="block font-medium text-ink-2" data-decl-number>{{ t('clientDeclarations.noNumber') }}</span>
                  <span class="block truncate text-[13px] leading-5 text-ink-3" :title="d.goods" data-decl-goods>
                    <span class="tabular-nums">{{ dateOf(d) }}</span><template v-if="d.goods"> · {{ d.goods }}</template>
                  </span>
                </td>
                <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap')">
                  <RouterLink :to="caseTo(d)" :class="caseLink" data-decl-case>{{ d.caseNumber }}</RouterLink>
                </td>
                <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap')">
                  <ZTag :tone="STATUS_TONE[d.status]" :data-decl-status="d.status">{{ statusText(d) }}</ZTag>
                </td>
                <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap text-right tabular-nums text-ink-2')" data-decl-payments>
                  {{ d.paymentsKzt != null ? formatMoney(d.paymentsKzt) : '—' }}
                </td>
                <td :class="cn(td, i === 0 && 'border-t-0', 'text-right')">
                  <ZButton
                    variant="link"
                    :loading="busyId === d.id"
                    :aria-label="t('clientDeclarations.downloadLabel', { number: numberLabel(d) })"
                    class="h-8 px-1 text-sm font-medium whitespace-nowrap"
                    data-decl-download
                    @click="download(d)"
                  >{{ t('clientDeclarations.download') }}</ZButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Телефон: карточки -->
        <ul role="list" class="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden" data-decl-cards>
          <li v-for="d in rows" :key="d.id" class="flex min-w-0 flex-col gap-2 rounded-panel border border-line bg-surface px-4 pt-3.5 pb-2" :data-decl-card="d.id">
            <div class="flex min-w-0 items-start gap-2.5">
              <div class="min-w-0 flex-1">
                <span v-if="d.number" class="block font-mono text-[14px] leading-[22px] font-medium text-ink [overflow-wrap:anywhere]">{{ d.number }}</span>
                <span v-else class="block text-[14.5px] leading-[22px] font-medium text-ink-2">{{ t('clientDeclarations.noNumber') }}</span>
                <span v-if="d.goods" class="block text-[13px] leading-5 text-ink-3 [overflow-wrap:anywhere] line-clamp-2">{{ d.goods }}</span>
                <span class="block text-[13px] leading-5 text-ink-3 tabular-nums">
                  {{ dateOf(d) }}<template v-if="d.paymentsKzt != null"> · {{ t('clientDeclarations.payments', { sum: formatMoney(d.paymentsKzt) }) }}</template>
                </span>
              </div>
              <ZTag :tone="STATUS_TONE[d.status]" class="shrink-0">{{ statusText(d) }}</ZTag>
            </div>
            <div class="flex items-center justify-between gap-3">
              <RouterLink :to="caseTo(d)" :class="cn(caseLink, 'inline-flex min-h-11 items-center')">{{ d.caseNumber }}</RouterLink>
              <ZButton
                variant="ghost"
                :loading="busyId === d.id"
                :aria-label="t('clientDeclarations.downloadLabel', { number: numberLabel(d) })"
                class="h-11 px-3 text-sm font-medium text-zircon-ink"
                @click="download(d)"
              >
                <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('clientDeclarations.download') }}
              </ZButton>
            </div>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
