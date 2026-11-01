# Glosario de lugares: Cliente · Sede · Estación · Puesto

Pasada de textos del 2026-11-01 (rama `feat/glosario`). Una sola palabra por cosa:

| Palabra | Qué es | En la base |
|---|---|---|
| **Cliente** | la empresa que contrata | clientAccount |
| **Sede** | el lugar del cliente, con su dirección | postSite / businessInfo (antes «sitio», «sitio de servicio», «puesto de seguridad» cuando era el lugar) |
| **Estación** | el punto que se cuida dentro de la sede | station (antes «puesto», «puesto de seguridad», «puesto de vigilancia» cuando era la estación) |
| **Puesto** | cada lugar de trabajo de la estación que cubre un vigilante a la vez (Fijo 1, Fijo 2) | stationPosition (antes «plaza») |

«Fijo», «sacafranco» y «puesto de supervisión» no cambian. Tampoco «sitio web», «sitios remotos» (video) ni «en su sitio» (lugar genérico).

Cambios en es.json: 174 valores — sede 58, estación 63, puesto 53. Valores por defecto en el código actualizados: 138 (menos Schedule.tsx, OpenShifts.tsx y AsignarAPuestoModal.tsx, que son de la otra sesión). en.json: 146 valores con Site · Station · Position.

## Cambios (es)

