<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhProhibit, PhShippingContainer, PhUser } from '@phosphor-icons/vue'
import ZModal from '@/components/z/ZModal.vue'
import type { DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import { sameTarget } from './useWorkspace'
import { fileTarget, formatContainerNumber, type LinkTarget } from './workspace'

// «Привязать к…» (замена выбора привязки у каждого файла и путь с клавиатуры вместо перетаскивания):
// «Не распределять», контейнеры, под каждым — его партии. Текущее место отмечено галочкой; выбор закрывает окно.
const props = defineProps<{
  open: boolean
  pkg: DocumentPackageDto
  file: DocumentPackageFileDto | null
  /** Подпись партии: компания клиента или его логин. */
  clientLabel: (clientName: string) => string
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [target: LinkTarget] }>()
const { t } = useI18n()

interface Choice { key: string; target: LinkTarget; label: string; kind: 'none' | 'container' | 'partia' }
const choices = computed<Choice[]>(() => {
  const out: Choice[] = [{ key: 'none', target: { kind: 'none' }, label: t('broker.packageWorkspace.link.none'), kind: 'none' }]
  for (const c of props.pkg.containers) {
    out.push({ key: `c:${c.id}`, target: { kind: 'container', containerId: c.id }, label: formatContainerNumber(c.containerNumber), kind: 'container' })
    for (const p of c.consolidations) {
      out.push({
        key: `p:${p.id}`,
        target: { kind: 'partia', containerId: c.id, partiaId: p.id },
        label: p.clientName?.trim() ? props.clientLabel(p.clientName) : t('broker.packageWorkspace.link.noClient'),
        kind: 'partia',
      })
    }
  }
  return out
})
const current = computed<LinkTarget | null>(() => (props.file ? fileTarget(props.file, props.pkg) : null))
const isCurrent = (c: Choice) => !!current.value && sameTarget(current.value, c.target)

const pick = (c: Choice) => {
  emit('update:open', false)
  if (!isCurrent(c)) emit('select', c.target)
}

const row = 'flex w-full min-h-10 cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent px-2.5 py-2 text-left font-sans text-sm text-ink outline-hidden hover:bg-sunken focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <ZModal
    :open="open"
    :title="file ? t('broker.packageWorkspace.link.title', { name: file.originalFileName }) : ''"
    :width="440"
    :footer="false"
    data-ws-link-menu
    @update:open="emit('update:open', $event)"
  >
    <ul class="m-0 flex list-none flex-col gap-0.5 p-0 pb-2">
      <li v-for="c in choices" :key="c.key">
        <button
          type="button"
          :class="[row, c.kind === 'partia' && 'pl-8', isCurrent(c) && 'bg-zircon-soft hover:bg-zircon-soft']"
          :aria-current="isCurrent(c) ? 'true' : undefined"
          :data-link-choice="c.key"
          @click="pick(c)"
        >
          <PhProhibit v-if="c.kind === 'none'" :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
          <PhShippingContainer v-else-if="c.kind === 'container'" :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
          <PhUser v-else :size="15" class="shrink-0 text-ink-3" aria-hidden="true" />
          <span v-if="c.kind === 'container'" class="sr-only">{{ t('broker.packageWorkspace.link.container') }}</span>
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]" :class="c.kind === 'container' && 'font-mono font-medium'">{{ c.label }}</span>
          <span v-if="isCurrent(c)" class="inline-flex shrink-0 items-center gap-1 text-xs text-zircon-ink">
            <PhCheck :size="14" weight="bold" aria-hidden="true" />{{ t('broker.packageWorkspace.link.current') }}
          </span>
        </button>
      </li>
    </ul>
    <p v-if="!pkg.containers.length" class="m-0 pb-2 text-sm text-muted">{{ t('broker.packageWorkspace.link.noContainers') }}</p>
  </ZModal>
</template>
