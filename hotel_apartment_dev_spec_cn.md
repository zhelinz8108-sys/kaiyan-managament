**长短租一体公寓资管平台
开发者文档**

适用场景：500 间酒店式公寓 · 日租 / 短租 / 长租混合经营 · 自持 / 包租 / 委托房源混合

| **文档类型** | 系统设计 / 开发规格                                  |
|--------------|------------------------------------------------------|
| **目标读者** | 产品、架构、后端、前端、测试、实施、数据团队         |
| **建议版本** | v1.1                                                 |
| **文档目的** | 定义业务边界、技术架构、核心模型、接口规范与实施路径 |

## 文档约定

- 本文档为完整 v1 开发规格版，不绑定具体技术栈，但要求实现时遵循文中定义的实体、状态、幂等、审计和集成约束。
- 默认前提：
  - 主系统是订单、租约、占用、账务、核心房态的最终权威源。
  - 库存采用“占用账本 + 每日快照”双层模型。
  - 完整 v1 包含 OTA 接入、业主结算、工单联动与经营报表；收益管理、重度 CRM、完整 ERP 仍不在 v1 范围。
- 时间语义统一采用项目时区的半开区间 `[start_at, end_at)`。
- 所有跨系统对象均需具备 `internal_id + external_ref + source_system` 的映射能力，用于幂等、回放和对账。

# 1. 项目概述

本系统定位为“以长短租一体公寓资管平台为主系统，外挂酒店能力”的经营中台。平台面向 500 间规模酒店式公寓，支持日租、短租、长租共存，并同时管理自持、包租和委托业主三类房源。

设计目标不是构建一个传统酒店 PMS，也不是一个单纯长租系统，而是统一管理“房源权益、租期、订单、合同、账单、渠道、业主结算、保洁维修和财务核算”的平台型系统。

| **核心原则：资产管理是主线，交易处理是入口，财务结算是闭环。** |
|----------------------------------------------------------------|

## 1.1 建设目标

- 建立统一房源主数据，支持同房源在不同日期按日租、短租、长租经营。
- 建立统一占用控制，避免订单、租约、维修、封房之间的冲突。
- 建立统一账单与支付台账，支持押金、收款、退款、分摊、核销和业主结算。
- 建立统一集成入口，支撑 OTA、PMS、支付、电子签、门锁、ERP 等外部能力接入。
- 建立完整审计链路，使关键交易、改价、退款、换房、退租、结算审核均可追溯。

# 2. 建设范围与非目标

## 2.1 建设范围

- 房源主数据：项目、楼栋、楼层、房型、房间、产权主体、经营状态、可售状态、价格策略。
- 参与方管理：住客档案、租客档案、业主档案、企业客户、渠道、会员标签、结算主体。
- 订单与合同：日租订单、短租订单、长租租约、续租、换房、退租、取消、No-show、违约处理。
- 库存与房态：房态、可售状态、封房、维修占用、临时锁库、日历快照、占用冲突控制。
- 账单与资金：应收、实收、退款、押金、佣金、渠道费、业主分账、项目经营报表、财务凭证接口。
- 运营协同：入住登记、离店、门锁授权、保洁、维修、巡检、待售房、停用房、脏房、维修房。
- 外部能力集成：OTA/渠道、支付、电子签、短信、公安/身份核验、发票、ERP、BI、门锁设备。

## 2.2 非目标

- 不在 v1 阶段自研完整收益管理系统（RMS）；仅提供价格规则和基础动态调价接口。
- 不在 v1 阶段自建完整 ERP；总账、报税、工资等能力通过财务系统承接。
- 不在 v1 阶段覆盖重度 CRM 营销自动化；仅保留会员标签、优惠券和营销事件接口。
- 不在 v1 阶段建设独立的数据中台；经营分析以业务库报表和标准数据抽取为主。
- 不在 v1 阶段支持多品牌多套复杂加盟财务清分；以单集团内项目经营为主。

# 3. 业务对象与系统边界

## 3.1 核心业务对象

| **对象**           | **主键建议**      | **关键属性**                              | **说明**                              |
|--------------------|-------------------|-------------------------------------------|---------------------------------------|
| Property           | property_id       | 项目、城市、币种、时区、经营状态          | 一个经营项目，对应单体或园区          |
| Building           | building_id       | property_id、楼栋编码、楼栋名称           | 物理空间分层对象                      |
| Floor              | floor_id          | building_id、楼层号、楼层名称             | 房间隶属楼层                          |
| RoomType           | room_type_id      | 可住人数、面积、朝向、可售标签            | 可售房型模板                          |
| Room               | room_id           | 房号、房型、产权、经营状态、可售状态      | 最小经营单元                          |
| Guest              | guest_id          | 身份信息、联系方式、会员标签              | 短租/日租住客主档                     |
| Tenant             | tenant_id         | 身份信息、租住偏好、信用信息              | 长租租客主档                          |
| Owner              | owner_id          | 结算主体、身份/企业信息、结算规则         | 业主/产权方主档                       |
| CorporateAccount   | corporate_account_id | 企业客户、授信额度、账期                | 企业协议客户                          |
| Channel            | channel_id        | 渠道类型、外部编码、结算方式              | OTA、自有渠道、线下前台等             |
| Booking            | booking_id        | 渠道、客人、入住离店、价格、订单状态      | 日租/短租交易订单                     |
| Lease              | lease_id          | 租约起止、押金、账单周期、租约状态        | 长租合同                              |
| CheckInRecord      | checkin_record_id | 入住登记、实际入住/离店、证件核验状态     | 住客入住执行记录                      |
| OccupancyLedger    | occupancy_id      | 房间、占用源、起止时间、状态、优先级      | 占用账本，用于冲突控制和审计          |
| InventoryLock      | lock_id           | 房间、锁定起止、过期时间、原因、状态      | 临时锁库对象                          |
| InventorySnapshot  | snapshot_id       | 房间、业务日、房态、可售状态、有效占用源  | 每日库存快照，用于查询和渠道分发      |
| Folio              | folio_id          | 业务类型、关联对象、金额、币种、到期日    | 账单头                                |
| FolioItem          | item_id           | 费用类型、数量、单价、税额、状态          | 账单明细                              |
| Payment            | payment_id        | 收款方式、金额、渠道流水、状态            | 收款台账                              |
| Refund             | refund_id         | 原支付单、退款金额、退款原因、状态        | 退款台账                              |
| PaymentAllocation  | allocation_id     | 支付单、账单明细、分摊金额                | 收款核销明细                          |
| DepositLedger      | deposit_id        | 关联对象、押金金额、余额、状态            | 押金台账                              |
| OwnerContract      | owner_contract_id | 产权主体、保底/分成规则、结算周期         | 自持可为空，包租/委托必须存在         |
| OwnerStatement     | statement_id      | 业主、结算周期、收入、扣费、净额、状态    | 业主结算单                            |
| WorkOrder          | work_order_id     | 工单类型、房间、指派人、状态、SLA         | 保洁/维修/巡检/服务工单               |
| RoomStatusEvent    | room_status_event_id | 房态变更前后值、触发来源、操作者       | 房态变更事件与审计对象                |

