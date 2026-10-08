<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { PartyAddress } from '@/types/api'
import type { ZOption } from '@/ui/options'
import { PARTY_LIMITS } from './partiaModel'

// Окно стороны партии (отправитель / получатель): название, страна, регион, город, улица → «Применить».
// Правка идёт в копии: «Применить» отдаёт сторону целиком (пустое — null), «Отмена» ничего не меняет.
// Страна — тот же справочник, что у прежней формы (значение — код); старый код, которого нет в списке, виден как есть.
const props = defineProps<{ open: boolean; title: string; party: PartyAddress | null; countryOptions: ZOption[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; apply: [party: PartyAddress] }>()
const { t } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.partia.party.${key}`, p ?? {})

const local = reactive<PartyAddress>({ name: null, countryCode: null, region: null, city: null, street: null })
watch(() => props.open, (open) => {
  if (!open) return
  const p = props.party
  local.name = p?.name ?? null
  local.countryCode = p?.countryCode ?? null
  local.region = p?.region ?? null
  local.city = p?.city ?? null
  local.street = p?.street ?? null
}, { immediate: true })

const options = computed<ZOption[]>(() => {
  const code = local.countryCode
  if (!code || props.countryOptions.some((o) => o.value === code)) return props.countryOptions
  return [{ value: code, label: code }, ...props.countryOptions]
})

const nul = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const tooLong = (k: keyof PartyAddress) => ((local[k] ?? '').length > PARTY_LIMITS[k] ? tr('tooLong', { n: PARTY_LIMITS[k] }) : undefined)
const invalid = computed(() => (Object.keys(PARTY_LIMITS) as (keyof PartyAddress)[]).some((k) => !!tooLong(k)))

const apply = () => {
  if (invalid.value) return
  emit('apply', { name: nul(local.name), countryCode: nul(local.countryCode), region: nul(local.region), city: nul(local.city), street: nul(local.street) })
  emit('update:open', false)
}
const ctl = 'max-sm:h-11'
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="560"
    :ok-text="tr('apply')"
    :cancel-text="tr('cancel')"
    :ok-button-props="{ disabled: invalid }"
    data-party-modal
    @update:open="emit('update:open', $event)"
    @ok="apply"
  >
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ZField :label="tr('name')" :error="tooLong('name')" class="sm:col-span-2">
        <ZInput :value="local.name" :maxlength="PARTY_LIMITS.name" :class="ctl" data-party-f="name" @update:value="local.name = nul($event)" />
      </ZField>
      <ZField :label="tr('country')" class="sm:col-span-2">
        <ZSelect
          :value="local.countryCode"
          :options="options"
          show-search
          allow-clear
          :placeholder="tr('countryPlaceholder')"
          class="max-sm:*:h-11"
          data-party-f="countryCode"
          @update:value="local.countryCode = nul($event)"
        />
      </ZField>
      <ZField :label="tr('region')" :error="tooLong('region')">
        <ZInput :value="local.region" :maxlength="PARTY_LIMITS.region" :class="ctl" data-party-f="region" @update:value="local.region = nul($event)" />
      </ZField>
      <ZField :label="tr('city')" :error="tooLong('city')">
        <ZInput :value="local.city" :maxlength="PARTY_LIMITS.city" :class="ctl" data-party-f="city" @update:value="local.city = nul($event)" />
      </ZField>
      <ZField :label="tr('street')" :error="tooLong('street')" class="sm:col-span-2">
        <ZInput :value="local.street" :maxlength="PARTY_LIMITS.street" :class="ctl" data-party-f="street" @update:value="local.street = nul($event)" />
      </ZField>
    </div>
  </ZModal>
</template>
