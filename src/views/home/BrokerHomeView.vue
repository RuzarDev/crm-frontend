<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhPlus, PhWarningCircle } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import HomePanel from '@/views/home/HomePanel.vue'
import ServiceHealthBanner from '@/views/home/ServiceHealthBanner.vue'
import ExpeditorHomePanel from '@/views/broker/expeditor/ExpeditorHomePanel.vue'
import { dashboardApi, type StaffHomeUrgent } from '@/api/dashboard'
import { manageApi } from '@/api/manage'
import { billingApi } from '@/api/billing'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeBadgeFromHome } from '@/shell/homeBadge'
import { allSections, buildBrokerNav, navAccessFromStore, sectionHref } from '@/shell/navModel'
import { NAV_ICONS } from '@/components/shell/navIcons'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'
import {
  URGENT_VISIBLE, buildAttention, monthCaption, moneyForMonth, ownerParts, shortWhen, stageHref, stageRows, taskNext,
  transitStatusHref, urgentHref, urgentWhen, type AttentionTone,
} from '@/views/home/brokerHome'
import { greetingKey, greetingName } from '@/views/home/greeting'
import { useBlock } from '@/views/home/useBlock'

// Главная сотрудника (пакет G, 02.11.2026, макет broker_home_redesign_v1): приветствие и «В работе N» с тем, чей ход;
// красный «Срочно»; «Требует внимания» (до 4 карточек); «Мои задачи» с «что дальше» и «Заявки по этапам» ссылками;
// «Распределение», «Деньги за месяц», транзит — как раньше. Заявочные блоки — одним запросом dashboard/home,
// каждый блок по-прежнему со своей загрузкой и ошибкой.
const { t, te, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const profileStore = useProfileStore()

const imp = auth.canUseImport40 && !auth.isFinanceOnly
const mgr = auth.hasPermission('import40.assign') && !auth.isFinanceOnly
const fin = auth.hasPermission('finance.read')
const tr = !auth.isFinanceOnly && auth.hasPermission('reestr.read')
// Экспедитор: кроме транзита — сводка Импорта 40 его клиентов (30.10.2026, аудит C-35), как пункт меню.
const isExpeditor = (auth.role || '').trim().toLowerCase() === 'expeditor'
const exp40 = !auth.isFinanceOnly && isExpeditor
const anyBlock = imp || mgr || fin || tr || exp40
// «Новая заявка» — только тем, кому список заявок откроет создание (декларант, руководитель, админ).
const canCreate = imp && auth.canCreateImport40

// dashboard/home — тем, кому из него что-то положено: заявки, счета («Срочно») или документы клиентов («Истекают
// документы»). Состав блоков по правам решает сервер. Экспедитору Главная — как раньше (без этого запроса).
const docs = !auth.isFinanceOnly && auth.hasPermission('clients.read')
const home = useBlock(!isExpeditor && (imp || fin || docs), () => dashboardApi.home())
const manage = useBlock(mgr, () => manageApi.overview())
const invoices = useBlock(fin, () => billingApi.list({ kind: 'invoice' }))
const transit = useBlock(tr, async () => (await dashboardApi.get()).data)
for (const b of [home, manage, invoices, transit]) void b.load()

const now = new Date()
const ids = { urgent: useId(), att: useId(), tasks: useId(), go: useId() }

// Значок «Главной» в меню — сразу из свежих данных (без ожидания опроса).
watch(() => home.data, (d) => {
  if (d) homeBadgeFromHome({ urgent: d.urgentTotal, awaitingMe: d.attention.awaitingMe ?? 0 })
})

// ---- Шапка ----
const part = greetingKey(now.getHours())
// Профиль грузит оболочка — имя может прийти позже, computed подхватит.
const name = computed(() => greetingName(profileStore.profile?.displayName))
const greeting = computed(() =>
  name.value ? t(`home.greeting.${part}`, { name: name.value }) : t(`home.greeting.${part}NoName`))
// «В работе заявок: 7 · у декларантов 5 · у КПП 1 · у клиентов 1» — разбивку сервер отдаёт только админу и РОП.
const summary = computed(() => {
  const d = home.data
  if (!d || d.activeCases == null) return ''
  return [t('home.summary', { active: d.activeCases }), ...ownerParts(d.owners).map((p) => t(`home.owners.${p.key}`, { n: p.n }))].join(' · ')
})
const newRequest = () => router.push('/import-40?new=1')

// ---- Срочно ----
const urgentOpen = ref(false)
const urgent = computed(() => home.data?.urgent ?? [])
const urgentShown = computed(() => (urgentOpen.value ? urgent.value : urgent.value.slice(0, URGENT_VISIBLE)))
const urgentMore = computed(() => Math.max(0, urgent.value.length - URGENT_VISIBLE))
const urgentTitle = (u: StaffHomeUrgent) =>
  u.kind === 'invoice' ? t('home.urgent.invoice', { number: u.invoiceNumber ?? '' }) : t(`home.urgent.${u.kind}`)
const urgentSub = (u: StaffHomeUrgent) =>
  u.kind === 'invoice' ? [u.clientName, formatMoney(u.amount ?? 0)].filter(Boolean).join(' · ') : u.clientName
const urgentWhenText = (u: StaffHomeUrgent) => {
  const w = urgentWhen(u)
  return t(`home.urgent.${w.key}`, w.params)
}

// ---- Требует внимания ----
const attention = computed(() => buildAttention({ home: home.data, transit: transit.data }))
// Пока грузятся блоки, из которых собираются карточки, место под них занято скелетоном — панели ниже не прыгают.
const attentionLoading = computed(() => home.loading || transit.loading)

const TONE: Record<AttentionTone, { card: string; mark: string }> = {
  gold: { card: 'bg-gold-soft border-gold-line hover:border-gold', mark: 'bg-gold text-navy' },
  danger: { card: 'bg-tone-danger-bg border-[#F6D2D4] hover:border-[#EBB3B7]', mark: 'bg-danger text-white' },
  neutral: { card: 'bg-canvas border-line hover:border-line-strong', mark: 'bg-tone-pay-bg text-tone-pay-fg' },
}

// ---- Мои задачи ----
const rows = computed(() => home.data?.tasks ?? [])
const tasksTotal = computed(() => home.data?.tasksTotal ?? 0)
const nextText = (r: (typeof rows.value)[number]) => {
  const n = taskNext(r)
  return t(n.key, n.params)
}
const yesterday = computed(() => t('home.yesterday'))
const ATT_SKELETON = ['52%', '64%']
const TASK_SKELETON = [['38%', '62%'], ['46%', '54%'], ['32%', '68%'], ['42%', '50%'], ['36%', '58%']]

// ---- Правая колонка ----
const stages = computed(() => stageRows(home.data?.bySteps ?? []))
const stagesFilled = computed(() => stages.value.filter((s) => s.count > 0))
const money = computed(() => moneyForMonth(invoices.data ?? [], now))
const month = computed(() => monthCaption(now, locale.value))
const transitStatuses = computed(() => (transit.data?.byStatus ?? []).filter((s) => s.count > 0))
const statusLabel = (s: string) => (te(`enum.reestrStatus.${s}`) ? t(`enum.reestrStatus.${s}`) : s)

// ---- Нет ни одного блока: ссылки на доступные разделы ----
const goSections = computed(() =>
  anyBlock ? [] : allSections(buildBrokerNav(navAccessFromStore(auth, false))).filter((s) => s.key !== 'home' && !s.action))

const link = 'shrink-0 rounded-[4px] text-[13px] font-medium text-zircon-ink no-underline outline-hidden transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
const rowLink = 'rounded-row no-underline outline-hidden transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none'
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-xl font-semibold tracking-[-0.015em] text-ink">{{ greeting }}</h1>
        <p v-if="imp" class="m-0 mt-1 min-h-5 text-sm text-ink-3" data-home-summary>{{ summary }}</p>
      </div>
      <ZButton v-if="canCreate" variant="primary" class="ml-auto" @click="newRequest">
        <template #icon><PhPlus :size="15" aria-hidden="true" /></template>
        {{ t('home.newRequest') }}
      </ZButton>
    </div>

    <!-- Сбой ключа ИИ или Zircon AI (09.11.2026) — администратору и РОП, только пока сбой длится. -->
    <ServiceHealthBanner />

    <!-- «Срочно» — только если есть что показать; строки по сроку, самое старое первым (сервер). -->
    <section
      v-if="urgent.length"
      :aria-labelledby="ids.urgent"
      data-home-urgent
      class="flex flex-col gap-1 rounded-panel border border-[#F6D2D4] bg-tone-danger-bg px-2 pt-3 pb-2"
    >
      <div class="flex items-center gap-2 px-2.5 pb-1">
        <PhWarningCircle :size="18" weight="fill" aria-hidden="true" class="shrink-0 text-danger" />
        <h2 :id="ids.urgent" class="m-0 text-base font-semibold text-tone-danger-fg">
          {{ t('home.urgent.title') }} — <span class="tabular-nums">{{ home.data?.urgentTotal ?? urgent.length }}</span>
        </h2>
      </div>
      <ul class="m-0 flex list-none flex-col p-0">
        <li v-for="(u, i) in urgentShown" :key="`${u.kind}-${u.caseId ?? ''}-${u.invoiceId ?? ''}-${i}`">
          <RouterLink
            :to="urgentHref(u)"
            data-home-urgent-row
            :class="cn(rowLink, 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2.5 py-2 text-ink hover:bg-surface/70')"
          >
            <span class="min-w-0 flex-1 basis-[220px]">
              <span class="text-sm font-semibold">{{ urgentTitle(u) }}</span>
              <span v-if="u.caseNumber" class="text-sm text-ink-2"> · <span class="font-mono">{{ u.caseNumber }}</span></span>
              <span class="block truncate text-[13px] text-ink-3">{{ urgentSub(u) }}</span>
            </span>
            <span
              :class="cn('shrink-0 text-[13px] font-semibold tabular-nums', u.past ? 'text-tone-danger-fg' : 'text-gold-ink')"
              data-home-urgent-when
            >{{ urgentWhenText(u) }}</span>
          </RouterLink>
        </li>
      </ul>
      <div v-if="urgentMore" class="px-2.5 pt-0.5">
        <button
          type="button"
          data-home-urgent-more
          :aria-expanded="urgentOpen"
          class="cursor-pointer rounded-[4px] border-0 bg-transparent p-0 font-sans text-[13px] font-medium text-tone-danger-fg outline-hidden hover:underline focus-visible:shadow-focus"
          @click="urgentOpen = !urgentOpen"
        >{{ urgentOpen ? t('home.urgent.less') : t('home.urgent.more', { n: urgentMore }) }}</button>
      </div>
    </section>

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
      <div v-else class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        <RouterLink
          v-for="c in attention"
          :key="c.key"
          :to="c.to"
          data-home-attention
          :data-key="c.key"
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
            <span class="mt-0.5 block text-[13px] text-ink-3">{{ t(`home.att.${c.key}.text`) }}</span>
          </span>
        </RouterLink>
      </div>
    </section>

    <div v-if="anyBlock" class="flex flex-wrap items-start gap-5">
      <section
        v-if="imp"
        :aria-labelledby="ids.tasks"
        :aria-busy="home.loading || undefined"
        class="min-w-0 flex-[999_1_520px] rounded-panel border border-line bg-surface"
      >
        <div class="flex items-center gap-3 border-b border-line px-4.5 py-3.5">
          <h2 :id="ids.tasks" class="m-0 text-base font-semibold text-ink">{{ t('home.tasks.title') }}</h2>
          <span
            v-if="home.data"
            data-home-tasks-count
            class="rounded-pill bg-sunken px-2 py-px text-xs font-semibold tabular-nums text-tone-neutral-fg"
          ><span aria-hidden="true">{{ tasksTotal }}</span><span class="sr-only">{{ t('home.tasks.countSr', { n: tasksTotal }) }}</span></span>
        </div>

        <div class="p-1.5">
          <ul v-if="home.loading" data-home-skeleton class="m-0 list-none p-0">
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
          <div v-else-if="home.error" class="flex items-center gap-3 px-3 py-2.5">
            <p class="m-0 min-w-0 flex-1 text-sm text-ink-3">{{ t('home.blockError') }}</p>
            <ZButton size="sm" @click="home.load()">{{ t('home.retry') }}</ZButton>
          </div>
          <ZEmpty v-else-if="!rows.length" :title="t('home.tasks.empty')">
            <template #action>
              <!-- S-19 (30.10.2026): «Открыть все заявки» — вкладка «В работе», а не снова пустые «Мои». -->
              <RouterLink to="/import-40?tab=active" :class="link" data-home-tasks-empty-action>{{ t('home.tasks.emptyAction') }}</RouterLink>
            </template>
          </ZEmpty>
          <template v-else>
            <ul class="m-0 list-none p-0">
              <li v-for="r in rows" :key="r.id">
                <RouterLink
                  :to="`/import-40/${r.id}`"
                  data-home-task
                  :class="cn(rowLink, 'flex items-center gap-3 px-3 py-2.5 text-ink hover:bg-canvas')"
                >
                  <ZAvatar :name="r.clientName" class="max-sm:hidden" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-base font-semibold">
                      <span class="font-mono">{{ r.number }}</span> · {{ r.clientName }}
                    </span>
                    <span
                      data-home-task-next
                      :class="cn('line-clamp-2 block text-[13px]', r.next === 'customsRequest' || r.isProblem ? 'text-tone-danger-fg' : 'text-ink-3')"
                    >{{ nextText(r) }}</span>
                  </span>
                  <time
                    :datetime="r.updatedAtUtc"
                    class="w-14 shrink-0 self-start pt-0.5 text-right text-[12.5px] text-muted tabular-nums"
                  >{{ shortWhen(r.updatedAtUtc, now, yesterday) }}</time>
                </RouterLink>
              </li>
            </ul>
            <div v-if="tasksTotal > rows.length" class="flex justify-end px-3 pt-1 pb-1.5">
              <RouterLink to="/import-40?tab=my" :class="cn(link, 'inline-flex items-center gap-1')" data-home-tasks-all>
                <span aria-hidden="true">{{ t('home.tasks.all', { n: tasksTotal }) }}</span>
                <span class="sr-only">{{ t('home.tasks.allSr', { n: tasksTotal }) }}</span>
                <PhArrowRight :size="13" aria-hidden="true" />
              </RouterLink>
            </div>
          </template>
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
          :loading="home.loading"
          :error="home.error"
          @retry="home.load()"
        >
          <div aria-hidden="true" class="flex h-2 gap-0.5 overflow-hidden rounded-pill">
            <span v-for="s in stagesFilled" :key="s.step" :style="{ flex: s.count, background: s.color }" />
            <span v-if="!stagesFilled.length" class="flex-1 bg-sunken" />
          </div>
          <!-- Пакет G: ненулевая строка — ссылка в список заявок с фильтром шага. -->
          <ul class="-mx-2 my-0 flex list-none flex-col p-0 text-sm">
            <li v-for="s in stages" :key="s.step">
              <component
                :is="s.count > 0 ? RouterLink : 'div'"
                :to="s.count > 0 ? stageHref(s.step) : undefined"
                :data-home-stage="s.step"
                :aria-label="s.count > 0 ? t('home.stages.rowSr', { stage: t('enum.step.s' + s.step), n: s.count }) : undefined"
                :class="cn(
                  'flex items-center gap-2 px-2 py-1 text-ink-2',
                  s.count > 0 && cn(rowLink, 'hover:bg-canvas hover:text-ink'),
                )"
              >
                <span aria-hidden="true" class="size-2 shrink-0 rounded-pill" :style="{ background: s.color }" />
                <span class="min-w-0 flex-1 truncate">{{ t('enum.step.s' + s.step) }}</span>
                <span :class="cn('shrink-0 text-right font-semibold tabular-nums', s.count > 0 ? 'text-ink' : 'text-muted')">{{ s.count }}</span>
              </component>
            </li>
          </ul>
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
          <!-- Пакет G (02.11.2026): «Без движения 5+ дней» отсюда убрано — оно в карточке «Застряли». -->
          <dl v-if="manage.data" class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt class="text-ink-2">{{ t('home.manage.unassigned') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.unassigned }}</dd>
            <dt class="text-ink-2">{{ t('home.manage.problems') }}</dt>
            <dd class="m-0 text-right font-semibold tabular-nums">{{ manage.data.problems }}</dd>
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

        <ExpeditorHomePanel v-if="exp40" />

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
            <!-- S-50 (30.10.2026): строка статуса — «Транзит» с этим фильтром. -->
            <template v-for="s in transitStatuses" :key="s.status">
              <dt class="text-ink-2">
                <RouterLink
                  v-if="transitStatusHref(s.status)"
                  :to="transitStatusHref(s.status)!"
                  class="rounded-[4px] text-ink-2 no-underline outline-hidden hover:text-ink hover:underline focus-visible:shadow-focus"
                  data-home-transit-status
                >{{ statusLabel(s.status) }}</RouterLink>
                <template v-else>{{ statusLabel(s.status) }}</template>
              </dt>
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