## 3.2 系统边界

- 主系统负责：房源主数据、库存与占用、订单、租约、账单、收退款台账、押金、业主结算、房态、工单、经营报表。
- 前台/PMS 协同系统负责：前台操作承载、自助入住终端、公安入住对接、门锁设备联动、酒店型客诉流程，但其业务动作必须通过主系统授权接口完成。
- 财务系统负责：总账、会计凭证、税务、供应商付款、财务报表；主系统向其输出交易与结算结果，不反向改写主业务状态。
- 渠道系统负责：订单输入、房价房态接收、取消回传；渠道不得直接改写主系统数据库，仅能通过 API / Webhook 集成。

## 3.3 权威数据矩阵

| **数据对象** | **主写系统** | **协同系统** | **最终权威** | **同步方向** | **说明** |
|--------------|--------------|--------------|--------------|--------------|----------|
| 订单 Booking | 主系统 | OTA、PMS/前台 | 主系统 | OTA/PMS -> 主系统，主系统 -> PMS/渠道 | 渠道订单进入主系统后生成内部订单号 |
| 租约 Lease | 主系统 | 电子签、前台 | 主系统 | 前台/电子签 -> 主系统，主系统 -> 财务/PMS | 前台仅发起动作，不持有最终租约状态 |
| 占用 OccupancyLedger | 主系统 | PMS/前台 | 主系统 | 主系统 -> PMS/渠道 | 所有占用必须先写入主系统账本 |
| 房态 Room Status | 主系统 | PMS/前台、工单、门锁 | 主系统 | PMS/工单事件 -> 主系统，主系统 -> 渠道/PMS | PMS 只可提交房态动作，不能跳过主系统直改 |
| 可售状态 Sellable Status | 主系统 | 渠道、运营后台 | 主系统 | 主系统 -> 渠道 | 可售状态由库存规则、运营封房和人工审批共同决定 |
| 入住/离店 CheckInRecord | 主系统 | PMS/前台、公安 | 主系统 | PMS/前台 -> 主系统，主系统 -> 公安/门锁 | 实际入住执行记录必须与订单或租约绑定 |
| 收款/退款结果 | 主系统 | 支付渠道 | 主系统 | 支付渠道 -> 主系统，主系统 -> 财务 | 渠道结果为输入，账务状态以主系统确认为准 |
| 业主结算单 OwnerStatement | 主系统 | 财务系统 | 主系统 | 主系统 -> 财务 | 财务接凭证和付款结果，不反写结算计算口径 |

## 3.4 边界约束

- PMS/前台不得绕过主系统直接创建入住、离店、换房、退款结果。
- 财务系统不得直接修改主系统账单、支付、押金余额；若需调整，应通过冲正、补记、作废流程回写主系统。
- 渠道取消、改期、重试必须带 `external_ref + source_system + idempotency_key`，主系统负责去重和状态折叠。
- 门锁、证件识别、自助机等设备接入均视为协同执行系统，其产生的事件必须进入主系统审计链路。

# 4. 总体技术架构

推荐采用“领域化单体 + 集成网关 + 事件总线”的分层架构，优先保证业务一致性，待门店规模继续扩大后逐步拆分服务。

| **接入层：管理后台 / 前台工作台 / 住客端小程序 / 业主端 / 渠道接口** |
|--------------------------------------------------------------------|
| **业务层：房源中心 / 参与方中心 / 库存与房态 / 订单中心 / 租约中心 / 账单中心 / 业主结算 / 工单中心** |
| 能力层：定价规则 / 权限 / 消息通知 / 支付 / 电子签 / 发票 / 身份核验 / 设备接入 |
| 数据层：OLTP 数据库 / Redis / 对象存储 / 搜索引擎 / 数据仓库 |
| 集成层：OTA / PMS / ERP / 门锁 / BI / 短信 / 企业微信 / 公安系统 |

## 4.1 设计原则

- 主事务链路优先一致性：订单确认、租约激活、支付入账、换房、退款、结算生成必须在主系统内完成状态落账。
- 集成链路优先可回放：所有入站回调、出站事件、外部同步均需记录请求、响应、签名校验和重试结果。
- 查询与分发优先性能：库存查询、价态分发、房态展示优先基于快照和投影，不直接扫描全量账本。
- 所有对外写接口必须支持幂等，所有关键状态变化必须产出审计事件。

## 4.2 部署建议

- 生产环境建议双可用区部署，数据库采用主备或托管高可用，关键链路支持自动故障转移。
- 前台、门锁、证件识别、自助机等设备接口必须设计离线降级机制，保证设备短时离线不影响在住客服务。
- 所有对外集成通过 API Gateway 或 Integration Service 收口，避免业务服务直接耦合第三方。
- 事件总线或消息队列需至少支撑“至少一次投递 + 消费端幂等”，不要求跨所有领域强一致分布式事务。

# 5. 领域模块设计

## 5.1 房源中心

- 管理 `Property / Building / Floor / RoomType / Room / OwnerContract`。
- 房源生命周期：筹备、在营、停售、维修、封房、退场。
- 产权模型：自持、包租、委托；每种模式拥有不同结算口径和合同要求。
- 支持一房多标签：可长租、可短租、可日租、可法人签约、可售渠道、是否支持门锁接入。
- 房源中心只负责定义静态属性和经营属性，不直接承载交易占用。

## 5.2 参与方中心

- 管理 `Guest / Tenant / Owner / CorporateAccount / Channel`。
- Guest 与 Tenant 可映射到同一自然人，但业务语义不同：
  - `Guest` 用于短租/日租住客、入住人、同住人。
  - `Tenant` 用于长租签约主体、租客信用与续租管理。
- Owner 需支持个人与企业两类主体，并维护默认结算方式、收款信息和税务标识。
- CorporateAccount 用于企业协议客户，支持协议价、账期、授信和联系人体系。
- Channel 需维护渠道类型、外部编码、幂等键规则、佣金口径、价税规则。

## 5.3 库存与房态中心

### 5.3.1 双层模型

