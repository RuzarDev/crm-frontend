<script setup lang="ts">
import { computed, useId, watchEffect } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhPlus } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import HomePanel from '@/views/home/HomePanel.vue'
import { dashboardApi } from '@/api/dashboard'
import { manageApi } from '@/api/manage'
import { billingApi } from '@/api/billing'
import { import40Api } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeAttention } from '@/shell/attention'
import { allSections, buildBrokerNav, navAccessFromStore, sectionHref } from '@/shell/navModel'
import { NAV_ICONS } from '@/components/shell/navIcons'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'
import {
  buildAttention, monthCaption, moneyForMonth, shortWhen, stageRows, stepTone, taskRows, type AttentionTone,
} from '@/views/home/brokerHome'
import { greetingKey, greetingName } from '@/views/home/greeting'
import { useBlock } from '@/views/home/useBlock'

// Главная сотрудника (макет Main.dc): приветствие, «Требует внимания», мои задачи и сводки справа.
// Какие блоки видны — по правам, как у прежних экранов; каждый грузится сам по себе.
const { t, te, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const profileStore = useProfileStore()

const imp = auth.canUseImport40 && !auth.isFinanceOnly
const mgr = auth.hasPermission('import40.assign') && !auth.isFinanceOnly
const fin = auth.hasPermission('finance.read')
const tr = !auth.isFinanceOnly && auth.hasPermission('reestr.read')
const anyBlock = imp || mgr || fin || tr

const dash = useBlock(imp, async () => (await dashboardApi.import40()).data)
const tasks = useBlock(imp, () => import40Api.myTasks())
const manage = useBlock(mgr, () => manageApi.overview())
const invoices = useBlock(fin, () => billingApi.list({ kind: 'invoice' }))
const transit = useBlock(tr, async () => (await dashboardApi.get()).data)
for (const b of [dash, tasks, manage, invoices, transit]) void b.load()

const now = new Date()
const ids = { att: useId(), tasks: useId(), go: useId() }

// ---- Шапка ----
const part = greetingKey(now.getHours())
// Профиль грузит оболочка — имя может прийти позже, computed подхватит.
const name = computed(() => greetingName(profileStore.profile?.displayName))
const greeting = computed(() =>
  name.value ? t(`home.greeting.${part}`, { name: name.value }) : t(`home.greeting.${part}NoName`))
const summary = computed(() => (dash.data ? t('home.summary', { active: dash.data.activeCases }) : ''))
const newRequest = () => router.push('/import-40?new=1')

// ---- Требует внимания ----
const attention = computed(() =>
  buildAttention({ import40: dash.data, manage: manage.data, invoices: invoices.data, now }))
// Пока грузятся блоки, из которых собираются карточки, место под них занято скелетоном — панели ниже не прыгают.
const attentionLoading = computed(() => dash.loading || manage.loading || invoices.loading)
// Бейдж у «Главной» в меню — когда отработали все блоки, из которых собираются карточки.
watchEffect(() => {
  if (!attentionLoading.value) homeAttention.value = attention.value.length
})

const TONE: Record<AttentionTone, { card: string; mark: string }> = {
  gold: { card: 'bg-gold-soft border-gold-line hover:border-gold', mark: 'bg-gold text-navy' },
  danger: { card: 'bg-tone-danger-bg border-[#F6D2D4] hover:border-[#EBB3B7]', mark: 'bg-danger text-white' },
  neutral: { card: 'bg-canvas border-line hover:border-line-strong', mark: 'bg-tone-pay-bg text-tone-pay-fg' },
}
const attText = (key: string, amount?: number) =>
  key === 'overdue' ? t('home.att.overdue.text', { sum: formatMoney(amount ?? 0) }) : t(`home.att.${key}.text`)

// ---- Мои задачи ----
const activeTasks = computed(() => (tasks.data ?? []).filter((c) => c.status < 8).length)
const rows = computed(() => taskRows(tasks.data ?? []))
const yesterday = computed(() => t('home.yesterday'))
const ATT_SKELETON = ['52%', '64%']
const TASK_SKELETON = [['38%', '62%'], ['46%', '54%'], ['32%', '68%'], ['42%', '50%'], ['36%', '58%']]

// ---- Правая колонка ----
const stages = computed(() => stageRows(dash.data?.bySteps ?? []))
const stagesFilled = computed(() => stages.value.filter((s) => s.count > 0))
const money = computed(() => moneyForMonth(invoices.data ?? [], now))
const month = computed(() => monthCaption(now, locale.value))
const transitStatuses = computed(() => (transit.data?.byStatus ?? []).filter((s) => s.count > 0))
const statusLabel = (s: string) => (te(`enum.reestrStatus.${s}`) ? t(`enum.reestrStatus.${s}`) : s)

// ---- Нет ни одного блока: ссылки на доступные разделы ----
const goSections = computed(() =>
  anyBlock ? [] : allSections(buildBrokerNav(navAccessFromStore(auth, false))).filter((s) => s.key !== 'home' && !s.action))

const link = 'shrink-0 rounded-[4px] text-[13px] font-medium text-zircon-ink no-underline outline-hidden transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-xl font-semibold tracking-[-0.015em] text-ink">{{ greeting }}</h1>
        <p v-if="imp" class="m-0 mt-1 min-h-5 text-sm text-ink-3">{{ summary }}</p>
      </div>
      <ZButton v-if="imp" variant="primary" class="ml-auto" @click="newRequest">
        <template #icon><PhPlus :size="15" aria-hidden="true" /></template>
        {{ t('home.newRequest') }}
      </ZButton>
    </div>

    <section
      v-if="attentionLoading || attention.length"
      :aria-labelledby="ids.att"
      :aria-busy="attentionLoading || undefined"
      class="flex flex-col gap-2.5"
    >
      <h2 :id="ids.att" class="m-0 text-[13px] font-semibold text-ink-2">{{ t('home.att.heading') }}</h2>
      <div v-if="attentionLoading" data-home-skeleton class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <div v-for="w in ATT_SKELETON" :key="w" class="flex items-start gap-3 rounded-[12px] border border-line bg-canvas px-4 py-3.5">
          <ZSkeleton width="30px" height="30px" class="shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <ZSkeleton :width="w" height="12px" />
            <ZSkeleton width="78%" height="10px" />
          </div>
        </div>
      </div>
      <div v-else class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <RouterLink
          v-for="c in attention"
          :key="c.key"
          :to="c.to"
          data-home-attention
          :class="cn(
            'flex items-start gap-3 rounded-[12px] border px-4 py-3.5 text-ink no-underline outline-hidden',
            'transition-[border-color] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
            TONE[c.tone].card,
          )"
        >
          <span
            :class="cn(
              'flex h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-[9px] px-1 text-[13px] font-bold tabular-nums',
              TONE[c.tone].mark,
            )"
          >{{ c.count }}</span>
          <span class="min-w-0">
            <span class="block text-base font-semibold">{{ t(`home.att.${c.key}.title`) }}</span>
            <span class="mt-0.5 block text-[13px] text-ink-3">{{ attText(c.key, c.amount) }}</span>
          </span>
        </RouterLink>
      </div>
    </section>

    <div v-if="anyBlock" class="flex flex-wrap items-start gap-5">
      <section
        v-if="imp"
        :aria-labelledby="ids.tasks"
        :aria-busy="tasks.loading || undefined"
        class="min-w-0 flex-[999_1_520px] rounded-panel border border-line bg-surface"
      >
        <div class="flex items-center gap-3 border-b border-line px-4.5 py-3.5">
          <h2 :id="ids.tasks" class="m-0 text-base font-semibold text-ink">{{ t('home.tasks.title') }}</h2>
          <span
            v-if="tasks.data"
            class="rounded-pill bg-sunken px-2 py-px text-xs font-semibold tabular-nums text-tone-neutral-fg"
          ><span aria-hidden="true">{{ activeTasks }}</span><span class="sr-only">{{ t('home.tasks.countSr', { n: activeTasks }) }}</span></span>
          <RouterLink to="/import-40?tab=my" :class="cn(link, 'ml-auto')">{{ t('home.tasks.all') }}</RouterLink>
        </div>

        <div class="p-1.5">
          <ul v-if="tasks.loading" data-home-skeleton class="m-0 list-none p-0">
            <li v-for="(w, i) in TASK_SKELETON" :key="i" class="flex items-center gap-3 px-3 py-2.5">
              <ZSkeleton width="30px" height="30px" class="shrink-0" />
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <ZSkeleton :width="w[0]" height="12px" />
                <ZSkeleton :width="w[1]" height="10px" />
              </div>
              <ZSkeleton width="88px" height="20px" class="shrink-0 max-sm:hidden" />
              <ZSkeleton width="40px" height="10px" class="w-16 shrink-0 items-end" />
            </li>
          </ul>
          <div v-else-if="tasks.error" class="flex items-center gap-3 px-3 py-2.5">
            <p class="m-0 min-w-0 flex-1 text-sm text-ink-3">{{ t('home.blockError') }}</p>
            <ZButton size="sm" @click="tasks.load()">{{ t('home.retry') }}</ZButton>
          </div>
          <ZEmpty v-else-if="!rows.length" :title="t('home.tasks.empty')">
            <template #action>
              <RouterLink to="/import-40" :class="link">{{ t('home.tasks.emptyAction') }}</RouterLink>
            </template>
          </ZEmpty>
          <ul v-else class="m-0 list-none p-0">
            <li v-for="r in rows" :key="r.id">
              <RouterLink
                :to="`/import-40/${r.id}`"
                data-home-task
                class="flex items-center gap-3 rounded-row px-3 py-2.5 text-ink no-underline outline-hidden transition-colors duration-150 ease-out hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none max-sm:flex-wrap max-sm:gap-y-1.5"
              >
                <ZAvatar :name="r.clientName" />
                <span class="min-w-0 flex-1 max-sm:basis-[calc(100%-42px)]">
                  <span class="block truncate text-base font-semibold">{{ r.clientName }}</span>
                  <span class="block truncate text-[13px] text-ink-3">
                    <span class="font-mono">{{ r.number }}</span><template v-if="r.cargo"> · {{ r.cargo }}</template>
                  </span>
                </span>
                <ZTag :tone="stepTone(r.step)" size="sm" class="shrink-0 max-sm:ml-[42px]">{{ t('enum.step.s' + r.step) }}</ZTag>
                <time
                  :datetime="r.updatedAtUtc"
                  class="w-16 shrink-0 text-right text-[12.5px] text-muted tabular-nums max-sm:ml-auto"
                >{{ shortWhen(r.updatedAtUtc, now, yesterday) }}</time>
              </RouterLink>
            </li>
          </ul>
        </div>
      </section>

      <div
        :class="cn(
          'min-w-0 gap-5',
          imp ? 'flex flex-[1_1_300px] flex-col' : 'grid w-full items-start [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
        )"
      >
        <HomePanel
          v-if="imp"
          :title="t('home.stages.title')"
          :loading="dash.loading"
          :error="dash.error"
          @retry="dash.load()"
        >
          <div aria-hidden="true" class="flex h-2 gap-0.5 overflow-hidden rounded-pill">
            <span v-for="s in stagesFilled" :key="s.step" :style="{ flex: s.count, background: s.color }" />
            <span v-if="!stagesFilled.length" class="flex-1 bg-sunken" />
          </div>
          <dl class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <template v-for="s in stages" :key="s.step">
              <dt class="flex min-w-0 items-center gap-2 text-ink-2">
                <span aria-hidden="true" class="size-2 shrink-0 rounded-pill" :style="{ background: s.color }" />
                <span class="truncate">{{ t('enum.step.s' + s.step) }}</span>
              </dt>
              <dd class="m-0 text-right font-semibold tabular-nums">{{ s.count }}</dd>
            </template>
          </dl>
        </HomePanel>

        <HomePanel
          v-if="mgr"
          :title="t('home.manage.title')"
          link-to="/import-40/manage"
          :link-label="t('home.manage.open')"
          :loading="manage.loading"
          :error="manage.error"
          @retry="manage.load()"
        >
          <dl v-if="manage.data" class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt class="text-ink-2">{{ t('home.manage.unassigned') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.unassigned }}</dd>
            <dt class="text-ink-2">{{ t('home.manage.problems') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.problems }}</dd>
            <dt class="text-ink-2">{{ t('home.manage.stale') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.stale }}</dd>
            <dt class="text-ink-2">{{ t('home.manage.clientDrafts') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.clientDrafts }}</dd>
          </dl>
        </HomePanel>

        <HomePanel
          v-if="fin"
          :title="t('home.money.title')"
          :caption="month"
          link-to="/billing"
          :link-label="t('home.money.open')"
          :loading="invoices.loading"
          :error="invoices.error"
          @retry="invoices.load()"
        >
          <dl class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt class="text-ink-2">{{ t('home.money.issued') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ formatMoney(money.issued) }}</dd>
            <dt class="text-ink-2">{{ t('home.money.paid') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums text-tone-done-fg">{{ formatMoney(money.paid) }}</dd>
            <dt class="text-ink-2">{{ t('home.money.awaiting') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums text-gold-ink">{{ formatMoney(money.awaiting) }}</dd>
          </dl>
        </HomePanel>

        <HomePanel
          v-if="tr"
          :title="t('home.transit.title')"
          link-to="/reestr"
          :link-label="t('home.transit.open')"
          :loading="transit.loading"
          :error="transit.error"
          @retry="transit.load()"
        >
          <dl v-if="transit.data" class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt class="text-ink-2">{{ t('home.transit.month') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ transit.data.entriesThisMonth }}</dd>
            <dt class="text-ink-2">{{ t('home.transit.total') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ transit.data.totalEntries }}</dd>
            <template v-for="s in transitStatuses" :key="s.status">
              <dt class="text-ink-2">{{ statusLabel(s.status) }}</dt>
              <dd class="m-0 text-right font-semibold tabular-nums">{{ s.count }}</dd>
            </template>
          </dl>
        </HomePanel>
      </div>
    </div>

    <section v-else :aria-labelledby="ids.go" class="flex flex-col gap-2.5">
      <h2 :id="ids.go" class="m-0 text-[13px] font-semibold text-ink-2">{{ t('home.goTo') }}</h2>
      <ul class="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        <li v-for="s in goSections" :key="s.key">
          <RouterLink
            :to="sectionHref(s)"
            class="group flex items-center gap-3 rounded-row border border-line bg-surface px-3.5 py-3 text-ink no-underline outline-hidden transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <span class="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-sunken text-ink-2">
              <component :is="NAV_ICONS[s.icon]" :size="16" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1 truncate text-base font-semibold">{{ t(s.labelKey) }}</span>
            <PhArrowRight :size="14" aria-hidden="true" class="shrink-0 text-faint transition-colors duration-150 group-hover:text-ink-2" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
