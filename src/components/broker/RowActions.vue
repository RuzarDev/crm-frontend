<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhDotsThree } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'

// Действия строки таблицы: необязательная главная кнопка + меню «⋯». Клики не всплывают к строке (открытие по клику на строку).
// Высота 32px, на телефоне 44px.
export interface RowPrimary {
  key: string
  label: string
  variant?: 'primary' | 'outline'
  loading?: boolean
  disabled?: boolean
}

defineProps<{ primary?: RowPrimary | null; items: ZDropdownItem[]; label: string }>()
const emit = defineEmits<{ action: [key: string] }>()
const { t } = useI18n()
const OUTLINE = 'border border-line-strong bg-surface enabled:hover:bg-sunken'
</script>

<template>
  <div class="flex items-center justify-end gap-1.5" data-row-actions @click.stop>
    <ZButton
      v-if="primary"
      :variant="primary.variant === 'primary' ? 'primary' : 'secondary'"
      :loading="primary.loading"
      :disabled="primary.disabled"
      :class="['h-8 max-sm:h-11 max-sm:px-4', primary.variant === 'primary' ? '' : OUTLINE]"
      data-row-primary
      @click="emit('action', primary.key)"
    >{{ primary.label }}</ZButton>
    <ZDropdown v-if="items.length" :items="items" @select="emit('action', $event)">
      <ZButton variant="ghost" class="size-8 px-0 max-sm:size-11" :aria-label="label" :title="t('broker.list.more')" data-row-more>
        <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
      </ZButton>
    </ZDropdown>
  </div>
</template>