- `OccupancyLedger` 为事实账本，记录所有有效或历史占用。
- `InventorySnapshot` 为每日快照，服务于查房态、售卖判断、渠道分发和报表统计。
- `InventoryLock` 为临时锁库对象，用于支付前保留、前台人工保留或渠道预占。

### 5.3.2 占用语义

- 统一时间语义采用半开区间 `[start_at, end_at)`。
- `BOOKING`：日租/短租占用，通常以夜晚库存为主；入住前与入住后均保留占用。
- `LEASE`：长租占用，以租约区间为主；激活租约后占用生效。
- `MAINTENANCE`：维修、保洁、巡检等运营占用，不允许售卖。
- `BLOCK`：人工封房、停用房、保留房等管理占用，不允许售卖。
- `LOCK`：临时锁库，不是最终交易结果，但在有效期内阻止并发售卖。

### 5.3.3 占用优先级与冲突规则

- 快照投影优先级：`BLOCK > MAINTENANCE > LEASE > BOOKING > LOCK > NONE`。
- 创建新占用时，`BOOKING / LEASE / MAINTENANCE / BLOCK` 之间不得存在时间重叠的有效记录。
- `LOCK` 不得与任何有效的 `BOOKING / LEASE / MAINTENANCE / BLOCK / LOCK` 重叠。
- 换房必须先在目标房校验无冲突，再迁移源订单/租约的占用，再释放原房占用。
- 延住本质上是延长现有 `BOOKING` 或 `LEASE` 的 `end_at`；若扩展区间冲突则必须失败。
- 提前离店本质上是缩短 `end_at` 并触发账单重算与房态调整。

### 5.3.4 锁库规则

- `InventoryLock` 必须包含 `expires_at`，超时后自动失效。
- 锁库默认仅用于支付前或人工操作中的短期保留，不用于长期占房。
- 锁库转订单成功时，原锁库应原子性转为已消耗或已释放，避免悬挂锁。
- No-show 订单在超出允许保留时间后必须释放锁库和占用，并产生审计事件。

### 5.3.5 房态与可售状态

| **概念** | **含义** | **典型取值** | **可由谁变更** |
|----------|----------|--------------|----------------|
| 房态 `room_status` | 描述房间当前运营实际状态 | VACANT_CLEAN、VACANT_DIRTY、OCCUPIED、INSPECTING、MAINTENANCE、OUT_OF_SERVICE | 主系统，来源可为前台、工单、离店保洁 |
| 可售状态 `sellable_status` | 描述房间当前是否允许售卖 | SELLABLE、UNSELLABLE、BLOCKED、HIDDEN | 主系统，来源可为运营后台、占用投影、封房规则 |

- `room_status` 由入住、离店、保洁完成、维修开始/结束、人工查房等动作驱动。
- `sellable_status` 由有效占用、封房、维修、渠道策略和人工停售共同决定。
- 房态变化必须落 `RoomStatusEvent`，包含前值、后值、触发来源、操作者、关联对象。

## 5.4 订单中心

- 管理日租/短租订单的生命周期、价格、取消规则、担保规则、来源渠道与入住执行。
- 支持订单拆分、换房、延住、提早离店、部分退款、No-show、改价审批。
- 订单确认时必须落地 `OccupancyLedger`，不得仅更新快照。
- 订单与入住记录解耦：一个订单可关联多个入住人和一个或多个入住执行记录。
- 企业协议订单需支持与 `CorporateAccount` 绑定，并允许部分挂账。

## 5.5 租约中心

- 管理长租签约、审核、电子签、续租、换租、退租、违约、押金转结。
- 租约激活前不得形成最终 `LEASE` 占用；电子签完成且首期应收满足条件后方可激活。
- 支持按月、半月、自然月或固定周期生成账单。
- 租约换房需要同步迁移占用、未结账单、押金挂账和门锁授权。

## 5.6 账单与收款中心

- 管理 `Folio / FolioItem / Payment / Refund / PaymentAllocation / DepositLedger`。
- `Folio` 表示应收账单头，`FolioItem` 表示可核销费用项。
- `Payment` 为收款流水；`PaymentAllocation` 将收款分配到一条或多条账单明细。
- `Refund` 必须关联原支付单，支持原路退和人工退。
- `DepositLedger` 独立于普通账单，管理押金收取、冻结、转结、扣罚、退还和余额。
- 所有账务调整通过“冲正、补记、作废”完成，不允许物理删除流水。

## 5.7 业主结算中心

- 支持固定租金、保底+分成、纯分成三类模式。
- 结算计算以已确认收入、退款、渠道费、平台费、清洁费、维修费、保底规则为基础。
- 结算单生成后进入审核流，审核通过后才可导出财务凭证或触发付款。
- 业主结算计算结果需可重算，但重算必须保留版本与原因。

## 5.8 工单中心

- 管理保洁、维修、巡检、住客服务工单。
- 工单需具备 `SLA、派工、受理、回单、照片留痕、费用归属、关联对象`。
- 保洁工单可驱动房态从 `VACANT_DIRTY -> INSPECTING -> VACANT_CLEAN`。
- 维修工单可驱动 `MAINTENANCE / OUT_OF_SERVICE` 房态，并影响可售状态。

# 6. 核心数据模型

## 6.1 建模原则

- 所有主业务实体必须具备内部主键、外部引用、来源系统、创建时间、更新时间、状态字段。
- 交易、占用、支付、退款、结算均采用“可追溯流水 + 状态流转”建模，不使用覆盖式写法隐藏历史。
- 所有时间字段使用项目时区统一解释；跨项目统计时再折算为集团口径时间。
- 所有枚举字段必须在附录统一定义，不允许同义不同值。

## 6.2 房源主数据层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| properties | property_id | name, city, timezone, currency, status | 项目主表 |
| buildings | building_id | property_id, code, name, status | 楼栋 |
| floors | floor_id | building_id, floor_no, name | 楼层 |
| room_types | room_type_id | property_id, name, capacity, area, tags | 房型模板 |
| rooms | room_id | property_id, building_id, floor_id, room_no, room_type_id, ownership_type, operation_status, sellable_status | 房间主表 |
| owner_contracts | owner_contract_id | owner_id, room_id, mode, guaranteed_amount, revenue_share_rule, start_date, end_date, settlement_cycle, status | 业主/包租合同 |

## 6.3 参与方层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| guests | guest_id | name, phone, id_type, id_no_masked, member_tags, source_system, external_ref | 住客档案 |
| tenants | tenant_id | name, phone, id_type, id_no_masked, credit_level, source_system, external_ref | 租客档案 |
| owners | owner_id | owner_type, name, settlement_profile, tax_profile, source_system, external_ref | 业主档案 |
| corporate_accounts | corporate_account_id | name, account_manager, billing_cycle, credit_limit, status | 企业协议客户 |
| channels | channel_id | channel_type, channel_code, settlement_mode, commission_rule, status | 渠道主数据 |

