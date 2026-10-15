<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhClipboardText, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import {
  GTIN_MAX_LENGTH, NTIN_MAX_LENGTH, appendCodes, gtinLineProblems, ntinProblem, parseCodes, type CodeProblem,
} from './tradeCodes'
import type { GoodsSectionProps } from './types'

// Гр. 33.3 «Маркировка» (как в КЕДЕН и D-Sector): таблица NTIN (№ / код; добавить, удалить, вставить списком — замена
// «Импорт из Excel» D-Sector) и поле GTIN (многострочное: GTIN или другой идентификационный код / артикул). Формат —
// подсказка под полем (13 цифр «02…» / 8–14 цифр, контрольная цифра GS1), сохранение не блокирует. В XML R.055 места
// нет — в КЕДЕН переносятся вручную. Не поля платежей: правка — прямо в item (как строки маркировки), без «Пересчитать».
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.tradeCodes.${key}`, p ?? {})
const problemText = (p: CodeProblem) => tc(`problems.${p.kind}`, 'n' in p ? { n: p.n } : {})

const PAGE = 50
const limit = ref(PAGE)
const ntins = computed(() => props.item.ntins ?? [])
const shown = computed(() => ntins.value.slice(0, Math.max(limit.value, 0)))
const hidden = computed(() => Math.max(0, ntins.value.length - shown.value.length))
const badCount = computed(() => ntins.value.filter((c) => ntinProblem(c)).length)

const list = (): string[] => {
  const g = props.item
  g.ntins ??= []
  return g.ntins
}
const root = ref<HTMLElement>()
const focusRow = async (i: number) => {
  if (i >= limit.value) limit.value = i + 1
  await nextTick()
  root.value?.querySelector<HTMLInputElement>(`input[data-f="ntin-${i}"]`)?.focus()
}
const setAt = (i: number, v: string) => { list()[i] = v.replace(/\s+/g, '') }
const add = () => {
  const arr = list()
  arr.push('')
  void focusRow(arr.length - 1)
}
const remove = (i: number) => {
  const arr = list()
  arr.splice(i, 1)
  if (arr.length) void focusRow(Math.min(i, arr.length - 1))
}
// Enter — к следующей строке; в последней заполненной — новая строка (быстрый ввод сканером штрихкодов).
const onEnter = (i: number) => {
  const arr = list()
  if (i < arr.length - 1) void focusRow(i + 1)
  else if (arr[i]?.trim()) add()
}
// Вставка нескольких кодов в строку — раскладываются по строкам (первый — в эту строку, если она пуста).
const onPaste = (i: number, e: ClipboardEvent) => {
  const codes = parseCodes(e.clipboardData?.getData('text') ?? '')
  if (codes.length < 2) return
  e.preventDefault()
  const arr = list()
  if (!arr[i]?.trim()) arr[i] = ''
  report(appendCodes(arr, codes))
}
const report = ({ added, duplicates }: { added: number; duplicates: number }) => {
  if (added) message.success(tc('pasteDone', { n: added }))
  if (duplicates) message.info(tc('pasteDuplicates', { n: duplicates }))
  if (!added && !duplicates) message.warning(tc('pasteEmpty'))
}

// «Вставить списком»: текст из Excel/письма — по одному коду в строке или через запятую/пробел.
const pasting = ref(false)
const pasteText = ref('')
const openPaste = async () => {
  pasting.value = true
  await nextTick()
  root.value?.querySelector<HTMLTextAreaElement>('textarea[data-f="ntin-paste"]')?.focus()
}
const applyPaste = () => {
  const res = appendCodes(list(), parseCodes(pasteText.value))
  report(res)
  if (res.added || res.duplicates) {
    pasteText.value = ''
    pasting.value = false
  }
}
const cancelPaste = () => { pasteText.value = ''; pasting.value = false }

// GTIN — многострочный текст: подсказка по строкам из одних цифр (артикул с буквами не проверяется).
const gtinProblems = computed(() => gtinLineProblems(props.item.gtin))
const gtinHelp = computed(() => gtinProblems.value.map((x) => `${x.line} — ${problemText(x.problem)}`).join('; '))
const onGtin = (v: string) => { props.item.gtin = v.trim() ? v : null }

const removeBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11',
)
</script>

<template>
  <section ref="root" class="flex flex-col gap-3" data-goods-trade-codes :aria-label="tc('title')">
    <div class="flex flex-col gap-1">
      <h3 class="m-0 text-[13px] font-semibold text-ink">{{ tc('title') }}</h3>
      <p class="m-0 text-xs text-muted">{{ tc('hint') }}</p>
    </div>

    <div class="grid grid-cols-1 gap-x-6 gap-y-4 @3xl:grid-cols-2">
      <!-- NTIN: таблица № / код -->
      <div class="flex min-w-0 flex-col gap-2" data-graph="33" data-goods-field="ntins" :data-goods-index="index">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span :id="`ntin-label-${index}`" class="text-[13px] font-medium text-ink-2">{{ tc('ntin') }}</span>
          <span class="text-xs text-muted" data-ntin-count>
            {{ tc('ntinCount', { n: ntins.filter((c) => c.trim()).length }) }}<template v-if="badCount"> · <span class="text-gold-ink">{{ tc('ntinBad', { n: badCount }) }}</span></template>
          </span>
        </div>
        <p class="m-0 text-xs text-muted">{{ tc('ntinFormat') }}</p>

        <p v-if="!ntins.length" class="m-0 text-[13px] text-muted" data-ntin-empty>{{ tc('ntinEmpty') }}</p>
        <ol v-else class="m-0 flex list-none flex-col gap-1.5 p-0" :aria-labelledby="`ntin-label-${index}`">
          <li v-for="(code, i) in shown" :key="i" class="flex flex-col gap-0.5" :data-ntin-row="i">
            <div class="flex items-center gap-2">
              <span class="w-8 shrink-0 text-right font-mono text-xs text-muted" aria-hidden="true">{{ i + 1 }}</span>
              <ZInput
                :value="code"
                mono
                inputmode="numeric"
                autocomplete="off"
                :maxlength="NTIN_MAX_LENGTH"
                :disabled="readonly"
                placeholder="02…"
                :aria-label="tc('ntinRow', { n: i + 1 })"
                :aria-describedby="ntinProblem(code) ? `ntin-${index}-${i}-problem` : undefined"
                class="min-w-0 flex-1 max-sm:h-11"
                :data-f="`ntin-${i}`"
                @update:value="setAt(i, $event)"
                @press-enter="onEnter(i)"
                @paste="onPaste(i, $event)"
              />
              <button v-if="!readonly" type="button" :class="removeBtn" :aria-label="tc('removeRow', { n: i + 1 })" :title="tc('remove')" :data-ntin-remove="i" @click="remove(i)">
                <PhX :size="16" aria-hidden="true" />
              </button>
            </div>
            <span v-if="ntinProblem(code)" :id="`ntin-${index}-${i}-problem`" class="pl-10 text-xs text-gold-ink" :data-ntin-problem="i">
              {{ problemText(ntinProblem(code)!) }}
            </span>
          </li>
        </ol>
        <div v-if="hidden" class="flex items-center gap-3 text-[13px] text-muted">
          {{ tc('hiddenRows', { n: hidden }) }}
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-ntin-more @click="limit += PAGE">{{ tc('showMore', { n: Math.min(PAGE, hidden) }) }}</ZButton>
        </div>

        <div v-if="!readonly && pasting" class="flex flex-col gap-2 rounded-row border border-line p-2" data-ntin-paste>
          <ZTextarea
            v-model:value="pasteText"
            :rows="4"
            :aria-label="tc('pasteLabel')"
            :placeholder="tc('pastePlaceholder')"
            class="font-mono"
            data-f="ntin-paste"
            @keydown.ctrl.enter.prevent="applyPaste"
            @keydown.meta.enter.prevent="applyPaste"
            @keydown.esc.prevent="cancelPaste"
          />
          <div class="flex flex-wrap items-center gap-2">
            <ZButton size="sm" class="max-sm:h-11" data-ntin-paste-apply @click="applyPaste">{{ tc('pasteApply') }}</ZButton>
            <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-ntin-paste-cancel @click="cancelPaste">{{ tc('pasteCancel') }}</ZButton>
            <span class="text-xs text-muted">{{ tc('pasteHint') }}</span>
          </div>
        </div>
        <div v-else-if="!readonly" class="flex flex-wrap items-center gap-2">
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-ntin-add @click="add">
            <PhPlus :size="14" aria-hidden="true" />{{ tc('add') }}
          </ZButton>
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-ntin-paste-open @click="openPaste">
            <PhClipboardText :size="14" aria-hidden="true" />{{ tc('paste') }}
          </ZButton>
        </div>
      </div>

      <!-- GTIN: многострочный текст -->
      <ZField
        graph="33"
        :label="tc('gtin')"
        :extra="tc('gtinFormat')"
        v-bind="gtinProblems.length ? { validateStatus: 'warning', help: gtinHelp } : {}"
        data-graph="33"
        :data-goods-index="index"
        data-goods-field="gtin"
      >
        <ZTextarea
          :value="item.gtin ?? ''"
          :rows="2"
          auto-grow
          :maxlength="GTIN_MAX_LENGTH"
          :disabled="readonly"
          :placeholder="tc('gtinPlaceholder')"
          class="font-mono"
          data-f="gtin"
          @update:value="onGtin"
        />
      </ZField>
    </div>
  </section>
</template>
