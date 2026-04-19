# 酒店公寓资管平台 - Phase 1 启动版

这是基于 [hotel_apartment_dev_spec_cn.md](./hotel_apartment_dev_spec_cn.md) 启动实施的第一版 Web API 后端，当前优先覆盖：

- 房态与房间详情查询
- 临时锁库
- 短租订单创建
- 入住 / 离店
- 账单收款
- iOS 前台 App 会话、设备注册、前台看板、增量同步
- 房间收益成本分析看板

## 技术选型

- Node.js 24
- TypeScript
- Fastify
- Prisma Client
- SQLite
- Vitest

## 快速开始

```bash
npm install
npx prisma generate
npm run db:reset
npm run prisma:seed:200
npm run dev
```

服务默认启动在 `http://127.0.0.1:3000`。

## 默认数据

执行 `npm run prisma:seed:200` 后会生成：

- 一个示例项目
- 200 个房间
- 一批示例住客
- 1 个前台账号
- 当日预抵、预离、在住订单样本
- 200 套房间固定成本档案
- 2026 年按月收益样本，覆盖日租 / 短租 / 长租 / 季节性 / 亏损房混合经营

也可以按需指定数量：

```bash
tsx prisma/seed.ts --rooms 80
tsx prisma/seed.ts --rooms 200 --year 2026
```

默认演示账号：

- 用户名：`frontdesk`
- 密码：`frontdesk123`

## 页面入口

- 后台首页：`http://127.0.0.1:3000/`
- 业主资管后台：`http://127.0.0.1:3000/economics/`
- 后台别名：`http://127.0.0.1:3000/admin/`、`http://127.0.0.1:3000/backend/`

房间盈亏看板会把每间房的：

- 年度总收益
- 年度固定成本
- 毛利 / 毛亏
- 日租 / 短租 / 长租收益拆分
- 12 个月经营模式切换

放到同一页，方便看出一套房到底是赚钱还是亏钱。

## 已实现接口

- `GET /health`
- `GET /api/v1/rooms/:id`
- `POST /api/v1/inventory/locks`
- `POST /api/v1/bookings`
- `POST /api/v1/bookings/:id/check-in`
- `POST /api/v1/checkouts`
- `POST /api/v1/folios/:id/payments`
- `POST /api/v1/frontdesk/app-sessions`
- `POST /api/v1/frontdesk/devices/register`
- `GET /api/v1/frontdesk/dashboard`
- `GET /api/v1/frontdesk/arrivals`
- `GET /api/v1/frontdesk/departures`
- `GET /api/v1/frontdesk/room-board`
- `GET /api/v1/frontdesk/bookings/:id`
- `GET /api/v1/frontdesk/sync`
- `GET /api/v1/asset/room-economics`

## 当前实现边界

这还是 Phase 1 启动版，不是完整成品。当前明确未覆盖：

- 长租租约、续租、退租、押金转结
- 退款、业主结算、ERP 对接
- 门锁 / 公安 / OTA 真正外部集成
- 完整 RBAC、审批流、操作审计落库
- 多角色后台权限、审批流和移动端成品界面

## 测试

```bash
npm test
```

当前已覆盖四条关键验证：

- 重复占用冲突
- 前台增量同步返回新订单
- 房间收益成本接口返回单房毛利计算结果
- 房间收益成本接口可聚合 200 套房
