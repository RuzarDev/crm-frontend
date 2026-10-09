<script setup lang="ts">
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZKbd from '@/components/z/ZKbd.vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import { NAV_ICONS } from '@/components/shell/navIcons'
import { resolveActive, sectionHref, type NavModel, type NavSection } from '@/shell/navModel'
import { cn } from '@/ui/cn'

// Боковое меню оболочки (брокер и клиент). Активный раздел решает resolveActive по пути, а не RouterLink:
// у RouterLink своё aria-current по точному совпадению — действие «Оформить поставку» в мастере подсвечивалось бы,
// а раздел на вложенной странице — нет. Поэтому RouterLink в режиме custom, <a> рисуем сами.
const props = withDefaults(defineProps<{
  model: NavModel
  path: string
  attention: number | null
  /** Кнопка поиска (⌘K) — только если родитель открывает поиск. */
  searchable?: boolean
  /** Клиентская оболочка: пункты 38px и крупнее текст. */
  comfortable?: boolean
  /** Логотип сверху. В ящике меню его нет — логотип стоит в шапке ящика рядом с крестиком. */
  showLogo?: boolean
  /** Узкое меню из иконок (страница ДТ, как на доске): подписи — для чтения с экрана и в подсказке. */
  compact?: boolean
}>(), { searchable: true, comfortable: false, showLogo: true, compact: false })

const emit = defineEmits<{ search: []; navigate: [] }>()
const { t } = useI18n()

const uid = useId()
const activeKey = computed(() => resolveActive(props.model, props.path)?.section.key ?? null)
const isActive = (s: NavSection) => !s.action && s.key === activeKey.value
const attentionCount = computed(() => (props.attention && props.attention > 0 ? props.attention : 0))

// Подпись клавиш: на Mac — ⌘K, иначе Ctrl K. aria-keyshortcuts — для чтения с экрана (саму подпись прячем).
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const kbdLabel = isMac ? '⌘K' : 'Ctrl K'
const kbdAria = isMac ? 'Meta+K' : 'Control+K'

// navigate() роутера сам пропускает клики с модификаторами и средней кнопкой (новая вкладка):
// preventDefault значит, что переход идёт здесь, — только тогда закрываем ящик.
const onItemClick = (e: MouseEvent, navigate: (e?: MouseEvent) => unknown) => {
  navigate(e)
  if (e.defaultPrevented) emit('navigate')
}

const itemClass = (s: NavSection) => cn(
  'flex items-center gap-2.5 rounded-field no-underline outline-hidden focus-visible:shadow-focus',
  'transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none',
  props.compact
    ? 'relative size-10 justify-center'
    : props.comfortable ? 'h-[38px] px-3 text-sm' : 'h-[34px] px-2.5 text-[13.5px]',
  isActive(s)
    ? 'bg-surface font-semibold text-ink shadow-raised hover:text-ink'
    : 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
)
// Группы и нижний блок рисуются одним циклом; нижний прижат к низу (mt-auto) и отделён линией.
const blocks = computed(() => [
  ...props.model.groups.map((g) => ({ key: g.key, labelKey: g.labelKey, sections: g.sections, bottom: false })),
  ...(props.model.bottom.length ? [{ key: 'bottom', labelKey: null, sections: props.model.bottom, bottom: true }] : []),
])
const listClass = computed(() => cn('m-0 flex list-none flex-col p-0', props.comfortable ? 'gap-[3px]' : 'gap-0.5'))
const iconSize = computed(() => (props.compact ? 18 : props.comfortable ? 17 : 16))
</script>

<template>
  <nav
    :aria-label="t('shell.sectionNav')"
    :class="cn('flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto p-3 [scrollbar-width:thin]', compact && 'items-center px-3 py-4')"
    :data-compact="compact ? '' : undefined"
  >
    <div v-if="showLogo" data-shell-logo :class="cn('pt-1', compact ? 'pb-3.5' : comfortable ? 'px-3 pb-4' : 'px-2.5 pb-3.5')">
      <ZirconLogo size="sm" :mark-only="compact" />
    </div>

    <button
      v-if="searchable && compact"
      type="button"
      :aria-label="t('shell.search.open')"
      :title="t('shell.search.open')"
      :aria-keyshortcuts="kbdAria"
      class="mb-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 ease-out hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none"
      @click="emit('search')"
    >
      <PhMagnifyingGlass :size="18" aria-hidden="true" />
    </button>
    <button
      v-else-if="searchable"
      type="button"
      :aria-keyshortcuts="kbdAria"
      class="mx-0.5 mb-2.5 flex h-[34px] shrink-0 cursor-pointer items-center justify-between rounded-field border border-line-strong bg-surface px-2.5 font-sans text-[13px] text-muted outline-hidden transition-[border-color,color] duration-150 ease-out hover:border-faint hover:text-ink-2 focus-visible:shadow-focus motion-reduce:transition-none"
      @click="emit('search')"
    >
      <span class="flex items-center gap-2">
        <PhMagnifyingGlass :size="15" aria-hidden="true" />
        {{ t('shell.search.open') }}
      </span>
      <ZKbd aria-hidden="true">{{ kbdLabel }}</ZKbd>
    </button>

    <div
      v-for="b in blocks"
      :key="b.key"
      :class="cn('flex flex-col gap-0.5', b.bottom && 'mt-auto border-t border-line pt-4', compact && b.bottom && 'pt-3')"
    >
      <div
        v-if="b.labelKey"
        :id="`${uid}-${b.key}`"
        :class="cn('pb-1 text-muted', compact ? 'sr-only' : comfortable ? 'px-3 pt-4 text-[12.5px] leading-4' : 'px-2.5 pt-3.5 text-xs')"
      >
        {{ t(b.labelKey) }}
      </div>
      <ul :class="listClass" :aria-labelledby="b.labelKey ? `${uid}-${b.key}` : undefined">
        <li v-for="s in b.sections" :key="s.key">
          <RouterLink v-slot="{ href, navigate }" :to="sectionHref(s)" custom>
            <a
              :href="href"
              :aria-current="isActive(s) ? 'page' : undefined"
              :class="itemClass(s)"
              :title="compact ? t(s.labelKey) : undefined"
              @click="onItemClick($event, navigate)"
            >
              <component
                :is="NAV_ICONS[s.icon]"
                :size="iconSize"
                aria-hidden="true"
                :class="cn('shrink-0', isActive(s) && 'text-zircon-ink')"
              />
              <span :class="compact ? 'sr-only' : 'min-w-0 truncate'">{{ t(s.labelKey) }}</span>
              <span
                v-if="s.badge === 'attention' && attentionCount && compact"
                class="absolute top-1.5 right-1.5 size-2 rounded-pill bg-gold"
              ><span class="sr-only">{{ t('shell.attentionSr', { n: attentionCount }) }}</span></span>
              <span
                v-else-if="s.badge === 'attention' && attentionCount"
                class="ml-auto shrink-0 rounded-pill bg-gold px-[7px] text-[11.5px] leading-[18px] font-bold tabular-nums text-navy"
              ><span aria-hidden="true">{{ attentionCount }}</span><span class="sr-only">{{ t('shell.attentionSr', { n: attentionCount }) }}</span></span>
              <span v-else-if="s.dot" :class="cn('size-2 shrink-0 rounded-pill bg-gold', compact ? 'absolute top-1.5 right-1.5' : 'ml-auto')">
                <span class="sr-only">{{ t('shell.dotSr') }}</span>
              </span>
            </a>
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
