<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCaretRight, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { carriersApi, type Carrier, type CarrierFields } from '@/api/carriers'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import { countryName } from '@/utils/countries'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import CarrierModal from './CarrierModal.vue'
import { CONTRACT_TONE, filterCarriers } from './carriers'
import { contractHint } from './contractHint'

// Перевозчики клиента (очередь 4, задача 2): список со сроком договора перевозки и неоплаченными счетами.
// У клиента — раздел «Перевозчики», у сотрудника — во вкладке «Контракты» карточки клиента. Удаления нет — «В архив».
const props = withDefaults(defineProps<{ clientId: string; href: (id: string) => string; readonly?: boolean }>(), { readonly: false })
const { t } = useI18n()
const router = useRouter()
const headingId = `carriers-${useId()}`

const list = shallowRef<Carrier[]>([])
const status = ref<'loading' | 'error' | 'ready'>('loading')
const showArchived = ref(false)
let seq = 0
const load = async () => {
  if (!props.clientId) return
  const my = ++seq
  if (!list.value.length) status.value = 'loading'
  try {
    const res = await carriersApi.list(props.clientId, { includeArchived: showArchived.value, silent: true })
    if (my !== seq) return
    list.value = res
    status.value = 'ready'
  } catch {
    if (my === seq) status.value = 'error'
  }
}
watch([() => props.clientId, showArchived], () => { void load() }, { immediate: true })

const countries = shallowRef<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((c) => { countries.value = c }).catch(() => { /* страна — кодом */ })

const q = ref('')
const rows = computed(() => filterCarriers(list.value, q.value))

const modalOpen = ref(false)
const create = async (fields: CarrierFields) => {
  const card = await carriersApi.create(props.clientId, fields)
  message.success(t('carriers.added'))
  void router.push(props.href(card.carrier.id))
}
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-3.5 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4" data-carriers-panel>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h2 :id="headingId" class="m-0 text-md font-semibold text-ink">{{ t('carriers.title') }}</h2>
        <p class="m-0 mt-0.5 text-sm text-ink-3">{{ t('carriers.subtitle') }}</p>
      </div>
      <ZButton v-if="!readonly" class="max-sm:h-11 max-sm:w-full" data-carriers-add @click="modalOpen = true">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ t('carriers.add') }}
      </ZButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('carriers.search')"
        :aria-label="t('carriers.search')"
        class="w-full max-sm:h-11 sm:w-[280px]"
        data-carriers-search
        @update:value="q = $event ?? ''"
      />
      <ZCheckbox v-model:checked="showArchived" class="flex min-h-11 items-center gap-2 text-sm text-ink-2 sm:min-h-8" data-carriers-show-archived>
        {{ t('carriers.showArchived') }}
      </ZCheckbox>
    </div>

    <div v-if="status === 'loading'" class="flex flex-col gap-2" aria-busy="true" data-carriers-skeleton>
      <ZSkeleton v-for="i in 3" :key="i" height="60px" />
    </div>
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-4 py-3" role="alert" data-carriers-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('carriers.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-carriers-retry @click="load">{{ t('carriers.retry') }}</ZButton>
    </div>
    <ZEmpty
      v-else-if="!rows.length"
      :title="q.trim() ? t('carriers.nothingFound') : t('carriers.empty')"
      :hint="q.trim() ? undefined : t('carriers.emptyHint')"
      data-carriers-empty
    />
    <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0" data-carriers-list>
      <li v-for="(c, i) in rows" :key="c.id" :class="cn(i > 0 && 'border-0 border-t border-solid border-line', c.isArchived && 'opacity-70')">
        <RouterLink
          :to="href(c.id)"
          class="flex items-center gap-3 px-4 py-3 text-inherit no-underline outline-hidden hover:bg-sunken focus-visible:shadow-focus"
          :data-carrier-row="c.id"
        >
          <div class="min-w-0 flex-1">
            <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="min-w-0 text-[15px] font-semibold break-words text-ink">{{ c.name }}</span>
              <ZTag v-if="c.isArchived" tone="neutral" size="sm">{{ t('carriers.archivedTag') }}</ZTag>
              <ZTag v-else-if="c.contractDocument" :tone="CONTRACT_TONE[c.contractDocument.status]" size="sm" data-carrier-contract-tag>
                {{ contractHint(c.contractDocument, t) }}
              </ZTag>
              <ZTag v-else tone="neutral" size="sm" data-carrier-no-contract>{{ t('carriers.noContract') }}</ZTag>
            </p>
            <p class="m-0 mt-0.5 text-[13px] break-words text-ink-3">
              {{ countryName(c.countryCode, countries) || c.countryCode }}<template v-if="c.regNumber"> · {{ c.regNumber }}</template>
              <template v-if="c.invoiceCount"> · {{ t('carriers.invoicesCount', { n: c.invoiceCount }) }}</template>
              <template v-if="c.unpaidCount"> · <span class="text-gold-ink">{{ t('carriers.unpaidCount', { n: c.unpaidCount }) }}</span></template>
            </p>
          </div>
          <PhCaretRight :size="16" class="shrink-0 text-muted" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>

    <CarrierModal v-model:open="modalOpen" mode="create" :client-id="clientId" :save="create" />
  </section>
</template>
