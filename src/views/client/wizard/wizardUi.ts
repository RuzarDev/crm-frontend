// Общие классы шагов мастера (доски Wizard / WizardPhone). На телефоне поля — 48px и 16px: палец попадает,
// а iOS не увеличивает страницу при фокусе (зум срабатывает на шрифте меньше 16px).
/** ZInput / ZNumber / ZPhone: класс уходит на рамку поля. */
export const phoneField = 'max-sm:h-12 max-sm:text-base'
/** ZSelect: класс — на корень, рамка — его прямой потомок. */
export const phoneSelect = 'max-sm:*:h-12 max-sm:*:text-base'
/** ZTextarea. */
export const phoneTextarea = 'max-sm:text-base max-sm:px-3 max-sm:py-3'
/** Заголовок шага и пояснение под ним. */
export const stepTitle = 'm-0 outline-hidden text-[22px] leading-7 font-semibold tracking-[-0.02em] text-ink sm:text-xl sm:leading-7 sm:tracking-[-0.01em]'
export const stepHint = 'm-0 mt-1.5 text-sm text-ink-3 sm:text-[15px]'
/** Подзаголовок блока внутри шага (Контейнеры, Отправитель, Получатель). */
export const blockTitle = 'm-0 text-[15px] leading-6 font-semibold text-ink'
