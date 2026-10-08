<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import ClientShipmentRow from '@/components/client/ClientShipmentRow.vue'
import { clientShipmentsApi, type ClientShipment } from '@/api/clientShipments'
import { useAuthStore } from '@/stores/auth'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { tabCounts, tabOf, type ShipmentTab } from '@/views/client/shipment'
import { useBlock } from '@/views/home/useBlock'
import { cn } from '@/ui/cn'

// «Мои поставки» клиента (редизайн, волна 2a, доска Main): вкладки по чьему ходу, поиск, строки поставок.
// Вкладка и поиск живут в адресе (?tab=, ?q=) — ссылку можно переслать, обновление страницы сохраняет вид.
// Переходы между вкладками и ввод в поиск — replace: «Назад» уводит со списка, а не листает вкладки и буквы.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const registration = useClientRegistration()

const TABS: ShipmentTab[] = ['active', 'waiting', 'drafts', 'done']

// ---- Старые ссылки клиента: мастер жил на /import-40 (?new=1, ?continueId=), теперь у него свой адрес ----
const legacyTarget = (q: LocationQuery): string | null => {
  if (!auth.isClient) return null
  if (q.new === '1') return '/import-40/new'
  const id = q.continueId
  if (typeof id === 'string' && id) return `/import-40/new/${encodeURIComponent(id)}`
  return null
}
const redirecting = ref(false)
watch(() => route.query, (q) => {
  const to = legacyTarget(q)
  if (!to) return
  redirecting.value = true
  void router.replace(to)
}, { immediate: true })

// Один запрос на экран; при переадресации список не нужен.
const cases = useBlock(!redirecting.value, () => clientShipmentsApi.list())
void cases.load()

// Пока регистрация не завершена, сервер заявку не примет — кнопка выключена, подсказка объясняет почему.
const locked = computed(() => registration.loaded.value && !registration.complete.value)
const newShipment = () => router.push('/import-40/new')

// ---- Вкладка (?tab=, по умолчанию «В работе» — без параметра) ----
const tab = computed<ShipmentTab>(() => {
  const v = route.query.tab
  return TABS.includes(v as ShipmentTab) ? (v as ShipmentTab) : 'active'
})
const tabTo = (k: ShipmentTab) => ({ query: { ...route.query, tab: k === 'active' ? undefined : k } })

// ---- Поиск (?q=, replace — не плодим историю на каждую букву) ----
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

const norm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
const needle = computed(() => norm(q.value))
const all = computed(() => cases.data ?? [])
const found = computed<ClientShipment[]>(() => {
  const n = needle.value
  if (!n) return all.value
  return all.value.filter((s) => [s.number, s.cargo, s.post].some((f) => norm(f).includes(n)))
})
// Шапка — по всем поставкам; вкладки — по найденному: видно, на какой вкладке совпадения.
const total = computed(() => tabCounts(all.value))
const counts = computed(() => tabCounts(found.value))
const rows = computed(() => found.value.filter((s) => tabOf(s) === tab.value))
const hasAny = computed(() => all.value.length > 0)
const showSummary = computed(() => total.value.active + total.value.waiting > 0)

