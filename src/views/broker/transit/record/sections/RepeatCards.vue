<script setup lang="ts" generic="T extends object">
import { toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'

// Список повторяющихся строк раздела (организации, пломбы, контейнеры…). Строки пишутся прямо в массив черновика.
// «Добавить» живёт в действиях раздела (SectionAddButton → add()), здесь — карточки и удаление.
// Ключ строки — стабильный id из WeakMap по объекту (не индекс): после удаления второй из трёх остальные
// остаются теми же узлами, поля не перемешиваются. Поля в строки не добавляем — они уходят на сервер.
const props = withDefaults(defineProps<{
  items: T[]
  readonly: boolean
  emptyText: string
  newItem: () => T
  /** Строка без карточки: номер, поля и «Удалить» в одну линию (контейнеры, грузовые операции). */
  inline?: boolean
}>(), { inline: false })
defineSlots<{ item: (p: { item: T; index: number }) => unknown }>()

const { t } = useI18n()

const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (item: T): number => {
  const raw = toRaw(item)
  let id = ids.get(raw)
  if (id === undefined) {
    id = ++nextId
    ids.set(raw, id)
  }
  return id
}

const add = () => { if (!props.readonly) props.items.push(props.newItem()) }
const remove = (index: number) => { if (!props.readonly) props.items.splice(index, 1) }
defineExpose({ add })

const deleteBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
const badge = 'inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-surface text-xs font-semibold text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
</script>

<template>
  <p v-if="!items.length" class="m-0 text-sm text-ink-3" data-repeat-empty>{{ emptyText }}</p>
  <ul v-else role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
    <li
      v-for="(item, index) in items"
      :key="keyOf(item)"
      data-repeat-item
      :class="inline
        ? 'flex items-end gap-2.5 max-sm:flex-wrap'
        : 'flex flex-col gap-3 rounded-row border border-line bg-surface p-3.5'"
    >
      <template v-if="inline">
        <span :class="[badge, 'mb-[7px] max-sm:mb-0 max-sm:self-center']" data-repeat-number>{{ index + 1 }}</span>
        <div class="min-w-0 flex-1 max-sm:basis-[calc(100%-4.5rem)]"><slot name="item" :item="item" :index="index" /></div>
        <button
          v-if="!readonly"
          type="button"
          :class="[deleteBtn, 'mb-0.5 max-sm:mb-0 max-sm:self-center']"
          :aria-label="`${t('common.delete')} ${index + 1}`"
          data-repeat-delete
          @click="remove(index)"
        ><PhX :size="16" aria-hidden="true" /></button>
      </template>
      <template v-else>
        <div class="flex items-center gap-2.5">
          <span :class="badge" data-repeat-number>{{ index + 1 }}</span>
          <button
            v-if="!readonly"
            type="button"
            :class="[deleteBtn, 'ml-auto']"
            :aria-label="`${t('common.delete')} ${index + 1}`"
            data-repeat-delete
            @click="remove(index)"
          ><PhX :size="16" aria-hidden="true" /></button>
        </div>
        <slot name="item" :item="item" :index="index" />
      </template>
    </li>
  </ul>
</template>