| Clave | Antes | Ahora | Qué es | Dónde se usa |
|---|---|---|---|---|
| `clients.assignGuards.emptyHint` | Entra a una estación de este sitio para asignar vigilantes. | Entra a una estación de esta sede para asignar vigilantes. | sede | src/pages/admin/post-sites/components/PostsiteAssignGuards/AssignGuards.tsx:269 |
| `clients.assignGuards.siteRosterHint` | Los vigilantes pertenecen a las estaciones de este sitio. Aquí ves el resumen; para asignar, quitar o cambiar un vigilante, entra a su estación. | Los vigilantes pertenecen a las estaciones de esta sede. Aquí ves el resumen; para asignar, quitar o cambiar un vigilante, entra a su estación. | sede | src/pages/admin/post-sites/components/PostsiteAssignGuards/AssignGuards.tsx:238 |
| `clients.contacts.form.AssignPostSite` | Indicar el Puesto de Seguridad | Indicar la sede | sede | src/pages/admin/clientes/components/ClientContacts/ClientContacts.tsx:1009 |
| `clients.form.commercialNameHint` | Se usará como nombre del sitio de servicio. | Se usará como nombre de la sede. | sede | src/pages/admin/clientes/ClientForm.tsx:1133 |
| `clients.overview.nPuestos` | {{n}} puestos | {{n}} estaciones | estacion | src/pages/admin/clientes/components/ClientOverview/ClientOverview.tsx:331 |
| `guards.assignSites.postSiteLoadError` | No se pudo cargar el puesto | No se pudo cargar la sede | sede | src/components/post-sites/PostSiteMiniInfo.tsx:31 |
| `guards.assignSites.postSiteLoading` | Cargando información del puesto... | Cargando información de la sede... | sede | src/components/post-sites/PostSiteMiniInfo.tsx:48 |
| `guards.assignSites.loadingPostSite` | Cargando información del puesto… | Cargando información de la sede… | sede | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:1067 |
| `guards.assignSites.searchPlaceholder` | Buscar puestos de seguridad | Buscar sede o estación | sede | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:758 |
| `guards.assignSites.actions.removeFromPost` | Quitar del puesto | Quitar de la estación | estacion | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:937 |
| `guards.assignSites.table.postSites` | Puestos de seguridad | Estación y puesto | estacion | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:816 |
| `guards.assignSites.errors.assignFailed` | No se pudo asignar el puesto | No se pudo asignar la estación | estacion | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:482 |
| `guards.assignSites.errors.selectClientSite` | Selecciona un cliente y un puesto | Selecciona un cliente y una sede | sede | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:357 |
| `guards.assignSites.errors.siteHasNoStations` | Esta sede todavía no tiene puestos. Crea un puesto en la sede y luego asigna al vigilante. | Esta sede todavía no tiene estaciones. Crea una estación en la sede y luego asigna al vigilante. | estacion | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:373 |
| `guards.assignSites.thisPost` | este puesto | esta estación | estacion | src/pages/admin/security-guards/components/GuardAssign-Sites/GuardAsignarSitiosPage.tsx:582 |
| `guards.list.filter.site` | Puesto de seguridad | Sede | sede | src/pages/admin/security-guards/SecurityGuardsPage.tsx:1445 |
| `ui.GuardSummary.puestoYEstacion` | Puesto y estación | Estación y puesto | estacion | src/pages/admin/security-guards/components/GuardSummary/GuardSummarypage.tsx:309 |
| `ui.GuardHorarioPage.puestoCliente` | Puesto · Cliente | Estación · Cliente | estacion | src/pages/admin/security-guards/components/GuardHorario/GuardHorarioPage.tsx:222 |
| `postSites.editPostSite` | Editar sitio de servicio | Editar sede | sede | src/pages/admin/post-sites/NewOrEditPostSitePage.tsx:99 |
| `postSites.newPostSite` | Nuevo sitio de servicio | Nueva sede | sede | src/pages/admin/post-sites/NewOrEditPostSitePage.tsx:100 |
| `postSites.postsite` | Sitio de servicio | Sede | sede | src/layouts/PostSiteLayout.tsx:64 |
| `postSites.Details.notfoundpostsite` | No se encontraron Puestos de vigilancia | No se encontró la sede | sede | src/pages/admin/post-sites/PostSiteDetailsPage.tsx:143 |
| `postSites.Details.title` | Puestos de vigilancia | Sede | sede | src/pages/admin/post-sites/PostSiteDetailsPage.tsx:112 |
| `postSites.overview.Map.noCoords` | Este sitio no tiene coordenadas configuradas. | Esta sede no tiene coordenadas configuradas. | sede | src/pages/admin/post-sites/components/PostsiteOverview/Overview.tsx:460 |
| `postSites.overview.Stats.guardOnSite` | Vigilantes en el sitio | Vigilantes en la sede | sede | src/pages/admin/post-sites/components/PostsiteOverview/Overview.tsx:122 |
| `postSites.overview.Stats.title` | Estadísticas del sitio | Estadísticas de la sede | sede | src/pages/admin/post-sites/components/PostsiteOverview/Overview.tsx:402 |
| `postSites.profile.GeneralInformation.siteName` | Nombre del sitio | Nombre de la sede | sede | src/pages/admin/post-sites/components/PostsiteProfile/Profile.tsx:616 |
| `postSites.profile.Map.NoCoordinates` | No hay coordenadas disponibles para este sitio | No hay coordenadas disponibles para esta sede | sede | src/pages/admin/post-sites/components/PostsiteProfile/Profile.tsx:785 |
| `postSites.profile.MoreInformation.postSiteChargeRate` | Tarifa de cargo del puesto de vigilancia | Tarifa de cobro de la sede | sede | src/pages/admin/post-sites/components/PostsiteProfile/Profile.tsx:726 |
| `postSites.profile.MoreInformation.postSitePayRate` | Tarifa de pago del puesto de vigilancia | Tarifa de pago de la sede | sede | src/pages/admin/post-sites/components/PostsiteProfile/Profile.tsx:750 |
| `postSites.stations.createSubtitle` | Define el turno, horario y la geocerca del puesto. | Define el turno, el horario y la geocerca de la estación. | estacion | src/pages/admin/post-sites/AddStationPage.tsx:87 |
| `postSites.wizardSubtitle` | Configura el sitio, su ubicación, servicio y estaciones paso a paso. | Configura la sede, su ubicación, el servicio y las estaciones paso a paso. | sede | src/pages/admin/post-sites/NewOrEditPostSitePage.tsx:91 |
| `postSites.wizardSubtitlePuesta` | Qué servicio se presta, los puestos y quién los cubre. Al terminar, el horario. | Qué servicio se presta, las estaciones y quién las cubre. Al terminar, el horario. | estacion | src/pages/admin/post-sites/NewOrEditPostSitePage.tsx:81 |
| `ui.PostSiteWizard.descripcionDelPuestoOpcional` | Descripción del puesto (opcional) | Descripción de la estación (opcional) | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:808 |
| `ui.PostSiteWizard.nombreDelPuesto` | Nombre del puesto * | Nombre de la estación * | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:789 |
| `ui.PostSiteWizard.quitarPuesto` | Quitar puesto | Quitar estación | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:794 |
| `ui.PostSiteWizard.cadaJornadaSeGuarda` | Cada jornada se guarda como un registro independiente en el puesto. | Cada jornada se guarda como un registro independiente en la estación. | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:971 |
| `ui.PostSiteWizard.queTipoDeServicioEs` | ¿Qué tipo de servicio es este sitio? | ¿Qué tipo de servicio es esta sede? | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1762 |
| `ui.PostSiteWizard.ubicacionDelSitio` | Ubicación del sitio | Ubicación de la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1817 |
| `ui.PostSiteWizard.fotoDelSitio` | Foto del sitio | Foto de la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:2526 |
| `ui.PostSiteWizard.errorAlCargarElSitio` | Error al cargar el sitio | Error al cargar la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1319 |
| `ui.PostSiteWizard.laFotoDelSitioNo` | La foto del sitio no se pudo guardar | La foto de la sede no se pudo guardar | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1532 |
| `ui.PostSiteWizard.subirFotoDelSitio` | Subir foto del sitio | Subir foto de la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:2563 |
| `ui.PostSiteWizard.estadoDelSitio` | Estado del sitio | Estado de la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:2586 |
| `ui.PostSiteWizard.errorAlCrearElSitio` | Error al crear el sitio | Error al crear la sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1747 |
| `ui.PostSiteWizard.step.sitio` | Sitio | Sede | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:187 |
| `ui.PostSiteWizard.buscaDireccionAsignaCliente` | Busca la dirección en el mapa y asigna el sitio a un cliente. | Busca la dirección en el mapa y asigna la sede a un cliente. | sede | src/pages/admin/post-sites/PostSiteWizard.tsx:1826 |
| `ui.PostSiteWizard.evento.archivarAlTerminar` | Al terminar, archivar a los vigilantes que no tengan otro puesto — liberan su asiento | Al terminar, archivar a los vigilantes que no tengan otra estación — liberan su asiento | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:2042 |
| `ui.PostSiteWizard.evento.historialConfirmarTexto` | Con estas fechas el evento ya terminó. No se crean turnos ni nómina hacia atrás: sus asignaciones se cierran y los vigilantes sin otro puesto se archivan, como en cualquier evento terminado. Lo que ya se fichó se conserva. | Con estas fechas el evento ya terminó. No se crean turnos ni nómina hacia atrás: sus asignaciones se cierran y los vigilantes sin otra estación se archivan, como en cualquier evento terminado. Lo que ya se fichó se conserva. | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:1680 |
| `ui.PostSiteWizard.evento.historialAviso` | Al guardar no se crean turnos ni nómina hacia atrás. Sus asignaciones se cierran y los vigilantes sin otro puesto se archivan. Si alguien está fichado ahora mismo en el evento, no se podrá guardar. | Al guardar no se crean turnos ni nómina hacia atrás. Sus asignaciones se cierran y los vigilantes sin otra estación se archivan. Si alguien está fichado ahora mismo en el evento, no se podrá guardar. | estacion | src/pages/admin/post-sites/PostSiteWizard.tsx:2002 |
| `ui.PostSite.analiticasPorSitioDeServicio` | Analíticas por Sitio de Servicio | Analíticas por sede | sede | src/pages/admin/analytics/PostSite.tsx:32 |
| `ui.PostSite.desempenoPorSitioDeServicio` | Desempeño por sitio de servicio | Desempeño por sede | sede | src/pages/admin/analytics/PostSite.tsx:104 |
| `ui.PostSite.sitiosConMasIncidentes` | Sitios con más incidentes | Sedes con más incidentes | sede | src/pages/admin/analytics/PostSite.tsx:84 |
| `ui.PostSite.desempenoOperativoDeCadaSitio` | Desempeño operativo de cada sitio: cobertura, rondas, ubicación e incidentes. | Desempeño operativo de cada sede: cobertura, rondas, ubicación e incidentes. | sede | src/pages/admin/analytics/PostSite.tsx:30 |
| `ui.PostSite.sitiosConActividad` | Sitios con actividad | Sedes con actividad | sede | src/pages/admin/analytics/PostSite.tsx:42 |
| `ui.ClientCoverage.estePuestoAunNoTiene` | Este puesto aún no tiene ubicación exacta. | Esta estación aún no tiene ubicación exacta. | estacion | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:980 |
| `ui.ClientCoverage.todosLosPuestosConTurno` | Todos los puestos con turno están cubiertos. | Todas las estaciones con turno están cubiertas. | estacion | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:1101 |
| `ui.ClientCoverage.estacionesDelSitio` | Estaciones del sitio | Estaciones de la sede | sede | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:456 |
| `ui.ClientCoverage.mapaDelSitio` | Mapa del sitio | Mapa de la sede | sede | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:862 |
| `ui.ClientCoverage.coberturaGeneralDelSitio` | Cobertura general del sitio | Cobertura general de la sede | sede | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:1063 |
| `ui.ClientCoverage.puestosYCoberturaEnVivo` | Puestos y cobertura en vivo de la sede seleccionada | Estaciones y cobertura en vivo de la sede seleccionada | estacion | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:421 |
| `ui.ClientCoverage.sedeSitio` | Sede / Sitio | Sede | sede | src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:427 |
| `ui.Scheduling.coberturaPorSitio` | Cobertura por sitio | Cobertura por sede | sede | src/pages/admin/analytics/Scheduling.tsx:192 |
| `ui.shared.sitio` | Sitio | Sede | sede | src/pages/admin/analytics/_shared.tsx:450 |
| `comun.puestoDeSeguridad` | Puesto de seguridad | Sede | sede | src/pages/admin/security-guards/SecurityGuardsPage.tsx:1453 |
| `comun.puestoDeSeguridadReq` | Puesto de seguridad* | Sede* | sede | src/pages/admin/dispatcher/NewDispatchPage.tsx:1824 |
| `comun.buscarSitio` | Buscar sitio... | Buscar sede... | sede | src/pages/admin/dispatcher/NewDispatchPage.tsx:1854 |
| `station.siteTours.thisSite` | Este sitio | Esta sede | sede | src/pages/admin/post-sites/components/PostsiteSiteTours/SiteTours.tsx:2060 |
| `dispatcher.post_site` | Puesto de seguridad | Sede | sede | src/pages/admin/dispatcher/DispatchDetailsPage.tsx:663 |
| `dispatcher.header_post_site` | Sitio | Sede | sede | src/pages/admin/dispatcher/NewDispatchPage.tsx:1320 |
| `dispatcher.select_site` | Seleccionar puesto de seguridad | Seleccionar sede | sede | src/pages/admin/dispatcher/DispatcherPage.tsx:1514 |
| `dispatcher.no_sites` | No hay puestos de seguridad | No hay sedes | sede | src/pages/admin/dispatcher/DispatcherPage.tsx:1526 |
| `dispatcher.searchPlaceholder` | Buscar por cliente o sitio | Buscar por cliente o sede | sede | src/pages/admin/dispatcher/DispatcherPage.tsx:1296 |
| `validation.route.sitesRequired` | Selecciona al menos un puesto de seguridad | Selecciona al menos una sede | sede | src/lib/validators/route-create.schema.ts:45 |
| `station.details.loadError` | Error al cargar puesto | Error al cargar la estación | estacion | src/pages/admin/post-sites/station-detail/StationDetailPage.tsx:81 |
| `station.guards.assignSub` | Vigilante fijo de la rotación del puesto | Vigilante fijo de la rotación de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationGuards.tsx:896 |
| `station.guards.removed` | Vigilante removido del puesto y de los turnos | Vigilante quitado de la estación y de sus turnos | estacion | src/pages/admin/post-sites/station-detail/components/StationGuards.tsx:623 |
| `station.guards.stationFull` | Todas las plazas de este puesto ya tienen vigilante. Si el cliente pide uno más, agrega una plaza en el horario del puesto y vuelve a asignar. | Todos los puestos de esta estación ya tienen vigilante. Si el cliente pide uno más, agrega un puesto en el horario de la estación y vuelve a asignar. | puesto | src/pages/admin/post-sites/station-detail/components/StationGuards.tsx:378 |
| `station.incidents.empty` | No hay incidencias para este puesto. | No hay incidencias para esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationIncidents.tsx:189 |
| `station.inventory.empty` | No hay inventario para este puesto. | No hay inventario para esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationInventory.tsx:110 |
| `station.parking.empty` | Todavía no se ha registrado ningún vehículo en este puesto. | Todavía no se ha registrado ningún vehículo en esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationParking.tsx:609 |
| `station.parking.subtitle` | Entrada y salida de vehículos en este puesto. El vigilante los registra desde la app y marca la salida cuando se van. | Entrada y salida de vehículos en esta estación. El vigilante los registra desde la app y marca la salida cuando se van. | estacion | src/pages/admin/post-sites/station-detail/components/StationParking.tsx:363 |
| `station.parking.capacityHint` | Vehículos dentro respecto al cupo del puesto | Vehículos dentro respecto al cupo de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationParking.tsx:314 |
| `station.parking.enable` | Activar reglas en este puesto | Activar reglas en esta estación | estacion | src/pages/admin/post-sites/station-detail/components/StationParking.tsx:389 |
| `station.parking.enableHint` | Sin activar, el puesto sigue registrando entradas y salidas: sólo se apagan el cupo, el aviso de permanencia y las placas vetadas. | Sin activar, la estación sigue registrando entradas y salidas: sólo se apagan el cupo, el aviso de permanencia y las placas vetadas. | estacion | src/pages/admin/post-sites/station-detail/components/StationParking.tsx:396 |
| `station.patrolQr.stationNoCoords` | El puesto no tiene coordenadas configuradas. | La estación no tiene coordenadas configuradas. | estacion | src/pages/admin/post-sites/station-detail/components/StationPatrolQR.tsx:376 |
| `station.patrolQr.useStationLocation` | Usar ubicación del puesto | Usar ubicación de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationPatrolQR.tsx:577 |
| `station.rondaHistory.empty` | No hay rondas registradas en este puesto. | No hay rondas registradas en esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationRondaHistory.tsx:748 |
| `station.rondaHistory.hint` | Todas las rondas realizadas en este puesto. Toca una ronda para ver cada punto de control, con foto, nota y ubicación. | Todas las rondas realizadas en esta estación. Toca una ronda para ver cada punto de control, con foto, nota y ubicación. | estacion | src/pages/admin/post-sites/station-detail/components/StationRondaHistory.tsx:730 |
| `station.siteTours.useStationLoc` | Usar ubicación del puesto | Usar ubicación de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationSiteTours.tsx:919 |
| `station.geofence.centerPinTitle` | Ubicación del puesto (arrastra para ajustar) | Ubicación de la estación (arrastra para ajustar) | estacion | src/components/GoogleMap/StationGeofencePolygon.tsx:206 |
| `stations.searchPlaceholder` | Buscar por nominativo, puesto o cliente… | Buscar por nominativo, estación o cliente… | estacion | src/pages/admin/stations/StationsPage.tsx:141 |
| `stations.coverage.onDuty` | Vigilante en puesto | Vigilante en la estación | estacion | src/pages/admin/stations/StationCardsGrid.tsx:137 |
| `stations.coverage.onDutyN` | {{count}} en puesto | {{count}} en la estación | estacion | src/pages/admin/stations/StationCardsGrid.tsx:133 |
| `stations.coverage.uncovered` | Puesto sin cubrir | Estación sin cubrir | estacion | src/pages/admin/stations/StationCardsGrid.tsx:167 |
| `stations.openRondas` | Rondas del puesto | Rondas de la estación | estacion | src/pages/admin/stations/StationCardsGrid.tsx:472 |
| `ui.StationGuards.editarElTurnoTitle` | Editar el turno (plaza, secuencia, fechas) | Editar el turno (puesto, secuencia, fechas) | puesto | src/pages/admin/post-sites/station-detail/components/StationGuards.tsx:851 |
| `ui.StationOverview.noHayInformacionDelPuesto` | No hay información del puesto | No hay información de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:419 |
| `ui.StationOverview.defineLaUbicacionBuscaLa` | Define la ubicación: busca la dirección, usa la del sitio o arrastra el pin. | Define la ubicación: busca la dirección, usa la de la sede o arrastra el pin. | sede | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:615 |
| `ui.StationOverview.configurarPuesto` | Configurar puesto | Configurar la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:1043 |
| `ui.StationOverview.aunNoHayMarcacionesEnEstePuesto` | Aún no hay marcaciones en este puesto. | Aún no hay marcaciones en esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:849 |
| `ui.StationOverview.cadaPlazaConSuCiclo` | Cada plaza con su ciclo | Cada puesto con su ciclo | puesto | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:1184 |
| `ui.StationOverview.editarPuesto` | Editar puesto | Editar estación | estacion | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:830 |
| `ui.StationOverview.sinCoordenadasBusca` | Sin coordenadas — busca la dirección o usa la del sitio. | Sin coordenadas — busca la dirección o usa la de la sede. | sede | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:1317 |
| `ui.StationOverview.cambiarElCicloRehace` | Cambiar el ciclo rehace los turnos futuros; nadie pierde su plaza. | Cambiar el ciclo rehace los turnos futuros; nadie pierde su puesto. | puesto | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:1248 |
| `ui.StationShifts.vigilanteRemovidoDelPuesto` | Vigilante removido del puesto | Vigilante quitado de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationShifts.tsx:746 |
| `ui.StationShifts.unoTrabajaTodosLosDias` | {{nombre}} trabaja todos los días en este puesto | {{nombre}} trabaja todos los días en esta estación | estacion | src/pages/admin/post-sites/station-detail/components/StationShifts.tsx:832 |
| `ui.StationShifts.nTrabajanTodosLosDias` | {{n}} vigilantes trabajan todos los días en este puesto | {{n}} vigilantes trabajan todos los días en esta estación | estacion | src/pages/admin/post-sites/station-detail/components/StationShifts.tsx:836 |
| `ui.StationShifts.puestoSinVigilantes` | Este puesto todavía no tiene vigilantes | Esta estación todavía no tiene vigilantes | estacion | src/pages/admin/post-sites/station-detail/components/StationShifts.tsx:794 |
| `ui.StationGeofencePolygon.buscarDireccionDelPuesto` | Buscar dirección del puesto… | Buscar dirección de la estación… | estacion | src/components/GoogleMap/StationGeofencePolygon.tsx:698 |
| `ui.StationGeofencePolygon.igualQueElSitio` | Igual que el sitio | Igual que la sede | sede | src/components/GoogleMap/StationGeofencePolygon.tsx:712 |
| `ui.StationHero.puestoMovil` | Puesto móvil | Estación móvil | estacion | src/pages/admin/supervisors/SupervisorCoveragePage.tsx:170 |
| `ui.StationHero.puestoRenombrado` | Puesto renombrado | Estación renombrada | estacion | src/pages/admin/post-sites/station-detail/components/StationHero.tsx:147 |
| `ui.StationHero.renombrarPuesto` | Renombrar puesto | Renombrar estación | estacion | src/pages/admin/post-sites/station-detail/components/StationHero.tsx:274 |
| `ui.StationHero.puesto` | Puesto | Estación | estacion | src/pages/admin/post-sites/station-detail/components/StationHero.tsx:101 |
| `ui.StationRoster.equipoDelPuesto` | Equipo del puesto | Equipo de la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationRoster.tsx:129 |
| `ui.StationVisitors.noHayVisitantesRegistradosPara` | No hay visitantes registrados para este puesto. | No hay visitantes registrados para esta estación. | estacion | src/pages/admin/post-sites/station-detail/components/StationVisitors.tsx:1010 |
| `ui.StationSiteTours.elPuesto` | el puesto | la estación | estacion | src/pages/admin/post-sites/station-detail/components/StationSiteTours.tsx:904 |
| `ui.SacafrancoAssignModal.ocupadoEnOtroPuesto` | Ocupado en otro puesto | Ocupado en otra estación | estacion | src/pages/admin/post-sites/station-detail/components/SacafrancoAssignModal.tsx:375 |
| `ui.StationCreateForm.comoTrabajan` | ¿Cómo trabajan los vigilantes de este puesto? | ¿Cómo trabajan los vigilantes de esta estación? | estacion | src/components/stations/StationCreateForm.tsx:1462 |
| `ui.StationCreateForm.cadaPlazaSuCiclo` | Cada plaza con su propio ciclo | Cada puesto con su propio ciclo | puesto | src/components/stations/StationCreateForm.tsx:1509 |
| `ui.StationCreateForm.plazaN` | Plaza {{n}} | Puesto {{n}} | puesto | src/components/stations/StationCreateForm.tsx:1688 |
| `ui.StationCreateForm.ubicacionYGeocercaExplica` | Arrastra el pin al punto exacto del puesto. La línea punteada es el radio de arriba: dentro de ella el vigilante puede marcar entrada. Si dibujas un polígono (3+ puntos), manda el polígono. | Arrastra el pin al punto exacto de la estación. La línea punteada es el radio de arriba: dentro de ella el vigilante puede marcar entrada. Si dibujas un polígono (3+ puntos), manda el polígono. | estacion | src/components/stations/StationCreateForm.tsx:1994 |
| `ui.StationCreateForm.semanalExplica` | Cada vigilante trabaja esos días de la semana, empiece cuando empiece, y el puesto se cubre solo esos días. Un vigilante por plaza, sin sacafranco. | Cada vigilante trabaja esos días de la semana, empiece cuando empiece, y la estación se cubre solo esos días. Un vigilante por puesto, sin sacafranco. | puesto | src/components/stations/StationCreateForm.tsx:1663 |
| `ui.RotationStyleSelect.cadaVigilanteSeQuedaEnLaSuyaTurno` | . Cada vigilante se queda en la suya — al asignarlos, el turno lo decide la plaza que elijas. Abajo sólo queda decidir cada cuántos días libran. | . Cada vigilante se queda en el suyo — al asignarlos, el turno lo decide el puesto que elijas. Abajo sólo queda decidir cada cuántos días libran. | puesto | src/components/schedule/RotationStyleSelect.tsx:640 |
| `ui.RotationStyleSelect.conSegundoTooltip` | Con {{segundo}}: pensado para puestos que alternan dos tramos. | Con {{segundo}}: pensado para estaciones que alternan dos tramos. | estacion | src/components/schedule/RotationStyleSelect.tsx:743 |
| `ui.RotationStyleSelect.elCicloAlternaEntreElTramo` | El ciclo alterna entre el tramo de la plaza y el siguiente. Un | El ciclo alterna entre el tramo del puesto y el siguiente. Un | puesto | src/components/schedule/RotationStyleSelect.tsx:661 |
| `ui.RotationStyleSelect.paraUnPuestoDe24h` | Para un puesto de 24 h con dos fijos: trabaja {{n}} de día, descansa, {{n}} de noche, descansa. | Para una estación de 24 h con dos fijos: trabaja {{n}} de día, descansa, {{n}} de noche, descansa. | estacion | src/components/schedule/RotationStyleSelect.tsx:934 |
| `ui.RotationStyleSelect.seCreaUnaPlazaPorTramo` | Se crea una plaza por tramo ({{n}} en total). Cada vigilante se queda en la suya — al asignarlo, el tramo lo decide la plaza que elijas. Abajo sólo queda decidir cada cuántos días libran. | Se crea un puesto por tramo ({{n}} en total). Cada vigilante se queda en el suyo — al asignarlo, el tramo lo decide el puesto que elijas. Abajo sólo queda decidir cada cuántos días libran. | puesto | src/components/schedule/RotationStyleSelect.tsx:646 |
| `ui.RotationStyleSelect.seCreanDosPlazasEspejo` | Se crean dos plazas con horarios espejo: | Se crean dos puestos con horarios espejo: | puesto | src/components/schedule/RotationStyleSelect.tsx:623 |
| `ui.RotationStyleSelect.sinSegundoTooltip` | Sin {{segundo}}: cada fijo se queda en SU tramo. Úsalo con una plaza por tramo, cada una con sus horas. | Sin {{segundo}}: cada fijo se queda en SU tramo. Úsalo con un puesto por tramo, cada uno con sus horas. | puesto | src/components/schedule/RotationStyleSelect.tsx:738 |
| `ui.RotacionDeLaEstacion.cadaPlazaConSuCiclo` | Cada plaza con su ciclo — uno hace 2 mañanas y 3 tardes, otro 3 y 2. | Cada puesto con su ciclo — uno hace 2 mañanas y 3 tardes, otro 3 y 2. | puesto | src/components/schedule/RotacionDeLaEstacion.tsx:314 |
| `ui.RotacionDeLaEstacion.elCicloDeCadaPlaza` | El ciclo de cada plaza | El ciclo de cada puesto | puesto | src/components/schedule/RotacionDeLaEstacion.tsx:342 |
| `ui.RotacionDeLaEstacion.unSoloCicloParaTodoElPuesto` | Un solo ciclo para todo el puesto. El motor escalona a los vigilantes entre sí. | Un solo ciclo para toda la estación. El motor escalona a los vigilantes entre sí. | estacion | src/components/schedule/RotacionDeLaEstacion.tsx:291 |
| `ui.Organigrama.plazaVacia` | Plaza sin vigilante | Puesto sin vigilante | puesto | src/pages/admin/programmer/OrganigramaView.tsx:758 |
| `ui.Sacafranco.descripcion` | No tiene plaza: cubre los libres de los fijos de las estaciones que marques. El Planificador le coloca los días. | No tiene puesto fijo: cubre los libres de los fijos de las estaciones que marques. El Planificador le coloca los días. | puesto | src/components/schedule/AgregarSacafrancoModal.tsx:156 |
| `ui.CambiarVigilante.descripcion` | {{nombre}} deja {{puesto}}; quien entre hereda su plaza y su ciclo desde la fecha que elijas. | {{nombre}} deja {{puesto}}; quien entre hereda su puesto y su ciclo desde la fecha que elijas. | puesto | src/components/schedule/CambiarVigilanteModal.tsx:95 |
| `ui.eventos.plazas` | Plazas | Puestos | puesto | src/pages/admin/post-sites/station-detail/components/StationOverview.tsx:759 |
| `ui.EventoDeLaEstacion.quitarTexto` | Su plaza queda libre y su turno del evento se borra. | Su puesto queda libre y su turno del evento se borra. | puesto | src/pages/admin/post-sites/station-detail/components/EventoDeLaEstacion.tsx:257 |
| `ui.EventoDeLaEstacion.sinPlazas` | Sin plazas | Sin puestos | puesto | src/pages/admin/post-sites/station-detail/components/EventoDeLaEstacion.tsx:319 |
| `ui.EventoDeLaEstacion.sinPlazasTexto` | Esta estación no tiene plazas. Usa «Cambiar relevos» para decir su horario y cuántos vigilantes van a la vez. | Esta estación no tiene puestos. Usa «Cambiar relevos» para decir su horario y cuántos vigilantes van a la vez. | puesto | src/pages/admin/post-sites/station-detail/components/EventoDeLaEstacion.tsx:315 |
| `ui.EventoDeLaEstacion.cubiertas` | {{cubiertas}} de {{plazas}} plazas cubiertas | {{cubiertas}} de {{plazas}} puestos cubiertos | puesto | src/pages/admin/post-sites/station-detail/components/EventoDeLaEstacion.tsx:334 |
| `ui.ZonasDelEventoMap.resumen` | {{cubiertas}} de {{cupo}} plazas cubiertas | {{cubiertas}} de {{cupo}} puestos cubiertos | puesto | src/components/maps/ZonasDelEventoMap.tsx:551 |
| `ui.ZonasDelEventoMap.h.plazas` | Plazas | Puestos | puesto | src/components/maps/ZonasDelEventoMap.tsx:367 |
| `ui.RelevosDelEvento.motivo.cupoReducido` | su relevo se queda con menos plazas | su relevo se queda con menos puestos | puesto | src/components/stations/RelevosDelEvento.tsx:271 |
| `ui.Patrones.enUso` | {{estaciones}} estaciones · {{plazas}} plazas · {{personas}} personas | {{estaciones}} estaciones · {{plazas}} puestos · {{personas}} personas | puesto | src/pages/admin/Configuration/scheduling/PatronesDeRotacionPage.tsx:182 |
| `ui.Patrones.plazas` | Plazas con este ciclo | Puestos con este ciclo | puesto | src/pages/admin/Configuration/scheduling/PatronesDeRotacionPage.tsx:390 |
| `ui.Requisito.explicacion` | Cuántos vigilantes pide la estación, a qué hora y qué días. Es lo único que define sus plazas: el Horario, Sin cubrir y los informes lo leen de aquí. | Cuántos vigilantes pide la estación, a qué hora y qué días. Es lo único que define sus puestos: el Horario, Sin cubrir y los informes lo leen de aquí. | puesto | src/pages/admin/post-sites/station-detail/components/RequisitoDeLaEstacion.tsx:255 |
| `ui.Requisito.sacafrancosAparte` | Además, {{count}} plaza(s) de sacafranco: cubren descansos y no cuentan en el requisito. | Además, {{count}} puesto(s) de sacafranco: cubren descansos y no cuentan en el requisito. | puesto | src/pages/admin/post-sites/station-detail/components/RequisitoDeLaEstacion.tsx:288 |
| `ui.Requisito.sale` | {{nombre}} deja la estación (su plaza de {{ventana}} desaparece). | {{nombre}} deja la estación (su puesto de {{ventana}} desaparece). | puesto | src/pages/admin/post-sites/station-detail/components/RequisitoDeLaEstacion.tsx:433 |
| `ui.Requisito.plazasNuevas` | {{count}} plaza(s) nueva(s) sin vigilante: saldrán en Sin cubrir. | {{count}} puesto(s) nuevo(s) sin vigilante: saldrán en Sin cubrir. | puesto | src/pages/admin/post-sites/station-detail/components/RequisitoDeLaEstacion.tsx:453 |
| `eventos.fechasLasPoneElEvento` | El vigilante trabaja las horas de su plaza dentro de esas fechas. No hace falta elegir inicio, fin ni ciclo. | El vigilante trabaja las horas de su puesto dentro de esas fechas. No hace falta elegir inicio, fin ni ciclo. | puesto | src/components/post-sites/EventoDeLaSede.tsx:152 |
| `eventos.plaza` | Plaza | Puesto | puesto | src/pages/admin/post-sites/station-detail/components/ShiftAssignModal.tsx:1091 |
| `eventos.eligeOtroVigilante` | Elige a otro vigilante: ese ya está en esta plaza. | Elige a otro vigilante: ese ya está en este puesto. | puesto | src/pages/admin/post-sites/station-detail/components/StationGuards.tsx:479 |
| `eventos.todasLasPlazasCubiertas` | Todas las plazas de este puesto ya están cubiertas. Para cambiar a alguien, usa «Cambiar» en su fila. | Todos los puestos de esta estación ya están cubiertos. Para cambiar a alguien, usa «Cambiar» en su fila. | puesto | src/pages/admin/post-sites/station-detail/components/ShiftAssignModal.tsx:1167 |
| `eventos.plazasCubiertas` | {{n}} de {{total}} plazas cubiertas | {{n}} de {{total}} puestos cubiertos | puesto | src/pages/admin/post-sites/station-detail/components/ShiftAssignModal.tsx:1170 |
| `agregarVarias.lista.ayuda` | Una fila por persona. Columnas: Tipo (vigilante, supervisor u oficina), Nombres, Apellidos, Documento, Celular, Correo, Rol (solo oficina), Puesto (estación o puesto de supervisión) y Empieza. Con la primera fila de títulos, el orden no importa. | Una fila por persona. Columnas: Tipo (vigilante, supervisor u oficina), Nombres, Apellidos, Documento, Celular, Correo, Rol (solo oficina), Puesto (la estación y su puesto, o el puesto de supervisión) y Empieza. Con la primera fila de títulos, el orden no importa. | puesto | src/pages/admin/personal/AgregarVariasPage.tsx:752 |
| `dispatcher.post_site_label` | Puesto | Sede | sede | src/pages/public/DispatchPublicView.tsx:382 |
| `guards.nav.asignarSitios` | Puesto y estaciones | Estación y puesto | estación | pestaña de la ficha del vigilante |

