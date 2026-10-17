// Себестоимость поставки (17.10): как Import40ShipmentCostCalc.IsAvailable на сервере — с выпуска ДТ (4) по выполненную
// заявку (8) включительно; отменённой (9) — нет.
export const costAvailable = (status: number): boolean => status >= 4 && status <= 8

/** Как Import40ShipmentCostLimits.NoteMax на сервере. */
export const COST_NOTE_MAX = 1000
