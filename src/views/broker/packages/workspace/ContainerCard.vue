<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThree, PhPaperclip, PhPencilSimple, PhPlus, PhShippingContainer, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import type { DocumentPackageContainerDto, DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import PartiaRow from './PartiaRow.vue'
import { useWorkspaceDnd, type DropKey } from './useWorkspace'
import { containerFiles, formatContainerNumber, partiaFiles } from './workspace'

// Карточка контейнера (доска Workspace): номер моно «MRSU 488584 9», второй номер, «ЖД накладная · n» (файлы уровня
// контейнера, нажатие — просмотр первого), «+ Клиент» (новая партия), «⋯» — «Изменить» / «Удалить»; ниже — партии.
// Цель перетаскивания «к контейнеру»; партии внутри — свои цели, их обработчики всплытие останавливают.
const props = defineProps<{
  pkg: DocumentPackageDto
  container: DocumentPackageContainerDto
  canEdit: boolean
  busy: boolean
  isPending: (key: string) => boolean
  /** Подпись клиента партии по её clientName: компания или логин; null — клиент не выбран. */
  clientLabel: (clientName: string) => string
}>()
const emit = defineEmits<{
  addPartia: []
  edit: []
  delete: []
  preview: [file: DocumentPackageFileDto]
  openPartia: [partiaId: string]
  deletePartia: [partiaId: string]
}>()
const { t } = useI18n()
const dnd = useWorkspaceDnd()

const number = computed(() => formatContainerNumber(props.container.containerNumber))
const rail = computed(() => containerFiles(props.pkg, props.container.id))
const clientOf = (name: string | null | undefined) => (name?.trim() ? props.clientLabel(name) : null)

const key = computed<DropKey>(() => `c:${props.container.id}`)
const listeners = computed(() => (dnd?.enabled.value ? dnd.target(key.value, { kind: 'container', containerId: props.container.id }) : {}))
const over = computed(() => !!dnd && dnd.over.value === key.value && !!dnd.dragging.value)

const menu = computed<ZDropdownItem[]>(() => [
  { key: 'edit', label: t('broker.packageWorkspace.container.edit'), icon: PhPencilSimple },
  { key: 'delete', label: t('broker.packageWorkspace.container.delete'), icon: PhTrash, danger: true },
])
const onMenu = (k: string) => {
  if (k === 'edit') emit('edit')
  else if (k === 'delete') emit('delete')
}
</script>

<template>
  <section
    class="min-w-0 rounded-panel border bg-surface p-3.5 transition-[border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none"
    :class="[over ? 'border-zircon shadow-[inset_0_0_0_1px_var(--color-zircon)]' : 'border-line', busy && 'opacity-60']"
    :aria-label="number"
    :aria-busy="busy || undefined"
    data-ws-container
    :data-container-id="container.id"
    v-on="listeners"
  >
    <div class="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <PhShippingContainer :size="18" class="shrink-0 text-ink-2" aria-hidden="true" />
      <h3 class="m-0 font-mono text-[15px] font-semibold text-ink [overflow-wrap:anywhere]" data-ws-container-number>{{ number }}</h3>
      <span v-if="container.secondaryContainerNumber" class="text-[12.5px] text-muted [overflow-wrap:anywhere]" data-ws-container-secondary>
        {{ t('broker.packages.drawer.trailer', { number: formatContainerNumber(container.secondaryContainerNumber) }) }}
      </span>
      <span class="ml-auto flex items-center gap-1">
        <button
          v-if="rail.length"
          type="button"
          class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-2 text-xs text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:h-11"
          :aria-label="t('broker.packageWorkspace.container.railBillAria', { number })"
          data-ws-rail
          @click="emit('preview', rail[0])"
        >
          <PhPaperclip :size="13" aria-hidden="true" />{{ t('broker.packageWorkspace.container.railBill', { n: rail.length }) }}
        </button>
        <ZButton
          v-if="canEdit"
          variant="ghost"
          size="sm"
          class="h-8 px-2.5 text-[13px] text-ink max-sm:h-11"
          :aria-label="t('broker.packageWorkspace.container.addClientAria', { number })"
          data-ws-add-partia
          @click="emit('addPartia')"
        >
          <template #icon><PhPlus :size="14" weight="bold" aria-hidden="true" /></template>
          {{ t('broker.packageWorkspace.container.addClient') }}
        </ZButton>
        <ZDropdown v-if="canEdit" :items="menu" @select="onMenu">
          <button
            type="button"
            :disabled="busy"
            :aria-label="t('broker.packageWorkspace.container.more', { number })"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:size-11"
            data-ws-container-more
          >
            <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </span>
    </div>

    <ul v-if="container.consolidations.length" class="m-0 flex list-none flex-col gap-2 p-0">
      <PartiaRow
        v-for="p in container.consolidations"
        :key="p.id"
        :partia="p"
        :container-id="container.id"
        :client="clientOf(p.clientName)"
        :files="partiaFiles(pkg, p.id).length"
        :can-edit="canEdit"
        :busy="isPending(`partia-delete:${p.id}`)"
        @open="emit('openPartia', p.id)"
        @delete="emit('deletePartia', p.id)"
      />
    </ul>
    <p v-else class="m-0 rounded-row bg-canvas px-3 py-2.5 text-sm text-muted" data-ws-no-partias>{{ t('broker.packageWorkspace.container.noPartias') }}</p>

    <p v-if="over && dnd?.dragging.value" class="m-0 mt-2 text-[12.5px] font-semibold text-zircon-ink" role="status" data-ws-drop-hint>
      {{ t('broker.packageWorkspace.drop.container', { name: dnd.dragging.value.originalFileName }) }}
    </p>
  </section>
</template>