## Claves de pantallas de la otra sesión (mike-0a): solo cambió el valor, no su código

| Clave | Antes | Ahora |
|---|---|---|
| `ui.Schedule.asignarUnVigilanteAEstaPlaza` | Asignar un vigilante a esta plaza | Asignar un vigilante a este puesto |
| `ui.Schedule.cuadranteDiarioSinPlaza` | Cuadrante diario (sin plaza) | Cuadrante diario (sin puesto) |
| `ui.Schedule.elAcompanamientoTieneFinal` | El acompañamiento tiene final: cuando termine, el aprendiz deja de seguir este puesto. Para que se quede, asígnalo a su propia plaza. | El acompañamiento tiene final: cuando termine, el aprendiz deja de seguir este puesto. Para que se quede, asígnalo a su propio puesto. |
| `ui.Schedule.elTurnoSeMueveDeEstacion` | El turno se mueve de estación. Deja de contar como cobertura de su plaza anterior. | El turno se mueve de estación. Deja de contar como cobertura de su puesto anterior. |
| `ui.Schedule.estePuestoTodaviaNoTienePlazas` | Este puesto todavía no tiene plazas. Créalas en el paso 3, eligiendo su jornada. | Esta estación todavía no tiene puestos. Créalos en el paso 3, eligiendo su jornada. |
| `ui.Schedule.esteTurnoLoGeneroLaRotacion` | Este turno lo generó la rotación. El cambio se queda hasta que se reoptimice o se reasigne el puesto; para que no vuelva, corrige las horas de la plaza en la cabecera de la estación. | Este turno lo generó la rotación. El cambio se queda hasta que se reoptimice o se reasigne el puesto; para que no vuelva, corrige las horas del puesto en la cabecera de la estación. |
| `ui.Schedule.estePuestoNoTienePosiciones` | Este puesto no tiene posiciones configuradas | Esta estación no tiene puestos configurados |
| `ui.Schedule.nPlazasSinCubrir` |  · {{count}} plazas sin cubrir |  · {{count}} puestos sin cubrir |
| `ui.Schedule.plaza` | Plaza | Puesto |
| `ui.Schedule.plazas` | Plazas | Puestos |
| `ui.Schedule.ponerAOtroVigilanteEnEstaPlaza` | Poner a otro vigilante en esta plaza | Poner a otro vigilante en este puesto |
| `ui.AllStaff.sinPlazas` | No hay plazas. Crea primero un puesto en la sede. | No hay puestos. Crea primero una estación en la sede. |
| `ui.SinCubrir.tipo.empty_slot` | Plaza vacía | Puesto vacío |
| `ui.SinCubrir.subtitulo` | Faltas, permisos sin reemplazo, plazas vacías y turnos sin vigilante, según el requisito de cada estación. | Faltas, permisos sin reemplazo, puestos vacíos y turnos sin vigilante, según el requisito de cada estación. |
| `ui.Schedule.nPlazasSinCubrir_one` / `_other` | · {{count}} plaza(s) sin cubrir | · {{count}} puesto(s) sin cubrir |

