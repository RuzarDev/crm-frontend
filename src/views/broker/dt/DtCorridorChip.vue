<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import { surApi } from '@/api/sur'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// Коридор ДТ в шапке (21.10, прогноз СУР): после подачи/регистрации сотрудник (декларант, РОП, админ) отмечает коридор,
// который назначила таможня. Только отметка идёт в статистику «Коридоры по нашим ДТ» — умолчание «зелёный» не считается.
// Коридор из КЕДЕН — с пометкой «по КЕДЕН». Свой запрос, без автосейва ДТ (PUT ДТ коридор не шлёт).
type Corridor = 'green' | 'yellow' | 'red'
const props = defineProps<{
  caseId: string
  dtId: string
  corridor: string | null | undefined
  setAtUtc: string | null | undefined
  kedenCorridor: string | null | undefined
  canEdit: boolean
}>()
const { t } = useI18n()

const state = ref({ corridor: props.corridor ?? null, setAt: props.setAtUtc ?? null, keden: props.kedenCorridor ?? null })
watch(() => [props.corridor, props.setAtUtc, props.kedenCorridor] as const, ([c, s, k]) => {
  state.value = { corridor: c ?? null, setAt: s ?? null, keden: k ?? null }
})

const NAMES = ['green', 'yellow', 'red'] as const
const known = computed<string | null>(() => state.value.keden || (state.value.setAt ? state.value.corridor : null))
const DOT: Record<string, string> = { green: 'bg-tone-done-fg', yellow: 'bg-gold-ink', red: 'bg-danger' }
const text = computed(() => {
  const c = known.value
  if (!c) return t('sur.corridorChip.none')
  const name = NAMES.includes(c as Corridor) ? t(`sur.corridorName.${c}`) : c
  return state.value.keden && !state.value.setAt ? `${name} · ${t('sur.corridorChip.fromKeden')}` : name
})

const items = computed<ZDropdownItem[]>(() => [
  ...NAMES.map((c) => ({ key: c, label: t(`sur.corridorName.${c}`) })),
  ...(state.value.setAt ? [{ key: 'clear', label: t('sur.corridorChip.clear') }] : []),
])
const saving = ref(false)
const onSelect = async (key: string) => {
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await surApi.setCorridor(props.caseId, props.dtId, key === 'clear' ? null : (key as Corridor))
    state.value = { corridor: data.corridor, setAt: data.setAtUtc, keden: data.kedenCorridor }
    message.success(t('sur.corridorChip.saved'))
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    saving.value = false
  }
}

const chip = cn(
  'inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-strong bg-surface px-2.5 font-sans text-[12.5px] text-ink-2 max-sm:h-9',
)
</script>

<template>
  <span class="inline-flex" data-dt-corridor :data-dt-corridor-known="known ?? ''">
    <ZDropdown v-if="canEdit" :items="items" @select="onSelect">
      <button
        type="button"
        :class="cn(chip, 'cursor-pointer outline-hidden transition-colors duration-150 hover:bg-sunken focus-visible:shadow-focus motion-reduce:transition-none')"
        :aria-label="`${t('sur.corridorChip.label')}: ${text}. ${t('sur.corridorChip.action')}`"
        :disabled="saving"
        data-dt-corridor-chip
      >
        <span :class="cn('size-[7px] shrink-0 rounded-pill', known ? DOT[known] ?? 'bg-ink-3' : 'bg-ink-3')" aria-hidden="true" />
        <span class="font-semibold text-ink">{{ t('sur.corridorChip.label') }}</span>
        <span class="min-w-0 truncate" data-dt-corridor-text>{{ text }}</span>
      </button>
    </ZDropdown>
    <span v-else :class="chip" data-dt-corridor-chip>
      <span :class="cn('size-[7px] shrink-0 rounded-pill', known ? DOT[known] ?? 'bg-ink-3' : 'bg-ink-3')" aria-hidden="true" />
      <span class="font-semibold text-ink">{{ t('sur.corridorChip.label') }}</span>
      <span class="min-w-0 truncate" data-dt-corridor-text>{{ text }}</span>
    </span>
  </span>
</template>
