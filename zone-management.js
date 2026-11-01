/* =====================================================================
   SmartCity360 - Zone Management (frontend)
   Meka thamai main JS file eka. Dan zone data enne backend API eken.
   Power on/off saha reports wala logic eka thama local sample data walin
   (ewath API walata connect karanna puluwan - passe).
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. API SETTINGS
   --------------------------------------------------------------------- */

// Backend eke base URL eka. Port eka / project name eka wenas unoth mehema wenas karanna.
const API_BASE = "http://localhost:8080/SmartCity360/api";

// Backend eken enne City -> districts -> streets -> buildings widihata.
// Mekedi kiyanne: kisima type ekak (City, District, Street) ekak yata thiyena
// children list eka JSON eke mona key eken enawada kiyala.
// Backend eke field names wenas nam METHANATA wenas karanna.
const CHILD_KEY = { City: "districtList", District: "streetList", Street: "buildingList" };

// Zone ekak yata thiyena next level eka mokakda kiyala.
const NEXT_TYPE = { City: "District", District: "Street", Street: "Building" };

// Backend eken load karapu zones tika methana thiyenawa (modal hari tree hari meken thama read karanne).
// Mulin empty array ekak; loadZones() eken fill wenawa.
let zoneData = [];

/* ---------------------------------------------------------------------
   2. TYPE META (tree eke icon walata)
   --------------------------------------------------------------------- */
const typeMeta = {
  City: { icon: "⌂", singular: "City" },
  District: { icon: "▦", singular: "District" },
  Street: { icon: "⌁", singular: "Street" },
  Building: { icon: "▥", singular: "Building" }
};

/* ---------------------------------------------------------------------
   3. APP STATE
   --------------------------------------------------------------------- */
const state = {
  selectedId: null,        // dan select karala thiyena zone eke id eka
  expanded: new Set(),     // expand karala thiyena zones (loadZones eken fill wenawa)
  pendingAction: null,     // modal eke confirm karanna inna power action eka
  chart: null,             // Chart.js instance eka
  reportGeneration: 0,     // report ekak generate wena welawe duplicate wala nawattanna
  loading: false           // zones load wenawada kiyala
};

/* ---------------------------------------------------------------------
   4. HTML ELEMENTS (id walin ekin eka gannawa)
   --------------------------------------------------------------------- */
const elements = Object.fromEntries([
  "zoneTree", "zoneSearch", "typeFilter", "statusFilter", "visibleCount",
  "totalCities", "totalDistricts", "totalStreets", "totalBuildings", "zonesOn", "zonesOff",
  "selectedZoneName", "selectedZoneSubtitle", "selectedZoneType", "zoneDetails", "powerStatusPill", "powerContent",
  "reportZoneName", "reportZoneType", "reportForm", "startDate", "endDate", "generateReportButton",
  "reportEmpty", "reportResults", "totalConsumption", "reportPeriod", "meterReadingCount",
  "meterBuildingCount", "dailyAverage", "readingRowsCount", "readingsTableBody", "energyChart",
  "confirmationModal", "modalIcon", "modalTitle", "modalDescription", "modalImpactText",
  "confirmPowerButton", "modalCloseButton", "cancelPowerButton", "toastRegion", "mobileMenuButton", "sidebar"
].map(id => [id, document.getElementById(id)]));

/* ---------------------------------------------------------------------
   5. API INTEGRATION (backend eken data gannawa)
   --------------------------------------------------------------------- */

