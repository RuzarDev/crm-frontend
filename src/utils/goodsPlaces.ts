// Количество грузовых мест по товару (гр.6/гр.31) — один источник на фронте и бэке
// (Import40Places.Of): CargoPlacesQuantity, затем PackagesCount. Количество упаковок местами не считается.
// В редакторе товара ДТ одно поле «Мест» пишет и packagesCount, и cargoPlacesQuantity
// (см. GoodsQtyValueSection и formToPayload в views/broker/dt/dtPayload.ts).
type PlacesSource = { cargoPlacesQuantity?: number | null; packagesCount?: number | null }

export function placesOfGoods(g: PlacesSource): number | null {
  const cargo = g.cargoPlacesQuantity
  const pack = g.packagesCount
  if (typeof cargo === 'number' && cargo > 0) return cargo
  if (typeof pack === 'number' && pack > 0) return pack
  return cargo ?? pack ?? null
}
