# 钉钉审批同步 设计文档

- **日期**：2026-09-15
- **项目**：四川农业大学水利水电学院物品管理系统
- **目标**：把钉钉「物品借用2026-2027」审批的数据同步进网站，自动扣减库存，匹配不准的人工兜底

> **⚠️ 现状更新（2026-09-16）**：本文档是 09-15 的设计记录，其中提到的
> `scripts/sync-dingtalk.py` 与 `.github/workflows/sync-dingtalk.yml`（GitHub 定时器方案）
> **已被移除**，原因是两套同步逻辑并存会重复插入记录、重复扣库存。
> 现行唯一实现是 Supabase Edge Function：`supabase/functions/sync-dingtalk/index.ts`，
> 由前端打开「钉钉审批」页时触发。被删文件已备份至
> `~/Downloads/claude code/备份/scau-water-inventory-旧同步方案-2026-09-16/`。

---

## 1. 背景

学院借东西已在钉钉上走审批，但网站的物品库存需要人工维护。本方案把审批数据自动同步进网站，让库存数字跟着审批走。

**已验证的事实**（2026-09-15 实测，非推测）：

| 项目 | 结论 |
|---|---|
| 换 token | `POST https://api.dingtalk.com/v1.0/oauth2/accessToken`，字段名 **`appKey`/`appSecret`** |
| token 位置 | header `x-acs-dingtalk-access-token`；旧版 oapi 接口放 query 参数 |
| 读表单结构 | `GET api.dingtalk.com/v1.0/workflow/forms/schemas/processCodes?processCode=X` |
| 列实例 ID | `POST oapi.dingtalk.com/topapi/processinstance/listids?access_token=X` |
| 读实例详情 | `POST oapi.dingtalk.com/topapi/processinstance/get?access_token=X` |
| 旧版接口成功判定 | body 里 `errcode == 0`（**不是** HTTP 200）|
| 所需权限 | `Workflow.Form.Read`、`qyapi_aflow`（均已开通）|
| access_token 有效期 | 7200 秒 |

**实测到的真实数据样例**：

```
借用部门=实践部  负责人=陈舒可  电话=15208454503  用途=社会实践总结交流会
物品明细1=[{"rowValue":[
   {"label":"物品名称","value":"院旗"},
   {"label":"物品数量","value":"1"}]}]
借用时间=2026-09-10  归还时间=2026-09-12  时长=24h  完好性=完好
status=COMPLETED  result=agree
```

## 2. 目标与非目标

### 目标
- 钉钉审批通过后，自动同步进网站的借记记录
- 匹配到库存物品的，自动扣减可借数量
- 匹配不准的，在网站上高亮提示，管理员一键关联
- 数量必须准确 —— 宁可漏扣，不可多扣

### 非目标（YAGNI）
- 不做网站 → 钉钉的反向提交（网站没有真实用户身份体系）
- 不做实时同步（10 分钟延迟对办公场景足够）
- 不做物品名称的机器学习匹配（规则匹配 + 人工兜底足够）

## 3. 架构

```
GitHub Actions 定时任务（每 10 分钟）
        │
        │ 1. 换 access_token
        │ 2. 拉最近 7 天的审批实例 ID 列表
        │ 3. 与数据库已有记录比对，找出新的
        │ 4. 逐条拉详情，只处理 status=COMPLETED && result=agree
        │ 5. 解析 form_component_values，展开「物品明细」表格字段
        │ 6. 模糊匹配物品名称
        │ 7. 写入 Supabase（匹配成功的扣减库存）
        ▼
Supabase（borrow_records）
        ▼
网站「借记记录」页
   ├─ 已匹配的记录：正常显示，标注来源钉钉
   └─ 待关联的记录：高亮提示，管理员选择库存物品后关联并补扣
```

**为什么用 GitHub Actions**：无需新建服务器；已有 `keep-alive.yml` 的成熟模式；密钥走 GitHub Secrets；运行日志在 GitHub 上直接可查。代价是非实时，但 10 分钟延迟对本场景无影响。