## 6.4 交易层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| bookings | booking_id | property_id, room_id, channel_id, guest_id, booking_status, checkin_at, checkout_at, rental_mode, total_amount, source_system, external_ref | 日租/短租订单 |
| booking_guests | id | booking_id, guest_id, role, is_primary | 订单住客关联 |
| leases | lease_id | property_id, room_id, tenant_id, lease_status, lease_start, lease_end, rent_amount, deposit_amount, billing_cycle, source_system, external_ref | 长租租约 |
| checkin_records | checkin_record_id | ref_type, ref_id, room_id, actual_checkin_at, actual_checkout_at, security_check_status, pms_ref, status | 入住执行记录 |

## 6.5 库存层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| occupancy_ledger | occupancy_id | room_id, source_type, source_id, start_at, end_at, occupancy_source, status, priority, created_by, source_system | 占用账本 |
| inventory_locks | lock_id | room_id, start_at, end_at, expires_at, reason, status, created_by, source_system | 临时锁库 |
| inventory_snapshots | snapshot_id | property_id, room_id, biz_date, room_status, sellable_status, effective_source_type, effective_source_id, generated_at | 每日库存快照 |
| room_status_events | room_status_event_id | room_id, before_status, after_status, trigger_type, trigger_ref_type, trigger_ref_id, operator_id, occurred_at | 房态变更事件 |

## 6.6 财务层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| folios | folio_id | biz_type, ref_type, ref_id, customer_type, customer_id, folio_status, amount_due, amount_paid, currency, due_date | 账单头 |
| folio_items | item_id | folio_id, fee_type, qty, unit_price, tax_amount, amount_due, item_status, business_date | 账单明细 |
| payments | payment_id | folio_id, payer_type, payer_id, amount, payment_method, payment_status, provider, channel_txn_no, paid_at, source_system, external_ref | 收款流水 |
| refunds | refund_id | payment_id, amount, refund_status, reason_code, original_path_flag, provider_refund_no, refunded_at | 退款流水 |
| payment_allocations | allocation_id | payment_id, folio_item_id, amount, allocation_status | 核销分摊 |
| deposit_ledger | deposit_id | ref_type, ref_id, amount, balance, deposit_status, transaction_type, related_payment_id, related_refund_id | 押金台账 |
| owner_statements | statement_id | owner_id, property_id, period_start, period_end, gross_income, deductions, net_amount, statement_status, version_no | 业主结算单 |
| owner_statement_items | id | statement_id, fee_category, amount, rule_snapshot | 业主结算明细 |

## 6.7 运营层

| **实体** | **主键** | **关键字段** | **说明** |
|----------|----------|--------------|----------|
| work_orders | work_order_id | type, room_id, ref_type, ref_id, assignee_id, work_order_status, sla_due_at, cost_owner_type, cost_owner_id | 工单 |
| work_order_logs | id | work_order_id, action, operator_id, result, attachment_ref, occurred_at | 工单日志 |

## 6.8 关键关系与约束

- `rooms` 与 `owner_contracts`：包租/委托房源在经营期内必须被有效合同覆盖；自持房源可无合同但必须标记为 `SELF`。
- `bookings` / `leases` 与 `occupancy_ledger`：每个有效订单或有效租约都必须存在至少一条对应占用记录。
- `inventory_locks`：同一时间段内，同一房间只能存在一条有效锁库。
- `checkin_records`：必须关联 `booking` 或 `lease`，不允许无来源入住。
- `payments.channel_txn_no`：在 `provider + channel_txn_no` 维度必须唯一。
- `refunds`：累计退款金额不得超过原支付金额。
- `payment_allocations`：累计分摊金额不得超过支付金额与账单应收余额的较小值。
- `deposit_ledger.balance`：余额不得小于零；押金扣罚、转结、退款均需生成台账记录。
- `folio_items`：不允许物理删除，仅允许冲正、作废或新增反向分录。
- `owner_statements`：同一业主、同一项目、同一周期允许多版本，但仅一个版本可处于已生效状态。

## 6.9 生命周期与状态机

### 6.9.1 Booking

`draft -> pending_payment -> confirmed -> checked_in -> checked_out`

终态：`cancelled / no_show`

### 6.9.2 Lease

`draft -> signing -> signed -> active`

中间态：`renewing / transferring`

终态：`terminated / completed / cancelled`

### 6.9.3 InventoryLock

`locked -> consumed / expired / released`

### 6.9.4 Payment

`initiated -> authorized -> succeeded`

异常态：`failed / cancelled`

### 6.9.5 Refund

`requested -> processing -> succeeded`

异常态：`failed / cancelled`

### 6.9.6 Folio

`draft -> issued -> partially_paid -> paid`

异常态：`voided / reversed / overdue`

### 6.9.7 WorkOrder

`new -> assigned -> in_progress -> resolved -> verified`

终态：`closed / cancelled`

# 7. 关键业务流程

## 7.1 短租预订流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 创建订单草稿 | Booking: `draft` | 渠道、房间、入住离店时间合法 | 返回参数错误，不写占用 |
| 申请锁库 | InventoryLock: `locked` | 房间在 `[checkin_at, checkout_at)` 无有效占用和锁库 | 锁库失败则订单停留 `draft` |
| 发起支付/担保 | Booking: `pending_payment` | 金额、币种、支付渠道可用 | 支付失败释放锁库 |
| 确认订单 | Booking: `confirmed`; OccupancyLedger 新增 `BOOKING` | 幂等校验、库存再次校验、锁库仍有效 | 任一步失败则回滚确认并释放锁库 |
| 办理入住 | Booking: `checked_in`; CheckInRecord 创建 | 订单已确认、身份核验通过、房态允许入住 | 入住失败不改订单主状态 |
| 办理离店 | Booking: `checked_out`; 房态改为 `VACANT_DIRTY` | 在住状态、未结费用规则、押金规则 | 离店失败保留在住状态 |
| 触发保洁 | WorkOrder 新建 | 离店成功 | 工单失败进入待派工队列 |

