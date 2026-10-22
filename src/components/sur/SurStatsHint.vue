<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWarning } from '@phosphor-icons/vue'
import { surApi, type SurCorridorStatsDto, type SurStatsDto, type SurStatsQuery } from '@/api/sur'
import { formatMoneyIn } from '@/ui/number'

// Подсказка СУР (очередь 4, задача 4) — в товаре ДТ (под подсказкой ставок) и в калькуляторе платежей (клиент и сотрудник):
// «По этому коду у нас N ДТ за 12 мес: зелёный X%, жёлтый Y%, красный Z%», отдельно по посту (если данных хватает),
// при N < 10 — «мало данных»; «цена ниже типичной» — стоимость за единицу ниже 25-го перцентиля наших ДТ по коду и стране.
// Только подсказка: ничего не блокирует, без «гарантий коридора». Сервер клиенту отдаёт только доли, N и признак;
// «типичная от …» (p25Kzt) приходит только сотрудникам. Запрос — тихо, с задержкой на ввод; сбой — строка без тоста;
// 403 (роль без доступа к статистике, например МПП транзита без import40.read) — блока нет совсем: это не сбой.
// Клиенту «ниже типичной» — только по своему товару своей ДТ (declarationId + goodsId; без id — goodsIndex): значения сервер
// берёт из ДТ. Id точнее позиции: при равных SortOrder порядок товаров у DTO и у сервера мог разойтись.
const props = withDefaults(defineProps<{
  code: string | null | undefined
  country?: string | null
  /** Таможенная стоимость, ₸ (гр. 45 / расчёт калькулятора). */
  valueKzt?: number | null
  netKg?: number | null
  /** Гр. 41: количество в ДЕИ и код ОКЕИ. */
  quantity?: number | null
  unitCode?: string | null
  /** ДТ: пост берётся из неё, сама ДТ в выборку не входит (сотрудник); клиенту — его ДТ для сравнения цены. */
  declarationId?: string | null
  /** Id сохранённого товара ДТ — клиенту сервер сравнивает цену этого товара (значения из ДТ, не из полей). */
  goodsId?: string | null
  /** Позиция товара в ДТ (с 0) — запасной путь, когда id товара ещё нет. */
  goodsIndex?: number | null
  debounceMs?: number
}>(), { country: null, valueKzt: null, netKg: null, quantity: null, unitCode: null, declarationId: null, goodsId: null, goodsIndex: null, debounceMs: 400 })

const { t, locale } = useI18n()
const ts = (key: string, p?: Record<string, unknown>) => t(`sur.${key}`, p ?? {})

const code = computed(() => (props.code ?? '').replace(/\D/g, ''))
const valid = computed(() => code.value.length === 10)
const query = computed<SurStatsQuery>(() => ({
  code: code.value,
  country: props.country || null,
  declarationId: props.declarationId || null,
  goodsId: props.declarationId && props.goodsId ? props.goodsId : null,
  goodsIndex: props.declarationId && !props.goodsId && props.goodsIndex != null && props.goodsIndex >= 0 ? props.goodsIndex : null,
  valueKzt: props.valueKzt && props.valueKzt > 0 ? props.valueKzt : null,
  netKg: props.netKg && props.netKg > 0 ? props.netKg : null,
  quantity: props.quantity && props.quantity > 0 ? props.quantity : null,
  unitCode: props.unitCode || null,
}))

const data = shallowRef<SurStatsDto | null>(null)
const failed = ref(false)
/** 403: статистика этой роли недоступна — блок не показываем (не «не удалось загрузить» на каждом коде). */
const forbidden = ref(false)
let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

const load = async (q: SurStatsQuery) => {
  const my = ++seq
  failed.value = false
  try {
    const { data: res } = await surApi.stats(q)
    if (my === seq) data.value = res
  } catch (e) {
    if (my !== seq) return
    data.value = null
    if ((e as { response?: { status?: number } })?.response?.status === 403) forbidden.value = true
    else failed.value = true
  }
}

