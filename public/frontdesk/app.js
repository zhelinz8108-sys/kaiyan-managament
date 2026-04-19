const state = {
  bootstrap: null,
  currentDate: null,
  syncCursor: null,
  roomFilter: "ALL",
  rooms: [],
};

const el = {
  propertyName: document.querySelector("#propertyName"),
  propertyMeta: document.querySelector("#propertyMeta"),
  liveClock: document.querySelector("#liveClock"),
  liveDate: document.querySelector("#liveDate"),
  syncStatus: document.querySelector("#syncStatus"),
  syncMeta: document.querySelector("#syncMeta"),
  refreshButton: document.querySelector("#refreshButton"),
  summaryTitle: document.querySelector("#summaryTitle"),
  summaryCopy: document.querySelector("#summaryCopy"),
  propertyId: document.querySelector("#propertyId"),
  operatorName: document.querySelector("#operatorName"),
  sampleBookingId: document.querySelector("#sampleBookingId"),
  arrivalsCount: document.querySelector("#arrivalsCount"),
  departuresCount: document.querySelector("#departuresCount"),
  inHouseCount: document.querySelector("#inHouseCount"),
  dirtyRoomCount: document.querySelector("#dirtyRoomCount"),
  roomBoardMeta: document.querySelector("#roomBoardMeta"),
  roomFilters: document.querySelector("#roomFilters"),
  roomSummary: document.querySelector("#roomSummary"),
  roomGrid: document.querySelector("#roomGrid"),
  arrivalsMeta: document.querySelector("#arrivalsMeta"),
  arrivalsList: document.querySelector("#arrivalsList"),
  departuresMeta: document.querySelector("#departuresMeta"),
  departuresList: document.querySelector("#departuresList"),
  syncServerTime: document.querySelector("#syncServerTime"),
  syncCursor: document.querySelector("#syncCursor"),
  syncBookingCount: document.querySelector("#syncBookingCount"),
  syncRoomCount: document.querySelector("#syncRoomCount"),
  syncCheckinCount: document.querySelector("#syncCheckinCount"),
  syncTimeline: document.querySelector("#syncTimeline"),
  detailDrawer: document.querySelector("#detailDrawer"),
  drawerClose: document.querySelector("#drawerClose"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerContent: document.querySelector("#drawerContent"),
};

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(value);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function initials(name = "") {
  return name.trim().slice(0, 1) || "客";
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

function formatBookingStatus(status) {
  return {
    CONFIRMED: "已确认",
    CHECKED_IN: "已入住",
    CHECKED_OUT: "已离店",
    CANCELLED: "已取消",
    NO_SHOW: "未到店",
  }[status] ?? status;
}

function getRoomMetrics(rooms) {
  return {
    total: rooms.length,
    clean: rooms.filter((room) => room.roomStatus === "VACANT_CLEAN").length,
    dirty: rooms.filter((room) => room.roomStatus === "VACANT_DIRTY").length,
    occupied: rooms.filter((room) => room.roomStatus === "OCCUPIED").length,
    unsellable: rooms.filter((room) => room.sellableStatus !== "SELLABLE").length,
  };
}

function statusClass(roomStatus, sellableStatus) {
  if (roomStatus === "VACANT_CLEAN") return "status-clean";
  if (roomStatus === "VACANT_DIRTY") return "status-dirty";
  if (roomStatus === "OCCUPIED") return "status-occupied";
  if (sellableStatus !== "SELLABLE") return "status-unsellable";
  return "status-maintenance";
}

function updateClock() {
  const now = new Date();
  el.liveClock.textContent = formatTime(now);
  el.liveDate.textContent = formatDate(now);
}

function renderHeader() {
  const bootstrap = state.bootstrap;
  el.propertyName.textContent = bootstrap.property.name;
  el.propertyMeta.textContent = `${bootstrap.property.city} · ${bootstrap.property.timezone} · ${bootstrap.today}`;
  el.propertyId.textContent = bootstrap.property.id;
  el.operatorName.textContent = bootstrap.sampleOperator?.displayName ?? "frontdesk";
  el.sampleBookingId.textContent = bootstrap.sampleBookingId ?? "暂无";
}

function renderSummary(dashboard, arrivals, rooms) {
  const metrics = getRoomMetrics(rooms);

  if (arrivals.length > 0) {
    const firstArrival = arrivals[0];
    el.summaryTitle.textContent = `${firstArrival.guest.name} 即将到店，${firstArrival.room.roomNo} 是当前首要关注房间`;
    el.summaryCopy.textContent = `当前共有 ${dashboard.arrivalsCount} 位预抵客人，${metrics.dirty} 间脏房 / 维修房需要跟进，建议优先处理迎宾准备和房态清理。`;
  } else if (dashboard.departuresCount > 0) {
    el.summaryTitle.textContent = `当前无新的预抵高峰，值班重点转为离店处理与房态恢复`;
    el.summaryCopy.textContent = `今日有 ${dashboard.departuresCount} 笔预离，建议关注结账效率、脏房流转和可售库存恢复。`;
  } else {
    el.summaryTitle.textContent = "当前班次节奏平稳，可以优先处理库存质量和异常房态";
    el.summaryCopy.textContent = `总房量 ${metrics.total} 间，可售房 ${metrics.total - metrics.unsellable} 间，当前页面已收敛为值班最核心的信息。`;
  }
}

function renderRoomFilters() {
  const filters = [
    ["ALL", "全部"],
    ["VACANT_CLEAN", "空净"],
    ["VACANT_DIRTY", "脏房"],
    ["OCCUPIED", "在住"],
    ["MAINTENANCE", "维修"],
    ["UNSELLABLE", "不可售"],
  ];

  el.roomFilters.innerHTML = filters
    .map(
      ([value, label]) => `
        <button class="room-filter ${state.roomFilter === value ? "active" : ""}" data-filter="${value}">
          ${label}
        </button>
      `,
    )
    .join("");

  el.roomFilters.querySelectorAll(".room-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.roomFilter = button.dataset.filter;
      renderRoomFilters();
      renderRoomBoard(state.rooms);
    });
  });
}