## 7.2 长租签约流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 创建租约草稿 | Lease: `draft` | 房源、租客、租期、租金规则合法 | 返回参数错误 |
| 审核租客与条款 | Lease: `signing` | 身份、授信、合同条款齐备 | 审核失败退回 `draft` |
| 电子签完成 | Lease: `signed` | 签署证据回传完整 | 电子签失败保留 `signing` |
| 收首期款与押金 | Payment/DepositLedger 写入 | 金额齐备、支付成功 | 支付失败不得激活租约 |
| 激活租约 | Lease: `active`; OccupancyLedger 新增 `LEASE` | 时间冲突校验、账单计划已生成 | 激活失败撤回占用并标记待处理 |
| 周期出账 | Folio/FolioItem 生成 | 账单周期规则明确 | 出账失败进入待重试任务 |

## 7.3 换房流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 发起换房申请 | Booking/Lease 标记 `transferring` | 订单或租约处于允许换房状态 | 不满足条件直接拒绝 |
| 校验目标房库存 | 无 | 目标房在目标区间无有效占用 | 失败则不进入迁移 |
| 迁移占用 | 原房占用缩短或关闭，目标房新增占用 | 时间区间连续、无重叠 | 任一步失败则维持原房占用 |
| 调整账单与押金 | Folio/FolioItem/DepositLedger 更新 | 房价差额、服务费、押金规则正确 | 账务失败则挂起人工处理 |
| 更新房态与入住记录 | RoomStatusEvent、CheckInRecord 更新 | 原房/新房房态可切换 | 回写失败需记录补偿任务 |

## 7.4 退款流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 发起退款申请 | Refund: `requested` | 原支付存在、可退余额充足 | 失败则不生成退款单 |
| 审批或自动判定 | Refund: `processing` | 取消规则、违约金、押金扣罚已结清 | 不满足条件则拒绝退款 |
| 调用支付渠道 | Refund: `processing` | 渠道状态可用、幂等键有效 | 渠道超时进入重试 |
| 渠道成功回写 | Refund: `succeeded`; Payment/Folio 更新 | 金额与原单一致 | 回写失败进入补偿队列 |
| 释放资源 | 订单取消时释放占用/锁库 | 订单未入住或符合提前离店规则 | 若释放失败则阻塞关闭流程 |

## 7.5 押金转结流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 确认待转结押金 | DepositLedger 创建或读取余额 | 押金余额充足 | 余额不足则失败 |
| 生成转结分录 | DepositLedger 新增转结记录 | 目标账单存在且可收款 | 失败则不影响原余额 |
| 生成核销 | PaymentAllocation 或专用转结分摊写入 | 转结金额不超过押金余额与应收余额 | 失败则回滚转结分录 |
| 更新账单状态 | Folio 变为 `partially_paid` 或 `paid` | 账单余额正确 | 异常则进入财务复核 |

## 7.6 业主结算流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 归集周期收入 | 无 | 仅统计已确认收入和有效退款 | 数据不完整则终止生成 |
| 计算扣费 | 无 | 渠道费、平台费、清洁费、维修费归属规则明确 | 规则缺失进入人工复核 |
| 生成结算单 | OwnerStatement: `draft` | 合同版本有效、周期未重复生效 | 冲突则拒绝生成 |
| 审核 | OwnerStatement: `approved` | 金额、附件、规则快照齐备 | 审核失败退回草稿 |
| 记账/付款 | OwnerStatement: `posted` / `paid` | 财务系统回执成功 | 回执失败保留待处理状态 |

## 7.7 离店保洁联动流程

| **步骤** | **状态变化** | **关键校验** | **失败补偿** |
|----------|--------------|--------------|--------------|
| 办理离店 | RoomStatus -> `VACANT_DIRTY` | 订单或租约已离店 | 失败则不触发工单 |
| 自动创建保洁工单 | WorkOrder: `new` | 房间需要保洁 | 创建失败进入补偿任务 |
| 派工并执行 | WorkOrder: `assigned -> in_progress -> resolved` | SLA 与执行人有效 | 逾期需升级 |
| 查房完成 | RoomStatus -> `INSPECTING` / `VACANT_CLEAN` | 结果与照片齐备 | 查房失败退回保洁 |
| 恢复可售 | SellableStatus -> `SELLABLE` | 无其他占用或维修封房 | 若仍有封房则保持不可售 |

# 8. API 设计规范

## 8.1 通用规范

- 接口风格采用 REST + Webhook；高频内部调用可逐步演进为 gRPC，但外部契约以 HTTP API 为准。
- 对外 API 统一经过网关，支持签名、限流、权限控制、审计日志、版本管理。
- 所有写接口必须支持以下公共字段：
  - `request_id`：调用方请求唯一标识。
  - `idempotency_key`：幂等键；同业务动作重试必须复用。
  - `operator`：操作者或系统操作者信息。
  - `source_system`：调用来源系统。
- 所有接口返回应至少包含：
  - `code`
  - `message`
  - `trace_id`
  - `data`
- 所有接口错误码需归类为：参数错误、权限错误、状态冲突、库存冲突、幂等冲突、外部依赖失败、系统错误。

## 8.2 最小可实施接口契约