watch(() => JSON.stringify(query.value), (_k, prev) => {
  if (timer) clearTimeout(timer)
  if (!valid.value) { seq += 1; data.value = null; failed.value = false; return }
  // Роль без доступа не меняется от смены кода — повторно не спрашиваем.
  if (forbidden.value) return
  // Другой код — прежняя статистика не про него: сразу убираем.
  if (data.value && data.value.code !== code.value) data.value = null
  const q = query.value
  if (prev === undefined || props.debounceMs <= 0) void load(q)
  else timer = setTimeout(() => { void load(q) }, props.debounceMs)
}, { immediate: true })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

const shares = (s: SurCorridorStatsDto) => {
  const parts = [
    ts('corridor.green', { pct: s.greenPct ?? 0 }),
    ts('corridor.yellow', { pct: s.yellowPct ?? 0 }),
    ts('corridor.red', { pct: s.redPct ?? 0 }),
  ]
  if (s.bluePct) parts.push(ts('corridor.blue', { pct: s.bluePct }))
  return parts.join(', ')
}
// «N с известным коридором из M»: известный — из КЕДЕН или отмеченный сотрудником. N ≥ 10, но данных всё равно нет —
// клиенту мало других импортёров в выборке (сервер скрывает доли): «мало данных» без чисел.
const codeLine = computed(() => {
  const d = data.value
  if (!d) return ''
  const s = d.byCode
  if (s.enough) return ts('byCode', { n: s.n ?? 0, total: s.total ?? 0, months: d.months, shares: shares(s) })
  // Клиенту при «мало данных» сервер числа не отдаёт (n = null) — без чисел.
  return s.n == null || s.n >= d.minN ? ts('fewImporters') : ts('fewData', { n: s.n, total: s.total ?? 0, months: d.months, min: d.minN })
})
const postLine = computed(() => {
  const p = data.value?.byPost
  return p?.enough ? ts('byPost', { post: p.postCode, n: p.n ?? 0, total: p.total ?? 0, shares: shares(p) }) : ''
})
const price = computed(() => (data.value?.price?.low ? data.value.price : null))
const unitText = computed(() => (price.value?.basis === 'unit' ? ts('unitDei') : ts('unitKg')))
const money = (n: number) => formatMoneyIn(locale.value, n)
</script>

<template>
  <div v-if="valid && !forbidden" class="flex flex-col gap-1.5 rounded-panel border border-line bg-canvas p-4 text-[13px]" data-sur-hint>
    <p class="m-0 text-sm font-semibold text-ink">{{ ts('title') }}</p>
    <p v-if="failed" class="m-0 text-ink-3" data-sur-failed>{{ ts('failed') }}</p>
    <p v-else-if="!data" class="m-0 text-muted" data-sur-loading>{{ ts('loading') }}</p>
    <template v-else>
      <p class="m-0 text-ink-2" :data-sur-code="data.byCode.enough ? 'enough' : 'few'">{{ codeLine }}</p>
      <p v-if="postLine" class="m-0 text-ink-2" data-sur-post>{{ postLine }}</p>
      <p v-if="price" class="m-0 flex gap-2 rounded-field bg-gold-soft px-2.5 py-1.5 text-gold-ink" role="alert" data-sur-low-price>
        <PhWarning :size="16" class="mt-0.5 flex-none" aria-hidden="true" />
        <span class="min-w-0">
          {{ ts('lowPrice', { unit: unitText }) }}
          <template v-if="price.p25Kzt != null && price.valuePerUnitKzt != null">
            {{ ts('lowPriceStaff', { p25: money(price.p25Kzt), own: money(price.valuePerUnitKzt), unit: unitText }) }}
          </template>
        </span>
      </p>
    </template>
    <p class="m-0 text-muted" data-sur-disclaimer>{{ ts('disclaimer') }}</p>
  </div>
</template>