// Backend eken enne raw object ekak. Eka frontend eka use karana widihata (id, name, type, status, meters, children) harawanawa.
// raw  = backend eken awa object eka
// type = "City" / "District" / "Street" / "Building"
function normalizeZone(raw, type) {
  const next = NEXT_TYPE[type]; // Building walata next type ekak nha (undefined)

  // Children tika ganna: mulin CHILD_KEY eken (eg: districts), nathnam "children" kiyala key ekak thiyenawanam eka.
  // Building walata children nathi nisa empty array ekak.
  const kids = next ? (raw[CHILD_KEY[type]] || raw.children || []) : [];

  // Power status eka backend eke mona field eka thiyenawada kiyala nodanna nisa 3k check karanawa.
  // Backend eke field eka "powerOn" (true / false)
  const power = raw.powerOn ?? raw.powerStatus ?? raw.status ?? raw.power;

  return {
    // Type prefix ekak ekka id eka hadanawa. Hethuwa: City id=1 saha District id=1 collide wenna puluwan.
    id: `${type}-${raw.id}`,

    // Backend ekata call karanakota (eg: power on/off) use karanna original id eka meka.
    rawId: raw.id,

    name: raw.name,
    type,

    // true / "ON" nam ON, anith okkoma OFF.
    status: power === true || String(power).toUpperCase() === "ON" ? "ON" : "OFF",

    // Building walata witharak meter count eka. meters array ekak nam eke length eka, nathnam meterCount field eka.
    // Backend eke meters thiyenne "meterList" kiyana array eke
    meters: type === "Building" ? (raw.meterList?.length ?? raw.meters?.length ?? raw.meterCount ?? 0) : 0,

    // Building ekata thiyena meter ID tika (report eke table ekata use karanna)
    meterIds: type === "Building" ? (raw.meterList || []).map(meter => meter.id) : [],

    // Children tikath recursively normalize karanawa.
    children: kids.map(kid => normalizeZone(kid, next))
  };
}

