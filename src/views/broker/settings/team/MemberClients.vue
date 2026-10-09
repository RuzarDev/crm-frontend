<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import ZSelect from '@/components/z/ZSelect.vue'

// Клиенты сотрудника в панели: список привязанных (с удалением) и поиск-добавление из справочника клиентов.
// Сам ничего не сохраняет: изменённый список уходит наверх, сохраняет панель вместе с ролями.
const props = defineProps<{
  /** Привязанные клиенты: id и подпись (подпись нужна и тем, кого нет в справочнике). */
  value: { id: string; label: string }[]
  /** Все клиенты для добавления. */
  options: { value: string; label: string }[]
  disabled?: boolean
  loading?: boolean
  error?: boolean
}>()
const emit = defineEmits<{ 'update:value': [value: { id: string; label: string }[]]; retry: [] }>()
const { t } = useI18n()

const addable = computed(() => props.options.filter((o) => !props.value.some((v) => v.id === o.value)))
const add = (id: string | null) => {
  const opt = props.options.find((o) => o.value === id)
  if (opt) emit('update:value', [...props.value, { id: opt.value, label: opt.label }])
}
const remove = (id: string) => emit('update:value', props.value.filter((v) => v.id !== id))
</script>

<template>
  <div class="flex flex-col gap-2" data-member-clients>
    <div v-if="error" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-member-clients-error>
      <span class="min-w-0 flex-1">{{ t('broker.settings.team.drawer.clientsError') }}</span>
      <button type="button" class="cursor-pointer rounded-field border-0 bg-transparent p-0 font-sans text-sm text-ink underline outline-hidden focus-visible:shadow-focus max-sm:min-h-11" data-member-clients-retry @click="emit('retry')">{{ t('broker.settings.team.retry') }}</button>
    </div>
    <template v-else>
      <p v-if="loading" class="m-0 text-sm text-muted" data-member-clients-loading>{{ t('broker.settings.team.drawer.clientsLoading') }}</p>
      <template v-else>
        <ZSelect
          v-if="!disabled"
          :value="null"
          :options="addable"
          show-search
          :placeholder="t('broker.settings.team.drawer.clientsAdd')"
          :not-found-content="t('broker.settings.team.drawer.clientsNone')"
          class="max-sm:min-h-11"
          :aria-label="t('broker.settings.team.drawer.clientsAdd')"
          data-member-clients-add
          @update:value="add($event as string | null)"
        />
        <p v-if="!value.length" class="m-0 text-sm text-muted" data-member-clients-empty>{{ t('broker.settings.team.drawer.clientsEmpty') }}</p>
        <ul v-else class="m-0 flex list-none flex-col p-0">
          <li v-for="c in value" :key="c.id" class="flex min-h-11 items-center gap-2 border-b border-line py-1 last:border-b-0" data-member-client>
            <span class="min-w-0 flex-1 truncate text-sm text-ink" data-member-client-name>{{ c.label }}</span>
            <button
              v-if="!disabled"
              type="button"
              :aria-label="t('broker.settings.team.drawer.clientRemove', { name: c.label })"
              class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-muted outline-hidden hover:text-ink focus-visible:shadow-focus sm:size-8"
              data-member-client-remove
              @click="remove(c.id)"
            >
              <PhX :size="14" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
