<template>
  <a-select
    :value="locale"
    size="small"
    :bordered="bordered"
    class="lang-switcher"
    :options="options"
    :get-popup-container="popupContainer"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'

defineProps<{ bordered?: boolean }>()

const { t, locale } = useI18n()

const options = computed(() =>
  SUPPORTED_LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) })),
)

const popupContainer = () => document.body
const onChange = (v: unknown) => setLocale(v as AppLocale)
</script>

<style scoped>
.lang-switcher {
  min-width: 108px;
}
</style>
