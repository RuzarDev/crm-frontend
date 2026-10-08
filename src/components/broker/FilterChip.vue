<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhPlus, PhX } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import ZInput from '@/components/z/ZInput.vue'
import ZPopover from '@/components/z/ZPopover.vue'
import { chipClear, chipFrame, chipTrigger } from './chipStyles'

// Фильтр-«чип» списка: пунктир «+ Метка»; с выбранным значением — «Метка: значение ×».
// Список вариантов — listbox в ZPopover; фокус остаётся на списке (или на поиске), активный вариант
// указывается через aria-activedescendant: ↑/↓/Home/End — перемещение, Enter — выбор, Esc — закрыть (Reka).
const props = withDefaults(defineProps<{
  label: string
  options: { value: string; label: string }[]
  value: string | null
  /** Поиск по списку; без значения включается сам, когда вариантов больше 8. */
  searchable?: boolean
  /** Подпись пункта «сбросить» в начале списка (по умолчанию «Все»). */
  allLabel?: string
}>(), { searchable: undefined, allLabel: undefined })

const emit = defineEmits<{ 'update:value': [value: string | null] }>()

const { t } = useI18n()
const uid = useId()
const triggerId = `${uid}-trigger`
const listId = `${uid}-list`
const optionId = (i: number) => `${uid}-opt-${i}`

const open = ref(false)
const query = ref('')
const activeIdx = ref(0)
const listEl = ref<HTMLElement>()
const triggerEl = ref<HTMLButtonElement>()

const hasSearch = computed(() => props.searchable ?? props.options.length > 8)
const selected = computed(() => (props.value == null ? null : props.options.find((o) => o.value === props.value) ?? { value: props.value, label: props.value }))
const active = computed(() => selected.value != null)

// «Все» — первый пункт (сброс); при вводе в поиск его нет.
const items = computed<{ value: string | null; label: string }[]>(() => {
  const q = query.value.trim().toLowerCase()
  const found = q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options
  return q ? found : [{ value: null, label: props.allLabel ?? t('broker.list.all') }, ...found]
})

watch(open, (v) => {
  // Поиск сбрасываем при закрытии: иначе при следующем открытии watch(query) затёр бы выбранный пункт.
  if (!v) { query.value = ''; return }
  const i = props.value == null ? 0 : items.value.findIndex((x) => x.value === props.value)
  activeIdx.value = Math.max(i, 0)
  scrollToActive()
})
watch(query, () => { activeIdx.value = 0 })

const scrollToActive = async () => {
  await nextTick()
  document.getElementById(optionId(activeIdx.value))?.scrollIntoView?.({ block: 'nearest' })
}
const move = (to: number) => {
  const n = items.value.length
  if (!n) return
  activeIdx.value = Math.min(Math.max(to, 0), n - 1)
  scrollToActive()
}
const pick = (i: number) => {
  const it = items.value[i]
  if (!it) return
  emit('update:value', it.value)
  open.value = false
}
// «×» исчезает вместе с активным состоянием — фокус переносим на кнопку чипа, а не теряем на <body>.
const clear = async () => {
  emit('update:value', null)
  await nextTick()
  triggerEl.value?.focus()
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.isComposing) return
  if (e.key === 'ArrowDown') { e.preventDefault(); move(activeIdx.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(activeIdx.value - 1) }
  else if (e.key === 'Enter') { e.preventDefault(); pick(activeIdx.value) }
  // Home/End в поле поиска двигают каретку — там не перехватываем.
  else if (!hasSearch.value && e.key === 'Home') { e.preventDefault(); move(0) }
  else if (!hasSearch.value && e.key === 'End') { e.preventDefault(); move(items.value.length - 1) }
}
const activeDescendant = computed(() => (items.value.length ? optionId(activeIdx.value) : undefined))
</script>

<template>
  <span :class="chipFrame(active)">
    <ZPopover v-model:open="open" content-class="p-1 min-w-56 max-w-[min(22rem,calc(100vw-2rem))]">
      <template #trigger>
        <button :id="triggerId" ref="triggerEl" type="button" :class="chipTrigger">
          <PhPlus v-if="!active" :size="13" weight="bold" aria-hidden="true" />
          <span class="truncate">{{ active ? `${label}: ${selected!.label}` : label }}</span>
        </button>
      </template>
      <div v-if="hasSearch" class="p-1 pb-1.5">
        <ZInput
          type="search"
          size="sm"
          class="max-sm:h-11"
          :value="query"
          :placeholder="t('broker.list.searchOptions')"
          :aria-label="t('broker.list.searchOptions')"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          :aria-controls="listId"
          :aria-activedescendant="activeDescendant"
          @update:value="query = $event"
          @keydown="onKeydown"
        />
      </div>
      <div
        :id="listId"
        ref="listEl"
        role="listbox"
        :aria-label="label"
        :tabindex="hasSearch ? -1 : 0"
        class="max-h-72 overflow-y-auto outline-hidden focus-visible:shadow-focus"
        :aria-activedescendant="hasSearch ? undefined : activeDescendant"
        @keydown="onKeydown"
      >
        <button
          v-for="(it, i) in items"
          :id="optionId(i)"
          :key="it.value == null ? 'all' : `v:${it.value}`"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="(it.value ?? null) === value"
          :class="cn(
            'flex h-9 w-full cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent px-2.5 text-left font-sans text-sm text-ink outline-hidden max-sm:h-11',
            i === activeIdx && 'bg-sunken',
            (it.value ?? null) === value && 'font-semibold',
          )"
          @mousedown.prevent
          @mousemove="activeIdx = i"
          @click="pick(i)"
        >
          <span class="min-w-0 flex-1 truncate">{{ it.label }}</span>
          <PhCheck v-if="(it.value ?? null) === value" :size="14" weight="bold" class="shrink-0 text-zircon-ink" aria-hidden="true" />
        </button>
        <p v-if="!items.length" class="px-2.5 py-2 text-sm text-muted">{{ t('broker.list.noOptions') }}</p>
      </div>
    </ZPopover>
    <button
      v-if="active"
      type="button"
      :class="chipClear"
      :aria-label="t('broker.list.clearFilter')"
      :aria-describedby="triggerId"
      @click="clear"
    >
      <PhX :size="12" weight="bold" aria-hidden="true" />
    </button>
  </span>
</template>