## 4. 数据库变更

**执行前必须把 SQL 原文交用户确认。**

```sql
-- 1. 允许 item_id 为空 —— 匹配不上的记录也要能存进来
ALTER TABLE borrow_records ALTER COLUMN item_id DROP NOT NULL;

-- 2. 钉钉来源标识：实例 ID + 行序号
--    一条审批可借多件物品，表格字段每行生成一条记录，
--    故唯一键必须是「实例 ID + 行号」的组合，只有实例 ID 会冲突
ALTER TABLE borrow_records ADD COLUMN dingtalk_instance_id TEXT;
ALTER TABLE borrow_records ADD COLUMN dingtalk_row_index INTEGER;

CREATE UNIQUE INDEX borrow_records_dingtalk_uniq
  ON borrow_records (dingtalk_instance_id, dingtalk_row_index);

-- 3. 是否已扣减库存 —— 防止重复扣减（同步重跑、人工关联补扣都要看它）
ALTER TABLE borrow_records ADD COLUMN stock_deducted BOOLEAN NOT NULL DEFAULT false;
```

**说明**：不需要额外的 `match_status` 列 —— `item_id IS NULL` 即表示待关联，`dingtalk_instance_id IS NOT NULL` 即表示来自钉钉。

## 5. 同步逻辑

新增 `scripts/sync-dingtalk.py`（Python + urllib + Supabase REST，**不引入任何依赖**）。

```
1. 换 access_token（复用 verify 脚本的写法）

2. 拉最近 7 天的审批实例 ID 列表

3. 查数据库已有的 dingtalk_instance_id 集合
   → 过滤出「新实例 ID」
   （只查钉钉返回的这批 ID，避免全表扫描）

4. 对每个新实例：
   a. 拉详情
   b. status != COMPLETED 或 result != agree → 跳过（审批中/被拒绝的不入库）
   c. 解析 form_component_values → 键值对
   d. 展开「物品明细1」表格字段的 JSON → 每一行一条记录
   e. 对每行做模糊匹配 → item_id 或 null
   f. 匹配成功 → available_qty -= 数量（且不小于 0），stock_deducted = true
   g. 插入 borrow_records（dingtalk_instance_id + dingtalk_row_index 唯一）
```

**幂等性**：靠 `(dingtalk_instance_id, dingtalk_row_index)` 唯一索引。重跑同步不会重复插入；插入冲突（唯一索引报错）时跳过该行，不视为失败。

## 6. 模糊匹配策略

**核心原则：只有高置信度的匹配才自动扣库存。低置信度一律标记待关联，等人工确认。**

| 级别 | 规则 | 处理 |
|---|---|---|
| **高** | 去空格后与库存物品名**完全相同** | 自动关联 + **自动扣减** |
| **高** | 库存物品名包含审批文本，或审批文本包含库存物品名（且长度 ≥ 2 字） | 自动关联 + **自动扣减** |
| **低** | 去掉常见后缀（包/服/帽/旗/椅等）后能包含 | **不扣减**，标记待关联 |
| **低** | 编辑距离相似度 ≥ 0.6 | **不扣减**，标记待关联 |
| **无** | 以上都不匹配 | 标记待关联，`item_id = NULL` |

**为什么低置信度不自动扣**：实测那条审批借的是「院旗」，而库存里根本没有"院旗"——说明审批文本与库存的差异是常态。错配一件物品会导致库存数字错误且难以察觉，代价远大于多一次人工确认。

**匹配时的额外约束**：若候选物品有多件（如"文件包"对应三个不同文件包），一律降级为「低置信度」，交人工选择。

## 7. 库存扣减逻辑

- **扣减时机**：仅在审批 `status=COMPLETED && result=agree` 且匹配为**高置信度**时
- **扣减数量**：`物品明细[].物品数量` 的值，**逐行独立扣减**
- **下界保护**：`available_qty` 扣减后不得小于 0（用 `GREATEST(0, ...)`），避免数据异常时出现负数
- **幂等**：扣减前检查 `stock_deducted`，已扣过的不再扣
- **人工关联后补扣**：管理员在网站关联物品时，走同一套扣减逻辑并标记 `stock_deducted = true`