Sus defaults en Schedule.tsx, OpenShifts.tsx y AsignarAPuestoModal.tsx siguen con «plaza»: el texto en pantalla sale de es.json, pero conviene alinearlos.

## Lo que se dejó y por qué

- `ui.Planificador.*` (25 textos con «puesto» = estación): pantalla de la otra sesión y en plena fusión con el Horario; que decidan ellos.
- `ui.Schedule.*` con «puesto» que puede ser estación o puesto según la fila (p. ej. «Agregar puesto», «Editar puesto»): sin ver la pantalla no se puede decidir.
- `ui.MonthStationBlock.editarElPuestoSinRehacer` («Editar el puesto (nombre, horas, plazas)…»): no queda claro si edita la estación o un puesto.
- `reports.card.*` «por Puesto de seguridad» (horas y KPI por estación o por sede): depende del informe del servidor; no tocado.
- `ui.Coverage.*`, despacho, radio, rutas y videovigilancia: fuera del recorrido de alta y horario.
- `comun.seleccionaUnSitio` (sitio relay de video) y `station.siteTours`/rondas con «sitio» genérico: otro significado.
- Las demás lenguas (pt, de, fr, it, nl, pl) no se tocaron.

## Claves con «sitio/plaza/puesto de seguridad» que nadie lee

