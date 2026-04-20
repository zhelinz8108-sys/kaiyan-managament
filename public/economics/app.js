function createDefaultFilters() {
  return {
    search: "",
    inventoryScope: "ACTIVE_MANAGED",
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
  expandedFloors: new Set(),
};

const el = {
  propertyName: document.querySelector("#propertyName"),
  periodChip: document.querySelector("#periodChip"),
  periodLabel: document.querySelector("#periodLabel"),
  logoutButton: document.querySelector("#logoutButton"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  refreshButton: document.querySelector("#refreshButton"),
  setupBanner: document.querySelector("#setupBanner"),
  summaryGrid: document.querySelector(".summary-grid"),
  toolbarCard: document.querySelector(".toolbar-card"),
  advancedFilters: document.querySelector("#advancedFilters"),
  secondaryInsights: document.querySelector("#secondaryInsights"),
  totalRevenueLabel: document.querySelector("#totalRevenueLabel"),
  totalRevenue: document.querySelector("#totalRevenue"),
  totalRevenueMeta: document.querySelector("#totalRevenueMeta"),
  totalFixedCostLabel: document.querySelector("#totalFixedCostLabel"),
  totalFixedCost: document.querySelector("#totalFixedCost"),
  totalFixedCostMeta: document.querySelector("#totalFixedCostMeta"),
  grossProfitLabel: document.querySelector("#grossProfitLabel"),
  grossProfit: document.querySelector("#grossProfit"),
  profitabilityTag: document.querySelector("#profitabilityTag"),
  scopeRoomLabel: document.querySelector("#scopeRoomLabel"),
  scopeRoomCount: document.querySelector("#scopeRoomCount"),
  scopeRoomMeta: document.querySelector("#scopeRoomMeta"),
  dailyRevenue: document.querySelector("#dailyRevenue"),
  shortStayRevenue: document.querySelector("#shortStayRevenue"),
  longStayRevenue: document.querySelector("#longStayRevenue"),
  bestWorst: document.querySelector("#bestWorst"),
  bestWorstMeta: document.querySelector("#bestWorstMeta"),
  watchManaged: document.querySelector("#watchManaged"),
  watchSelling: document.querySelector("#watchSelling"),
  watchNote: document.querySelector("#watchNote"),
  roomSearch: document.querySelector("#roomSearch"),
  scopeFilters: document.querySelector("#scopeFilters"),
  profitFilters: document.querySelector("#profitFilters"),
  modeFilters: document.querySelector("#modeFilters"),
  floorSelect: document.querySelector("#floorSelect"),
  typeFilters: document.querySelector("#typeFilters"),
  sortSelect: document.querySelector("#sortSelect"),
  ledgerCopy: document.querySelector("#ledgerCopy"),
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

const managementStatusOptions = [
  { value: "POTENTIAL", label: "底表 / 未接入" },
  { value: "NEGOTIATING", label: "洽谈中" },
  { value: "READY", label: "待上线" },
  { value: "ACTIVE", label: "在管" },
  { value: "PAUSED", label: "暂停经营" },
  { value: "EXITED", label: "已退场" },
];

const inventoryScopeFilters = [
  { value: "ACTIVE_MANAGED", label: "当前在管" },
  { value: "PIPELINE", label: "储备池" },
  { value: "EXITED", label: "退场历史" },
  { value: "ALL_BUILDING", label: "整栋底表" },
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
  floor_desc: "按高楼层优先",
  gross_profit_desc: "按毛利从高到低",
  gross_profit_asc: "按毛利从低到高",
  revenue_desc: "按收益从高到低",
  margin_desc: "按毛利率从高到低",
};

async function api(path) {
  const response = await fetch(path);
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("登录已失效，请重新登录");
  }
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  const payload = await response.json();
  return payload.data;
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login/?next=${encodeURIComponent(next)}`;
}

async function logout() {
  const response = await fetch("/api/v1/web-admin/logout", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("退出登录失败");
  }

  redirectToLogin();
}

function showError(error, fallback = "加载失败") {
  console.error(error);
  window.alert(error instanceof Error ? error.message : fallback);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    return "暂无毛利率";
  }

  return `毛利率 ${(value * 100).toFixed(1)}%`;
}

function formatArea(value) {
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}㎡`;
}

function formatDate(value) {
  if (!value) {
    return "未设置";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatDateRange(start, end) {
  if (!start && !end) {
    return "未设置";
  }
  if (start && !end) {
    return `${formatDate(start)} 起`;
  }
  if (!start && end) {
    return `截至 ${formatDate(end)}`;
  }
  return `${formatDate(start)} - ${formatDate(end)}`;
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

function formatManagementStatus(status) {
  return {
    ACTIVE: "在管",
    READY: "待上线",
    NEGOTIATING: "洽谈中",
    PAUSED: "暂停经营",
    EXITED: "已退场",
    POTENTIAL: "底表",
    UNMANAGED: "未建档",
  }[status] ?? status;
}

function managementClassName(status) {
  return {
    ACTIVE: "management-active",
    READY: "management-ready",
    NEGOTIATING: "management-negotiating",
    PAUSED: "management-paused",
    EXITED: "management-exited",
  }[status] ?? "";
}

function formatScopeLabel(scope) {
  return (
    inventoryScopeFilters.find((item) => item.value === scope)?.label ??
    state.overview?.scope?.label ??
    scope
  );
}

function roomHasRecordedRevenue(room) {
  return room.revenue.total > 0 || room.revenue.occupiedNights > 0;
}

function roomHasRecordedEconomics(room) {
  return room.revenue.total > 0 || room.fixedCost > 0;
}

function isBlankBaseline(summary) {
  return (
    summary.totalRevenue === 0 &&
    summary.totalFixedCost === 0 &&
    summary.grossProfit === 0 &&
    summary.profitableRooms === 0 &&
    summary.lossRooms === 0
  );
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
  if (mixSummary.idleMonths > 0 && parts.length === 0) {
    parts.push(`空置 ${mixSummary.idleMonths} 个月`);
  }

  return parts.join(" · ") || "尚未录入收益";
}

function monthStripMarkup(monthMix) {
  return monthMix
    .map((item) => {
      const label = `${item.month}月 · ${formatMode(item.mode)} · ${
        item.revenue > 0 ? formatCurrency(item.revenue) : "未录入收益"
      }`;

      return `
        <div class="month-pill ${modeClass(item.mode)}" title="${escapeHtml(label)}">
          <span>${item.month}</span>
        </div>
      `;
    })
    .join("");
}

function timelineMarkup(monthMix) {
  return monthMix
    .map(
      (item) => `
        <div class="timeline-cell ${modeClass(item.mode)}">
          <strong>${item.month}月</strong>
          <span>${formatMode(item.mode)}</span>
          <span>${item.revenue > 0 ? formatCurrency(item.revenue) : "未录入收益"}</span>
        </div>
      `,
    )
    .join("");
}

function profitabilityGrade(room) {
  const margin = room.profitability.margin ?? 0;
  if (!roomHasRecordedEconomics(room)) {
    return { label: "待录入", className: "grade-watch" };
  }
  if (room.profitability.grossProfit < 0) {
    return { label: "风险", className: "grade-risk" };
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
  return room.profitability.grossProfit > 0 && (room.profitability.margin ?? 0) < 0.12;
}

function managementPillMarkup(status) {
  return `
    <span class="status-pill management-pill ${managementClassName(status)}">
      ${formatManagementStatus(status)}
    </span>
  `;
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
          <strong>${
            !roomHasRecordedEconomics(room)
              ? "待录入"
              : room.profitability.grossProfit >= 0
                ? "赚钱"
                : "亏损"
          }</strong>
        </div>
      </div>
    </section>
  `;
}

function managementCard(room) {
  const management = room.management;

  return `
    <section class="detail-card">
      <h4>房源状态</h4>
      <div class="line-list">
        <div class="line-item"><span>当前状态</span><strong>${formatManagementStatus(management.status)}</strong></div>
        <div class="line-item"><span>房东姓名</span><strong>${escapeHtml(management.ownerName ?? "未录入")}</strong></div>
        <div class="line-item"><span>联系方式</span><strong>${escapeHtml(management.ownerPhone ?? "未录入")}</strong></div>
        <div class="line-item"><span>接房方式</span><strong>${escapeHtml(management.acquireMode ?? "未录入")}</strong></div>
        <div class="line-item"><span>生效区间</span><strong>${formatDateRange(management.effectiveFrom, management.effectiveTo)}</strong></div>
        <div class="line-item"><span>归档说明</span><strong>${escapeHtml(management.notes ?? "未录入")}</strong></div>
      </div>
    </section>
  `;
}

function costEditorCard(room) {
  const fields = costFieldConfig
    .map(
      (field) => `
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
      `,
    )
    .join("");

  return `
    <section class="detail-card cost-editor-card">
      <div class="cost-editor-header">
        <div>
          <h4>成本录入</h4>
          <p class="cost-editor-copy">保存后会立刻重算这套房的固定成本、毛利和首页汇总。</p>
        </div>
        <span class="cost-editor-hint">金额单位：元 / 月</span>
      </div>
      <form class="cost-editor-form" data-room-id="${room.roomId}">
        <div class="cost-editor-grid">
          ${fields}
        </div>
        <label class="cost-editor-field cost-editor-notes">
          <span>备注</span>
          <textarea name="notes" rows="3" placeholder="例如：物业费按季度结算，保洁由房东承担">${escapeHtml(
            room.notes ?? "",
          )}</textarea>
        </label>
        <div class="cost-editor-actions">
          <button type="submit" class="refresh-button cost-save-button">保存成本</button>
        </div>
      </form>
    </section>
  `;
}

function managementEditorCard(room) {
  const management = room.management;
  const statusOptions = managementStatusOptions
    .map(
      (item) => `
        <option value="${item.value}" ${item.value === management.status ? "selected" : ""}>
          ${item.label}
        </option>
      `,
    )
    .join("");

  return `
    <section class="detail-card cost-editor-card">
      <div class="cost-editor-header">
        <div>
          <h4>在管状态变更</h4>
          <p class="cost-editor-copy">每次保存都会新增一段有效期，用来表示今天起这套房进入在管、待上线、洽谈中或已退场。</p>
        </div>
        <span class="cost-editor-hint">状态记录</span>
      </div>
      <form class="management-editor-form" data-room-id="${room.roomId}">
        <div class="cost-editor-grid">
          <label class="cost-editor-field">
            <span>管理状态</span>
            <select name="managementStatus" class="select-input">
              ${statusOptions}
            </select>
          </label>
          <label class="cost-editor-field">
            <span>生效开始</span>
            <input type="date" name="effectiveFrom" value="${formatDateInput(new Date())}" />
          </label>
          <label class="cost-editor-field">
            <span>生效结束</span>
            <input type="date" name="effectiveTo" value="" />
          </label>
          <label class="cost-editor-field">
            <span>房东姓名</span>
            <input type="text" name="ownerName" value="${escapeHtml(management.ownerName ?? "")}" placeholder="例如：张女士" />
          </label>
          <label class="cost-editor-field">
            <span>联系方式</span>
            <input type="text" name="ownerPhone" value="${escapeHtml(management.ownerPhone ?? "")}" placeholder="例如：13800000000 / 备用联系人" />
          </label>
          <label class="cost-editor-field">
            <span>接房方式</span>
            <input type="text" name="acquireMode" value="${escapeHtml(management.acquireMode ?? "")}" placeholder="例如：整租 / 分成 / 托管" />
          </label>
        </div>
        <label class="cost-editor-field cost-editor-notes">
          <span>说明</span>
          <textarea name="notes" rows="3" placeholder="例如：本周签约，下周一切到在管">${escapeHtml(
            management.notes ?? "",
          )}</textarea>
        </label>
        <div class="cost-editor-actions">
          <button type="submit" class="refresh-button cost-save-button">保存状态</button>
        </div>
      </form>
    </section>
  `;
}

function detailTimelineSection(room) {
  if (!roomHasRecordedRevenue(room)) {
    return `
      <section class="detail-card">
        <h4>经营结构</h4>
        <p class="watch-note">这套房还没有录入收益端数据。你可以先录成本，也可以后续按月补录收益。</p>
      </section>
    `;
  }

  return `
    <section class="drawer-section">
      <p class="timeline-caption">12 个月经营模式与已确认收益</p>
      <div class="timeline">
        ${timelineMarkup(room.monthMix)}
      </div>
    </section>
  `;
}

function detailMarkup(room) {
  const grade = profitabilityGrade(room);
  const profitClass =
    room.profitability.grossProfit > 0
      ? "profit"
      : room.profitability.grossProfit < 0
        ? "loss"
        : "neutral";

  let profitDescription = "当前尚未录入收益和成本";
  if (roomHasRecordedEconomics(room)) {
    profitDescription =
      room.profitability.grossProfit >= 0
        ? "这套房当前已经覆盖固定成本"
        : "这套房当前还没有覆盖固定成本";
  }

  return `
    <section class="drawer-hero">
      <div class="drawer-hero-main">
        <div class="drawer-room-title">
          <span class="drawer-room-no">${escapeHtml(room.roomNo)}</span>
          <span class="pill">${escapeHtml(room.roomType)}</span>
          ${managementPillMarkup(room.management.status)}
          <span class="grade-chip ${grade.className}">${grade.label}</span>
        </div>
        <p class="drawer-room-meta">${escapeHtml(room.floor)}层 · ${formatArea(room.areaSqm)} · ${formatRoomStatus(
          room.roomStatus,
        )} · ${formatSellableStatus(room.sellableStatus)}</p>
        <p class="drawer-room-meta">${roomMixSummary(room.mixSummary)}</p>
      </div>

      <div class="profit-box ${profitClass}">
        <span>年度毛利</span>
        <strong>${formatSignedCurrency(room.profitability.grossProfit)}</strong>
        <span>${formatPercent(room.profitability.margin)}</span>
        <span>${profitDescription}</span>
      </div>
    </section>

    ${detailTimelineSection(room)}

    <section class="drawer-grid">
      ${managementCard(room)}
      ${revenueCard(room)}
      ${costCard(room)}
      ${managementEditorCard(room)}
    </section>

    ${costEditorCard(room)}
  `;
}

function setSummaryTone(summary) {
  const grossProfitCard = el.grossProfit.closest(".summary-card");
  grossProfitCard.classList.toggle("profit", summary.grossProfit > 0);
  grossProfitCard.classList.toggle("loss", summary.grossProfit < 0);
  grossProfitCard.classList.toggle("neutral", summary.grossProfit === 0);
}

function renderHeader() {
  const { property, period, summary, scope } = state.overview;
  const blankBaseline = isBlankBaseline(summary);
  const managedPoolText = `${summary.management.activeManagedRooms} 套在管 / ${summary.totalBuildingRooms} 套整栋底表`;

  document.title = property.name;
  el.propertyName.textContent = property.name;
  el.periodChip.textContent = formatScopeLabel(scope.code);

  if (blankBaseline) {
    el.periodLabel.textContent = `${period.label} · ${managedPoolText}。默认先看当前在管房源，需要新增接房时切到“整栋底表”或“储备池”。`;
  } else {
    el.periodLabel.textContent = `${period.label} · 当前口径：${formatScopeLabel(scope.code)} · 毛利 ${formatSignedCurrency(
      summary.grossProfit,
    )}`;
  }

  el.ledgerCopy.textContent =
    scope.code === "ACTIVE_MANAGED"
      ? "默认只显示当前在管房源，按楼层折叠后逐层展开。点开房号可录入成本，也可把这套房切到待上线、洽谈中或退场。"
      : scope.code === "PIPELINE"
        ? "这里是待签约、待上线和暂停中的房源池，不计入当前在管经营汇总。确认接房后，点开房间详情把状态切成“在管”。"
        : scope.code === "EXITED"
          ? "这里保留历史退场房源，便于回看楼内曾经接过的房间。"
          : "这里展示整栋楼的房号底表。不是所有房间都归我们经营，只有切成“在管”的房间才进入默认首页汇总。";
}

function renderSummary() {
  const { summary, scope } = state.overview;
  const blankBaseline = isBlankBaseline(summary);

  el.totalRevenueLabel.textContent = `${formatScopeLabel(scope.code)}收益`;
  el.totalRevenue.textContent = formatCurrency(summary.totalRevenue);
  el.totalRevenueMeta.textContent = "当前范围内已确认收益";

  el.totalFixedCostLabel.textContent = `${formatScopeLabel(scope.code)}固定成本`;
  el.totalFixedCost.textContent = formatCurrency(summary.totalFixedCost);
  el.totalFixedCostMeta.textContent = "月租、物业、保洁、维修等";

  el.grossProfitLabel.textContent = "毛利 / 毛亏";
  el.grossProfit.textContent = formatSignedCurrency(summary.grossProfit);
  el.profitabilityTag.textContent = blankBaseline
    ? "当前还没有录入收益和成本"
    : summary.grossProfit > 0
      ? "当前范围已经覆盖固定成本"
      : summary.grossProfit < 0
        ? "当前范围还没有覆盖固定成本"
        : "当前范围盈亏持平";

  el.scopeRoomLabel.textContent = `${formatScopeLabel(scope.code)}房量`;
  el.scopeRoomCount.textContent = `${summary.totalRoomsInScope} 套`;
  el.scopeRoomMeta.textContent = `盈利 ${summary.profitableRooms} / 亏损 ${summary.lossRooms} · 整栋底表 ${summary.totalBuildingRooms} 套`;

  el.dailyRevenue.textContent = formatCurrency(summary.revenueByMode.DAILY);
  el.shortStayRevenue.textContent = formatCurrency(summary.revenueByMode.SHORT_STAY);
  el.longStayRevenue.textContent = formatCurrency(summary.revenueByMode.LONG_STAY);
  el.bestWorst.textContent = summary.bestRoom
    ? `${summary.bestRoom.roomNo} / ${summary.worstRoom?.roomNo ?? "--"}`
    : "--";
  el.bestWorstMeta.textContent = summary.bestRoom
    ? `最佳 ${formatSignedCurrency(summary.bestRoom.grossProfit)} · 最弱 ${formatSignedCurrency(
        summary.worstRoom?.grossProfit ?? 0,
      )}`
    : "当前还没有可比较的经营结果";

  el.setupBanner.hidden = !blankBaseline;
  el.summaryGrid.hidden = blankBaseline;
  el.secondaryInsights.hidden = blankBaseline;
  el.toolbarCard.classList.remove("compact");
  setSummaryTone(summary);
}

function renderChipGroup(target, items, activeValue, onSelect) {
  target.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="filter-chip ${item.value === activeValue ? "active" : ""}" data-value="${
          item.value
        }">
          ${escapeHtml(item.label)}
        </button>
      `,
    )
    .join("");

  target.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const result = onSelect(chip.dataset.value);
      if (result && typeof result.then === "function") {
        result.catch((error) => showError(error, "操作失败"));
      }
    });
  });
}

function renderControls() {
  const roomTypes = ["ALL", ...new Set(state.overview.rooms.map((room) => room.roomType))];
  const floors = [...new Set(state.overview.rooms.map((room) => room.floor))].sort(compareFloorDesc);

  renderChipGroup(el.scopeFilters, inventoryScopeFilters, state.filters.inventoryScope, async (value) => {
    if (value === state.filters.inventoryScope) {
      return;
    }

    state.filters.inventoryScope = value;
    state.filters.floor = "ALL";
    state.expandedFloors = new Set();
    closeDrawer();
    await loadOverview();
  });

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
    ...floors.map((floor) => `<option value="${escapeHtml(floor)}">${escapeHtml(floor)}层</option>`),
  ].join("");

  if (!roomTypes.includes(state.filters.type)) {
    state.filters.type = "ALL";
  }
  if (!floors.includes(state.filters.floor)) {
    state.filters.floor = "ALL";
  }

  el.roomSearch.value = state.filters.search;
  el.floorSelect.value = state.filters.floor;
  el.sortSelect.value = state.filters.sort;
  el.advancedFilters.hidden = false;
}