function renderRoomSummary(rooms) {
  const metrics = getRoomMetrics(rooms);
  el.roomSummary.innerHTML = `
    <div class="summary-chip">
      <span>总房量</span>
      <strong>${metrics.total}</strong>
    </div>
    <div class="summary-chip">
      <span>空净房</span>
      <strong>${metrics.clean}</strong>
    </div>
    <div class="summary-chip">
      <span>在住房</span>
      <strong>${metrics.occupied}</strong>
    </div>
    <div class="summary-chip">
      <span>不可售</span>
      <strong>${metrics.unsellable}</strong>
    </div>
  `;
}

function renderRoomBoard(rooms) {
  const filtered = rooms.filter((room) => {
    if (state.roomFilter === "ALL") return true;
    if (state.roomFilter === "UNSELLABLE") return room.sellableStatus !== "SELLABLE";
    if (state.roomFilter === "MAINTENANCE") {
      return ["MAINTENANCE", "OUT_OF_SERVICE", "INSPECTING"].includes(room.roomStatus);
    }
    return room.roomStatus === state.roomFilter;
  });

  el.roomBoardMeta.textContent = `${filtered.length} / ${rooms.length} 间`;

  if (!filtered.length) {
    el.roomGrid.innerHTML = `<div class="empty-state">当前筛选条件下没有房间。</div>`;
    return;
  }

  el.roomGrid.innerHTML = filtered
    .map((room) => {
      const tone = statusClass(room.roomStatus, room.sellableStatus);
      return `
        <article class="room-tile">
          <div class="room-heading">
            <span class="room-number">${room.roomNo}</span>
            <span class="room-chip">${room.roomType}</span>
          </div>
          <div class="room-status-line">
            <span class="room-status ${tone}">${formatRoomStatus(room.roomStatus)}</span>
            <span class="mini-badge">${formatSellableStatus(room.sellableStatus)}</span>
          </div>
          <div class="room-foot">
            <span class="room-mini">${room.operationState}</span>
            <span class="room-mini">${formatDateTime(room.updatedAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBookingList(container, metaNode, items, emptyText, label) {
  metaNode.textContent = `${items.length} 条`;

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const actionTime = label === "arrival" ? item.checkinAt : item.checkoutAt;
      return `
        <button class="booking-row" data-booking-id="${item.id}">
          <div class="booking-top">
            <div class="booking-guest">
              <div class="guest-badge">${initials(item.guest.name)}</div>
              <div>
                <strong>${item.guest.name}</strong>
                <span>${item.guest.phone}</span>
              </div>
            </div>
            <div class="booking-room">${item.room.roomNo}</div>
          </div>
          <div class="booking-meta">
            <div>
              <span>${label === "arrival" ? "预计到店" : "预计离店"}</span>
              <strong>${formatDateTime(actionTime)}</strong>
            </div>
            <div>
              <span>订单状态</span>
              <strong>${formatBookingStatus(item.status)}</strong>
            </div>
            <div>
              <span>订单金额</span>
              <strong>¥${(item.totalAmount / 100).toFixed(2)}</strong>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".booking-row").forEach((node) => {
    node.addEventListener("click", () => openBookingDetail(node.dataset.bookingId));
  });
}

function renderSync(sync) {
  el.syncMeta.textContent = new Date(sync.serverTime).toLocaleTimeString("zh-CN");
  el.syncServerTime.textContent = new Date(sync.serverTime).toLocaleTimeString("zh-CN");
  el.syncCursor.textContent = sync.nextCursor;
  el.syncBookingCount.textContent = sync.changes.bookings.length;
  el.syncRoomCount.textContent = sync.changes.rooms.length;
  el.syncCheckinCount.textContent = sync.changes.checkins.length;

  const items = [
    ["订单变更", sync.changes.bookings.length, "本轮拉取到的订单状态更新"],
    ["房态变更", sync.changes.rooms.length, "本轮房态与可售状态更新"],
    ["入住变更", sync.changes.checkins.length, "本轮入住 / 离店记录更新"],
  ];

  el.syncTimeline.innerHTML = items
    .map(
      ([label, value, description]) => `
        <div class="timeline-item">
          <span>${label}</span>
          <strong>${value}</strong>
          <span>${description}</span>
        </div>
      `,
    )
    .join("");
}

function renderDrawer(detail) {
  const booking = detail.booking;
  const folio = detail.folio_summary[0];

  el.drawerTitle.textContent = `${booking.guest.name} · ${booking.room.roomNo}`;
  el.drawerContent.innerHTML = `
    <div class="detail-row">
      <span>订单号</span>
      <strong>${booking.id}</strong>
    </div>
    <div class="detail-row">
      <span>房态 / 可售</span>
      <strong>${formatRoomStatus(detail.room_status)} · ${formatSellableStatus(booking.room.sellableStatus)}</strong>
    </div>
    <div class="detail-row">
      <span>入住 / 离店</span>
      <strong>${formatDateTime(booking.checkinAt)} → ${formatDateTime(booking.checkoutAt)}</strong>
    </div>
    <div class="detail-row">
      <span>账单状态</span>
      <strong>${folio ? `${folio.status} · ¥${(folio.amount_due / 100).toFixed(2)} / 已收 ¥${(folio.amount_paid / 100).toFixed(2)}` : "暂无账单"}</strong>
    </div>
    <div class="detail-row">
      <span>住客联系</span>
      <strong>${booking.guest.name} · ${booking.guest.phone}</strong>
    </div>
  `;
}

async function openBookingDetail(bookingId) {
  const detail = await api(`/api/v1/frontdesk/bookings/${bookingId}`);
  renderDrawer(detail);
  el.detailDrawer.classList.add("open");
  el.detailDrawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  el.detailDrawer.classList.remove("open");
  el.detailDrawer.setAttribute("aria-hidden", "true");
}

async function loadDashboard() {
  const propertyId = state.bootstrap.property.id;
  const bizDate = state.currentDate;

  el.syncStatus.textContent = "同步中...";

  const [dashboard, roomBoard, arrivals, departures, sync] = await Promise.all([
    api(`/api/v1/frontdesk/dashboard?property_id=${propertyId}&biz_date=${bizDate}`),
    api(`/api/v1/frontdesk/room-board?property_id=${propertyId}`),
    api(`/api/v1/frontdesk/arrivals?property_id=${propertyId}&biz_date=${bizDate}`),
    api(`/api/v1/frontdesk/departures?property_id=${propertyId}&biz_date=${bizDate}`),
    api(`/api/v1/frontdesk/sync?property_id=${propertyId}&cursor=${encodeURIComponent(state.syncCursor ?? "1970-01-01T00:00:00.000Z")}`),
  ]);

  state.rooms = roomBoard.rooms;
  state.syncCursor = sync.nextCursor;

  el.arrivalsCount.textContent = dashboard.arrivalsCount;
  el.departuresCount.textContent = dashboard.departuresCount;
  el.inHouseCount.textContent = dashboard.inHouseCount;
  el.dirtyRoomCount.textContent = dashboard.dirtyRoomCount;
  el.syncStatus.textContent = "已同步";

  renderSummary(dashboard, arrivals.items, roomBoard.rooms);
  renderRoomFilters();
  renderRoomSummary(roomBoard.rooms);
  renderRoomBoard(roomBoard.rooms);
  renderBookingList(el.arrivalsList, el.arrivalsMeta, arrivals.items, "今天没有新的预抵订单。", "arrival");
  renderBookingList(el.departuresList, el.departuresMeta, departures.items, "今天没有新的预离订单。", "departure");
  renderSync(sync);
}

async function bootstrap() {
  state.bootstrap = await api("/api/v1/frontdesk/bootstrap");
  state.currentDate = state.bootstrap.today;
  renderHeader();
  updateClock();
  await loadDashboard();
}

el.refreshButton.addEventListener("click", async () => {
  el.refreshButton.disabled = true;
  el.refreshButton.textContent = "刷新中...";
  try {
    await loadDashboard();
  } finally {
    el.refreshButton.disabled = false;
    el.refreshButton.textContent = "刷新面板";
  }
});

el.drawerClose.addEventListener("click", closeDrawer);
el.detailDrawer.addEventListener("click", (event) => {
  if (event.target === el.detailDrawer) {
    closeDrawer();
  }
});

setInterval(updateClock, 1000);

bootstrap().catch((error) => {
  console.error(error);
  el.syncStatus.textContent = "同步失败";
  el.propertyName.textContent = "页面加载失败";
  el.propertyMeta.textContent = error.message;
});