// Backend eken zones okkoma load karanawa.
async function loadZones() {
  state.loading = true;

  const response = await fetch(`${API_BASE}/zones`, {
    headers: { Accept: "application/json" }
  });

  // 404, 500 wage deval awoth error ekak throw karanawa (caller eka catch karanawa)
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Body eka mulin text widihata gannawa (empty nam json() fail wenawa, ethakota hodin error eka pennanna)
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Empty response from /zones (HTTP ${response.status}). Backend eka null / empty body ekak return karanawa wenna puluwan.`);
  }
  const data = JSON.parse(text);

  // Backend eken awe City list ekak. Eka frontend format ekata harawanawa.
  zoneData = data.map(city => normalizeZone(city, "City"));

  // Load unata passe children thiyena okkoma zones expand karala pennanawa.
  state.expanded = new Set(allZones().filter(zone => zone.children.length).map(zone => zone.id));

  // Aluth data ekedi aye select karala thibba zone eka nathi unoth selection eka clear karanawa.
  if (state.selectedId && !getZone(state.selectedId)) {
    state.selectedId = null;
  }

  state.loading = false;
}

/* ---------------------------------------------------------------------
   6. HELPER FUNCTIONS (tree eka walata)
   --------------------------------------------------------------------- */

// Tree eka flat list ekak widihata ganna. Zone ekak ekka eke parent ekath enawa.
const allZones = () => {
  const zones = [];
  const walk = (nodes, parent = null) => nodes.forEach(zone => {
    zones.push({ ...zone, parent });
    walk(zone.children, zone);
  });
  walk(zoneData);
  return zones;
};

// Id eken zone ekak hoyanawa (copy ekak, parent ekath ekka)
const getZone = id => allZones().find(zone => zone.id === id) || null;

// Zone ekak yata thiyena okkoma descendants (children, grandchildren...)
const getChildren = zone => zone.children.flatMap(child => [child, ...getChildren(child)]);

// Zone ekak yata thiyena okkoma buildings (zone eka Building nam eka ekath ekka)
const getBuildings = zone => [zone, ...getChildren(zone)].filter(item => item.type === "Building");

// Zone ekak yata thiyena okkoma meters gana
const getMeterCount = zone => getBuildings(zone).reduce((total, building) => total + building.meters, 0);

// Id eken ORIGINAL zone object eka hoyanawa (copy nemei). Power status wenas karanakota meka use karanawa.
function findZoneReference(id, zones = zoneData) {
  for (const zone of zones) {
    if (zone.id === id) return zone;
    const descendant = findZoneReference(id, zone.children);
    if (descendant) return descendant;
  }
  return null;
}

/* ---------------------------------------------------------------------
   7. SUMMARY CARDS (uda thiyena cards 6)
   --------------------------------------------------------------------- */
function updateSummary() {
  const counts = { City: 0, District: 0, Street: 0, Building: 0, ON: 0, OFF: 0 };

  allZones().forEach(zone => {
    counts[zone.type] += 1;
    counts[zone.status] += 1;
  });

  elements.totalCities.textContent = counts.City;
  elements.totalDistricts.textContent = counts.District;
  elements.totalStreets.textContent = counts.Street;
  elements.totalBuildings.textContent = counts.Building;
  elements.zonesOn.textContent = counts.ON;
  elements.zonesOff.textContent = counts.OFF;
}

/* ---------------------------------------------------------------------
   8. SEARCH & FILTERS
   --------------------------------------------------------------------- */

// Zone ekak dan thiyena search / type / status filters walata match wenawada?
function matchesCurrentFilters(zone) {
  const query = elements.zoneSearch.value.trim().toLocaleLowerCase();
  return zone.name.toLocaleLowerCase().includes(query)
    && (elements.typeFilter.value === "all" || zone.type === elements.typeFilter.value)
    && (elements.statusFilter.value === "all" || zone.status === elements.statusFilter.value);
}

// Zone eka hari eke children walin kenek hari match wenawanam true (ethakota parent ekath tree eke pennanawa)
function filterMatches(zone) {
  return matchesCurrentFilters(zone) || zone.children.some(filterMatches);
}

/* ---------------------------------------------------------------------
   9. TREE RENDER
   --------------------------------------------------------------------- */
function renderTree() {
  // Search ekak hari filter ekak hari dala thiyenawada?
  const hasFilters = elements.zoneSearch.value.trim() || elements.typeFilter.value !== "all" || elements.statusFilter.value !== "all";
  const visibleZones = allZones().filter(matchesCurrentFilters);

  elements.visibleCount.textContent = `${visibleZones.length} ${visibleZones.length === 1 ? "zone" : "zones"}`;

  // Data load wenakota loading message eka pennanawa
  if (state.loading && zoneData.length === 0) {
    elements.zoneTree.innerHTML = '<div class="tree-no-results"><strong>Loading zones...</strong><span>Please wait.</span></div>';
    return;
  }

  // Kisima zone ekak match wenne nathnam "No zones found" kiyala pennanawa
  if (!zoneData.some(filterMatches)) {
    elements.zoneTree.innerHTML = '<div class="tree-no-results"><strong>No zones found</strong><span>Try a different search or filter.</span></div>';
    return;
  }

  elements.zoneTree.innerHTML = zoneData.map(zone => renderNode(zone, 0, hasFilters)).join("");

  // Zone eka click karama select wenna
  elements.zoneTree.querySelectorAll(".zone-select").forEach(button => {
    button.addEventListener("click", () => selectZone(button.dataset.zoneId));
  });

  // Arrow (expand / collapse) button click karama
  elements.zoneTree.querySelectorAll(".tree-toggle:not(.leaf)").forEach(button => {
    button.addEventListener("click", () => {
      const { zoneId } = button.dataset;
      state.expanded.has(zoneId) ? state.expanded.delete(zoneId) : state.expanded.add(zoneId);
      renderTree();
    });
  });
}

// Zone ekak (saha eke children) HTML widihata hadanawa
function renderNode(zone, depth, filtered) {
  // Filter karala thiyenawanam match nowena ewa pennanne na
  if (filtered && !filterMatches(zone)) return "";

  const expandable = zone.children.length > 0;
  const open = filtered || state.expanded.has(zone.id); // filter thiyenakota okkoma open
  const selected = zone.id === state.selectedId;
  const statusClass = zone.status === "OFF" ? "off" : "";

  return `<div class="tree-node" data-type="${zone.type}" role="treeitem" aria-expanded="${expandable ? open : "false"}">
    <div class="tree-node-row${selected ? " selected" : ""}" style="--depth:${depth}">
      <button type="button" class="tree-toggle${expandable ? "" : " leaf"}" data-zone-id="${escapeHtml(zone.id)}" aria-label="${open ? "Collapse" : "Expand"} ${escapeHtml(zone.name)}" ${expandable ? "" : "tabindex=-1"}>${open ? "⌄" : "›"}</button>
      <button type="button" class="zone-select" data-zone-id="${escapeHtml(zone.id)}" aria-selected="${selected}" aria-label="Select ${zone.type}: ${escapeHtml(zone.name)}">
        <span class="zone-icon" aria-hidden="true">${typeMeta[zone.type].icon}</span>
        <span class="zone-copy"><strong>${escapeHtml(zone.name)}</strong><small>${zone.type}</small></span>
        <span class="node-status ${statusClass}"><i class="status-dot ${statusClass}"></i>${zone.status}</span>
      </button>
    </div>
    ${expandable ? `<div class="tree-children${open ? "" : " collapsed"}" role="group">${zone.children.map(child => renderNode(child, depth + 1, filtered)).join("")}</div>` : ""}
  </div>`;
}

// User input / backend data HTML ekata dama gannakota XSS awoid karanna special characters escape karanawa
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

/* ---------------------------------------------------------------------
   10. ZONE SELECT & DETAILS PANEL
   --------------------------------------------------------------------- */
function selectZone(zoneId) {
  const zone = getZone(zoneId);

  if (!zone) {
    showToast("Unable to select zone", "The selected zone is no longer available.", true);
    return;
  }

  state.selectedId = zoneId;
  renderTree();          // selected highlight eka update karanna
  renderDetails(zone);   // details + power controls update karanna

  // Reports section eke "Reporting for" kotasath update karanawa
  elements.reportZoneName.textContent = zone.name;
  elements.reportZoneType.textContent = `${zone.type} · ${getBuildings(zone).length} ${getBuildings(zone).length === 1 ? "building" : "buildings"} included`;
}

function renderDetails(zone) {
  elements.selectedZoneName.textContent = zone.name;
  elements.selectedZoneSubtitle.textContent = `${zone.type} zone · ${getChildren(zone).length} descendant ${getChildren(zone).length === 1 ? "zone" : "zones"}`;
  elements.selectedZoneType.textContent = zone.type;
  elements.selectedZoneType.classList.remove("hidden");

  const buildings = getBuildings(zone).length;
  const childCount = zone.children.length;
  const parentName = zone.parent ? zone.parent.name : "—";

  // [label, value, isId] - isId true nam monospace font eken pennanawa
  const details = [
    ["Zone ID", zone.id, true],
    ["Parent zone", parentName],
    ["Power status", zone.status],
    ["Direct child zones", childCount],
    ["Buildings under zone", buildings],
    ["Meters under zone", getMeterCount(zone)]
  ];

  elements.zoneDetails.innerHTML = details.map(([label, value, isId]) =>
    `<div class="detail-item"><span>${label}</span><strong class="${isId ? "id-value" : ""}">${escapeHtml(value)}</strong></div>`
  ).join("");

  renderPowerControls(zone);
}

/* ---------------------------------------------------------------------
   11. POWER CONTROLS
   --------------------------------------------------------------------- */
function renderPowerControls(zone) {
  const isBuilding = zone.type === "Building";

  // Pill eka (ON = green, OFF = red)
  elements.powerStatusPill.classList.toggle("off", zone.status === "OFF");
  elements.powerStatusPill.querySelector("span").textContent = `Power ${zone.status}`;

  // Building walata power control nathi - message ekak pennanawa
  if (isBuilding) {
    elements.powerContent.innerHTML = `<div class="building-message"><span class="building-message-icon">!</span><div><strong>Building-level power control unavailable</strong><p>Power can only be managed at the City, District, or Street level. Energy reports remain available for ${escapeHtml(zone.name)}. <a href="#reportsSection">View reports ↓</a></p></div></div>`;
    return;
  }

  // City / District / Street walata shutdown & restore buttons
  // Already OFF nam shutdown disable, already ON nam restore disable.
  elements.powerContent.innerHTML = `<div class="power-state-row">
      <div class="power-state-label"><span class="power-state-icon ${zone.status === "OFF" ? "off" : ""}">ϟ</span><span><strong>Current power status</strong><small>${escapeHtml(zone.name)} and its descendant zones</small></span></div>
      <span class="status-pill ${zone.status === "OFF" ? "off" : ""}"><i></i>Power ${zone.status}</span>
    </div>
    <div class="power-buttons">
      <button type="button" class="button button-shutdown" data-power-action="OFF" ${zone.status === "OFF" ? "disabled" : ""}>⏻ &nbsp; Shut down power</button>
      <button type="button" class="button button-restore" data-power-action="ON" ${zone.status === "ON" ? "disabled" : ""}>↻ &nbsp; Restore power</button>
    </div>`;

  elements.powerContent.querySelectorAll("[data-power-action]").forEach(button => {
    button.addEventListener("click", () => openPowerConfirmation(zone, button.dataset.powerAction));
  });
}

// Confirm modal eka open karanawa
function openPowerConfirmation(zone, action) {
  state.pendingAction = { zoneId: zone.id, status: action };

  const isShutdown = action === "OFF";
  const affected = [zone, ...getChildren(zone)]; // meken affect wena okkoma zones

  elements.modalIcon.classList.toggle("restore", !isShutdown);
  elements.modalTitle.textContent = isShutdown ? "Shut down power?" : "Restore power?";
  elements.modalDescription.textContent = `You are about to ${isShutdown ? "shut down" : "restore"} power for ${zone.name} (${zone.type}).`;
  elements.modalImpactText.textContent = `This action will affect ${affected.length} zone${affected.length === 1 ? "" : "s"} including ${getBuildings(zone).length} building${getBuildings(zone).length === 1 ? "" : "s"} under this ${zone.type.toLowerCase()}.`;
  elements.confirmPowerButton.textContent = isShutdown ? "Shut down power" : "Restore power";
  elements.confirmPowerButton.className = `button ${isShutdown ? "button-danger" : "button-primary"}`;
  elements.confirmationModal.classList.remove("hidden");
  elements.confirmPowerButton.focus();
}

function closePowerConfirmation() {
  elements.confirmationModal.classList.add("hidden");
  state.pendingAction = null;
}

// Backend ekata yawana PUT request eke body eka (PowerControlDTO) methanin hadanawa.
// !!! Oyage PowerControlDTO eke field names wenas nam METHANA witharak wenas karanna !!!
function buildPowerPayload(zone, powerOn) {
  return {
    zoneId: zone.rawId,                  // zone eke real id eka (City/District/Street id)
    zoneType: zone.type.toUpperCase(),   // "CITY" / "DISTRICT" / "STREET"
    action: powerOn ? "ON" : "OFF"       // "ON" = restore, "OFF" = shut down
  };
}

// PUT /api/zones ekata request eka yawanawa.
// Backend eka String ("update success") return karanawa nisa json() karanne na, text() widihata gannawa.
async function sendPowerUpdate(zone, powerOn) {
  const response = await fetch(`${API_BASE}/zones`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(buildPowerPayload(zone, powerOn))
  });

  // Backend eke response text eka ("update success" wage)
  let message = "";
  try { message = (await response.text()).trim(); } catch { /* ignore */ }

  // 400 / 404 / 500 wage awoth error eka detail ekka throw karanawa
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${message ? " - " + message : ""}`);
  }
  return message;
}