| **接口** | **用途** | **关键请求字段** | **关键响应字段** | **幂等语义** | **核心错误码** |
|----------|----------|------------------|------------------|--------------|----------------|
| `POST /api/v1/bookings` | 创建日租/短租订单 | request_id, idempotency_key, source_system, channel_id, guest_id, room_id, checkin_at, checkout_at, price_items | booking_id, booking_status, total_amount, occupancy_preview | 同一 `source_system + idempotency_key` 只能创建一个订单 | `ROOM_CONFLICT`, `PRICE_INVALID`, `IDEMPOTENCY_CONFLICT` |
| `POST /api/v1/inventory/locks` | 申请临时锁库 | request_id, idempotency_key, room_id, start_at, end_at, expires_at, reason | lock_id, status, expires_at | 重试返回同一锁库结果 | `ROOM_CONFLICT`, `LOCK_EXPIRED`, `TIME_RANGE_INVALID` |
| `POST /api/v1/bookings/{id}/check-in` | 确认入住 | request_id, idempotency_key, operator, guests, actual_checkin_at, verification_result | checkin_record_id, booking_status, room_status | 同一订单同一入住动作只生效一次 | `BOOKING_STATUS_INVALID`, `SECURITY_CHECK_FAILED`, `ROOM_STATUS_INVALID` |
| `POST /api/v1/checkouts` | 办理离店 | request_id, idempotency_key, ref_type, ref_id, actual_checkout_at, settlement_option | checkout_result, pending_amount, room_status | 同一离店动作重复提交返回同结果 | `REF_STATUS_INVALID`, `UNSETTLED_FOLIO`, `ROOM_STATUS_INVALID` |
| `POST /api/v1/leases` | 创建长租租约 | request_id, idempotency_key, tenant_id, room_id, lease_start, lease_end, rent_amount, deposit_amount, billing_cycle | lease_id, lease_status, payment_plan | 同一请求只创建一个租约草稿 | `ROOM_CONFLICT`, `LEASE_TERM_INVALID`, `IDEMPOTENCY_CONFLICT` |
| `POST /api/v1/folios/generate` | 生成账单 | request_id, idempotency_key, ref_type, ref_id, billing_period, fee_items | folio_id, folio_status, amount_due | 同一来源同一周期不可重复生成生效账单 | `FOLIO_ALREADY_EXISTS`, `BILLING_RULE_INVALID` |
| `POST /api/v1/folios/{id}/payments` | 账单收款 | request_id, idempotency_key, amount, payment_method, provider, channel_txn_no, paid_at | payment_id, payment_status, folio_status, allocated_amount | 同一渠道流水不可重复入账 | `PAYMENT_DUPLICATED`, `AMOUNT_INVALID`, `FOLIO_STATUS_INVALID` |
| `POST /api/v1/payments/{id}/refunds` | 发起退款 | request_id, idempotency_key, amount, reason_code, original_path_flag | refund_id, refund_status, refundable_amount | 同一退款请求重复提交返回同退款单 | `REFUND_AMOUNT_EXCEEDED`, `PAYMENT_STATUS_INVALID`, `PROVIDER_UNAVAILABLE` |
| `POST /api/v1/room-transfers` | 换房 | request_id, idempotency_key, ref_type, ref_id, from_room_id, to_room_id, effective_at, reason | transfer_id, ref_status, folio_adjustment_preview | 同一业务对象同一生效时间只允许一次有效换房 | `TARGET_ROOM_CONFLICT`, `TRANSFER_NOT_ALLOWED`, `FOLIO_ADJUST_FAILED` |
| `POST /api/v1/owner-statements/generate` | 生成业主结算单 | request_id, idempotency_key, owner_id, property_id, period_start, period_end | statement_id, statement_status, net_amount | 同业主同周期重复请求返回同版本或显式冲突 | `STATEMENT_ALREADY_EFFECTIVE`, `RULE_SNAPSHOT_MISSING` |

### 8.2.1 iOS 前台 App 推荐接口

- iOS 前台 App 作为前台协同客户端，写操作复用本章通用交易接口；App 专属接口以认证、视图聚合和增量同步为主。
- 移动端不作为 Webhook 接收端；实时同步采用“API 增量拉取 + 可选推送提醒”的模式。

| **接口** | **用途** | **关键请求字段** | **关键响应字段** | **说明** |
|----------|----------|------------------|------------------|----------|
| `POST /api/v1/frontdesk/app-sessions` | 前台 App 登录/换班建会话 | username, password_or_ticket, device_id, property_id | access_token, refresh_token, operator_profile, shift_context | 令牌需绑定设备和项目 |
| `POST /api/v1/frontdesk/devices/register` | 注册设备 | device_id, device_model, os_version, app_version, push_token | device_status, capabilities | 用于设备审计、远程失效和推送能力登记 |
| `GET /api/v1/frontdesk/dashboard` | 拉取前台首页聚合数据 | property_id, biz_date | arrivals_count, departures_count, in_house_count, dirty_room_count, alerts | 仅返回当前项目可见数据 |
| `GET /api/v1/frontdesk/arrivals` | 今日预抵清单 | property_id, biz_date, cursor | items, next_cursor, server_time | 支持分页与增量刷新 |
| `GET /api/v1/frontdesk/departures` | 今日预离清单 | property_id, biz_date, cursor | items, next_cursor, server_time | 支持分页与增量刷新 |
| `GET /api/v1/frontdesk/room-board` | 房态总览 | property_id, biz_date, updated_since | rooms, snapshot_version, server_time | 返回房态、可售状态、在住摘要 |
| `GET /api/v1/frontdesk/bookings/{id}` | 订单详情 | booking_id | booking, folio_summary, guests, room_status | 用于入住、离店、换房前复核 |
| `GET /api/v1/frontdesk/sync` | 前台增量同步 | property_id, cursor, entity_types | changes, tombstones, next_cursor, server_time | 统一同步房态、订单摘要、入住状态等变更 |

## 8.3 事件与 Webhook 契约

### 8.3.1 通用字段

| **字段** | **说明** |
|----------|----------|
| event_id | 事件唯一标识 |
| event_type | 事件类型 |
| occurred_at | 事件发生时间 |
| trace_id | 链路追踪标识 |
| aggregate_type | 聚合根类型，如 booking / lease / payment |
| aggregate_id | 聚合根主键 |
| idempotency_key | 触发该事件的幂等键 |
| version | 事件版本 |
| payload | 事件负载 |
| retry_policy | 重试策略描述 |

### 8.3.2 建议事件主题

- `booking.created`
- `booking.confirmed`
- `booking.cancelled`
- `booking.no_show`
- `guest.checked_in`
- `guest.checked_out`
- `lease.signed`
- `lease.activated`
- `folio.issued`
- `payment.succeeded`
- `refund.succeeded`
- `room.status.changed`
- `work_order.resolved`
- `owner_statement.generated`

### 8.3.3 Webhook 规则

- 所有出站 Webhook 必须使用签名头，并提供事件重放能力。
- 消费方返回非 2xx 时允许重试；重试策略至少支持指数退避和最大重试次数。
- 接收方必须基于 `event_id` 做消费去重，不得假设同一事件只投递一次。
- Webhook 发送和回调处理均需落集成日志，包含请求体、签名摘要、响应码、重试次数。

# 9. 外部系统集成

## 9.1 集成总原则

- 所有入站回调必须校验签名、来源 IP 白名单或等效安全策略。
- 所有入站请求必须基于 `external_ref + source_system + idempotency_key` 去重。
- 所有出站调用必须记录请求报文、响应报文、状态码、耗时和重试结果。
- 所有第三方失败都必须有降级路径：重试、人工补单、人工对账或事件补偿。

## 9.2 外部系统集成约束

| **外部系统** | **接入方式** | **核心数据** | **主约束** |
|--------------|---------------|--------------|------------|
| OTA / 渠道 | API + Webhook | 房态、价态、订单、取消 | 渠道订单入站必须幂等；房态价态出站以主系统快照为准 |
| 酒店前台 / PMS | API | 入住、离店、换房、在住状态 | 前台动作通过主系统 API 完成；避免双向直写冲突 |
| 支付 | SDK / API | 收款、退款、对账 | `provider + channel_txn_no` 唯一；退款需绑定原支付 |
| 电子签 | API | 租约、补充协议 | 必须保留签署证据、文件快照和签署时间 |
| ERP | API / 文件 | 凭证、科目、应收应付 | 主系统输出结果单据，ERP 不反写交易核心状态 |
| 门锁 / 设备 | MQTT / API | 开锁、入住授权、告警 | 需支持离线容错、授权回传和失败告警 |
| 公安 / 身份核验 | API | 身份核验、入住登记 | 实际入住记录与核验结果必须绑定存档 |
| iOS 前台 App | API + 增量同步 | 房态、今日到离住、入住执行、收款摘要 | 不直连数据库；以主系统返回为准；写操作必须幂等 |