const ROW_SKELETON = [['58%', '44%'], ['46%', '52%'], ['64%', '40%'], ['52%', '48%'], ['40%', '36%']]
const rowGrid = 'flex flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-4 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_13.5rem] md:items-center md:gap-5'
const cta = 'h-10 rounded-row px-4 text-[14.5px] max-sm:h-11 max-sm:w-full'
// «Повторить» — sm на компьютере, на телефоне — палец (44px).
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <div v-if="!redirecting" class="flex flex-col gap-[22px]">
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.list.title') }}</h1>
        <div v-if="cases.loading" class="mt-1.5" data-client-skeleton>
          <ZSkeleton width="220px" height="14px" />
        </div>
        <p v-else-if="showSummary" class="m-0 mt-1 text-base text-ink-3" data-client-summary>
          {{ t('client.list.summary', { active: total.active }) }}<template v-if="total.waiting"> · {{ t('client.list.summaryWaiting', { waiting: total.waiting }) }}</template>
        </p>
      </div>
      <ZTooltip :title="locked ? t('clientHome.newLocked') : ''">
        <span :tabindex="locked ? 0 : undefined" class="ml-auto inline-flex rounded-row outline-hidden focus-visible:shadow-focus max-sm:w-full">
          <ZButton variant="primary" :class="cta" :disabled="locked" data-client-new @click="newShipment">
            <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
            {{ t('shell.client.newShipment') }}
          </ZButton>
        </span>
      </ZTooltip>
    </div>

    <!-- Ниже xl поиск сверху во всю ширину, вкладки под ним прокручиваются (колонка контента из-за боковой панели уже окна);
         с xl — в одну строку, поиск справа (порядок в DOM — как на телефоне, чтобы Tab шёл в том же порядке, что видит
         глаз; с xl меняет только order).
         Нижняя линия — тенью, а не рамкой: граница активной вкладки ложится поверх, прокрутке не мешает отрицательный отступ. -->
    <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:shadow-[inset_0_-1px_0_var(--color-line)]">
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('client.list.search')"
        :aria-label="t('client.list.searchLabel')"
        class="w-full max-sm:h-11 xl:order-2 xl:mb-2 xl:ml-auto xl:w-[300px]"
        data-client-search
        @update:value="onSearch"
      />
      <nav
        :aria-label="t('client.list.tabsLabel')"
        class="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] xl:order-1 xl:shadow-none [&::-webkit-scrollbar]:hidden"
      >
        <RouterLink v-for="k in TABS" :key="k" v-slot="{ href, navigate }" :to="tabTo(k)" replace custom>
          <a
            :href="href"
            :aria-current="k === tab ? 'page' : undefined"
            :data-client-tab="k"
            :class="cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[6px] border-0 border-b-2 px-3 py-2.5 text-sm no-underline outline-hidden max-sm:min-h-11',
              'transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
              k === tab ? 'border-navy font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )"
            @click="navigate"
          >
            <!-- Невидимая полужирная копия держит ширину: вкладка не «прыгает», когда становится активной. -->
            <span
              :data-label="t(`client.list.tab.${k}`)"
              class="inline-flex flex-col after:invisible after:block after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
            >{{ t(`client.list.tab.${k}`) }}</span>
            <span
              v-if="k === 'waiting' && counts.waiting > 0"
              class="rounded-pill bg-gold px-[7px] text-xs leading-[18px] font-bold tabular-nums text-navy"
              data-client-tab-count
            >{{ counts.waiting }}</span>
            <span
              v-else
              :class="cn('tabular-nums text-muted', k === tab ? 'font-medium' : 'font-normal')"
              data-client-tab-count
            >{{ cases.loading || cases.error ? '' : counts[k] }}</span>
          </a>
        </RouterLink>
      </nav>
    </div>

    <section :aria-label="t(`client.list.tab.${tab}`)" :aria-busy="cases.loading || undefined">
      <div v-if="cases.loading" class="flex flex-col gap-2.5" data-client-skeleton>
        <div v-for="(w, i) in ROW_SKELETON" :key="i" :class="rowGrid">
          <div class="flex min-w-0 flex-col gap-2">
            <ZSkeleton :width="w[0]" height="16px" />
            <ZSkeleton :width="w[1]" height="12px" />
          </div>
          <div class="flex min-w-0 flex-col gap-2 max-md:order-2">
            <ZSkeleton height="5px" />
            <ZSkeleton width="56%" height="12px" />
          </div>
          <div class="flex min-w-0 items-center justify-between gap-3.5 max-md:order-1 md:justify-end">
            <ZSkeleton width="104px" height="22px" />
            <ZSkeleton width="40px" height="12px" />
          </div>
        </div>
      </div>

      <div v-else-if="cases.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-client-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('clientHome.loadError') }}</p>
        <ZButton size="sm" :class="retry" data-client-retry @click="cases.load()">{{ t('home.retry') }}</ZButton>
      </div>

      <div v-else-if="!hasAny" class="rounded-panel border border-dashed border-line-strong" data-client-empty="none">
        <ZEmpty :title="t('clientHome.emptyTitle')" :hint="t('clientHome.emptyText')">
          <template #action>
            <ZTooltip :title="locked ? t('clientHome.newLocked') : ''">
              <span :tabindex="locked ? 0 : undefined" class="inline-flex rounded-row outline-hidden focus-visible:shadow-focus">
                <ZButton variant="primary" :class="cta" :disabled="locked" data-client-new @click="newShipment">
                  <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
                  {{ t('shell.client.newShipment') }}
                </ZButton>
              </span>
            </ZTooltip>
          </template>
        </ZEmpty>
      </div>

      <div v-else-if="!rows.length" class="rounded-panel border border-dashed border-line-strong" :data-client-empty="needle ? 'search' : tab">
        <ZEmpty
          :title="needle ? t('client.list.nothing', { q: q.trim() }) : t(`client.list.empty.${tab}`)"
          :hint="needle ? t('client.list.nothingHint') : undefined"
        />
      </div>

      <ul v-else role="list" class="m-0 flex list-none flex-col gap-2.5 p-0" data-client-list>
        <li v-for="s in rows" :key="s.id"><ClientShipmentRow :shipment="s" /></li>
      </ul>
    </section>
  </div>
</template>