// Confirm karama: mulin backend ekata PUT karanawa, success unoth thama server eken aye load karala UI eka update karanawa.
async function applyPowerAction() {
  if (!state.pendingAction) return;

  const zone = findZoneReference(state.pendingAction.zoneId);

  // Building walata power control nathi nisa guard ekak
  if (!zone || zone.type === "Building") {
    closePowerConfirmation();
    showToast("Power action unavailable", "Only City, District, and Street zones can be managed.", true);
    return;
  }

  const status = state.pendingAction.status;
  const powerOn = status === "ON";
  const name = zone.name;
  const descendantCount = getChildren(zone).length;

  // Request eka yanakota confirm button eka disable karanawa (double click awoid karanna)
  elements.confirmPowerButton.disabled = true;

  try {
    // 1) Backend ekata PUT request eka
    await sendPowerUpdate(zone, powerOn);

    // 2) Success nam server eken aluth data load karanawa (backend eka children walatath apply karala thiyenna puluwan)
    const expandedBefore = new Set(state.expanded); // expand karala thibba tika mathaka thiyaganna
    await loadZones();
    state.expanded = expandedBefore;

    // 3) UI eka update karanawa
    closePowerConfirmation();
    updateSummary();
    renderTree();
    if (state.selectedId && getZone(state.selectedId)) renderDetails(getZone(state.selectedId));
    showToast(status === "OFF" ? "Power shut down" : "Power restored", `${name} and ${descendantCount} descendant zone${descendantCount === 1 ? "" : "s"} now have power ${status}.`);
  } catch (error) {
    // Backend eka fail unoth UI eka wenas karanne na
    console.error(error);
    state.loading = false; // loadZones() fail unoth loading flag eka reset karanawa
    closePowerConfirmation();
    showToast("Power update failed", error.message || "Could not update power on the server.", true);
  } finally {
    elements.confirmPowerButton.disabled = false;
  }
}

