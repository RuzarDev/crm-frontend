<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhInfo, PhWarning, PhWarningCircle, PhX } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'

export type ZAlertType = 'info' | 'success' | 'warning' | 'error'

// Замена a-alert. closable: кнопка закрытия сама прячет плашку и шлёт close.
const props = withDefaults(defineProps<{
  type?: ZAlertType
  message?: string
  description?: string
  showIcon?: boolean
  closable?: boolean
}>(), { type: 'info', showIcon: false, closable: false })
const emit = defineEmits<{ close: [e: MouseEvent] }>()

const { t } = useI18n()
const visible = ref(true)

const TONE: Record<ZAlertType, string> = {
  info: 'border-transparent bg-tone-info-bg text-tone-info-fg',
  success: 'border-transparent bg-tone-done-bg text-tone-done-fg',
  warning: 'border-gold-line bg-gold-soft text-gold-ink',
  error: 'border-transparent bg-tone-danger-bg text-tone-danger-fg',
}
const ICON = { info: PhInfo, success: PhCheckCircle, warning: PhWarning, error: PhWarningCircle }

const role = computed(() => (props.type === 'error' || props.type === 'warning' ? 'alert' : 'status'))
const onClose = (e: MouseEvent) => {
  visible.value = false
  emit('close', e)
}
</script>

<template>
  <div v-if="visible" :role="role" :class="cn('flex items-start gap-3 rounded-row border px-4 py-3 text-sm', TONE[type])">
    <component :is="ICON[type]" v-if="showIcon" :size="18" weight="fill" aria-hidden="true" class="mt-0.5 shrink-0" />
    <div class="min-w-0 flex-1">
      <div v-if="message" class="font-semibold">{{ message }}</div>
      <div v-if="$slots.default || description" :class="cn('text-current', message && 'mt-0.5 opacity-90')">
        <slot>{{ description }}</slot>
      </div>
    </div>
    <div v-if="$slots.action" class="shrink-0"><slot name="action" /></div>
    <button
      v-if="closable"
      type="button"
      :aria-label="t('z.close')"
      class="-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-current outline-hidden transition-colors duration-150 hover:bg-surface/60 focus-visible:shadow-focus motion-reduce:transition-none"
      @click="onClose"
    >
      <PhX :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
