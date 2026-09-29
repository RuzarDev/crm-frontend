// Количество грузовых мест по товару (гр.6/гр.31) — один источник на фронте и бэке
// (Import40Places.Of): CargoPlacesQuantity, затем PackagesCount. Количество упаковок местами не считается.
// В карточке ДТ виден один инпут «Кол-во грузовых мест» (packagesCount); cargoPlacesQuantity
// держится равным ему (см. DtSectionGoods / сохранение в Import40DtView).
type PlacesSource = { cargoPlacesQuantity?: number | null; packagesCount?: number | null }

export function placesOfGoods(g: PlacesSource): number | null {
  const cargo = g.cargoPlacesQuantity
  const pack = g.packagesCount
  if (typeof cargo === 'number' && cargo > 0) return cargo
  if (typeof pack === 'number' && pack > 0) return pack
  return cargo ?? pack ?? null
}