/* ---------------------------------------------------------------------
   12. TOAST (uda wam passe pop-up message)
   --------------------------------------------------------------------- */
function showToast(title, message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.innerHTML = `<span class="toast-icon">${isError ? "!" : "✓"}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4400); // 4.4s passe auto remove
}

/* ---------------------------------------------------------------------
   13. REPORTS - DATE HELPERS
   --------------------------------------------------------------------- */

// Default date range eka: ada saha ihata dina 6k (dina 7k)
function initializeDates() {
  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  elements.startDate.value = formatDate(start);
  elements.endDate.value = formatDate(end);
  elements.endDate.max = formatDate(today); // anagathaye dawas select karanna ba
}

// Date eka YYYY-MM-DD widihata (local timezone eke). Input type=date ekata ona format eka.
function formatDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ---------------------------------------------------------------------
   14. REPORT GENERATION
   --------------------------------------------------------------------- */
// NOTE: Dan report eka SAMPLE (random wage) data walin hadanne.
// Passe Meter / MeterReadingRecod API walin real data aragena buildReport eka replace karanna.
function generateReport(event) {
  event.preventDefault(); // form eka page reload wenna denna epa

  const zone = getZone(state.selectedId);

  if (!zone) {
    showToast("Select a zone first", "Choose any city, district, street, or building to generate its report.", true);
    return;
  }

  const start = new Date(`${elements.startDate.value}T00:00:00`);
  const end = new Date(`${elements.endDate.value}T00:00:00`);

  // Date validation: invalid, nathnam start > end nam error
  if (!elements.startDate.value || !elements.endDate.value || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    showToast("Check the date range", "Enter a valid start date that is on or before the end date.", true);
    return;
  }

  // Dina 365ta wadi range ekak ganna ba
  if ((end - start) / 86400000 > 365) {
    showToast("Date range is too large", "Choose a reporting period of 366 days or fewer.", true);
    return;
  }

  // Loading state eka pennanawa
  const generation = ++state.reportGeneration;
  elements.generateReportButton.disabled = true;
  elements.generateReportButton.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span> Generating...';
  elements.reportResults.classList.add("hidden");
  elements.reportEmpty.classList.remove("hidden");
  elements.reportEmpty.innerHTML = '<span class="report-empty-icon loading-spinner" aria-hidden="true"></span><strong>Preparing your sample report...</strong><span>Gathering simulated meter readings for the selected zone.</span>';

  // 650ms delay eka real API call ekak wage penenna (passe API call ekakin replace karanna)
  window.setTimeout(() => {
    // Ewata passe aye generate karala nam, pitiyen aawa eka ignore karanawa
    if (generation !== state.reportGeneration) return;

    try {
      buildReport(zone, start, end);
      elements.reportEmpty.classList.add("hidden");
      elements.reportResults.classList.remove("hidden");
      showToast("Report generated", `Sample energy usage for ${zone.name} is ready.`);
    } catch (error) {
      console.error("Could not generate the sample energy report.", error);
      elements.reportEmpty.innerHTML = '<span class="report-empty-icon">!</span><strong>Report could not be generated</strong><span>Please try again. Your zone data has not been changed.</span>';
      showToast("Report generation failed", "An unexpected error occurred while preparing the sample report.", true);
    } finally {
      // Success wunath fail wunath button eka aye enable karanawa
      elements.generateReportButton.disabled = false;
      elements.generateReportButton.innerHTML = '<span aria-hidden="true">▤</span> Generate report';
    }
  }, 650);
}

// Report eka hadanawa: summary cards, table, chart
function buildReport(zone, start, end) {
  const buildings = getBuildings(zone);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const labels = [];
  const totals = [];
  const meterIds = new Set();

  // Building ekak ekakata sample consumption / readings hadanawa
  const buildingSummaries = buildings.map((building, index) => {
    const base = 54 + building.meters * 7 + index * 13;
    const consumption = Math.round(base * days * (0.92 + ((building.id.length * 3) % 17) / 100));
    return {
      building,
      consumption,
      readings: building.meters * days,
      // Backend eken awa real meter ID eka (meter nathnam "—")
      meterId: building.meterIds && building.meterIds.length ? building.meterIds.join(", ") : "—"
    };
  });
  buildingSummaries.forEach(item => meterIds.add(item.meterId));

  let total = 0;
  const dayCount = Math.min(days, 31); // chart eke bars 31ta wadi pennanne na

  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(start);
    // Dina 31ta wadi nam dawas samawa wage (evenly) ganna
    date.setDate(start.getDate() + (days > 31 ? Math.round(index * (days - 1) / 30) : index));
    labels.push(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));

    // Dawasaka total eka sample widihata hadanawa
    const dailyTotal = Math.round(buildingSummaries.reduce((sum, item, buildingIndex) =>
      sum + (item.building.meters ? 4.2 + ((index * 7 + buildingIndex * 11 + item.building.id.length) % 34) / 10 : 0), 0));
    totals.push(dailyTotal);
    total += dailyTotal;
  }

  // Dina 31ta wadi nam total eka project karanawa (estimate)
  const projectedTotal = days > dayCount ? Math.round(total * days / dayCount) : total;
  const readingTotal = buildingSummaries.reduce((sum, item) => sum + item.readings, 0);

  // Summary cards fill karanawa
  elements.totalConsumption.textContent = `${projectedTotal.toLocaleString()} kWh`;
  elements.reportPeriod.textContent = `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  elements.meterReadingCount.textContent = readingTotal.toLocaleString();
  elements.meterBuildingCount.textContent = `${meterIds.size} meters · ${buildings.length} ${buildings.length === 1 ? "building" : "buildings"}`;
  elements.dailyAverage.textContent = `${Math.round(projectedTotal / days).toLocaleString()} kWh`;
  elements.readingRowsCount.textContent = `${buildingSummaries.length} ${buildingSummaries.length === 1 ? "building" : "buildings"}`;

  // Table eka fill karanawa
  elements.readingsTableBody.innerHTML = buildingSummaries.length
    ? buildingSummaries.map(item => `<tr><td>${escapeHtml(item.building.name)}</td><td>${escapeHtml(item.meterId)}</td><td>${item.readings.toLocaleString()}</td><td>${item.consumption.toLocaleString()} kWh</td><td><span class="table-status"><i class="status-dot ${item.building.status === "OFF" ? "off" : ""}"></i>${item.building.status === "OFF" ? "Off" : "On"}</span></td></tr>`).join("")
    : '<tr><td colspan="5">No descendant buildings are available for this zone.</td></tr>';

  // Chart.js load wela nathnam error ekak
  if (typeof Chart === "undefined") throw new Error("Chart.js is unavailable.");

  // Kalin chart ekak thiyenawanam destroy karanawa (canvas eka reuse karanna)
  if (state.chart) state.chart.destroy();

  state.chart = new Chart(elements.energyChart, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Energy used",
        data: totals,
        backgroundColor: "#4b86f5",
        hoverBackgroundColor: "#2463eb",
        borderRadius: 4,
        maxBarThickness: 26
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => ` ${context.parsed.y} kWh` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: "#929dae", maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 9 } } },
        y: { beginAtZero: true, border: { display: false, dash: [3, 3] }, grid: { color: "#edf0f5" }, ticks: { color: "#929dae", font: { size: 9 }, padding: 7 } }
      }
    }
  });
}

