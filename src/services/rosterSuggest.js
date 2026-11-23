/* ─── Sugerencia de asignación para el rol diario ──────────
   Pure function: fills only the empty slots with employees that
   have a schedule in this shift and no absence. The manager
   reviews the result before publishing.

   SUPUESTO: reglas simples mientras el cliente define las suyas
   - capitanes a áreas sin capitán, en orden;
   - meseros a estaciones sin mesero, evitando repetir la estación
     del último rol del mismo turno;
   - runners repartidos entre áreas (primero las que tienen menos);
   - todas las hostess programadas;
   - el cierre no se sugiere: lo marca el capitán;
   - no se sugiere a nadie que no esté activo ni a quien tenga una
     restricción o no esté autorizado para ese lugar (`fits`).
   ─────────────────────────────────────────────────────────── */

export function suggestAssignments({
  areas, stations, assignments, availability, turnoId, previousStations = new Map(), fits = () => true,
}) {
  const taken = new Set(assignments.map((a) => a.empleado_id))
  const candidates = (puesto) => availability
    .filter((e) => e.puesto === puesto && e.turno_id === turnoId && !e.es_descanso && !e.ausencia
      && (e.estado ?? 'activo') === 'activo' && !taken.has(e.empleado_id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const fitsSlot = (e, row) => fits({ empleado_id: e.empleado_id, es_cierre: false, ...row })

  const rows = []
  const take = (e, row) => { taken.add(e.empleado_id); rows.push({ empleado_id: e.empleado_id, es_cierre: false, ...row }) }

  const captains = candidates('capitan')
  areas
    .filter((area) => !assignments.some((a) => a.funcion === 'capitan' && a.area_id === area.id))
    .forEach((area) => {
      const row = { funcion: 'capitan', area_id: area.id, estacion_id: null }
      const i = captains.findIndex((e) => fitsSlot(e, row))
      if (i !== -1) take(captains.splice(i, 1)[0], row)
    })

  const waiters = candidates('mesero')
  const emptyStations = stations.filter((s) => !assignments.some((a) => a.funcion === 'mesero' && a.estacion_id === s.id))
  emptyStations.forEach((station) => {
    const row = { funcion: 'mesero', area_id: station.area_id, estacion_id: station.id }
    let i = waiters.findIndex((e) => fitsSlot(e, row) && previousStations.get(e.empleado_id) !== station.id)
    if (i === -1) i = waiters.findIndex((e) => fitsSlot(e, row))
    if (i === -1) return
    take(waiters.splice(i, 1)[0], row)
  })

  const runnersPerArea = new Map(areas.map((area) => [
    area.id, assignments.filter((a) => a.funcion === 'runner' && a.area_id === area.id).length,
  ]))
  candidates('runner').forEach((e) => {
    const options = [...runnersPerArea.entries()]
      .filter(([areaId]) => fitsSlot(e, { funcion: 'runner', area_id: areaId, estacion_id: null }))
      .sort((a, b) => a[1] - b[1])
    if (!options.length) return
    const [areaId] = options[0]
    runnersPerArea.set(areaId, runnersPerArea.get(areaId) + 1)
    take(e, { funcion: 'runner', area_id: areaId, estacion_id: null })
  })

  const hostessRow = { funcion: 'hostess', area_id: null, estacion_id: null }
  candidates('hostess').filter((e) => fitsSlot(e, hostessRow)).forEach((e) => take(e, hostessRow))

  const uncovered = emptyStations.length - rows.filter((r) => r.funcion === 'mesero').length
  return { rows, uncovered }
}
