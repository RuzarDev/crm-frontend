<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThreeVertical, PhFileText, PhSealCheck } from '@phosphor-icons/vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import type { FileKind, FilePatch, Party, TruckFile } from '@/api/autoTransit'

// Файл машины или партии: имя и вид, клик — скачать (blob с входом). Меню (граница или декларант): вид, партия /
// общий документ, «с печатью» (инвойс и упаковочный лист), «виден получателю», удалить (декларант или РОП).
const props = defineProps<{
  file: TruckFile
  parties: Party[]
  canPatch: boolean
  canDelete: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ download: [file: TruckFile]; patch: [file: TruckFile, patch: FilePatch]; remove: [file: TruckFile] }>()
const { t } = useI18n()

const KINDS: FileKind[] = ['invoice', 'packingList', 'cmr', 'driverPassport', 'vehiclePassport', 'td', 'warehouseReceipt', 'other']
const kindLabel = (k: FileKind) => t(`broker.autoTransit.file.kind.${k}`)
const stampable = computed(() => props.file.kind === 'invoice' || props.file.kind === 'packingList')
const hasMenu = computed(() => props.canPatch || props.canDelete)

const items = computed<ZDropdownItem[]>(() => {
  const out: ZDropdownItem[] = []
  if (props.canPatch) {
    KINDS.forEach((k) => out.push({ key: `kind:${k}`, label: kindLabel(k), checked: props.file.kind === k }))
    out.push({ key: 'party:', label: t('broker.autoTransit.file.toTruck'), checked: props.file.partyId == null, divider: true })
    ;[...props.parties].sort((a, b) => a.number - b.number).forEach((p) => out.push({
      key: `party:${p.id}`, label: t('broker.autoTransit.file.toParty', { n: p.number }), checked: props.file.partyId === p.id,
    }))
    if (stampable.value) out.push({ key: 'stamped', label: t('broker.autoTransit.file.stamped'), checked: props.file.stamped, divider: true })
    out.push({ key: 'visible', label: t('broker.autoTransit.file.visible'), checked: props.file.visibleToRecipient, divider: !stampable.value })
  }
  if (props.canDelete) out.push({ key: 'delete', label: t('broker.autoTransit.file.delete'), danger: true, divider: out.length > 0 })
  return out
})

const onSelect = (key: string) => {
  if (props.busy) return
  const f = props.file
  if (key === 'delete') return emit('remove', f)
  if (key === 'stamped') return emit('patch', f, { stamped: !f.stamped })
  if (key === 'visible') return emit('patch', f, { visibleToRecipient: !f.visibleToRecipient })
  if (key.startsWith('kind:')) {
    const kind = key.slice(5) as FileKind
    if (kind !== f.kind) emit('patch', f, { kind })
    return
  }
  if (key.startsWith('party:')) {
    const partyId = key.slice(6) || null
    if (partyId !== f.partyId) emit('patch', f, { partyId })
  }
}
</script>

<template>
  <span
    class="inline-flex max-w-full min-w-0 items-center rounded-row border border-line-strong bg-canvas text-xs text-ink-2"
    :data-file-chip="file.id"
  >
    <button
      type="button"
      class="flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-row border-0 bg-transparent py-1 pr-2 pl-2.5 font-sans text-xs text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11"
      :title="file.fileName"
      :aria-label="t('broker.autoTransit.file.download', { name: file.fileName })"
      data-file-download
      @click="emit('download', file)"
    >
      <PhFileText :size="14" aria-hidden="true" class="shrink-0 text-muted" />
      <span class="min-w-0 truncate">{{ file.fileName }}</span>
      <span class="shrink-0 text-muted" data-file-kind>· {{ kindLabel(file.kind) }}</span>
      <PhSealCheck v-if="file.stamped" :size="14" class="shrink-0 text-tone-done-fg" :aria-label="t('broker.autoTransit.file.stamped')" data-file-stamped />
    </button>
    <span v-if="hasMenu" class="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
    <ZDropdown v-if="hasMenu" :items="items" @select="onSelect">
      <button
        type="button"
        class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-row border-0 bg-transparent p-0 text-muted outline-hidden hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed max-sm:size-11"
        :disabled="busy"
        :aria-label="t('broker.autoTransit.file.menu', { name: file.fileName })"
        data-file-menu
      >
        <PhDotsThreeVertical :size="16" aria-hidden="true" />
      </button>
    </ZDropdown>
  </span>
</template>