/* ---------------------------------------------------------------------
   15. MOBILE MENU
   --------------------------------------------------------------------- */
function toggleMobileMenu() {
  const open = elements.sidebar.classList.toggle("mobile-open");
  elements.mobileMenuButton.setAttribute("aria-expanded", String(open));
  elements.mobileMenuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
}

/* ---------------------------------------------------------------------
   16. EVENT LISTENERS
   --------------------------------------------------------------------- */

// Search / filter wenas wenakota tree eka aye render karanawa
elements.zoneSearch.addEventListener("input", renderTree);
elements.typeFilter.addEventListener("change", renderTree);
elements.statusFilter.addEventListener("change", renderTree);

// Expand all: children thiyena okkoma zones open karanawa
document.getElementById("expandAllButton").addEventListener("click", () => {
  allZones().filter(zone => zone.children.length).forEach(zone => state.expanded.add(zone.id));
  renderTree();
});

// Collapse all: okkoma close karanawa
document.getElementById("collapseAllButton").addEventListener("click", () => {
  state.expanded.clear();
  renderTree();
});

// Refresh button: backend eken aye data load karanawa
document.getElementById("refreshButton").addEventListener("click", async () => {
  try {
    await loadZones();
    updateSummary();
    renderTree();
    // Select karala thibba zone eka thama thiyenawanam details aye update karanawa
    if (state.selectedId && getZone(state.selectedId)) renderDetails(getZone(state.selectedId));
    showToast("Zone data refreshed", "Latest zones loaded from the server.");
  } catch (error) {
    console.error(error);
    state.loading = false;
    showToast("Refresh failed", "Could not reach the zones API.", true);
  }
});

