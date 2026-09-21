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
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { SearchOutlined } from '@ant-design/icons-vue'
import { companyLookupApi, isBinLike, type CompanyLookupDto } from '@/api/companyLookup'

// Кнопка «Найти по БИН»: тянет карточку юрлица из ГБД ЮЛ (data.egov.kz) и отдаёт
// её родителю событием found — что именно подставлять, решает родитель (у профиля,
// мастера и граф ДТ разный набор полей). Ошибки показывает сама.
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

const loading = ref(false)
const tooltip = computed(() =>
  isBinLike(props.bin) ? t('binLookup.tipReady') : t('binLookup.tipEnter'),
)

const lookup = async () => {
  if (!isBinLike(props.bin)) return
  loading.value = true
  try {
    const company = await companyLookupApi.byBin(props.bin!, props.anonymous)
    emit('found', company)
    const status = company.statusRu ? ` · ${company.statusRu}` : ''
    message.success(t('binLookup.found', { name: `${company.nameRu ?? company.nameKz ?? company.bin}${status}` }))
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    const st = err.response?.status
    const text = err.response?.data?.error
    if (st === 404) message.warning(text ?? t('binLookup.notFound'))
    else if (st === 503) message.error(text ?? t('binLookup.notConfigured'))
    else if (st === 400) message.warning(text ?? t('binLookup.badBin'))
    else message.error(text ?? t('binLookup.unavailable'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.bin-lookup-btn { white-space: nowrap; }
</style>
