<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { DeclarationCopySource } from '@/api/autoTransit'
import { dateText } from '../truck/truckView'

/** Итог копии: ok — подставлено (окно закрывается), cancelled — пользователь не стал заменять, остальное — ошибка в окне. */
export type CopyResult = 'ok' | 'cancelled' | 'notFound' | 'error'

// «Копировать с прошлой ТД» (очередь 2а, Task 3; очередь 3 — ещё по отправителю и посту назначения, с отметкой «совпало»):
// список прошлых ПИ / ТД (сервер отбирает, новые сверху, не больше 20), выбор одной и галочка «Скопировать и товары». Само копирование (загрузка источника,
// подтверждение замены, applyCopy) — run от страницы; в базу ничего не пишется до «Сохранить».
const props = defineProps<{
  open: boolean
  sources: DeclarationCopySource[]
  run: (sourcePartyId: string, withGoods: boolean) => Promise<CopyResult>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const C = 'broker.autoTransit.td.copy'

const selected = ref<string | null>(null)
const withGoods = ref(false)
const running = ref(false)
const error = ref<'notFound' | 'error' | null>(null)
watch(() => props.open, (v) => {
  if (!v) return
  selected.value = props.sources[0]?.partyId ?? null
  withGoods.value = false
  error.value = null
})
watch(selected, () => { error.value = null })

const rows = computed(() => props.sources.map((s) => ({
  id: s.partyId,
  // Получатель источника (ревью этапа 1): по посту назначения в списке бывают ПИ других клиентов.
  title: [t(`${C}.source`, { plate: s.truckPlate }), s.recipientName?.trim()].filter(Boolean).join(' · '),
  meta: [
    s.tdNumber.trim() ? t(`${C}.tdNumber`, { n: s.tdNumber.trim() }) : t(`${C}.noTdNumber`),
    s.updatedAtUtc ? t(`${C}.saved`, { date: dateText(s.updatedAtUtc) }) : '',
    t(`${C}.goods`, { n: s.goodsCount }),
    // Очередь 3: источник подходит по получателю, отправителю или посту назначения — пишем, по чему.
    s.matchedBy?.length ? t(`${C}.matched`, { by: s.matchedBy.map((m) => t(`${C}.matchedBy.${m}`)).join(', ') }) : '',
  ].filter(Boolean).join(' · '),
})))

const onOk = async () => {
  if (!selected.value || running.value) return
  running.value = true
  error.value = null
  try {
    const res = await props.run(selected.value, withGoods.value)
    if (res === 'ok') emit('update:open', false)
    else if (res !== 'cancelled') error.value = res
  } finally {
    running.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t(`${C}.title`)"
    :ok-text="t(`${C}.ok`)"
    :cancel-text="t(`${C}.cancel`)"
    :confirm-loading="running"
    :ok-button-props="{ disabled: !selected }"
    :width="520"
    data-td-copy-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <p class="m-0 text-sm text-ink-2">{{ t(`${C}.hint`) }}</p>
      <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend class="sr-only">{{ t(`${C}.listLabel`) }}</legend>
        <label
          v-for="r in rows"
          :key="r.id"
          class="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-row border px-3 py-2.5 has-[:focus-visible]:shadow-focus max-sm:min-h-11"
          :class="selected === r.id ? 'border-navy bg-sunken' : 'border-line hover:border-line-strong'"
          :data-td-copy-source="r.id"
        >
          <input v-model="selected" type="radio" name="td-copy-source" :value="r.id" class="mt-0.5 shrink-0 accent-navy">
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{{ r.title }}</span>
            <span class="text-xs text-muted [overflow-wrap:anywhere]">{{ r.meta }}</span>
          </span>
        </label>
      </fieldset>
      <label class="inline-flex min-h-9 cursor-pointer items-center gap-2 self-start text-sm text-ink max-sm:min-h-11">
        <ZCheckbox v-model:checked="withGoods" data-td-copy-goods />{{ t(`${C}.withGoods`) }}
      </label>
      <ZAlert v-if="error" type="error" show-icon data-td-copy-error>{{ t(`${C}.${error}`) }}</ZAlert>
    </div>
  </ZModal>
</template>