## 9.3 特殊集成规则

- OTA 改期或取消若与主系统当前状态冲突，应进入人工复核队列，不得自动覆盖已入住或已离店状态。
- 支付回调可能先于业务确认到达；主系统必须允许“先回调、后补单”的匹配流程，但需保留异常台账。
- 门锁授权需与 `CheckInRecord` 绑定；授权失败不得影响账务落账，但必须阻塞自助入住完成。
- ERP 对账差异不得直接改写 `payments / refunds / folios`，应通过差异单或调整单回到主系统处理。

## 9.4 iOS 前台 App 对接规范

### 9.4.1 系统定位

- iOS 前台 App 属于前台协同终端，不是主数据系统，也不是最终权威源。
- App 推荐使用固定 `source_system = IOS_FRONTDESK_APP`，并为每台设备分配唯一 `device_id`。
- App 仅能访问已授权项目、门店和班次内的数据；跨项目切换必须重新获取上下文。
- App 不得直连业务数据库，不得绕过网关直接调用内部服务。

### 9.4.2 同步数据范围

- 建议同步到移动端的数据：
  - 今日预抵、预离、在住清单
  - 房态总览、可售状态、脏房/维修房摘要
  - 订单详情摘要、住客信息摘要、入住记录摘要
  - 账单汇总、待收金额、支付结果、退款结果
  - 门锁授权结果、异常告警、待办任务
- 默认不下发到移动端的数据：
  - 完整业主结算明细
  - 全量财务流水原始报表
  - 非当前项目或非当前班次的敏感经营数据
  - 未授权查看的完整证件影像和敏感支付信息

### 9.4.3 同步模式

- 首次登录后按 `property_id + biz_date` 拉取前台首页、房态总览和今日到离住基础快照。
- 后续同步采用基于 `cursor` 或 `updated_since` 的增量拉取，服务端返回：
  - `changes`：新增或更新对象
  - `tombstones`：删除或失效对象引用
  - `next_cursor`：下一次同步游标
  - `server_time`：服务端时间
- 写操作成功后，服务端必须立即返回最新业务状态；App 不应以本地预测状态替代服务端确认状态。
- 如需更实时的提示，可叠加 WebSocket、SSE 或 APNs 静默推送作为“有变更请拉取”的提醒机制，但最终数据仍以同步接口为准。

### 9.4.4 离线与弱网策略

- App 可离线缓存最近一次同步的房态看板、今日到离住清单和当前正在处理的订单摘要。
- 本地缓存必须加密存储，且在用户退出登录、切换项目或设备失效后立即清除。
- 弱网场景下允许暂存草稿数据，如入住登记表单、证件采集结果、备注信息。
- 以下高风险动作必须以服务端成功响应为准，不能仅依赖本地排队后默认为成功：
  - 入住
  - 离店
  - 换房
  - 收款
  - 退款
  - 房态人工改写
- 如需建设“断网应急办理入住”能力，应作为独立应急模式设计，不纳入 v1 默认能力。

### 9.4.5 冲突处理与幂等

- 主系统为最终权威；App 发现本地缓存与服务端状态不一致时，应以服务端返回结果覆盖本地展示。
- 所有写操作必须携带：
  - `request_id`
  - `idempotency_key`
  - `operator`
  - `source_system`
  - `device_id`
- 建议读接口与写接口返回 `version_no` 或 `updated_at`；App 发起高风险操作时应携带最近读取到的版本号，用于检测“他人已更新”冲突。
- 若服务端返回 `STATE_CONFLICT`、`ROOM_CONFLICT`、`BOOKING_STATUS_INVALID` 等冲突类错误，App 必须先刷新详情再允许用户二次确认，不得自动重试覆盖。
- 多次点击或网络重试必须复用同一个 `idempotency_key`，避免重复入住、重复收款、重复换房。

### 9.4.6 门锁与设备联动

- App 发起开锁、补发房卡或门锁授权时，必须先向主系统请求授权，再由主系统或受控设备网关下发。
- 门锁授权动作必须绑定 `CheckInRecord`、`room_id`、`operator_id` 和有效期。
- 门锁或设备执行失败时，App 应展示失败原因，并保留可重试或转人工处理入口。
- 任何设备侧成功或失败事件都必须回写主系统并进入审计链路。

### 9.4.7 安全要求

- App 会话应采用短期 `access_token + refresh_token` 模式，并支持单设备下线、远程注销和强制重新登录。
- 设备丢失、越权、账号离职或权限回收后，应能立即失效该设备的访问令牌。
- S1 级敏感字段默认脱敏展示；只有具备明确权限的岗位才可查看完整信息。
- App 应记录关键本地操作日志并回传服务端，用于排查误操作和审计补链。

# 10. 安全、权限与审计

## 10.1 权限模型

- 采用 `RBAC + 数据域隔离`：集团、项目、门店、角色、岗位维度组合授权。
- 关键高风险动作需支持二次确认或审批：改价、免单、大额退款、手工关账、人工改房态、业主结算生效。
- 系统操作与人工操作必须可区分，`operator_type` 至少支持 `USER / SYSTEM / INTEGRATION`。
- 移动端前台 App 应启用设备绑定、令牌过期控制、远程失效和最小必要数据下发策略。

## 10.2 敏感数据分级

| **级别** | **数据示例** | **控制要求** |
|----------|--------------|--------------|
| S1 | 身份证号、护照号、支付账号、完整联系方式 | 加密存储、默认脱敏展示、严格权限控制 |
| S2 | 姓名、企业信息、签约文件、结算账户信息 | 受角色控制，导出需审批或留痕 |
| S3 | 房态、工单、经营数据 | 按项目或岗位授权访问 |

## 10.3 审计要求

- 所有关键动作必须记录审计日志：下单、改价、取消、免单、退款、换房、退租、押金转结、结算审核、人工改房态。
- 审计日志至少包含：
  - `audit_id`
  - `operator_id`
  - `operator_type`
  - `source_system`
  - `request_id`
  - `trace_id`
  - `aggregate_type`
  - `aggregate_id`
  - `action`
  - `before_snapshot`
  - `after_snapshot`
  - `reason`
  - `occurred_at`