No se cambiaron. `sidebar.*` solo se lee para los ids del menú (`sidebar.<id>`, `sidebar.<id>.label`, `sidebar.<id>.<sub>`), así que las copias `sidebar.postSites.*`, `sidebar.guards.*`, `sidebar.dispatcher.*`, etc. son restos.

128 claves:

- `clientPostSites.archiveError`
- `clientPostSites.archivedAll`
- `clientPostSites.archivedPartial`
- `clientPostSites.cannotArchiveLinkedGuards`
- `clientPostSites.confirmArchiveDescription`
- `clientPostSites.confirmArchiveTitle`
- `clientPostSites.newPostSite`
- `clientPostSites.searchPlaceholder`
- `clientPostSites.selectAtLeastOne`
- `clientPostSites.headers.postSite`
- `dashboard.page.noToursData`
- `dashboard.page.tours`
- `dashboard.popover.widgets.tours`
- `guards.KPI.new.toasts.clients_sites_load_error`
- `guards.new.toasts.clients_sites_load_error`
- `incidents.filterFields.station`
- `postSites.postesitedeleteconfirm`
- `postSites.postsitedeleted`
- `postSites.postsitedeletedPlural`
- `postSites.postsitedeleteerror`
- `postSites.postsiterestore`
- `postSites.postsiterestoreerror`
- `postSites.postsitesttiledelete`
- `postSites.postsitesttiledeletePlural`
- `postSites.searchPlaceholder`
- `postSites.selectAtLeastOne`
- `postSites.Details.SiteTourTags`
- `postSites.Details.SiteTours`
- `postSites.KPI.guardOnSite`
- `postSites.form.descriptionPlaceholder`
- `postSites.form.siteName`
- `postSites.inventories.usePostsite`
- `postSites.overview.types.siteTour`
- `sidebar.sitios-publicacion`
- `sidebar.analiticas.sitios-publicacion`
- `sidebar.contacts.contactPostSites`
- `sidebar.contacts.form.AssignPostSite`
- `sidebar.dashboard.page.noToursData`
- `sidebar.dashboard.page.tours`
- `sidebar.dashboard.popover.widgets.tours`
- `sidebar.guards.assignSites_no_postsites`
- `sidebar.guards.new.toasts.clients_sites_load_error`
- `sidebar.incidents.filterFields.station`
- `sidebar.parking.espacios`
- `sidebar.postSites.postesitedeleteconfirm`
- `sidebar.postSites.postsitedeleted`
- `sidebar.postSites.postsitedeletedPlural`
- `sidebar.postSites.postsitedeleteerror`
- `sidebar.postSites.postsiterestore`
- `sidebar.postSites.postsiterestoreerror`
- `sidebar.postSites.postsitesttiledelete`
- `sidebar.postSites.postsitesttiledeletePlural`
- `sidebar.postSites.searchPlaceholder`
- `sidebar.postSites.selectAtLeastOne`
- `sidebar.postSites.siteName`
- `sidebar.postSites.Details.SiteTourTags`
- `sidebar.postSites.Details.SiteTours`
- `sidebar.postSites.KPI.guardOnSite`
- `sidebar.postSites.form.descriptionPlaceholder`
- `sidebar.postSites.form.siteName`
- `sidebar.postSites.inventories.usePostsite`
- `sidebar.postSites.overview.types.siteTour`
- `sidebar.postSites.siteTourTag.noGuardsForStation`
- `sidebar.postSites.siteTourTag.empty.message`
- `components.summary.stats.metrics.assignedSites`
- `settings.mobileHub.module_map_desc`
- `ui.PatrullaBoard.paradasSinUbicacion_one`
- `ui.PatrullaBoard.paradasSinUbicacion_other`
- `ui.PatrullaBoard.paradasSinUbicacion_few`
- `ui.PatrullaBoard.paradasSinUbicacion_many`
- `ui.PostSiteDetailsDialog.detallesDelSitio`
- `ui.PostSiteDetailsDialog.informacionDetalladaDelPuestoDeSeguridadSeleccionada`
- `ui.PostSiteDetailsDialog.errorAlCargarDetallesDelSitio`
- `ui.PostSiteWizard.descripcionDelSitio`
- `ui.PostSiteWizard.elSitioFueCreadoPero`
- `ui.PostSiteWizard.puedesAnadirlasAhoraODesde`
- `ui.PostSiteWizard.sitioActualizado`
- `ui.PostSiteWizard.sitioCreadoSinEstaciones`
- `ui.PostSiteWizard.verTodosLosSitios`
- `ui.PostSiteWizard.crearSitio`
- `ui.RouteForm.nParadasSinUbicacionOptimizar_one`
- `ui.RouteForm.nParadasSinUbicacionOptimizar_other`
- `ui.RouteForm.nParadasSinUbicacionOptimizar_few`
- `ui.RouteForm.nParadasSinUbicacionOptimizar_many`
- `ui.RouteForm.nParadasSinUbicacionMapa_one`
- `ui.RouteForm.nParadasSinUbicacionMapa_other`
- `ui.RouteForm.nParadasSinUbicacionMapa_few`
- `ui.RouteForm.nParadasSinUbicacionMapa_many`
- `ui.Schedule.avisoEstilosSacafranco`
- `ui.Schedule.nPlazasSinCubrir_one`
- `ui.Schedule.nPlazasSinCubrir_other`
- `ui.PostSiteImportDialog.sitiosImportados`
- `ui.PostSiteImportDialog.sitiosImportados_one`
- `ui.PostSiteImportDialog.sitiosImportados_other`
- `ui.PostSiteImportDialog.sitiosImportados_few`
- `ui.PostSiteImportDialog.sitiosImportados_many`
- `ui.PostSiteImportDialog.importarSitiosDesdeExcel`
- `ui.Organigrama.plazasSinCubrir_one`
- `ui.Organigrama.plazasSinCubrir_other`
- `ui.MobilPage.serviceTemplateDesc.guard`
- `ui.MobilPage.serviceTemplateDesc.custody`
- `ui.MobilPage.serviceTemplateDesc.firstaid`
- `ui.RondaWizard.pendingPlacement_one`
- `ui.RondaWizard.pendingPlacement_other`
- `ui.runLabels.visitStatus.arrived`
- `ui.runLabels.skipReason.site_inaccessible`
- `ui.eventos.nPlazas_one`
- `ui.eventos.nPlazas_other`
- `ui.EventoDeLaEstacion.plazasLibres_one`
- `ui.EventoDeLaEstacion.plazasLibres_other`
- `ui.EventoDeLaEstacion.asignarTexto_one`
- `ui.EventoDeLaEstacion.asignarTexto_other`
- `ronda.wizard.pendingPlacement`
- `modulosAdicionales.demos.monitoreo.estado.enSitio`
- `modulosAdicionales.demos.monitoreo.plan.titulo`
- `modulosAdicionales.demos.monitoreo.unidad.enSitio`
- `modulosAdicionales.demos.monitoreo.rastro.enSitio`
- `modulosAdicionales.demos.monitoreo.pasos.cola`
- `modulosAdicionales.demos.video.equipos.nvr`
- `modulosAdicionales.demos.video.kpi.sitios`
- `modulosAdicionales.demos.video.incidente.titulo`
- `modulosAdicionales.demos.video.incidente.enSitio`
- `modulosAdicionales.demos.video.sup.enSitio`
- `modulosAdicionales.demos.video.tel.despacho`
- `modulosAdicionales.demos.video.tel.navegar`
- `modulosAdicionales.demos.video.pasos.agrega`
- `modulosAdicionales.demos.video.pasos.relayVivo`
- `modulosAdicionales.demos.video.resultado.conectar`
