function createDefaultFilters() {
  return {
    search: "",
    profitability: "ALL",
    mode: "ALL",
    floor: "ALL",
    type: "ALL",
    sort: "room_no_asc",
  };
}

const state = {
  bootstrap: null,
  overview: null,
  year: null,
  selectedRoomId: null,
  filters: createDefaultFilters(),
  filtersPanelOpen: false,
  expandedFloors: new Set(),
};

const el = {
  propertyName: document.querySelector("#propertyName"),
  periodLabel: document.querySelector("#periodLabel"),
  filterToggleButton: document.querySelector("#filterToggleButton"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  refreshButton: document.querySelector("#refreshButton"),
  setupBanner: document.querySelector("#setupBanner"),
  summaryGrid: document.querySelector(".summary-grid"),
  toolbarCard: document.querySelector(".toolbar-card"),
  advancedFilters: document.querySelector("#advancedFilters"),
  secondaryInsights: document.querySelector("#secondaryInsights"),
  totalRevenue: document.querySelector("#totalRevenue"),
  totalFixedCost: document.querySelector("#totalFixedCost"),
  grossProfit: document.querySelector("#grossProfit"),
  profitabilityTag: document.querySelector("#profitabilityTag"),
  profitableRooms: document.querySelector("#profitableRooms"),
  lossRooms: document.querySelector("#lossRooms"),
  dailyRevenue: document.querySelector("#dailyRevenue"),
  shortStayRevenue: document.querySelector("#shortStayRevenue"),
  longStayRevenue: document.querySelector("#longStayRevenue"),
  bestWorst: document.querySelector("#bestWorst"),
  bestWorstMeta: document.querySelector("#bestWorstMeta"),
  roomSearch: document.querySelector("#roomSearch"),
  profitFilters: document.querySelector("#profitFilters"),
  modeFilters: document.querySelector("#modeFilters"),
  floorSelect: document.querySelector("#floorSelect"),
  typeFilters: document.querySelector("#typeFilters"),
  sortSelect: document.querySelector("#sortSelect"),
  roomListMeta: document.querySelector("#roomListMeta"),
  tableHead: document.querySelector(".table-head"),
  roomList: document.querySelector("#roomList"),
  detailDrawer: document.querySelector("#detailDrawer"),
  drawerClose: document.querySelector("#drawerClose"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerSubtitle: document.querySelector("#drawerSubtitle"),
  drawerContent: document.querySelector("#drawerContent"),
};

const costFieldConfig = [
  { key: "rent", label: "月租成本" },
  { key: "propertyFee", label: "月物业费" },
  { key: "cleaning", label: "月保洁费" },
  { key: "maintenance", label: "月维修费" },
  { key: "utility", label: "月水电杂费" },
  { key: "other", label: "月其他费用" },
];

const profitabilityFilters = [
  { value: "ALL", label: "全部" },
  { value: "PROFIT", label: "盈利" },
  { value: "LOSS", label: "亏损" },
  { value: "THIN", label: "薄利" },
];

const modeFilters = [
  { value: "ALL", label: "全部" },
  { value: "MIXED", label: "混合" },
  { value: "DAILY", label: "日租" },
  { value: "SHORT_STAY", label: "短租" },
  { value: "LONG_STAY", label: "长租" },
  { value: "IDLE", label: "空置" },
];

const sortLabels = {
  room_no_asc: "按楼层 / 房号",
  floor_desc: "高楼层优先",
  gross_profit_desc: "毛利最高优先",
  gross_profit_asc: "毛亏风险优先",
  revenue_desc: "收益最高优先",
  margin_desc: "毛利率最高优先",
};

function isBlankBaseline(summary) {
  return (
    summary.totalRevenue === 0 &&
    summary.totalFixedCost === 0 &&
    summary.grossProfit === 0 &&
    summary.profitableRooms === 0 &&
    summary.lossRooms === 0
  );
}

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data;
}

function initialYear() {
  const search = new URLSearchParams(window.location.search);
  const year = Number(search.get("year"));
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

function initialRoomQuery() {
  const search = new URLSearchParams(window.location.search);
  return search.get("room");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatSignedCurrency(value) {
  if (value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatPercent(value) {
  if (value === null) {
    return "当前无可计算毛利率";
  }

  return `毛利率 ${(value * 100).toFixed(1)}%`;
}

function formatArea(value) {
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}㎡`;
}

function formatMoneyInput(value) {
  return (value / 100).toFixed(2);
}

function parseMoneyInput(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function floorNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareFloorAsc(left, right) {
  return floorNumber(left) - floorNumber(right);
}

function compareFloorDesc(left, right) {
  return floorNumber(right) - floorNumber(left);
}

function formatRoomStatus(status) {
  return {
    VACANT_CLEAN: "空净",
    VACANT_DIRTY: "脏房",
    OCCUPIED: "在住",
    INSPECTING: "待查房",
    MAINTENANCE: "维修中",
    OUT_OF_SERVICE: "停用",
  }[status] ?? status;
}

function formatSellableStatus(status) {
  return {
    SELLABLE: "可售",
    UNSELLABLE: "不可售",
    BLOCKED: "封房",
    HIDDEN: "隐藏",
  }[status] ?? status;
}

function formatMode(mode) {
  return {
    DAILY: "日租",
    SHORT_STAY: "短租",
    LONG_STAY: "长租",
    IDLE: "空置",
    MIXED: "混合",
  }[mode] ?? mode;
}

function modeClass(mode) {
  return {
    DAILY: "daily",
    SHORT_STAY: "short",
    LONG_STAY: "long",
    IDLE: "idle",
    MIXED: "mixed",
  }[mode] ?? "idle";
}

function roomMixSummary(mixSummary) {
  const parts = [];

  if (mixSummary.dailyMonths > 0) {
    parts.push(`日租 ${mixSummary.dailyMonths} 个月`);
  }
  if (mixSummary.shortStayMonths > 0) {
    parts.push(`短租 ${mixSummary.shortStayMonths} 个月`);
  }
  if (mixSummary.longStayMonths > 0) {
    parts.push(`长租 ${mixSummary.longStayMonths} 个月`);
  }
  if (mixSummary.idleMonths > 0) {
    parts.push(`空置 ${mixSummary.idleMonths} 个月`);
  }

  return parts.join(" · ") || "暂无经营记录";
}

function monthStripMarkup(monthMix) {
  return monthMix
    .map(
      (item) => `
        <div class="month-pill ${modeClass(item.mode)}" title="${item.month}月 ${formatMode(item.mode)} ${item.revenue > 0 ? formatCurrency(item.revenue) : "无收益"}">
          <span>${item.month}</span>
        </div>
      `,
    )
    .join("");
}

function timelineMarkup(monthMix) {
  return monthMix
    .map(
      (item) => `
        <div class="timeline-cell ${modeClass(item.mode)}">
          <strong>${item.month}月</strong>
          <span>${formatMode(item.mode)}</span>
          <span>${item.revenue > 0 ? formatCurrency(item.revenue) : "无收益"}</span>
        </div>
      `,
    )
    .join("");
}

function revenueCard(room) {
  return `
    <section class="detail-card">
      <h4>收益端</h4>
      <div class="line-list">
        <div class="line-item"><span>全年总收益</span><strong>${formatCurrency(room.revenue.total)}</strong></div>
        <div class="line-item"><span>日租收益</span><strong>${formatCurrency(room.revenue.byMode.DAILY)}</strong></div>
        <div class="line-item"><span>短租收益</span><strong>${formatCurrency(room.revenue.byMode.SHORT_STAY)}</strong></div>
        <div class="line-item"><span>长租收益</span><strong>${formatCurrency(room.revenue.byMode.LONG_STAY)}</strong></div>
        <div class="line-item"><span>入住夜数</span><strong>${room.revenue.occupiedNights} 晚</strong></div>
        <div class="line-item"><span>月均收益</span><strong>${formatCurrency(room.revenue.averagePerMonth)}</strong></div>
      </div>
    </section>
  `;
}

function costCard(room) {
  return `
    <section class="detail-card">
      <h4>成本端</h4>
      <div class="line-list">
        <div class="line-item"><span>月租成本</span><strong>${formatCurrency(room.monthlyCost.rent)}</strong></div>
        <div class="line-item"><span>月物业费</span><strong>${formatCurrency(room.monthlyCost.propertyFee)}</strong></div>
        <div class="line-item"><span>月保洁费</span><strong>${formatCurrency(room.monthlyCost.cleaning)}</strong></div>
        <div class="line-item"><span>月维修费</span><strong>${formatCurrency(room.monthlyCost.maintenance)}</strong></div>
        <div class="line-item"><span>月水电杂费</span><strong>${formatCurrency(room.monthlyCost.utility)}</strong></div>
        <div class="line-item"><span>月其他费用</span><strong>${formatCurrency(room.monthlyCost.other)}</strong></div>
        <div class="line-item"><span>全年固定成本</span><strong>${formatCurrency(room.fixedCost)}</strong></div>
      </div>
      <div class="mix-row">
        <div class="mix-chip">
          <span class="mix-label">经营结构</span>
          <strong>${roomMixSummary(room.mixSummary)}</strong>
        </div>
        <div class="mix-chip">
          <span class="mix-label">结果判断</span>
          <strong>${room.profitability.status === "PROFIT" ? "赚钱" : "亏损"}</strong>
        </div>
      </div>
    </section>
  `;
}

function costEditorCard(room) {
  const fields = costFieldConfig.map((field) => `
    <label class="cost-editor-field">
      <span>${field.label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        name="${field.key}"
        value="${formatMoneyInput(room.monthlyCost[field.key])}"
      />
    </label>
  `).join("");

  return `
    <section class="detail-card cost-editor-card">
      <div class="cost-editor-header">
        <div>
          <h4>成本录入</h4>
          <p class="cost-editor-copy">按房间维护真实月成本，保存后会重新计算固定成本、毛利和盈利/亏损。</p>
        </div>
        <span class="cost-editor-hint">金额单位：元 / 月</span>
      </div>
      <form class="cost-editor-form" data-room-id="${room.roomId}">
        <div class="cost-editor-grid">
          ${fields}
        </div>
        <label class="cost-editor-field cost-editor-notes">
          <span>备注</span>
          <textarea name="notes" rows="3" placeholder="例如：业主自行承担保洁，物业费按季度分摊">${room.notes ?? ""}</textarea>
        </label>
        <div class="cost-editor-actions">
          <button type="submit" class="refresh-button cost-save-button">保存成本</button>
        </div>
      </form>
    </section>
  `;
}

function profitabilityGrade(room) {
  const margin = room.profitability.margin ?? 0;
  if (room.revenue.total === 0 && room.fixedCost === 0) {
    return { label: "待录入", className: "grade-watch" };
  }
  if (room.profitability.grossProfit < 0) {
    return { label: "风险", className: "grade-risk" };
  }
  if (room.profitability.grossProfit === 0) {
    return { label: "持平", className: "grade-watch" };
  }
  if (margin >= 0.35) {
    return { label: "A级", className: "grade-a" };
  }
  if (margin >= 0.2) {
    return { label: "B级", className: "grade-b" };
  }
  if (margin >= 0.1) {
    return { label: "C级", className: "grade-c" };
  }
  return { label: "观察", className: "grade-watch" };
}

function dominantMode(room) {
  const candidates = [
    ["DAILY", room.mixSummary.dailyMonths],
    ["SHORT_STAY", room.mixSummary.shortStayMonths],
    ["LONG_STAY", room.mixSummary.longStayMonths],
  ];

  const active = candidates.filter(([, count]) => count > 0);
  if (active.length === 0) {
    return "IDLE";
  }
  if (active.length > 1) {
    return "MIXED";
  }
  return active[0][0];
}

function isThinMargin(room) {
  return room.profitability.grossProfit >= 0 && (room.profitability.margin ?? 0) < 0.12;
}

function detailMarkup(room) {
  const profitClass =
    room.profitability.status === "PROFIT"
      ? "profit"
      : room.profitability.status === "LOSS"
        ? "loss"
        : "neutral";
  const grade = profitabilityGrade(room);
  const profitDescription =
    room.profitability.status === "PROFIT"
      ? "本房间已经覆盖固定成本"
      : room.profitability.status === "LOSS"
        ? "本房间尚未覆盖固定成本"
        : room.revenue.total === 0 && room.fixedCost === 0
          ? "当前尚未录入收益和成本"
          : "本房间当前处于盈亏持平";

  return `
    <section class="drawer-hero">
      <div class="drawer-hero-main">
        <div class="drawer-room-title">
          <span class="drawer-room-no">${room.roomNo}</span>
          <span class="pill">${room.roomType}</span>
          <span class="grade-chip ${grade.className}">${grade.label}</span>
        </div>
        <p class="drawer-room-meta">${room.floor}层 · ${formatArea(room.areaSqm)} · ${formatRoomStatus(room.roomStatus)} · ${formatSellableStatus(room.sellableStatus)}</p>
        <p class="drawer-room-meta">${roomMixSummary(room.mixSummary)}</p>
        ${room.notes ? `<p class="drawer-room-note">${room.notes}</p>` : ""}
      </div>

      <div class="profit-box ${profitClass}">
        <span>年度毛利</span>
        <strong>${formatSignedCurrency(room.profitability.grossProfit)}</strong>
        <span>${formatPercent(room.profitability.margin)}</span>
        <span>${profitDescription}</span>
      </div>
    </section>

    <section class="drawer-section">
      <p class="timeline-caption">12 个月经营模式与已确认收益</p>
      <div class="timeline">
        ${timelineMarkup(room.monthMix)}
      </div>
    </section>

    <section class="drawer-grid">
      ${revenueCard(room)}
      ${costCard(room)}
    </section>

    ${costEditorCard(room)}
  `;
}

function renderHeader() {
  const { property, period, summary } = state.overview;
  const blankBaseline = isBlankBaseline(summary);
  const tone = summary.grossProfit >= 0 ? "整体盈利" : "整体亏损";

  document.title = property.name;
  el.propertyName.textContent = property.name;
  el.periodLabel.textContent =
    blankBaseline
      ? `${period.label} · 当前还没有录入任何收益或成本，先从楼层开始。`
      : `${period.label} · ${tone} ${formatCurrency(Math.abs(summary.grossProfit))} · 按楼层展开查看每间房的收益、固定成本和利润。`;
}

function setSummaryTone(summary) {
  const grossProfitCard = el.grossProfit.closest(".summary-card");
  grossProfitCard.classList.toggle("profit", summary.grossProfit > 0);
  grossProfitCard.classList.toggle("loss", summary.grossProfit < 0);
  grossProfitCard.classList.toggle("neutral", summary.grossProfit === 0);
}

function renderSummary() {
  const { summary } = state.overview;
  const blankBaseline = isBlankBaseline(summary);

  el.totalRevenue.textContent = formatCurrency(summary.totalRevenue);
  el.totalFixedCost.textContent = formatCurrency(summary.totalFixedCost);
  el.grossProfit.textContent = formatSignedCurrency(summary.grossProfit);
  el.profitabilityTag.textContent =
    summary.totalRevenue === 0 && summary.totalFixedCost === 0
      ? "等待录入收益和成本"
      : summary.grossProfit > 0
      ? "本期整体已覆盖固定成本"
      : summary.grossProfit < 0
        ? "本期整体仍未覆盖固定成本"
        : "本期整体盈亏持平";
  el.profitableRooms.textContent = `${summary.profitableRooms} 间`;
  el.lossRooms.textContent = `亏损房间 ${summary.lossRooms} 间`;
  el.dailyRevenue.textContent = formatCurrency(summary.revenueByMode.DAILY);
  el.shortStayRevenue.textContent = formatCurrency(summary.revenueByMode.SHORT_STAY);
  el.longStayRevenue.textContent = formatCurrency(summary.revenueByMode.LONG_STAY);
  el.bestWorst.textContent = summary.bestRoom
    ? `${summary.bestRoom.roomNo} / ${summary.worstRoom?.roomNo ?? "--"}`
    : "--";
  el.bestWorstMeta.textContent = summary.bestRoom
    ? `最佳 ${formatSignedCurrency(summary.bestRoom.grossProfit)} · 最弱 ${formatSignedCurrency(summary.worstRoom?.grossProfit ?? 0)}`
    : "暂无经营表现数据";

  el.setupBanner.hidden = !blankBaseline;
  el.summaryGrid.hidden = blankBaseline;
  el.secondaryInsights.hidden = blankBaseline;
  el.toolbarCard.classList.toggle("compact", blankBaseline && !state.filtersPanelOpen);
  setSummaryTone(summary);
}

function renderChipGroup(target, items, activeValue, onSelect) {
  target.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="filter-chip ${item.value === activeValue ? "active" : ""}" data-value="${item.value}">
          ${item.label}
        </button>
      `,
    )
    .join("");

  target.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => onSelect(chip.dataset.value));
  });
}

function renderControls() {
  const roomTypes = ["ALL", ...new Set(state.overview.rooms.map((room) => room.roomType))];
  const floors = [...new Set(state.overview.rooms.map((room) => room.floor))]
    .sort(compareFloorDesc);

  renderChipGroup(el.profitFilters, profitabilityFilters, state.filters.profitability, (value) => {
    state.filters.profitability = value;
    renderControls();
    renderLedger();
  });
  renderChipGroup(el.modeFilters, modeFilters, state.filters.mode, (value) => {
    state.filters.mode = value;
    renderControls();
    renderLedger();
  });
  renderChipGroup(
    el.typeFilters,
    roomTypes.map((type) => ({ value: type, label: type === "ALL" ? "全部" : type })),
    state.filters.type,
    (value) => {
      state.filters.type = value;
      renderControls();
      renderLedger();
    },
  );

  el.floorSelect.innerHTML = [
    `<option value="ALL">全部楼层</option>`,
    ...floors.map((floor) => `<option value="${floor}">${floor}层</option>`),
  ].join("");

  el.roomSearch.value = state.filters.search;
  el.floorSelect.value = floors.includes(state.filters.floor) ? state.filters.floor : "ALL";
  el.sortSelect.value = state.filters.sort;
  el.advancedFilters.hidden = !state.filtersPanelOpen;
  el.filterToggleButton.textContent = state.filtersPanelOpen ? "收起筛选" : "更多筛选";
}

function renderWatchPanel() {
  const rooms = state.overview.rooms;
  const lossCount = rooms.filter((room) => room.profitability.grossProfit < 0).length;
  const idleCount = rooms.filter((room) => room.mixSummary.idleMonths > 0).length;
  const thinCount = rooms.filter(isThinMargin).length;
  const mixedCount = rooms.filter((room) => dominantMode(room) === "MIXED").length;

  el.watchLoss.textContent = `${lossCount} 间`;
  el.watchIdle.textContent = `${idleCount} 间`;
  el.watchThin.textContent = `${thinCount} 间`;
  el.watchMixed.textContent = `${mixedCount} 间`;

  const best = state.overview.summary.bestRoom;
  const worst = state.overview.summary.worstRoom;
  el.watchNote.textContent = best && worst
    ? `当前最强房间是 ${best.roomNo}，最弱房间是 ${worst.roomNo}。建议优先筛出亏损和薄利房查看详情。`
    : "当前暂无经营提示。";
}

function roomMatchesFilters(room) {
  const query = state.filters.search.trim().toLowerCase();
  if (query) {
    const haystack = [room.roomNo, room.floor, room.roomType, String(room.areaSqm), roomMixSummary(room.mixSummary)]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (state.filters.type !== "ALL" && room.roomType !== state.filters.type) {
    return false;
  }

  if (state.filters.floor !== "ALL" && room.floor !== state.filters.floor) {
    return false;
  }

  if (state.filters.profitability === "PROFIT" && room.profitability.grossProfit <= 0) {
    return false;
  }
  if (state.filters.profitability === "LOSS" && room.profitability.grossProfit >= 0) {
    return false;
  }
  if (state.filters.profitability === "THIN" && !isThinMargin(room)) {
    return false;
  }

  const mode = dominantMode(room);
  if (state.filters.mode !== "ALL" && mode !== state.filters.mode) {
    return false;
  }

  return true;
}

function compareRooms(left, right) {
  switch (state.filters.sort) {
    case "floor_desc": {
      const floorDelta = compareFloorDesc(left.floor, right.floor);
      if (floorDelta !== 0) {
        return floorDelta;
      }
      return left.roomNo.localeCompare(right.roomNo, "zh-CN", { numeric: true });
    }
    case "gross_profit_desc":
      return right.profitability.grossProfit - left.profitability.grossProfit;
    case "gross_profit_asc":
      return left.profitability.grossProfit - right.profitability.grossProfit;
    case "revenue_desc":
      return right.revenue.total - left.revenue.total;
    case "margin_desc":
      return (right.profitability.margin ?? -1) - (left.profitability.margin ?? -1);
    default:
      return compareFloorDesc(left.floor, right.floor) ||
        left.roomNo.localeCompare(right.roomNo, "zh-CN", { numeric: true });
  }
}

function visibleRooms() {
  return state.overview.rooms.filter(roomMatchesFilters).sort(compareRooms);
}

function shouldGroupByFloor() {
  return state.filters.sort === "room_no_asc" || state.filters.sort === "floor_desc";
}

function syncExpandedFloors(floors) {
  const visibleFloors = new Set(floors);
  state.expandedFloors = new Set(
    [...state.expandedFloors].filter((floor) => visibleFloors.has(floor)),
  );

  if (state.filters.floor !== "ALL" && visibleFloors.has(state.filters.floor)) {
    state.expandedFloors = new Set([state.filters.floor]);
  }
}

function toggleFloor(floor) {
  if (state.expandedFloors.has(floor)) {
    state.expandedFloors.delete(floor);
  } else {
    state.expandedFloors.add(floor);
  }
  renderLedger();
}

function floorSectionMarkup(floor, rooms, expanded) {
  const totalRevenue = rooms.reduce((sum, room) => sum + room.revenue.total, 0);
  const totalGrossProfit = rooms.reduce((sum, room) => sum + room.profitability.grossProfit, 0);
  const blankFloor = totalRevenue === 0 && totalGrossProfit === 0;

  return `
    <section class="floor-section ${expanded ? "expanded" : "collapsed"}">
      <button
        type="button"
        class="floor-section-toggle"
        data-floor="${floor}"
        aria-expanded="${expanded ? "true" : "false"}"
      >
        <div class="floor-section-leading">
          <div class="floor-section-title">${floor}层</div>
          <div class="floor-section-count">${rooms.length} 套</div>
        </div>
        <div class="floor-section-summary">
          ${blankFloor
            ? `<span class="floor-section-note">未录入收益和成本</span>`
            : `<span>收益 ${formatCurrency(totalRevenue)}</span><span>毛利 ${formatSignedCurrency(totalGrossProfit)}</span>`}
          <span class="floor-section-action">${expanded ? "收起" : "展开"}</span>
        </div>
      </button>
      <div class="floor-section-rows" ${expanded ? "" : "hidden"}>
        ${rooms.map(rowMarkup).join("")}
      </div>
    </section>
  `;
}

function rowMarkup(room) {
  const profitClass =
    room.profitability.status === "PROFIT"
      ? "profit"
      : room.profitability.status === "LOSS"
        ? "loss"
        : "neutral";
  const rowTone =
    room.profitability.status === "PROFIT"
      ? "row-profit"
      : room.profitability.status === "LOSS"
        ? "row-loss"
        : "row-neutral";
  const grade = profitabilityGrade(room);

  return `
    <button type="button" class="room-row ${rowTone}" data-room-id="${room.roomId}">
      <div class="room-cell room-id-cell">
        <div class="room-no-line">
          <span class="room-no room-link">${room.roomNo}</span>
          <span class="pill">${room.roomType}</span>
          <span class="grade-chip ${grade.className}">${grade.label}</span>
        </div>
        <div class="room-asset-line">
          <span>${room.floor}层</span>
          <span>${formatArea(room.areaSqm)}</span>
        </div>
        <div class="room-status-line">
          <span class="status-pill room-status-pill">${formatRoomStatus(room.roomStatus)}</span>
          <span class="status-pill sellable-pill">${formatSellableStatus(room.sellableStatus)}</span>
        </div>
      </div>

      <div class="room-cell room-mix-cell">
        <span class="cell-label">经营结构</span>
        <strong>${roomMixSummary(room.mixSummary)}</strong>
        <div class="month-strip">${monthStripMarkup(room.monthMix)}</div>
      </div>

      <div class="room-cell">
        <span class="cell-label">全年收益</span>
        <strong>${formatCurrency(room.revenue.total)}</strong>
      </div>

      <div class="room-cell">
        <span class="cell-label">固定成本</span>
        <strong>${formatCurrency(room.fixedCost)}</strong>
      </div>

      <div class="room-cell profit-cell ${profitClass}">
        <span class="cell-label">毛利 / 毛亏</span>
        <strong>${formatSignedCurrency(room.profitability.grossProfit)}</strong>
        <span class="profit-note">${formatPercent(room.profitability.margin)}</span>
      </div>

      <div class="room-cell room-action-cell">
        <span class="room-open-hint">详情</span>
      </div>
    </button>
  `;
}

function renderLedger() {
  const rooms = visibleRooms();
  const floorLabel = state.filters.floor === "ALL" ? "全部楼层" : `${state.filters.floor}层`;
  el.roomListMeta.textContent =
    `显示 ${rooms.length} / ${state.overview.rooms.length} 间 · ${floorLabel} · ${sortLabels[state.filters.sort]}`;

  if (!rooms.length) {
    el.tableHead.hidden = true;
    el.roomList.innerHTML = `
      <div class="empty-state">
        当前筛选条件下没有匹配的房间，请调整搜索或筛选条件。
      </div>
    `;
    return;
  }

  if (shouldGroupByFloor()) {
    const sections = [];
    const roomMap = new Map();

    for (const room of rooms) {
      if (!roomMap.has(room.floor)) {
        roomMap.set(room.floor, []);
        sections.push(room.floor);
      }
      roomMap.get(room.floor).push(room);
    }

    syncExpandedFloors(sections);
    const hasExpandedFloor = sections.some((floor) => state.expandedFloors.has(floor));
    el.tableHead.hidden = !hasExpandedFloor;
    el.roomList.innerHTML = sections
      .map((floor) => floorSectionMarkup(floor, roomMap.get(floor), state.expandedFloors.has(floor)))
      .join("");
  } else {
    el.tableHead.hidden = false;
    el.roomList.innerHTML = rooms.map(rowMarkup).join("");
  }

  el.roomList.querySelectorAll(".floor-section-toggle").forEach((node) => {
    node.addEventListener("click", () => toggleFloor(node.dataset.floor));
  });

  el.roomList.querySelectorAll(".room-row").forEach((node) => {
    node.addEventListener("click", () => openDrawer(node.dataset.roomId));
  });
}

function openDrawer(roomId) {
  const room = state.overview?.rooms.find((item) => item.roomId === roomId);
  if (!room) {
    return;
  }

  state.selectedRoomId = roomId;
  el.drawerTitle.textContent = `${room.roomNo} 房间详情`;
  el.drawerSubtitle.textContent = "完整查看这套房的收益端、成本端和 12 个月经营结构。";
  el.drawerContent.innerHTML = detailMarkup(room);
  el.detailDrawer.classList.add("open");
  el.detailDrawer.setAttribute("aria-hidden", "false");

  const url = new URL(window.location.href);
  url.searchParams.set("room", room.roomNo);
  window.history.replaceState({}, "", url);
}

async function saveRoomCostProfile(form) {
  const roomId = form.dataset.roomId;
  const formData = new FormData(form);
  const payload = {
    monthly_rent_cost: parseMoneyInput(String(formData.get("rent") ?? "")),
    monthly_property_fee_cost: parseMoneyInput(String(formData.get("propertyFee") ?? "")),
    monthly_cleaning_cost: parseMoneyInput(String(formData.get("cleaning") ?? "")),
    monthly_maintenance_cost: parseMoneyInput(String(formData.get("maintenance") ?? "")),
    monthly_utility_cost: parseMoneyInput(String(formData.get("utility") ?? "")),
    monthly_other_cost: parseMoneyInput(String(formData.get("other") ?? "")),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  if (Object.values(payload).some((value) => value === null)) {
    throw new Error("成本金额必须是大于等于 0 的数字");
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "保存中...";

  try {
    const response = await fetch(`/api/v1/rooms/${roomId}/cost-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }

    await loadOverview();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "保存成本";
  }
}

function closeDrawer() {
  el.detailDrawer.classList.remove("open");
  el.detailDrawer.setAttribute("aria-hidden", "true");
  state.selectedRoomId = null;

  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

function bindControls() {
  el.filterToggleButton.addEventListener("click", () => {
    state.filtersPanelOpen = !state.filtersPanelOpen;
    renderControls();
    renderSummary();
  });

  el.roomSearch.addEventListener("input", () => {
    state.filters.search = el.roomSearch.value;
    renderLedger();
  });

  el.floorSelect.addEventListener("change", () => {
    state.filters.floor = el.floorSelect.value;
    renderLedger();
  });

  el.sortSelect.addEventListener("change", () => {
    state.filters.sort = el.sortSelect.value;
    renderLedger();
  });

  el.clearFiltersButton.addEventListener("click", () => {
    state.filters = createDefaultFilters();
    state.filtersPanelOpen = false;
    state.expandedFloors = new Set();
    renderControls();
    renderSummary();
    renderLedger();
  });

  el.refreshButton.addEventListener("click", async () => {
    el.refreshButton.disabled = true;
    el.refreshButton.textContent = "刷新中...";
    try {
      await loadOverview();
    } finally {
      el.refreshButton.disabled = false;
      el.refreshButton.textContent = "刷新分析";
    }
  });

  el.drawerClose.addEventListener("click", closeDrawer);
  el.detailDrawer.addEventListener("click", (event) => {
    if (event.target === el.detailDrawer) {
      closeDrawer();
    }
  });

  el.drawerContent.addEventListener("submit", async (event) => {
    const form = event.target.closest(".cost-editor-form");
    if (!form) {
      return;
    }

    event.preventDefault();
    try {
      await saveRoomCostProfile(form);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "保存成本失败");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.detailDrawer.classList.contains("open")) {
      closeDrawer();
    }
  });
}

async function loadOverview() {
  if (!state.bootstrap) {
    state.bootstrap = await api("/api/v1/frontdesk/bootstrap");
  }

  state.year = state.year ?? initialYear() ?? Number(state.bootstrap.today.slice(0, 4));
  const propertyId = state.bootstrap.property.id;
  state.overview = await api(
    `/api/v1/asset/room-economics?property_id=${propertyId}&year=${state.year}`,
  );

  renderHeader();
  renderSummary();
  renderControls();
  renderLedger();

  if (state.selectedRoomId) {
    openDrawer(state.selectedRoomId);
    return;
  }

  const roomQuery = initialRoomQuery();
  if (roomQuery) {
    const matchedRoom = state.overview.rooms.find(
      (room) => room.roomNo === roomQuery || room.roomId === roomQuery,
    );
    if (matchedRoom) {
      openDrawer(matchedRoom.roomId);
    }
  }
}

async function bootstrap() {
  bindControls();
  await loadOverview();
}

bootstrap().catch((error) => {
  console.error(error);
  el.propertyName.textContent = "加载失败";
  el.periodLabel.textContent = error.message;
  el.roomList.innerHTML = `
    <div class="empty-state">
      房间盈亏看板加载失败，请确认服务端和示例数据已经初始化。
    </div>
  `;
});