- 审计日志应支持按项目、房间、订单、租约、支付单、业主结算单检索。

# 11. 非功能要求

- 可用性：核心交易链路目标 99.9% 以上。
- 性能：
  - 房态查询 P95 < 300ms
  - 订单创建 P95 < 800ms
  - 锁库接口 P95 < 500ms
  - 批量结算任务支持 500 间规模在夜间窗口完成
- 可观测性：统一日志、指标、链路追踪、审计事件、外部调用重试监控。
- 备份恢复：事务库支持每日全量备份与分钟级 binlog / WAL 恢复。
- 集成可靠性：Webhook 与异步消息消费默认按至少一次处理，消费端必须具备幂等能力。

# 12. 推荐实施顺序与阶段边界

| **阶段** | **范围** | **必备交付** | **阶段边界说明** |
|----------|----------|--------------|------------------|
| Phase 1 | 房源、参与方、库存、短租订单、锁库、入住离店、支付 | 打通短租经营闭环；完成占用账本、库存快照、订单、入住、收款 | 不含长租租约、业主结算、复杂工单 |
| Phase 2 | 长租租约、账单、押金、水电、电子签 | 打通长租签约与周期出账闭环 | 不含业主结算和财务集成深度联动 |
| Phase 3 | 业主结算、财务对接、工单、报表 | 打通资产与财务闭环；实现业主结算审核、工单回写、经营报表 | BI 深度分析和自动化优化可后置 |
| Phase 4 | 渠道扩展、设备接入、BI、自动化运营 | 规模化优化；补充更多渠道、门锁、自助机、自动化流程 | 持续迭代 |

## 12.1 阶段验收映射原则

- Phase 1 验收只要求短租闭环成立，不要求业主结算完成。
- Phase 2 验收要求租约、押金、周期出账可闭环，不要求完整财务清分。
- Phase 3 验收要求业主结算、工单、财务对接可闭环，形成完整 v1 能力。
- 完整 v1 验收以第 14 章为准。

# 13. 开发团队协作建议

- 采用领域负责人机制：房源/库存、交易、租约、财务结算、工单集成分别归属明确 owner。
- 所有跨模块接口必须先定义 schema、枚举和幂等规则，再开始联调。
- 所有业务状态变更都应绑定至少一个测试场景和一个审计场景。
- 上线前必须完成三类压测：高并发查房态、渠道重试风暴、批量结算任务。
- 集成联调必须准备异常剧本：重复回调、乱序回调、第三方超时、部分成功、人工补单。

# 14. 完整 v1 验收标准

## 14.1 核心业务能力

- □ 同一房间不能被订单、租约、维修、封房或锁库重复占用。
- □ 支持同房源在不同日期按日租、短租、长租经营。
- □ 支持锁库、订单确认、No-show 释放、提前离店、延住、换房。
- □ 支持包租与委托业主的差异化结算。
- □ 支持押金、收款、退款、违约金、部分收款、押金转结。

## 14.2 运营协同能力

- □ 支持入住登记、离店、保洁工单联动房态。
- □ 支持维修或封房导致的不可售控制。
- □ 支持门锁/设备授权与失败回传。
- □ 支持 iOS 前台 App 展示房态看板、今日预抵/预离/在住清单，并与主系统保持增量同步。

## 14.3 集成能力

- □ 支持 OTA 订单接入与房态回传。
- □ 支持支付回调、退款回调与对账唯一键控制。
- □ 支持电子签结果回传与租约激活联动。
- □ 支持业主结算单导出或推送财务系统。
- □ 支持 iOS 前台 App 通过 API 完成入住、离店、换房、收款等操作，且所有写操作具备幂等能力。

## 14.4 数据与审计能力

- □ 所有关键流程都能映射到实体、状态机和接口，不存在“有流程无数据承载”。
- □ 所有关键动作均有审计日志与状态变更记录。
- □ 所有外部集成都有失败策略：重试、补偿、去重、人工介入点。
- □ 经营日报、入住报表、业主结算单可基于标准数据对象生成。
- □ 支持 iOS 前台 App 与 Web/PMS 并发操作时的冲突检测、刷新提示和重复提交防护。

# 附录 A：命名建议

- `ownership_type`: `SELF / MASTER_LEASE / CONSIGNMENT`
- `rental_mode`: `DAILY / SHORT_STAY / LONG_STAY`
- `occupancy_source`: `BOOKING / LEASE / MAINTENANCE / BLOCK / LOCK`
- `room_status`: `VACANT_CLEAN / VACANT_DIRTY / OCCUPIED / INSPECTING / MAINTENANCE / OUT_OF_SERVICE`
- `sellable_status`: `SELLABLE / UNSELLABLE / BLOCKED / HIDDEN`
- `booking_status`: `DRAFT / PENDING_PAYMENT / CONFIRMED / CHECKED_IN / CHECKED_OUT / CANCELLED / NO_SHOW`
- `lease_status`: `DRAFT / SIGNING / SIGNED / ACTIVE / RENEWING / TRANSFERRING / TERMINATED / COMPLETED / CANCELLED`
- `folio_status`: `DRAFT / ISSUED / PARTIALLY_PAID / PAID / VOIDED / REVERSED / OVERDUE`
- `payment_status`: `INITIATED / AUTHORIZED / SUCCEEDED / FAILED / CANCELLED`
- `refund_status`: `REQUESTED / PROCESSING / SUCCEEDED / FAILED / CANCELLED`
- `work_order_status`: `NEW / ASSIGNED / IN_PROGRESS / RESOLVED / VERIFIED / CLOSED / CANCELLED`
- `fee_type`: `RENT / ROOM_CHARGE / DEPOSIT / WATER / ELECTRIC / SERVICE / CLEANING / PENALTY / CHANNEL_FEE / PLATFORM_FEE / REPAIR_FEE`
- `source_system`: `WEB_ADMIN / WEB_FRONTDESK / IOS_FRONTDESK_APP / MINI_PROGRAM / OTA / PMS / PAYMENT_GATEWAY / ERP / DEVICE_GATEWAY`

# 附录 B：通用错误码建议

- `VALIDATION_ERROR`：参数校验失败
- `PERMISSION_DENIED`：权限不足
- `STATE_CONFLICT`：状态不允许
- `ROOM_CONFLICT`：库存或占用冲突
- `IDEMPOTENCY_CONFLICT`：幂等键冲突
- `EXTERNAL_DEPENDENCY_ERROR`：第三方依赖失败
- `AUDIT_REQUIRED`：需要审批或复核
- `SYSTEM_ERROR`：系统内部错误
