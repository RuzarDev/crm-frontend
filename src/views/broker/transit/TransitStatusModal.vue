<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useReestrStore } from '@/stores/reestr'
import type { ReestrEntry, ReestrEntryStatus } from '@/types/api'
import { TRANSIT_STATUSES, statusKey } from './transit'

// Смена статуса записи транзита (одной — из меню строки, нескольких — из полосы выбора).
// Одна: статус не изменился — окно закрывается без запроса. Окно закрывается после успешной смены
// (changed — родитель обновляет историю статусов и снимает выбор); при отказе сервера остаётся открытым.
const props = defineProps<{ open: boolean; entries: ReestrEntry[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>()

const { t } = useI18n()
const store = useReestrStore()

const value = ref<ReestrEntryStatus | null>(null)
const saving = ref(false)
const single = computed(() => (props.entries.length === 1 ? props.entries[0] : null))
watch(() => props.open, (v) => { if (v) value.value = single.value ? single.value.status : null }, { immediate: true })

const options = computed(() => TRANSIT_STATUSES.map((s) => ({ value: s, label: t(`enum.reestrStatus.${statusKey(s)}`) })))
const title = computed(() => (single.value ? t('transit.smenaStatusa') : t('broker.transit.statusTitleMany', { n: props.entries.length })))

const close = () => emit('update:open', false)

const save = async () => {
  const status = value.value
  if (status === null || saving.value || !props.entries.length) return
  const one = single.value
  if (one && status === one.status) {
    close()
    return
  }
  saving.value = true
  try {
    if (one) {
      if (!(await store.changeStatus(one.id, status))) return
    } else {
      await store.changeStatuses(props.entries.map((e) => e.id), status)
    }
    emit('changed')
    close()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="420"
    :ok-text="t('transit.sohranit')"
    :cancel-text="t('transit.otmena')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: value === null }"
    data-transit-status-modal
    @update:open="emit('update:open', $event)"
    @ok="save"
  >
    <div class="pb-2">
      <ZField :label="t('transit.status')">
        <ZSelect
          :value="value"
          :options="options"
          :placeholder="t('transit.vyberiteStatus')"
          data-transit-status-select
          @update:value="value = $event as ReestrEntryStatus | null"
        />
      </ZField>
    </div>
  </ZModal>
</template>
