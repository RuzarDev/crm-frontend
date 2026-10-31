<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import ZInput from '@/components/z/ZInput.vue'

// Вагоны поставки ЖД (01.11.2026, пункт 1 правок 30.10): «Номер вагона» строками и «+ Вагон», как «+ Контейнер» в мастере.
// Одна строка есть всегда (пустая — «вагон не указан»). Значение — список как ввели; пустые и повторы отбрасывает сервер
// (Import40Wagons). commit — поле потеряло фокус, Enter или строку удалили: экраны с сохранением по blur сохраняют список.
const props = withDefaults(defineProps<{
  value: string[]
  label: string
  disabled?: boolean
  /** Классы поля (высота на телефоне — как у соседних полей экрана). */
  inputClass?: string
}>(), { disabled: false, inputClass: '' })
const emit = defineEmits<{ 'update:value': [value: string[]]; commit: [] }>()

const { t } = useI18n()
const labelId = `wagons-${useId()}`
const rows = computed(() => (props.value.length ? props.value : ['']))

// Ключи строк: удаление из середины не пересоздаёт соседние поля (фокус и ввод не прыгают).
let nextKey = 0
const keys = ref<number[]>([])
watch(() => rows.value.length, (n) => {
  while (keys.value.length < n) keys.value.push(++nextKey)
  if (keys.value.length > n) keys.value.splice(n)
}, { immediate: true })

const inputs = ref<(InstanceType<typeof ZInput> | null)[]>([])
const setAt = (i: number, v: string) => {
  const next = [...rows.value]
  next[i] = v
  emit('update:value', next)
}
const add = async () => {
  emit('update:value', [...rows.value, ''])
  await nextTick()
  inputs.value[rows.value.length - 1]?.focus()
}
const remove = (i: number) => {
  const next = rows.value.filter((_, k) => k !== i)
  keys.value.splice(i, 1)
  emit('update:value', next.length ? next : [''])
  emit('commit')
}

const iconButton =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden ' +
  'transition-colors duration-150 ease-out hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus disabled:cursor-not-allowed ' +
  'disabled:opacity-45 motion-reduce:transition-none sm:size-9'
</script>

<template>
  <div role="group" :aria-labelledby="labelId" class="flex min-w-0 flex-col gap-1" data-wagons>
    <span :id="labelId" class="text-sm font-medium text-ink-2">{{ label }}</span>
    <ul role="list" class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="(w, i) in rows" :key="keys[i]" class="flex items-center gap-2" data-wagon-row>
        <ZInput
          :ref="(el) => { inputs[i] = el as InstanceType<typeof ZInput> | null }"
          :value="w"
          mono
          inputmode="numeric"
          :maxlength="50"
          autocomplete="off"
          :disabled="disabled"
          :aria-label="t('placement.wagons.numberN', { n: i + 1 })"
          :class="['min-w-0 flex-1', inputClass]"
          data-wagon-input
          @update:value="setAt(i, $event)"
          @blur="emit('commit')"
          @press-enter="emit('commit')"
        />
        <button
          v-if="rows.length > 1 && !disabled"
          type="button"
          :aria-label="w.trim() ? t('placement.wagons.remove', { number: w.trim() }) : t('placement.wagons.removeRow', { n: i + 1 })"
          :class="iconButton"
          data-wagon-remove
          @click="remove(i)"
        >
          <PhTrash :size="17" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <button
      v-if="!disabled"
      type="button"
      class="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-field border-0 bg-transparent px-2 font-sans text-sm font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-9"
      data-wagon-add
      @click="add"
    >
      <PhPlus :size="15" weight="bold" aria-hidden="true" />{{ t('placement.wagons.add') }}
    </button>
  </div>
</template>
