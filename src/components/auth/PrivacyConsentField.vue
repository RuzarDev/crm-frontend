<script setup lang="ts">
import ZField from '@/components/z/ZField.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import { authLinkClass } from '@/components/auth/classes'

// Галочка согласия на обработку персональных данных (30.10.2026) — регистрация и принятие приглашения. Поле формы
// «consent»: правило в форме страницы показывает ошибку под галочкой, если форму отправили Enter'ом без неё.
// Ссылка на политику — в новой вкладке, чтобы не потерять заполненную форму; клик по ссылке галочку не ставит.
defineProps<{ checked: boolean }>()
const emit = defineEmits<{ 'update:checked': [checked: boolean] }>()
</script>

<template>
  <ZField name="consent">
    <ZCheckbox
      :checked="checked"
      class="items-start gap-2.5 text-[13.5px] leading-[1.45] text-ink-2 [&>button]:mt-0.5"
      data-privacy-consent
      @update:checked="emit('update:checked', $event)"
    >
      <i18n-t keypath="privacy.consent" tag="span" scope="global">
        <template #link>
          <a href="/privacy" target="_blank" rel="noopener" :class="[authLinkClass, 'underline underline-offset-2']">{{ $t('privacy.consentLink') }}</a>
        </template>
      </i18n-t>
    </ZCheckbox>
  </ZField>
</template>
