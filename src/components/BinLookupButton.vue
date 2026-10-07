<template>
  <a-tooltip :title="tooltip">
    <a-button
      :size="size"
      :type="type"
      :disabled="disabled || !isBinLike(bin)"
      :loading="loading"
      class="bin-lookup-btn"
      @click="lookup"
    >
      <SearchOutlined v-if="!loading" />
      <slot>{{ t('binLookup.find') }}</slot>
    </a-button>
  </a-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SearchOutlined } from '@ant-design/icons-vue'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import { useBinLookup } from '@/composables/useBinLookup'

// Кнопка «Найти по БИН/ИИН»: тянет карточку юрлица из ГБД ЮЛ (data.egov.kz) или ИП из КГД и отдаёт
// её родителю событием found — что именно подставлять, решает родитель (у профиля,
// мастера и граф ДТ разный набор полей). Ошибки показывает сама (useBinLookup).
const { t } = useI18n()
const props = withDefaults(defineProps<{
  bin: string | null | undefined
  size?: 'small' | 'middle' | 'large'
  type?: 'default' | 'primary' | 'link' | 'dashed' | 'text'
  disabled?: boolean
  // Публичный эндпоинт (страница регистрации, без токена) — с rate-limit по IP.
  anonymous?: boolean
}>(), { size: 'small', type: 'default', disabled: false, anonymous: false })

const emit = defineEmits<{ found: [company: CompanyLookupDto] }>()

// Геттер: anonymous читается при каждом поиске — смена prop учитывается.
const { loading, lookup: find } = useBinLookup({ get anonymous() { return props.anonymous } })
const tooltip = computed(() =>
  isBinLike(props.bin) ? t('binLookup.tipReady') : t('binLookup.tipEnter'),
)

const lookup = async () => {
  const company = await find(props.bin)
  if (company) emit('found', company)
}
</script>

<style scoped>
.bin-lookup-btn { white-space: nowrap; }
</style>