// Report form submit
elements.reportForm.addEventListener("submit", generateReport);

// Power modal buttons
elements.confirmPowerButton.addEventListener("click", applyPowerAction);
elements.modalCloseButton.addEventListener("click", closePowerConfirmation);
elements.cancelPowerButton.addEventListener("click", closePowerConfirmation);

// Modal eke backdrop (pitipassen) click karama close wenna
elements.confirmationModal.addEventListener("click", event => {
  if (event.target === elements.confirmationModal) closePowerConfirmation();
});

elements.mobileMenuButton.addEventListener("click", toggleMobileMenu);

// Keyboard shortcuts
document.addEventListener("keydown", event => {
  // Esc: modal eka saha mobile menu eka close karanawa
  if (event.key === "Escape") {
    closePowerConfirmation();
    elements.sidebar.classList.remove("mobile-open");
    elements.mobileMenuButton.setAttribute("aria-expanded", "false");
  }

  // "/" : search box ekata focus karanawa (wena input ekak focus wela nathnam witharai)
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.zoneSearch.focus();
  }
});

/* ---------------------------------------------------------------------
   17. APP START (page eka load wenakota meka run wenawa)
   --------------------------------------------------------------------- */
initializeDates();

// Mulin "Loading zones..." pennanna
state.loading = true;
updateSummary();
renderTree();

// Backend eken data load karanawa
loadZones()
  .catch(error => {
    // Backend run wenne nathnam / CORS problem ekak nam methanata enawa
    console.error(error);
    state.loading = false;
    showToast("Could not load zones", "Check that the backend is running and CORS is enabled.", true);
  })
  .finally(() => {
    // Success wunath fail wunath UI eka update karanawa
    updateSummary();
    renderTree();
  });