function renderWatchPanel() {
  const { summary } = state.overview;
  const management = summary.management;
  el.watchManaged.textContent = `${management.activeManagedRooms} 套`;
  el.watchSelling.textContent = `${management.activeSellableRooms} 套`;
  el.watchNote.textContent = `“当前在卖”按当前在管且可售统计。整栋底表共 ${summary.totalBuildingRooms} 套，默认首页只看当前在管房源。`;
}

function roomMatchesFilters(room) {
  const query = state.filters.search.trim().toLowerCase();
  if (query) {
    const haystack = [
      room.roomNo,
      room.floor,
      room.roomType,
      String(room.areaSqm),
      room.management.acquireMode ?? "",
      formatManagementStatus(room.management.status),
      roomMixSummary(room.mixSummary),
    ]
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
    case "floor_desc":
      return compareFloorDesc(left.floor, right.floor) || left.roomNo.localeCompare(right.roomNo, "zh-CN", { numeric: true });
    case "gross_profit_desc":
      return right.profitability.grossProfit - left.profitability.grossProfit;
    case "gross_profit_asc":
      return left.profitability.grossProfit - right.profitability.grossProfit;
    case "revenue_desc":
      return right.revenue.total - left.revenue.total;
    case "margin_desc":
      return (right.profitability.margin ?? -1) - (left.profitability.margin ?? -1);
    default:
      return compareFloorDesc(left.floor, right.floor) || left.roomNo.localeCompare(right.roomNo, "zh-CN", { numeric: true });
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
  state.expandedFloors = new Set([...state.expandedFloors].filter((floor) => visibleFloors.has(floor)));

  if (state.filters.floor !== "ALL" && visibleFloors.has(state.filters.floor)) {
    state.expandedFloors = new Set([state.filters.floor]);
    return;
  }

  if (state.selectedRoomId) {
    const room = state.overview.rooms.find((item) => item.roomId === state.selectedRoomId);
    if (room && visibleFloors.has(room.floor)) {
      state.expandedFloors.add(room.floor);
    }
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
  const allBlank = rooms.every((room) => !roomHasRecordedEconomics(room));

  return `
    <section class="floor-section ${expanded ? "expanded" : "collapsed"}">
      <button
        type="button"
        class="floor-section-toggle"
        data-floor="${escapeHtml(floor)}"
        aria-expanded="${expanded ? "true" : "false"}"
      >
        <div class="floor-section-leading">
          <div class="floor-section-title">${escapeHtml(floor)}层</div>
          <div class="floor-section-count">${rooms.length} 套</div>
        </div>
        <div class="floor-section-summary">
          ${
            allBlank
              ? `<span class="floor-section-note">这层还没有录入收益和成本</span>`
              : `<span>收益 ${formatCurrency(totalRevenue)}</span><span>毛利 ${formatSignedCurrency(totalGrossProfit)}</span>`
          }
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
    room.profitability.grossProfit > 0
      ? "profit"
      : room.profitability.grossProfit < 0
        ? "loss"
        : "neutral";
  const rowTone =
    room.profitability.grossProfit > 0
      ? "row-profit"
      : room.profitability.grossProfit < 0
        ? "row-loss"
        : "row-neutral";

  const mixCell = roomHasRecordedRevenue(room)
    ? `
        <strong>${roomMixSummary(room.mixSummary)}</strong>
        <div class="month-strip">${monthStripMarkup(room.monthMix)}</div>
      `
    : `
        <strong>尚未录入收益</strong>
        <span class="profit-note">这套房当前还没有收益结构</span>
      `;

  return `
    <button type="button" class="room-row ${rowTone}" data-room-id="${room.roomId}">
      <div class="room-cell room-id-cell">
        <div class="room-no-line">
          <span class="room-no room-link">${escapeHtml(room.roomNo)}</span>
          <span class="pill">${escapeHtml(room.roomType)}</span>
          ${managementPillMarkup(room.management.status)}
        </div>
        <div class="room-asset-line">
          <span>${escapeHtml(room.floor)}层</span>
          <span>${formatArea(room.areaSqm)}</span>
        </div>
        <div class="room-status-line">
          <span class="status-pill room-status-pill">${formatRoomStatus(room.roomStatus)}</span>
          <span class="status-pill sellable-pill">${formatSellableStatus(room.sellableStatus)}</span>
        </div>
      </div>

      <div class="room-cell room-mix-cell">
        <span class="cell-label">经营结构</span>
        ${mixCell}
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
  const scopeLabel = formatScopeLabel(state.filters.inventoryScope);
  const totalInScope = state.overview.summary.totalRoomsInScope;

  el.roomListMeta.textContent = `显示 ${rooms.length} / ${totalInScope} 套 · ${scopeLabel} · ${floorLabel} · ${sortLabels[state.filters.sort]}`;

  if (!rooms.length) {
    el.tableHead.hidden = true;
    el.roomList.innerHTML = `
      <div class="empty-state">
        当前筛选条件下没有匹配的房间。你可以放宽筛选条件，或者切换到“整栋底表”查看尚未进入经营池的房号。
      </div>
    `;
    return;
  }

  if (shouldGroupByFloor()) {
    const floors = [...new Set(rooms.map((room) => room.floor))];
    syncExpandedFloors(floors);
    const grouped = floors.map((floor) => ({
      floor,
      rooms: rooms.filter((room) => room.floor === floor),
    }));

    const hasExpandedFloor = grouped.some((item) => state.expandedFloors.has(item.floor));
    el.tableHead.hidden = !hasExpandedFloor;
    el.roomList.innerHTML = grouped
      .map((item) => floorSectionMarkup(item.floor, item.rooms, state.expandedFloors.has(item.floor)))
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
  state.expandedFloors.add(room.floor);
  el.drawerTitle.textContent = `${room.roomNo} 房间详情`;
  el.drawerSubtitle.textContent = "查看这套房的收益、成本和当前在管状态";
  el.drawerContent.innerHTML = detailMarkup(room);
  el.detailDrawer.classList.add("open");
  el.detailDrawer.setAttribute("aria-hidden", "false");

  const url = new URL(window.location.href);
  url.searchParams.set("room", room.roomNo);
  window.history.replaceState({}, "", url);
}

function closeDrawer(options = { updateUrl: true }) {
  el.detailDrawer.classList.remove("open");
  el.detailDrawer.setAttribute("aria-hidden", "true");
  state.selectedRoomId = null;

  if (options.updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
  }
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

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }

    await loadOverview();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "保存成本";
  }
}

async function saveRoomManagementAssignment(form) {
  const roomId = form.dataset.roomId;
  const formData = new FormData(form);
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  const effectiveTo = String(formData.get("effectiveTo") ?? "").trim();

  if (!effectiveFrom) {
    throw new Error("请选择生效开始日期");
  }

  const payload = {
    management_status: String(formData.get("managementStatus") ?? "POTENTIAL"),
    effective_from: effectiveFrom,
    effective_to: effectiveTo || undefined,
    owner_name: String(formData.get("ownerName") ?? "").trim() || undefined,
    owner_phone: String(formData.get("ownerPhone") ?? "").trim() || undefined,
    acquire_mode: String(formData.get("acquireMode") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "保存中...";

  try {
    const response = await fetch(`/api/v1/rooms/${roomId}/management-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok) {
      throw new Error(`保存失败：${response.status}`);
    }

    await loadOverview();
    const stillVisible = state.overview.rooms.some((room) => room.roomId === roomId);
    if (!stillVisible) {
      window.alert("房源状态已更新，这套房已经移出当前视图。你可以切换范围继续查看。");
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "保存状态";
  }
}

function bindControls() {
  el.logoutButton?.addEventListener("click", async () => {
    el.logoutButton.disabled = true;
    el.logoutButton.textContent = "退出中...";
    try {
      await logout();
    } catch (error) {
      showError(error, "退出登录失败");
      el.logoutButton.disabled = false;
      el.logoutButton.textContent = "退出登录";
    }
  });

  el.roomSearch.addEventListener("input", () => {
    state.filters.search = el.roomSearch.value;
    renderLedger();
  });

  el.floorSelect.addEventListener("change", () => {
    state.filters.floor = el.floorSelect.value;
    state.expandedFloors = state.filters.floor === "ALL" ? new Set() : new Set([state.filters.floor]);
    renderLedger();
  });

  el.sortSelect.addEventListener("change", () => {
    state.filters.sort = el.sortSelect.value;
    renderLedger();
  });

  el.clearFiltersButton.addEventListener("click", async () => {
    state.filters = createDefaultFilters();
    state.expandedFloors = new Set();
    closeDrawer();
    await loadOverview();
  });

  el.refreshButton.addEventListener("click", async () => {
    el.refreshButton.disabled = true;
    el.refreshButton.textContent = "刷新中...";
    try {
      await loadOverview();
    } finally {
      el.refreshButton.disabled = false;
      el.refreshButton.textContent = "刷新数据";
    }
  });

  el.drawerClose.addEventListener("click", () => closeDrawer());

  el.detailDrawer.addEventListener("click", (event) => {
    if (event.target === el.detailDrawer) {
      closeDrawer();
    }
  });

  el.drawerContent.addEventListener("submit", async (event) => {
    const form = event.target.closest("form");
    if (!form) {
      return;
    }

    event.preventDefault();

    try {
      if (form.classList.contains("cost-editor-form")) {
        await saveRoomCostProfile(form);
        return;
      }

      if (form.classList.contains("management-editor-form")) {
        await saveRoomManagementAssignment(form);
      }
    } catch (error) {
      showError(error, "保存失败");
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
  const params = new URLSearchParams({
    property_id: propertyId,
    year: String(state.year),
    inventory_scope: state.filters.inventoryScope,
  });

  state.overview = await api(`/api/v1/asset/room-economics?${params.toString()}`);

  renderHeader();
  renderSummary();
  renderWatchPanel();
  renderControls();
  renderLedger();

  if (state.selectedRoomId) {
    const selectedRoom = state.overview.rooms.find((room) => room.roomId === state.selectedRoomId);
    if (selectedRoom) {
      openDrawer(selectedRoom.roomId);
    } else {
      closeDrawer();
    }
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
  el.periodLabel.textContent = error instanceof Error ? error.message : "房源后台加载失败";
  el.roomList.innerHTML = `
    <div class="empty-state">
      房源后台加载失败，请确认服务端和数据库已经初始化完成。
    </div>
  `;
});
