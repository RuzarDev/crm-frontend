<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThree, PhTrash } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import type { DocumentPackageClientConsolidationDto } from '@/types/api'
import { pluralForm } from '@/views/broker/list'
import { useWorkspaceDnd, type DropKey } from './useWorkspace'
import { partiaGaps } from './workspace'

// Строка партии в карточке контейнера (доска Workspace): инициалы, клиент (компания, иначе логин), строка маршрута
// «отправитель → получатель · ст. … · пломба …», чего не хватает для строки реестра (золотом), «n товаров · k док.»
// (k — привязанные файлы), «Открыть» (редактор партии; без reestr.write — для просмотра) и «⋯ → Удалить партию».
// Цель перетаскивания: обработчики останавливают всплытие — файл не уходит заодно в контейнер (B13.1).
const props = defineProps<{
  partia: DocumentPackageClientConsolidationDto
  containerId: string
  /** Подпись клиента: компания или логин; null — клиент не выбран. */
  client: string | null
  files: number
  canEdit: boolean
  busy: boolean
}>()
const emit = defineEmits<{ open: []; delete: [] }>()
const { t, locale } = useI18n()
const dnd = useWorkspaceDnd()

const name = computed(() => props.client ?? t('broker.packageWorkspace.partia.noClient'))
const dash = '—'
const route = computed(() => {
  const from = props.partia.shipper?.name?.trim() || dash
  const to = props.partia.consignee?.name?.trim() || dash
  const parts = [`${from} → ${to}`]
  const station = props.partia.destinationStation?.trim()
  if (station) parts.push(t('broker.packageWorkspace.partia.station', { name: station }))
  const seal = props.partia.sealNumber?.trim()
  if (seal) parts.push(t('broker.packageWorkspace.partia.seal', { number: seal }))
  return parts.join(' · ')
})
const gaps = computed(() => partiaGaps(props.partia))
const gapText = computed(() => (gaps.value.length
  ? t('broker.packageWorkspace.partia.gaps', { list: gaps.value.map((g) => t(`broker.packageWorkspace.partia.gap.${g}`)).join(', ') })
  : ''))
const goods = computed(() => props.partia.goodsItems?.length ?? 0)
const summary = computed(() => [
  t(`broker.packageWorkspace.partia.goods.${pluralForm(goods.value, locale.value)}`, { n: goods.value }),
  t('broker.packageWorkspace.partia.docs', { n: props.files }),
].join(' · '))

const key = computed<DropKey>(() => `p:${props.partia.id}`)
const listeners = computed(() => (dnd?.enabled.value
  ? dnd.target(key.value, { kind: 'partia', containerId: props.containerId, partiaId: props.partia.id })
  : {}))
const over = computed(() => !!dnd && dnd.over.value === key.value && !!dnd.dragging.value)

const menu = computed<ZDropdownItem[]>(() => [{ key: 'delete', label: t('broker.packageWorkspace.partia.delete'), icon: PhTrash, danger: true }])
const onMenu = (k: string) => { if (k === 'delete') emit('delete') }
</script>

<template>
  <li
    class="rounded-row border px-3 py-2.5 transition-[background-color,border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none"
    :class="[
      over ? 'border-zircon bg-zircon-soft shadow-[inset_0_0_0_1px_var(--color-zircon)]' : 'border-line bg-surface',
      busy && 'opacity-60',
    ]"
    :aria-busy="busy || undefined"
    data-ws-partia
    :data-partia-id="partia.id"
    v-on="listeners"
  >
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <ZAvatar :name="name" class="max-sm:hidden" />
      <div class="min-w-0 flex-1 basis-48">
        <div class="text-[13.5px] font-medium text-ink [overflow-wrap:anywhere]" data-ws-partia-client>{{ name }}</div>
        <div class="text-xs text-ink-3 [overflow-wrap:anywhere]" data-ws-partia-route>{{ route }}</div>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-0.5 text-xs max-sm:items-start">
        <span v-if="gapText" class="font-medium text-gold-ink" data-ws-partia-gaps>{{ gapText }}</span>
        <span class="tabular-nums text-muted" data-ws-partia-summary>{{ summary }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1 max-sm:ml-auto">
        <ZButton
          variant="ghost"
          size="sm"
          class="h-8 px-3 text-[13px] text-ink max-sm:h-11"
          :aria-label="t('broker.packageWorkspace.partia.openAria', { name })"
          data-ws-partia-open
          @click="emit('open')"
        >{{ t('broker.packageWorkspace.partia.open') }}</ZButton>
        <ZDropdown v-if="canEdit" :items="menu" @select="onMenu">
          <button
            type="button"
            :disabled="busy"
            :aria-label="t('broker.packageWorkspace.partia.more', { name })"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:size-11"
            data-ws-partia-more
          >
            <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </div>
    </div>
    <p v-if="over && dnd?.dragging.value" class="m-0 mt-1.5 text-[12.5px] font-semibold text-zircon-ink sm:pl-10" role="status" data-ws-drop-hint>
      {{ t('broker.packageWorkspace.drop.partia', { name: dnd.dragging.value.originalFileName }) }}
    </p>
  </li>
</template>
