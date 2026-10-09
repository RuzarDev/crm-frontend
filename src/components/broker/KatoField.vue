<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZSelect from '@/components/z/ZSelect.vue'
import { katoApi, katoLabel, type KatoDto } from '@/api/kato'
import type { ZOption } from '@/ui/options'

// Выбор КАТО (Z-замена KatoSelect): классификатор ~15,6 тыс. кодов в клиент не грузим — серверный поиск
// с паузой (250 мс) и защитой от гонки (ответ устаревшего запроса отбрасывается). Значение — 9-значный код;
// у сохранённого кода подпись подтягивается отдельно (GET /ref/kato/{code}), чтобы показать название, а не код.
// Монтирование значение не меняет — пишет только выбор пользователя.
const props = defineProps<{
  value: string | null | undefined
  disabled?: boolean
  placeholder?: string
  invalid?: boolean
}>()
const emit = defineEmits<{ 'update:value': [code: string | null] }>()
const { t } = useI18n()

type KatoOption = ZOption & { value: string; nameRu: string; path: string }
const toOpt = (k: KatoDto): KatoOption => ({ value: k.code, label: katoLabel(k), nameRu: k.nameRu, path: k.path })

const found = ref<KatoOption[]>([])
const current = ref<KatoOption | null>(null)
const loading = ref(false)
const query = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

// Выбранный код всегда в списке (иначе в поле был бы голый код).
const options = computed<ZOption[]>(() => {
  const cur = current.value
  return cur && !found.value.some((o) => o.value === cur.value) ? [cur, ...found.value] : found.value
})

const runSearch = async (q: string) => {
  const my = ++seq
  loading.value = true
  try {
    const items = await katoApi.search(q, 40, { silent: true })
    if (my === seq) found.value = items.map(toOpt)
  } catch {
    if (my === seq) found.value = []
  } finally {
    if (my === seq) loading.value = false
  }
}
const onSearch = (q: string) => {
  query.value = q
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void runSearch(q.trim()) }, 250)
}
// Первое открытие — начало списка.
const onFocus = () => {
  if (!query.value && !found.value.length && !loading.value) void runSearch('')
}
const onUpdate = (v: unknown) => {
  const code = v == null || v === '' ? null : String(v)
  current.value = code ? (options.value.find((o) => o.value === code) as KatoOption | undefined) ?? null : null
  emit('update:value', code)
}

// Подпись сохранённого кода (и кода, подставленного извне — справочник, копия декларанта).
let labelSeq = 0
watch(() => props.value, async (code) => {
  const my = ++labelSeq
  if (!code) { current.value = null; return }
  if (current.value?.value === code) return
  const known = found.value.find((o) => o.value === code)
  if (known) { current.value = known; return }
  current.value = { value: code, label: code, nameRu: '', path: '' }
  const k = await katoApi.get(code)
  if (k && my === labelSeq) current.value = toOpt(k)
}, { immediate: true })

onBeforeUnmount(() => { if (timer) clearTimeout(timer); seq++ })
</script>

<template>
  <ZSelect
    :value="value || null"
    :options="options"
    show-search
    allow-clear
    :filter-option="false"
    :loading="loading"
    :disabled="disabled"
    :invalid="invalid"
    :placeholder="placeholder ?? t('broker.kato.placeholder')"
    :not-found-content="query ? t('broker.kato.notFound') : t('broker.kato.typeToSearch')"
    popup-width="26rem"
    data-kato-field
    @search="onSearch"
    @focus="onFocus"
    @update:value="onUpdate"
  >
    <template #option="{ option }">
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="truncate font-medium">{{ (option as KatoOption).nameRu || option.label }}</span>
        <span class="truncate text-xs text-muted">{{ option.value }}<template v-if="(option as KatoOption).path"> · {{ (option as KatoOption).path }}</template></span>
      </span>
    </template>
  </ZSelect>
</template>
