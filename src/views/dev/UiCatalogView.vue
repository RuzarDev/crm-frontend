<script setup lang="ts">
import { ref } from 'vue'
import { PhArrowSquareOut, PhCopy, PhMagnifyingGlass, PhPencilSimple, PhPlus, PhQuestion, PhTray, PhTrash, PhUploadSimple } from '@phosphor-icons/vue'
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
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-8 font-sans text-ink sm:px-10">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-8">
      <ZPage title="Каталог компонентов" subtitle="Волна 0a–0b · стиль C · IBM Plex Sans">
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
