<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZModal from '@/components/z/ZModal.vue'

// Одно предупреждение при отправке из мастера (01.11.2026, правки 30.10 п.4а): раньше подряд шли два окна — «Не всё
// загружено» (запрос декларанта) и «Не приложены» (обязательные по чек-листу). Теперь одно окно с двумя списками;
// повторы мастер убирает до показа. «Сначала загрузить» (и крестик) — не отправлять, «Отправить» — отправить.
defineProps<{ asked: string[]; required: string[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ send: []; upload: [] }>()
const { t } = useI18n()

const send = () => {
  open.value = false
  emit('send')
}
</script>

<template>
  <ZModal
    v-model:open="open"
    :title="t('client.wizard.warn.title')"
    :ok-text="t('client.wizard.warn.ok')"
    :cancel-text="t('client.wizard.warn.cancel')"
    :width="480"
    data-wz-warn
    @ok="send"
    @cancel="emit('upload')"
  >
    <template #description>{{ t('client.wizard.warn.text') }}</template>
    <div class="mt-3 flex flex-col gap-3.5 text-sm leading-[21px] text-ink-2">
      <section v-if="asked.length" data-wz-warn-asked>
        <h3 class="m-0 mb-1 text-[13px] font-semibold tracking-[0.02em] text-ink">{{ t('client.wizard.warn.asked') }}</h3>
        <ul role="list" class="m-0 list-disc pl-5">
          <li v-for="x in asked" :key="x">{{ x }}</li>
        </ul>
      </section>
      <section v-if="required.length" data-wz-warn-required>
        <h3 class="m-0 mb-1 text-[13px] font-semibold tracking-[0.02em] text-ink">{{ t('client.wizard.warn.required') }}</h3>
        <ul role="list" class="m-0 list-disc pl-5">
          <li v-for="x in required" :key="x">{{ x }}</li>
        </ul>
      </section>
      <p class="m-0 text-[13px] text-muted">{{ t('client.wizard.warn.resp') }}</p>
    </div>
  </ZModal>
</template>
