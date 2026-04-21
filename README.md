# 凯燕环球中心后台

这是一个面向酒店式公寓内部运营的后台系统，当前重点覆盖：

- 房间收益 / 成本分析
- 在管 / 在卖房源池管理
- 业主姓名与联系方式查看
- 房间成本录入
- 房源状态切换与历史归档
- Web 后台登录保护

## 技术栈

- Node.js 24
- TypeScript
- Fastify
- Prisma Client
- SQLite
- Vitest

## 本地启动

```bash
npm install
npm run prisma:generate
npm run db:reset
npm run prisma:seed
npm run dev
```

默认访问：

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/economics/`

## 常用命令

```bash
npm run build
npm test
npm run db:init
npm run db:backup
npm run prisma:seed
npm run admin:user -- --username kaiyan-admin --password your-password --display-name "凯燕管理员"
```

说明：

- `db:init`：初始化数据库，或在现有数据库上自动补应用尚未执行的新 migration
- `db:backup`：备份 SQLite 数据库到 `prisma/backups`
- `admin:user`：创建或重置后台登录账号

## 后台账号

当前 Web 登录基于数据库用户，不再只依赖单一环境变量账号。

默认会读取以下环境变量作为“首个管理员引导账号”：

```env
WEB_ADMIN_USERNAME=
WEB_ADMIN_PASSWORD=
WEB_ADMIN_DISPLAY_NAME=
WEB_ADMIN_SESSION_DAYS=14
WEB_ADMIN_COOKIE_SECURE=false
```

如果数据库里还没有管理员账号，启动应用时会自动创建这一位管理员。

## 数据库与迁移

当前数据库仍为 SQLite：

```env
DATABASE_URL="file:./dev.db"
```

数据库文件默认位于：

- `prisma/dev.db`

项目使用自维护 migration 目录：

- `prisma/migrations`

`scripts/init-db.ts` 现在支持两种场景：

- 新建数据库并执行全部 migration
- 对已有数据库自动补执行尚未应用的新 migration

## 操作审计

当前会记录以下后台审计事件：

- 管理员登录成功
- 管理员登录失败
- 管理员退出登录
- 房间成本录入 / 更新
- 房源在管状态变更

可通过接口查看最近审计：

- `GET /api/v1/web-admin/audit-logs?limit=50`

## 自动发布

已接入 GitHub Actions 自动发布到腾讯云轻量应用服务器。

触发方式：

- push 到 `main`
- 手动执行 workflow

自动发布会执行：

1. 拉取最新 `main`
2. 备份线上 SQLite 数据库
3. 执行 `npm ci`
4. 执行 `npm run db:init`
5. 执行 `npm run prisma:generate`
6. 执行 `npm run build`
7. 重启 PM2
8. 进行健康检查
9. 失败时回滚到上一版本

工作流文件：

- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

服务器部署脚本：

- [`scripts/deploy-production.sh`](./scripts/deploy-production.sh)

## 线上环境

当前线上域名：

- `http://kaiyan.host/`

正式启用前建议继续补齐：

- HTTPS
- 自动定时数据库备份
- 更细的后台角色权限
- 备份恢复演练

## 测试

```bash
npm test
```

当前已覆盖的关键测试包括：

- 重复占用冲突
- 前台同步
- 房间收益 / 成本聚合
- 登录保护
- 活跃在管房源范围
- 整栋底表范围
- 200 房压力样本
- 成本录入