## 8. 人工关联界面

在「借记记录」页新增：

- **待关联提示区**：列出所有 `item_id IS NULL AND dingtalk_instance_id IS NOT NULL` 的记录，高亮显示
- **每条显示**：审批里的原始物品名称、**数量（醒目）**、借用人、部门、借用/归还日期
- **操作**：一个可搜索的下拉框，选中库存物品 → 点击「关联」
- **关联后**：写入 `item_id`，按记录数量扣减该物品库存，标记 `stock_deducted = true`，从待关联区消失

**数量必须显著展示**：用大号数字 + 单位，避免管理员在关联时看错数量导致扣错。

## 9. 错误处理

| 情形 | 处理 |
|---|---|
| 换 token 失败 | 整个同步中止，GitHub Actions 标红告警 |
| 拉实例列表失败 | 同上 |
| 单条实例详情拉取失败 | 记录错误、跳过该条，继续处理其余（不因一条失败中断整批）|
| 表格字段 JSON 解析失败 | 跳过该条并记录原始文本，不猜测 |
| 库存扣减时物品不存在 | 跳过扣减，仍插入记录 |
| Supabase 写入冲突（唯一索引） | 静默跳过 —— 说明该行已同步过 |

**日志要求**：每次运行输出「新增 N 条 / 跳过 M 条 / 待关联 K 条」，便于在 GitHub Actions 页面快速判断健康状况。

## 10. 部署

新增 `.github/workflows/sync-dingtalk.yml`：

```yaml
on:
  schedule:
    - cron: '*/10 * * * *'    # 每 10 分钟
  workflow_dispatch:           # 支持手动触发，便于调试
```

**必需的 GitHub Secrets**：

| Secret | 说明 |
|---|---|
| `DINGTALK_CLIENT_ID` | 公开值 |
| `DINGTALK_CLIENT_SECRET` | ⚠️ 保密 |
| `DINGTALK_PROCESS_CODE` | `PROC-04DDCCFB-...` |
| `VITE_SUPABASE_URL` | 已存在 |
| `VITE_SUPABASE_ANON_KEY` | 已存在 |

**频率与配额**：每 10 分钟一次 = 4320 次/月，低于标准版组织 10000 次/月的免费额度。实际每次约 2~3 次调用（换 token 不计入配额）。

## 11. 验收方式

1. **手动触发一次 GitHub Actions**，确认运行成功
2. **核对数据库**：那条真实记录（陈舒可借院旗 1 件）是否入库
3. **核对匹配结果**：因库存无"院旗"，应正确落到「待关联」
4. **网站验证**：借记记录页能看到该条，且高亮提示待关联
5. **手动关联测试**：选一件库存物品关联，确认库存正确扣减且数量准确

## 12. 风险与权衡

| 风险 | 缓解 |
|---|---|
| 匹配错误导致扣错库存 | 低置信度一律不自动扣，交人工 |
| 数量解析错误 | 数量字段是纯文本，解析失败即跳过该行并记录，不猜 |
| 重复扣减 | `stock_deducted` 标记 + 唯一索引双重保障 |
| 一条审批多件物品漏处理 | 表格字段按行展开，每行独立入库；唯一键含行号 |
| 审批里的物品不在库存 | 正是「待关联」流程要覆盖的场景，属预期内 |
| GitHub Actions 定时延迟 | 办公场景可接受；必要时可手动触发 |
| **Supabase RLS 当前是 `Allow all`** | ⚠️ 既有的安全弱点（anon key 公开且可写）。本次不改动，但建议后续收紧 |
| 网站没有真实用户身份体系 | 本方案不做双向提交，规避此问题 |

## 13. 待用户后续决策

- 归还流程：当前表单在**借用时**就填了「归还时间」和「物品完好性」，尚无独立的归还审批。实际归还时如何在系统中体现（手动改状态？还是将来加归还审批？）
- 是否收紧 Supabase RLS 策略
