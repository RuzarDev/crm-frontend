<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { PhArrowSquareOut, PhCopy, PhFunnel, PhMagnifyingGlass, PhPencilSimple, PhPlus, PhQuestion, PhTray, PhTrash, PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZPage from '@/components/z/ZPage.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZPopconfirm from '@/components/z/ZPopconfirm.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZTabs from '@/components/z/ZTabs.vue'
import ZCollapse from '@/components/z/ZCollapse.vue'
import ZCollapseItem from '@/components/z/ZCollapseItem.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import ZPopover from '@/components/z/ZPopover.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZDescriptions from '@/components/z/ZDescriptions.vue'
import ZDescriptionsItem from '@/components/z/ZDescriptionsItem.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import ZDateRange from '@/components/z/ZDateRange.vue'
import ZListRow from '@/components/z/ZListRow.vue'
import ZStepper, { type ZStep } from '@/components/z/ZStepper.vue'
import ZAskBanner from '@/components/z/ZAskBanner.vue'
import ZProgress from '@/components/z/ZProgress.vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ShellSidebar from '@/components/shell/ShellSidebar.vue'
import ShellSectionTabs from '@/components/shell/ShellSectionTabs.vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import { buildBrokerNav, buildClientNav, type NavAccess } from '@/shell/navModel'
import type { ZColumn, ZKey } from '@/ui/table'
import type { ZRule } from '@/ui/validation'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'

const search = ref('Казахмыс')
const bin = ref('210340012345')
const note = ref('Сертификат на позицию 3 запрошен у клиента 05.10')
const companies = ['ТОО «Казахмыс Трейд»', 'ТОО «Astana Foods»', 'ИП Сейткали А.', 'ТОО «Ақжол Логистик»', 'ТОО «Altyn Med»']
const tones = [
  ['neutral', 'Черновик'], ['info', 'Декларирование'], ['wait', 'На границе'], ['submitted', 'Подана'],
  ['done', 'Выпущена'], ['pay', 'Оплата'], ['danger', 'Проблема'], ['accent', 'Нужно от вас'],
] as const

// ---- Волна 0b: поля, списки, окна ----
const netWeight = ref<number | null>(1240.5)
const quantity = ref<number | null>(24)
const badQuantity = ref<number | null>(-3)

const procedures = [
  { value: 'IM40', label: 'ИМ 40 — выпуск для внутреннего потребления' },
  { value: 'EK10', label: 'ЭК 10 — экспорт' },
  { value: 'TT80', label: 'ТТ 80 — таможенный транзит' },
]
const countries = [
  { value: 'CN', label: 'Китай', code: 'CN' }, { value: 'DE', label: 'Германия', code: 'DE' },
  { value: 'TR', label: 'Турция', code: 'TR' }, { value: 'RU', label: 'Россия', code: 'RU' },
  { value: 'KR', label: 'Республика Корея', code: 'KR' }, { value: 'UZ', label: 'Узбекистан', code: 'UZ' },
  { value: 'KG', label: 'Кыргызстан', code: 'KG' }, { value: 'AE', label: 'ОАЭ', code: 'AE' },
]
const transports = [
  { value: 'auto', label: 'Автомобильный' }, { value: 'rail', label: 'Железнодорожный' },
  { value: 'air', label: 'Воздушный' }, { value: 'sea', label: 'Морской' },
]
const procedure = ref<string | null>('IM40')
const country = ref<string | null>('CN')
const modes = ref<string[]>(['auto', 'rail'])
const containers = ref<string[]>(['MSKU1234567', 'TGHU7654321'])
const badProcedure = ref<string | null>(null)

const posts = [
  { value: '55201', label: '55201 — т/п «Хоргос»', region: 'Жетысуская обл.' },
  { value: '55302', label: '55302 — т/п «Достык»', region: 'Жетысуская обл.' },
  { value: '53102', label: '53102 — т/п «Алтынколь»', region: 'Жетысуская обл.' },
  { value: '41801', label: '41801 — т/п «Нур-Жолы»', region: 'Жетысуская обл.' },
  { value: '60101', label: '60101 — т/п «Жайсан»', region: 'Мангистауская обл.' },
]
const post = ref('55201')
const wideSearch = ref('')

const grA = ref<string | null>('2026-09-28')
const emptyDate = ref<string | null>(null)
const badDate = ref<string | null>('2026-09-28')

const agreeOnce = ref(true)
const agreeNone = ref(false)
const agreeSome = ref(false)
const notify = ref(true)
const express = ref(false)
const contractKind = ref<string | number | null>('once')
const view = ref<string | number | null>('list')
const viewLocked = ref<string | number | null>('table')

const tab = ref('docs')
const tabs = [
  { key: 'docs', label: 'Документы', count: 12 },
  { key: 'goods', label: 'Товары', count: 3 },
  { key: 'pay', label: 'Платежи' },
  { key: 'history', label: 'История', disabled: true },
]
const openPanels = ref<string[]>(['g31'])
const spinning = ref(true)

const moreItems: ZDropdownItem[] = [
  { key: 'edit', label: 'Редактировать', icon: PhPencilSimple },
  { key: 'copy', label: 'Копировать ДТ', icon: PhCopy },
  { key: 'xml', label: 'Выгрузить XML', icon: PhArrowSquareOut, disabled: true },
  { key: 'delete', label: 'Удалить', icon: PhTrash, danger: true, divider: true },
]

const modalOpen = ref(false)
const modalSaving = ref(false)
const drawerOpen = ref(false)
const mClient = ref('ТОО «Ақжол Логистик»')
const mProc = ref<string | null>('IM40')
const mDate = ref<string | null>('2026-09-28')
const mWeight = ref<number | null>(1240.5)
const lastAction = ref('')

// ---- Волна 0c: форма, таблица, описания, файлы, период, стиль C ----
const form = reactive<{
  bin: string; email: string; dateA: string | null; procedure: string | null; weight: number | null; password: string
}>({ bin: '21034001234', email: 'declarant@akzhol', dateA: null, procedure: null, weight: null, password: '' })
const formRules: Record<string, ZRule[]> = {
  bin: [{ required: true }, { pattern: /^\d{12}$/, message: 'БИН — ровно 12 цифр' }],
  email: [{ required: true }, { type: 'email' }],
  dateA: [{ required: true, message: 'Укажите дату гр.А' }],
  procedure: [{ required: true, message: 'Выберите процедуру' }],
  weight: [{ required: true, message: 'Укажите вес нетто' }],
  password: [{ required: true }, { min: 8 }],
}
const formState = ref('')
const onFormFinish = () => { formState.value = 'Форма валидна'; message.success('Заявка сохранена') }
const onFormFailed = (info: { errors: { name: string | undefined; message: string }[] }) => { formState.value = `Ошибок: ${info.errors.length}` }

interface Row {
  key: string
  number: string
  client: string
  tnved: string
  goods: string
  status: string
  sum: number
  date: string
}
const rowClients = ['ТОО «Казахмыс Трейд»', 'ТОО «Astana Foods»', 'ИП Сейткали А.', 'ТОО «Ақжол Логистик»', 'ТОО «Altyn Med»', 'ТОО «Алатау Строй»']
const rowTnved = ['8471 30 000 0', '8708 99 970 9', '3926 90 970 9', '8414 59 300 0', '6109 10 000 0', '8481 80 990 0']
const rowGoods = [
  'Комплектующие для станков с ЧПУ, шпиндельные узлы, 24 места',
  'Тормозные колодки и ступицы для грузовых автомобилей',
  'Изделия из пластмасс для строительства, фитинги и муфты',
  'Вентиляторы осевые промышленные для систем охлаждения',
  'Футболки хлопковые трикотажные, мужские, партия 12 000 шт',
  'Запорная арматура, шаровые краны, диаметр 50 мм',
]
const rowStatuses: [string, 'neutral' | 'info' | 'wait' | 'submitted' | 'done' | 'pay' | 'danger' | 'accent'][] = [
  ['Черновик', 'neutral'], ['Декларирование', 'info'], ['На границе', 'wait'], ['Подана', 'submitted'],
  ['Выпущена', 'done'], ['Оплата', 'pay'], ['Проблема', 'danger'], ['Нужно от вас', 'accent'],
]
const makeRow = (i: number): Row => ({
  key: `r${i}`,
  number: `И40-${String(100 + i).padStart(4, '0')}`,
  client: rowClients[(i * 7) % rowClients.length],
  tnved: rowTnved[(i * 5) % rowTnved.length],
  goods: rowGoods[(i * 3) % rowGoods.length],
  status: String((i * 11) % rowStatuses.length),
  sum: 480_000 + ((i * 7919) % 97) * 143_250 + (i % 13) * 1_000,
  date: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + ((i * 3) % 28)).padStart(2, '0')}`,
})
const allRows: Row[] = Array.from({ length: 60 }, (_, i) => makeRow(i + 1))
const fmtDate = (iso: string) => iso.split('-').reverse().join('.')
const fmtSum = (n: number) => `${n.toLocaleString('ru-RU')} ₸`
const toneOf = (i: string) => rowStatuses[Number(i)]

const tableColumns: ZColumn<Row>[] = [
  { key: 'number', title: 'Номер', dataIndex: 'number', width: 120, fixed: 'left', sorter: true },
  { key: 'client', title: 'Клиент', dataIndex: 'client', width: 250 },
  { key: 'tnved', title: 'ТН ВЭД', dataIndex: 'tnved', width: 140 },
  { key: 'goods', title: 'Описание товара', dataIndex: 'goods', width: 220, ellipsis: true },
  { key: 'status', title: 'Статус', dataIndex: 'status', width: 160 },
  { key: 'sum', title: 'Сумма', dataIndex: 'sum', width: 150, align: 'right', sorter: true, className: 'tabular-nums', customRender: ({ value }) => fmtSum(value as number) },
  { key: 'date', title: 'Дата', dataIndex: 'date', width: 110, sorter: true, customRender: ({ value }) => fmtDate(value as string) },
]
const tableLoading = ref(false)
const tableEmpty = ref(false)
const tableData = computed(() => (tableEmpty.value ? [] : allRows))
const selectedKeys = ref<ZKey[]>(['r3', 'r5'])
const rowSelection = {
  get selectedRowKeys() { return selectedKeys.value },
  onChange: (keys: ZKey[]) => { selectedKeys.value = keys },
}

const SERVER_TOTAL = 240
const serverPage = ref(1)
const serverLoading = ref(false)
const serverRows = computed(() => Array.from({ length: 10 }, (_, i) => makeRow((serverPage.value - 1) * 10 + i + 1)))
const serverColumns: ZColumn<Row>[] = [
  { key: 'number', title: 'Номер', dataIndex: 'number', width: 120 },
  { key: 'client', title: 'Клиент', dataIndex: 'client' },
  { key: 'sum', title: 'Сумма', dataIndex: 'sum', width: 150, align: 'right', className: 'tabular-nums', customRender: ({ value }) => fmtSum(value as number) },
]
const onServerPage = (page: number) => {
  serverLoading.value = true
  setTimeout(() => { serverPage.value = page; serverLoading.value = false }, 300)
}

const filterSelected = ref<string[]>(['Подана', 'Выпущена'])
const filterStatuses = ['Черновик', 'Декларирование', 'На границе', 'Подана', 'Выпущена', 'Оплата']

const uploadedNames = ref<string[]>([])
const onUploadSelect = (files: File[]) => { uploadedNames.value = files.map((f) => f.name) }
const period = ref<[string | null, string | null]>(['2026-09-01', '2026-09-28'])

const stages: ZStep[] = [
  { key: 'request', label: 'Заявка' },
  { key: 'docs', label: 'Документы' },
  { key: 'calc', label: 'Расчёт' },
  { key: 'declaring', label: 'Декларирование' },
  { key: 'submit', label: 'Подача в КЕДЕН' },
  { key: 'release', label: 'Выпуск' },
  { key: 'closed', label: 'Закрыто' },
]
const crumbs = [{ label: 'Импорт 40', to: '/_ui' }, { label: 'И40-182', to: '/_ui' }, { label: 'Декларация' }]
const searchHint = ref('')
const searchQuery = ref('И40-182')
const pwd = ref('Zircon2026!')

const { confirm } = useConfirm()
const askConfirm = async () => {
  const ok = await confirm({
    title: 'Снять декларацию с подачи?',
    content: 'ДТ №10000010/280926/0001234 вернётся в черновики, статус КЕДЕН сбросится.',
    okText: 'Снять', cancelText: 'Оставить', danger: true,
  })
  lastAction.value = ok ? 'Подтверждено' : 'Отменено'
}
const saveModal = () => {
  modalSaving.value = true
  setTimeout(() => { modalSaving.value = false; modalOpen.value = false; message.success('Заявка сохранена') }, 800)
}
const onMenu = (key: string) => { lastAction.value = `Пункт меню: ${key}` }

// ---- Волна 1: оболочка ----
const demoAccess = (role: string, extra: Partial<NavAccess> = {}): NavAccess => ({
  role, hasPermission: () => role === 'administrator', clientHasModule: (m) => m === 'import40',
  canUseImport40: true, canUseSales: true, isFinanceOnly: false, registrationIncomplete: false, ...extra,
})
const brokerNav = buildBrokerNav(demoAccess('administrator'))
const clientNav = buildClientNav(demoAccess('client', { registrationIncomplete: true }))
const referencesSection = brokerNav.groups.flatMap((g) => g.sections).find((s) => s.key === 'references')!
const shellEvent = ref('')
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-8 font-sans text-ink sm:px-10">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-8">
      <ZPage title="Каталог компонентов" subtitle="Волны 0a–0c · стиль C · IBM Plex Sans">
        <template #meta><ZTag tone="info" size="sm">dev</ZTag></template>
        <template #actions>
          <ZButton variant="secondary" @click="message.info('Черновик сохранён')">Тост: инфо</ZButton>
          <ZButton variant="primary" @click="message.success('Декларация сохранена')">Тост: успех</ZButton>
          <ZButton variant="danger-ghost" @click="message.error({ content: 'Не удалось выгрузить XML: нет гр.30', duration: 6 })">Тост: ошибка</ZButton>
        </template>
      </ZPage>

      <ZPanel class="min-w-0" title="Кнопки">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <ZButton variant="primary"><template #icon><PhPlus :size="16" /></template>Новая заявка</ZButton>
            <ZButton>Открыть ДТ</ZButton>
            <ZButton variant="ghost">Отмена</ZButton>
            <ZButton variant="danger">Удалить заявку</ZButton>
            <ZButton variant="danger-ghost">Снять с подачи</ZButton>
            <ZButton variant="link">Показать историю</ZButton>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <ZButton variant="primary" loading>Подаём в КЕДЕН</ZButton>
            <ZButton disabled>Недоступно</ZButton>
            <ZButton size="sm"><template #icon><PhUploadSimple :size="14" /></template>Загрузить</ZButton>
            <ZButton size="sm" variant="ghost">Ещё</ZButton>
          </div>
        </div>
      </ZPanel>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Поля ввода">
          <div class="flex flex-col gap-3">
            <ZInput v-model:value="search" allow-clear placeholder="Поиск по клиенту, БИН, номеру">
              <template #prefix><PhMagnifyingGlass :size="16" /></template>
            </ZInput>
            <ZInput v-model:value="bin" mono :maxlength="12" placeholder="БИН" />
            <ZInput value="8471 30 000 0" mono invalid />
            <ZInput value="Только чтение" readonly />
            <ZInput value="Недоступно" disabled />
            <ZInput size="sm" placeholder="Маленькое поле" />
          </div>
        </ZPanel>
        <ZPanel class="min-w-0" title="Многострочное">
          <ZTextarea v-model:value="note" auto-grow placeholder="Комментарий для декларанта" />
        </ZPanel>
      </div>

      <ZPanel class="min-w-0" title="Статусы и аватары">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <ZTag v-for="[tone, label] in tones" :key="tone" :tone="tone">{{ label }}</ZTag>
          </div>
          <div class="flex flex-col">
            <div v-for="c in companies" :key="c" class="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <ZAvatar :name="c" />
              <span class="font-semibold">{{ c }}</span>
              <span class="ml-auto font-mono text-sm tabular-nums text-ink-3">8471 30 000 0</span>
            </div>
          </div>
          <p class="text-sm text-ink-3">Поиск по всему <ZKbd>⌘</ZKbd> <ZKbd>K</ZKbd></p>
        </div>
      </ZPanel>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Загрузка">
          <ZSkeleton :lines="4" />
        </ZPanel>
        <ZPanel class="min-w-0" padding="none">
          <ZEmpty title="Заявок пока нет" hint="Новые заявки клиентов появятся здесь, а вы получите уведомление">
            <template #icon><PhTray :size="20" /></template>
            <template #action><ZButton variant="primary" size="sm">Создать заявку</ZButton></template>
          </ZEmpty>
        </ZPanel>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Числа (ZNumber)">
          <div class="flex flex-col gap-3">
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Вес нетто, кг (гр.38)
              <ZNumber v-model:value="netWeight" :precision="3" :min="0" placeholder="0,000" />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Количество мест, с кнопками
              <ZNumber v-model:value="quantity" controls :min="0" :max="999" :step="1" />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Ошибка (не может быть отрицательным)
              <ZNumber v-model:value="badQuantity" invalid />
            </label>
            <ZNumber :value="1240.5" :precision="3" disabled />
            <ZNumber size="sm" :value="12" controls />
            <p class="font-mono text-xs tabular-nums text-ink-3">значения: {{ netWeight }} · {{ quantity }} · {{ badQuantity }}</p>
          </div>
        </ZPanel>

        <ZPanel class="min-w-0" title="Автодополнение (ZCombobox)">
          <div class="flex flex-col gap-3">
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Таможенный пост (гр.29)
              <ZCombobox v-model:value="post" :options="posts" mono allow-clear placeholder="Код или название поста" />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Узкое поле, окно шире (popupWidth, слот option)
              <ZCombobox v-model:value="wideSearch" :options="posts" :popup-width="420" placeholder="Поиск">
                <template #option="o">
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate">{{ o.label }}</span>
                    <span class="truncate text-xs text-ink-3">{{ o.region }}</span>
                  </span>
                </template>
              </ZCombobox>
            </label>
            <ZCombobox value="55201" :options="posts" invalid />
            <ZCombobox value="55302" :options="posts" disabled />
          </div>
        </ZPanel>
      </div>

      <ZPanel class="min-w-0" title="Списки (ZSelect)">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Процедура (гр.1)
            <ZSelect v-model:value="procedure" :options="procedures" placeholder="Выберите процедуру" />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Страна происхождения, поиск по коду (CN → Китай)
            <ZSelect v-model:value="country" :options="countries" show-search option-filter-prop="code" allow-clear placeholder="Код страны, напр. CN" />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Виды транспорта (multiple)
            <ZSelect v-model:value="modes" :options="transports" mode="multiple" allow-clear placeholder="Выберите" />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Номера контейнеров (tags)
            <ZSelect v-model:value="containers" :options="[]" mode="tags" placeholder="Введите номер и Enter" />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Ошибка (status=error)
            <ZSelect v-model:value="badProcedure" :options="procedures" status="error" placeholder="Обязательное поле" />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Недоступно
            <ZSelect value="TT80" :options="procedures" disabled />
          </label>
        </div>
        <p class="mt-3 font-mono text-xs tabular-nums text-ink-3">
          {{ procedure }} · {{ country }} · {{ modes.join(',') }} · {{ containers.join(',') }}
        </p>
      </ZPanel>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Даты (ZDate)">
          <div class="flex flex-col gap-3">
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Дата гр.А
              <ZDate v-model:value="grA" allow-clear />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Пустая
              <ZDate v-model:value="emptyDate" placeholder="ДД.ММ.ГГГГ" />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Ошибка
              <ZDate v-model:value="badDate" invalid />
            </label>
            <ZDate value="2026-09-28" disabled />
            <ZDate value="2026-09-28" readonly />
            <p class="font-mono text-xs tabular-nums text-ink-3">значение: {{ grA }}</p>
          </div>
        </ZPanel>

        <ZPanel class="min-w-0" title="Выбор">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <ZCheckbox v-model:checked="agreeOnce">Ознакомлен с условиями договора</ZCheckbox>
              <ZCheckbox v-model:checked="agreeNone">Не выбрано</ZCheckbox>
              <ZCheckbox v-model:checked="agreeSome" indeterminate>Частично (indeterminate)</ZCheckbox>
              <ZCheckbox :checked="true" disabled>Недоступно, отмечено</ZCheckbox>
              <ZCheckbox disabled>Недоступно</ZCheckbox>
            </div>
            <div class="flex flex-col gap-2">
              <ZSwitch v-model:checked="notify">Уведомлять по e-mail</ZSwitch>
              <ZSwitch v-model:checked="express" size="sm">Срочное оформление</ZSwitch>
              <ZSwitch :checked="true" disabled>Недоступно</ZSwitch>
            </div>
            <ZRadioGroup
              v-model:value="contractKind"
              :options="[{ value: 'once', label: 'Разовый договор' }, { value: 'multi', label: 'Многоразовый договор' }, { value: 'old', label: 'Архивный', disabled: true }]"
            />
            <ZRadioGroup
              v-model:value="contractKind" orientation="vertical"
              :options="[{ value: 'once', label: 'Разовый' }, { value: 'multi', label: 'Многоразовый' }]"
            />
            <ZSegmented v-model:value="view" :options="[{ value: 'list', label: 'Список' }, { value: 'table', label: 'Таблица' }]" />
            <ZSegmented v-model:value="viewLocked" :options="['Список', 'Таблица']" disabled />
          </div>
        </ZPanel>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Вкладки и раскрытие">
          <div class="flex flex-col gap-4">
            <ZTabs v-model:active-key="tab" :items="tabs" />
            <p class="text-sm text-ink-3">Активна вкладка: {{ tab }}</p>
            <ZCollapse v-model:active-key="openPanels">
              <ZCollapseItem value="g31" header="Гр.31 — Грузовые места и описание товаров">
                Комплектующие для станков с ЧПУ, 24 места, марка «KAZ-Drive».
              </ZCollapseItem>
              <ZCollapseItem value="g44" header="Гр.44 — Дополнительные сведения и документы">
                Инвойс INV-2026-0417 от 12.09.2026, контракт 77/2026.
              </ZCollapseItem>
              <ZCollapseItem value="g33" header="Гр.33 — Код товара" disabled>
                Недоступно до выбора процедуры.
              </ZCollapseItem>
            </ZCollapse>
          </div>
        </ZPanel>

        <ZPanel class="min-w-0" title="Сообщения">
          <div class="flex flex-col gap-3">
            <ZAlert type="info" message="Курсы на дату гр.А" description="Курсы НБ РК подставлены на 28.09.2026." show-icon />
            <ZAlert type="success" message="ДТ принята КЕДЕН" show-icon />
            <ZAlert type="warning" message="Не указан код поста" description="Укажите, например, 55201 — т/п «Хоргос»." show-icon closable />
            <ZAlert type="error" message="Не удалось выгрузить XML" description="Нет сведений по гр.30 (СВХ)." show-icon>
              <template #action><ZButton size="sm" variant="secondary">Исправить</ZButton></template>
            </ZAlert>
            <div class="flex items-center gap-3">
              <ZSwitch v-model:checked="spinning">Загрузка</ZSwitch>
            </div>
            <ZSpin :spinning="spinning" tip="Считаем платежи…">
              <ZSkeleton :lines="3" />
            </ZSpin>
          </div>
        </ZPanel>
      </div>

      <ZPanel class="min-w-0" title="Всплывающее">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-1 text-sm text-ink-2">
              Контейнер MSKU1234567
              <ZTooltip title="Номер по ISO 6346: четыре буквы и семь цифр">
                <button type="button" aria-label="Подсказка" class="inline-flex size-5 items-center justify-center rounded-pill border-0 bg-sunken p-0 text-ink-2 outline-hidden focus-visible:shadow-focus">
                  <PhQuestion :size="12" />
                </button>
              </ZTooltip>
            </span>
            <ZDropdown :items="moreItems" @select="onMenu">
              <ZButton variant="secondary">Ещё</ZButton>
            </ZDropdown>
            <ZPopconfirm title="Удалить файл?" description="Инвойс INV-2026-0417.pdf будет удалён из заявки." ok-text="Удалить" cancel-text="Отмена" danger @confirm="lastAction = 'Файл удалён'" @cancel="lastAction = 'Удаление отменено'">
              <ZButton variant="danger-ghost">Удалить файл</ZButton>
            </ZPopconfirm>
            <ZPopconfirm title="Отключено" disabled><ZButton disabled>Недоступно</ZButton></ZPopconfirm>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <ZButton variant="primary" @click="modalOpen = true">Открыть окно</ZButton>
            <ZButton @click="drawerOpen = true">Открыть панель</ZButton>
            <ZButton variant="danger" @click="askConfirm">Спросить</ZButton>
          </div>
          <p class="text-sm text-ink-3">Последнее действие: <span class="text-ink">{{ lastAction || '—' }}</span></p>
        </div>
      </ZPanel>

      <ZPanel class="min-w-0" title="Форма (ZForm + ZField)">
        <ZForm :model="form" :rules="formRules" layout="grid" class="gap-x-4 gap-y-3" @finish="onFormFinish" @finish-failed="onFormFailed">
          <ZField label="БИН клиента" name="bin" required :span="4" help="12 цифр, без пробелов">
            <ZInput v-model:value="form.bin" mono :maxlength="12" placeholder="210340012345" />
          </ZField>
          <ZField label="E-mail декларанта" name="email" required :span="4">
            <ZInput v-model:value="form.email" type="text" placeholder="name@company.kz" />
          </ZField>
          <ZField label="Дата" graph="A" name="dateA" required :span="4">
            <ZDate v-model:value="form.dateA" />
          </ZField>
          <ZField label="Процедура" graph="1" name="procedure" required :span="6">
            <ZSelect v-model:value="form.procedure" :options="procedures" placeholder="Выберите процедуру" />
          </ZField>
          <ZField label="Вес нетто, кг" graph="38" name="weight" required :span="3" extra="До трёх знаков после запятой">
            <ZNumber v-model:value="form.weight" :precision="3" :min="0" />
          </ZField>
          <ZField label="Пароль КЕДЕН" name="password" required :span="3">
            <ZInput v-model:value="form.password" type="password" />
          </ZField>
          <div class="flex flex-wrap items-center gap-3">
            <ZButton variant="primary" html-type="submit">Сохранить</ZButton>
            <span class="text-sm text-ink-3">{{ formState || 'Нажмите «Сохранить», чтобы увидеть ошибки' }}</span>
          </div>
        </ZForm>
      </ZPanel>

      <ZPanel class="min-w-0" title="Таблица (ZTable)" padding="none">
        <div class="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
          <ZSwitch v-model:checked="tableLoading" size="sm">Загрузка</ZSwitch>
          <ZSwitch v-model:checked="tableEmpty" size="sm">Пусто</ZSwitch>
          <ZPopover title="Фильтр: статус" :width="260">
            <template #trigger><ZButton size="sm" variant="secondary"><template #icon><PhFunnel :size="14" /></template>Статус ({{ filterSelected.length }})</ZButton></template>
            <div class="flex flex-col gap-2">
              <ZCheckbox v-for="st in filterStatuses" :key="st" :checked="filterSelected.includes(st)" @update:checked="(v: boolean) => (filterSelected = v ? [...filterSelected, st] : filterSelected.filter((x) => x !== st))">{{ st }}</ZCheckbox>
            </div>
          </ZPopover>
          <span class="ml-auto text-sm text-ink-3">Выбрано: <b class="tabular-nums text-ink">{{ selectedKeys.length }}</b></span>
        </div>
        <ZTable
          :columns="tableColumns" :data-source="tableData" :loading="tableLoading" :row-selection="rowSelection"
          :scroll="{ x: 1100 }" :pagination="{ pageSize: 10, showTotal: (total: number) => `Всего ${total}` }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'client'">
              <span class="flex min-w-0 items-center gap-2">
                <ZAvatar :name="(record as Row).client" size="sm" />
                <span class="truncate">{{ (record as Row).client }}</span>
              </span>
            </template>
            <template v-else-if="column.key === 'tnved'"><span class="font-mono tabular-nums">{{ (record as Row).tnved }}</span></template>
            <template v-else-if="column.key === 'status'"><ZTag :tone="toneOf((record as Row).status)[1]">{{ toneOf((record as Row).status)[0] }}</ZTag></template>
          </template>
        </ZTable>
      </ZPanel>

      <ZPanel class="min-w-0" title="Таблица: серверная пагинация" padding="none">
        <ZTable
          :columns="serverColumns" :data-source="serverRows" :loading="serverLoading"
          :pagination="{ current: serverPage, pageSize: 10, total: SERVER_TOTAL, onChange: onServerPage, showTotal: (total: number) => `Всего ${total}` }"
        />
      </ZPanel>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Описания (ZDescriptions)">
          <ZDescriptions bordered :column="2" title="Стороны ДТ">
            <ZDescriptionsItem label="Отправитель (гр.2)">Shenzhen Mechanics Co., Ltd.</ZDescriptionsItem>
            <ZDescriptionsItem label="Получатель (гр.8)">ТОО «Ақжол Логистик»</ZDescriptionsItem>
            <ZDescriptionsItem label="БИН"><span class="font-mono tabular-nums">210340012345</span></ZDescriptionsItem>
            <ZDescriptionsItem label="Процедура">ИМ 40</ZDescriptionsItem>
            <ZDescriptionsItem label="Адрес" :span="2" multiline>{{ 'Республика Казахстан, 050000,\nг. Алматы, Алмалинский район,\nул. Фурманова, 187, офис 12' }}</ZDescriptionsItem>
            <ZDescriptionsItem label="Комментарий" :span="2"></ZDescriptionsItem>
          </ZDescriptions>
        </ZPanel>

        <ZPanel class="min-w-0" title="Файлы (ZUpload) и период">
          <div class="flex flex-col gap-4">
            <ZUpload accept=".xlsx" :max-size-mb="10" @select="onUploadSelect">Загрузить Excel</ZUpload>
            <ZUpload type="drag" accept=".pdf,.xlsx,.jpg" multiple @select="onUploadSelect">Перетащите инвойс или спецификацию сюда</ZUpload>
            <p class="font-mono text-xs text-ink-3">файлы: {{ uploadedNames.join(', ') || '—' }}</p>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Период оформления
              <ZDateRange v-model:value="period" allow-clear />
            </label>
            <p class="font-mono text-xs tabular-nums text-ink-3">{{ period[0] }} — {{ period[1] }}</p>
          </div>
        </ZPanel>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ZPanel class="min-w-0" title="Поиск и пароль">
          <div class="flex flex-col gap-3">
            <ZInput v-model:value="searchQuery" type="search" enter-button allow-clear placeholder="Номер заявки или БИН" @search="(v: string) => (searchHint = `Поиск: ${v}`)" />
            <ZInput type="search" enter-button="Найти" placeholder="С текстом на кнопке" />
            <ZInput v-model:value="pwd" type="password" />
            <p class="text-sm text-ink-3">{{ searchHint || 'Enter или кнопка запускает поиск' }}</p>
          </div>
        </ZPanel>

        <ZPanel class="min-w-0" title="Стиль C: строки списка">
          <div class="flex flex-col">
            <ZListRow v-for="(c, i) in companies.slice(0, 3)" :key="c" :title="c" subtitle="Импорт 40 · ИМ 40" :avatar-name="c">
              <template #meta><ZTag :tone="rowStatuses[i + 1][1]" size="sm">{{ rowStatuses[i + 1][0] }}</ZTag></template>
              <template #trailing><span class="font-mono text-sm text-ink">{{ fmtSum(1_240_500 + i * 311_250) }}</span></template>
            </ZListRow>
          </div>
        </ZPanel>
      </div>

      <ZPanel class="min-w-0" title="Стиль C: этапы, подсказки, прогресс">
        <div class="flex flex-col gap-5">
          <ZBreadcrumbs :items="crumbs" />
          <ZStepper :steps="stages" current="declaring" />
          <ZAskBanner title="Нужен сертификат соответствия" description="Для позиции 3 загрузите сертификат до подачи декларации." action-text="Загрузить" @action="message.info('Открыть загрузку')" />
          <div class="flex flex-col gap-3">
            <ZProgress :percent="45" show-info aria-label="Заполнено 45%" />
            <ZProgress :percent="100" status="success" show-info aria-label="Готово" />
            <ZProgress :percent="30" status="exception" size="sm" aria-label="Ошибка" />
          </div>
        </div>
      </ZPanel>

      <ZPanel class="min-w-0" title="Оболочка">
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-center gap-6">
            <ZirconLogo size="sm" />
            <ZirconLogo size="md" />
            <span class="inline-flex rounded-field bg-navy px-4 py-3"><ZirconLogo size="md" inverse /></span>
          </div>
          <div class="flex flex-wrap gap-6">
            <div class="h-[640px] w-[248px] overflow-hidden rounded-panel border border-line bg-canvas">
              <ShellSidebar
                :model="brokerNav" path="/import-40/manage" :attention="3"
                @search="shellEvent = 'search'" @navigate="shellEvent = 'navigate'"
              />
            </div>
            <div class="h-[640px] w-[240px] overflow-hidden rounded-panel border border-line bg-canvas">
              <ShellSidebar :model="clientNav" path="/home" :attention="1" comfortable :searchable="false" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-3">
              <p class="text-sm text-ink-3">Вкладки раздела «Справочники» (узкая полоса прокручивается):</p>
              <div class="max-w-[360px] rounded-field border border-line bg-surface">
                <ShellSectionTabs :section="referencesSection" active-key="timeline" />
              </div>
              <p class="text-sm text-ink-3">{{ shellEvent ? `Событие: ${shellEvent}` : 'Поиск/пункт меню — событие появится здесь' }}</p>
            </div>
          </div>
        </div>
      </ZPanel>

      <ZModal
        v-model:open="modalOpen" title="Новая заявка на оформление" :width="560" destroy-on-close
        ok-text="Сохранить" cancel-text="Отмена" :confirm-loading="modalSaving" @ok="saveModal"
      >
        <div class="flex flex-col gap-3">
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Клиент
            <ZInput v-model:value="mClient" allow-clear />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Процедура
            <ZSelect v-model:value="mProc" :options="procedures" />
          </label>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Дата гр.А
              <ZDate v-model:value="mDate" />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-sm text-ink-2">Вес нетто, кг
              <ZNumber v-model:value="mWeight" :precision="3" :min="0" />
            </label>
          </div>
          <div>
            <ZPopconfirm title="Очистить заявку?" description="Введённые поля будут сброшены." ok-text="Очистить" danger @confirm="mClient = ''; mProc = null; mDate = null; mWeight = null">
              <ZButton variant="danger-ghost" size="sm">Очистить поля</ZButton>
            </ZPopconfirm>
          </div>
        </div>
      </ZModal>

      <ZDrawer v-model:open="drawerOpen" title="Карточка клиента" :width="420" destroy-on-close>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <ZAvatar name="ТОО «Ақжол Логистик»" />
            <div>
              <div class="font-semibold">ТОО «Ақжол Логистик»</div>
              <div class="font-mono text-sm tabular-nums text-ink-3">БИН 210340012345</div>
            </div>
          </div>
          <ZAlert type="info" message="Договор многоразовый, действует до 31.12.2026" show-icon />
        </div>
        <template #footer><ZButton @click="drawerOpen = false">Закрыть</ZButton></template>
      </ZDrawer>
    </div>
  </div>
</template>
