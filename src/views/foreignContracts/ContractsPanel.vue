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
import { foreignContractsApi, type ForeignContract, type ForeignContractFields } from '@/api/foreignContracts'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import ContractModal from './ContractModal.vue'
import { DEADLINE_TONE, day, deadlineHint, deliveredPercent, filterContracts, money, urgentDeadline } from './contracts'

// Внешнеторговые контракты клиента (17.10, задача 3): список с остатком, долей поставленного и ближайшим сроком.
// Один раздел у клиента («Контракты») и у сотрудника (вкладка карточки клиента). Удаления нет — «В архив» в карточке.
// href(id) — куда ведёт строка (у клиента /contracts/:id, у сотрудника /clients/:client/contracts/:id).
const props = withDefaults(defineProps<{ clientId: string; href: (id: string) => string; readonly?: boolean }>(), { readonly: false })
const { t, locale } = useI18n()
const router = useRouter()
const headingId = `contracts-${useId()}`

const list = shallowRef<ForeignContract[]>([])
const status = ref<'loading' | 'error' | 'ready'>('loading')
const showArchived = ref(false)
let seq = 0
const load = async () => {
  if (!props.clientId) return
  const my = ++seq
  if (!list.value.length) status.value = 'loading'
  try {
    const res = await foreignContractsApi.list(props.clientId, { includeArchived: showArchived.value, silent: true })
    if (my !== seq) return
    list.value = res
    status.value = 'ready'
  } catch {
    if (my === seq) status.value = 'error'
  }
}
watch([() => props.clientId, showArchived], () => { void load() }, { immediate: true })

const q = ref('')
const rows = computed(() => filterContracts(list.value, q.value))
const attention = computed(() => list.value.filter((c) => !c.isArchived && urgentDeadline(c)).length)

const modalOpen = ref(false)
const create = async (fields: ForeignContractFields) => {
  const card = await foreignContractsApi.create(props.clientId, fields)
  message.success(t('foreignContracts.added'))
  void router.push(props.href(card.contract.id))
}
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-3.5 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4" data-contracts-panel>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h2 :id="headingId" class="m-0 text-md font-semibold text-ink">{{ t('foreignContracts.title') }}</h2>
        <p class="m-0 mt-0.5 text-sm text-ink-3">{{ t('foreignContracts.subtitle') }}</p>
      </div>
      <ZButton v-if="!readonly" class="max-sm:h-11 max-sm:w-full" data-contracts-add @click="modalOpen = true">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ t('foreignContracts.add') }}
      </ZButton>
    </div>

    <p v-if="status === 'ready' && attention" class="m-0 rounded-row bg-gold-soft px-3.5 py-2.5 text-sm text-gold-ink" role="status" data-contracts-attention>
      {{ t('foreignContracts.attention', { n: attention }) }}
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('foreignContracts.search')"
        :aria-label="t('foreignContracts.search')"
        class="w-full max-sm:h-11 sm:w-[280px]"
        data-contracts-search
        @update:value="q = $event ?? ''"
      />
      <ZCheckbox v-model:checked="showArchived" class="flex min-h-11 items-center gap-2 text-sm text-ink-2 sm:min-h-8" data-contracts-show-archived>
        {{ t('foreignContracts.showArchived') }}
      </ZCheckbox>
    </div>

    <div v-if="status === 'loading'" class="flex flex-col gap-2" aria-busy="true" data-contracts-skeleton>
      <ZSkeleton v-for="i in 3" :key="i" height="72px" />
    </div>
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-4 py-3" role="alert" data-contracts-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('foreignContracts.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-contracts-retry @click="load">{{ t('foreignContracts.retry') }}</ZButton>
    </div>
    <ZEmpty
      v-else-if="!rows.length"
      :title="q.trim() ? t('foreignContracts.nothingFound') : t('foreignContracts.empty')"
      :hint="q.trim() ? undefined : t('foreignContracts.emptyHint')"
      data-contracts-empty
    />
    <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0" data-contracts-list>
      <li v-for="(c, i) in rows" :key="c.id" :class="cn(i > 0 && 'border-0 border-t border-solid border-line', c.isArchived && 'opacity-70')">
        <RouterLink
          :to="href(c.id)"
          class="flex flex-col gap-2 px-4 py-3 text-inherit no-underline outline-hidden hover:bg-sunken focus-visible:shadow-focus sm:flex-row sm:items-center sm:gap-4"
          :data-contract-row="c.id"
        >
          <div class="min-w-0 flex-1">
            <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="min-w-0 text-[15px] font-semibold break-words text-ink">{{ t('foreignContracts.numberFrom', { n: c.number, date: day(c.contractDate) }) }}</span>
              <ZTag v-if="c.isArchived" tone="neutral" size="sm">{{ t('foreignContracts.archivedTag') }}</ZTag>
              <template v-else-if="urgentDeadline(c)">
                <ZTag :tone="DEADLINE_TONE[urgentDeadline(c)!.state]" size="sm" data-contract-urgent>
                  {{ t(`foreignContracts.deadline.${urgentDeadline(c)!.kind}`) }} · {{ deadlineHint(urgentDeadline(c)!, t) }}
                </ZTag>
              </template>
            </p>
            <p class="m-0 mt-0.5 text-[13px] break-words text-ink-3">
              {{ c.supplierName }}<template v-if="c.unkNumber"> · {{ t('foreignContracts.unkShort', { n: c.unkNumber }) }}</template>
            </p>
            <div class="mt-2 h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div class="h-full rounded-full bg-zircon" :style="{ width: `${deliveredPercent(c)}%` }" />
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-3 sm:w-[240px] sm:justify-end sm:text-right">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5 sm:items-end">
              <span class="text-sm font-semibold text-ink tabular-nums" data-contract-remaining>
                {{ t('foreignContracts.remainingOf', { remaining: money(locale, c.balance.remaining, c.currency), amount: money(locale, c.amount, c.currency) }) }}
              </span>
              <span class="text-xs text-muted tabular-nums">{{ t('foreignContracts.deliveredPct', { n: deliveredPercent(c) }) }}</span>
            </div>
            <PhCaretRight :size="16" class="shrink-0 text-muted" aria-hidden="true" />
          </div>
        </RouterLink>
      </li>
    </ul>

    <ContractModal v-model:open="modalOpen" mode="create" :client-id="clientId" :save="create" />
  </section>
</template>
