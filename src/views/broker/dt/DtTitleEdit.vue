<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { PhPencilSimple } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import { DT_TITLE_MAX } from '@/views/broker/case/dtTitle'

// Название ДТ с правкой на месте (23.10.2026) — строка списка ДТ заявки и шапка страницы ДТ. Своё название — обычным
// цветом, автоназвание — приглушённым. Карандаш (только с правом CanManageDeclarations) → поле на месте: Enter или уход
// фокуса — сохранить, Esc — отмена, пусто — вернуть автоназвание. Поле начинается со своего названия (не с автоназвания:
// Enter без правки не превращал бы автоназвание в своё), автоназвание — подсказкой в поле.
// Сохраняет родитель: save → true — поле закрывается, false — остаётся (текст ошибки показал общий перехватчик).
const props = withDefaults(defineProps<{
  /** Своё название (null — нет). */
  title: string | null | undefined
  autoTitle: string | null
  canEdit: boolean
  save: (title: string | null) => Promise<boolean>
  /** Тег текста: 'h1' в шапке ДТ. */
  as?: string
  /** Текст — ссылкой (строка списка ДТ). */
  to?: RouteLocationRaw | null
  textClass?: string
}>(), { as: 'span', to: null, textClass: '' })
const { t } = useI18n()

const own = computed(() => (props.title ?? '').trim() || null)
const text = computed(() => own.value ?? props.autoTitle)

const editing = ref(false)
const busy = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const pencilEl = ref<HTMLButtonElement | null>(null)

const start = async () => {
  if (!props.canEdit || editing.value) return
  draft.value = own.value ?? ''
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}
const finish = async (refocus: boolean) => {
  editing.value = false
  if (!refocus) return
  await nextTick()
  pencilEl.value?.focus()
}
const commit = async (refocus: boolean) => {
  if (!editing.value || busy.value) return
  const next = draft.value.trim() || null
  if (next === own.value) {
    await finish(refocus)
    return
  }
  busy.value = true
  try {
    if (await props.save(next)) await finish(refocus)
  } finally {
    busy.value = false
  }
}
const cancel = () => { void finish(true) }

const pencilLabel = computed(() => t(own.value ? 'import40Case.dtTitle.rename' : 'import40Case.dtTitle.name'))
</script>

<template>
  <span class="inline-flex min-w-0 max-w-full items-center gap-1" data-dt-title-box>
    <input
      v-if="editing"
      ref="inputEl"
      v-model="draft"
      type="text"
      :maxlength="DT_TITLE_MAX"
      :placeholder="autoTitle || t('import40Case.dtTitle.placeholder')"
      :aria-label="t('import40Case.dtTitle.inputLabel')"
      :aria-busy="busy || undefined"
      :readonly="busy"
      class="h-8 w-[min(420px,100%)] min-w-0 rounded-field border border-line-strong bg-surface px-2 font-sans text-sm text-ink outline-hidden focus:shadow-focus max-sm:h-11"
      data-dt-title-input
      @keydown.enter.prevent="commit(true)"
      @keydown.esc.prevent.stop="cancel"
      @blur="commit(false)"
    />
    <template v-else>
      <component
        :is="to ? RouterLink : as"
        v-if="text"
        :to="to ?? undefined"
        :class="cn(
          'm-0 min-w-0 [overflow-wrap:anywhere]',
          own ? 'text-ink' : 'text-ink-2',
          to && 'rounded-[4px] no-underline outline-hidden hover:text-zircon-ink hover:underline focus-visible:shadow-focus',
          textClass,
        )"
        data-dt-title
        :data-dt-title-auto="own ? undefined : ''"
      >{{ text }}</component>
      <button
        v-if="canEdit"
        ref="pencilEl"
        type="button"
        :aria-label="pencilLabel"
        :title="pencilLabel"
        class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none max-sm:size-11"
        data-dt-title-edit
        @click="start"
      >
        <PhPencilSimple :size="14" aria-hidden="true" />
      </button>
    </template>
  </span>
</template>
