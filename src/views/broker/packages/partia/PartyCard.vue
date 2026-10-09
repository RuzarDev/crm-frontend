<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPencilSimple } from '@phosphor-icons/vue'
import type { PartyAddress } from '@/types/api'

// Карточка стороны партии (доска PartiaEditor): подпись «Отправитель» / «Получатель», название,
// «страна · регион, город, улица» или «Не заполнено». Нажатие открывает окно правки; в чтении — просто карточка.
const props = defineProps<{ label: string; party: PartyAddress; readonly: boolean }>()
const emit = defineEmits<{ edit: [] }>()
const { t } = useI18n()

const val = (v: string | null | undefined) => (v ?? '').trim()
const empty = computed(() => (Object.keys(props.party) as (keyof PartyAddress)[]).every((k) => !val(props.party[k])))
const address = computed(() => {
  const place = [props.party.region, props.party.city, props.party.street].map(val).filter(Boolean).join(', ')
  return [val(props.party.countryCode), place].filter(Boolean).join(' · ')
})
</script>

<template>
  <component
    :is="readonly ? 'div' : 'button'"
    :type="readonly ? undefined : 'button'"
    :aria-label="readonly ? undefined : t('broker.partia.party.editAria', { title: label })"
    class="group flex min-h-11 w-full min-w-0 flex-col items-start gap-1 rounded-panel border border-line bg-surface px-3.5 py-3 text-left font-sans outline-hidden"
    :class="!readonly && 'cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none'"
    data-party-card
    @click="!readonly && emit('edit')"
  >
    <span class="flex w-full items-center gap-2 text-xs leading-4 text-ink-3">
      <span class="min-w-0 flex-1">{{ label }}</span>
      <PhPencilSimple v-if="!readonly" :size="14" aria-hidden="true" class="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100" />
    </span>
    <span v-if="empty" class="text-sm text-muted" data-party-empty>{{ t('broker.partia.party.empty') }}</span>
    <template v-else>
      <span class="w-full text-sm font-medium text-ink [overflow-wrap:anywhere]" data-party-name>{{ val(party.name) || '—' }}</span>
      <span v-if="address" class="w-full text-[12.5px] leading-[1.4] text-ink-3 [overflow-wrap:anywhere]" data-party-address>{{ address }}</span>
    </template>
  </component>
</template>
