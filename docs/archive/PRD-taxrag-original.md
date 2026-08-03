# PRD 05 · TaxRAG AU

**类型** 旗舰（检索工程）｜**窗口** D21–24 ｜**Timebox** 4 天 ｜**降级** 开关 A 触发即冻结为深度卫星 ｜**状态** Draft v0.1

## 1. 问题与定位

对 ATO（澳洲税务局）指引/rulings 做高质量检索问答，每句结论带来源引用 + 显式免责。它复用 LeaseGuard 首建的 `@kit/reg-rag`，落地第二个受监管垂直——**证明引擎的可迁移性，而非再造一个孤立 RAG**。对应"检索质量工程"考点。

它的旗舰性**不在营收，在一份公开的检索工程对比报告**：这是 RAG 岗位面试里比任何 demo 都值钱的东西。7 月中启动、一个月后上线正处澳洲报税季（截止 10 月 31），流量时机好，但变现最多做轻 premium，不指望收入。

## 2. 合规红线（先立）

税务个案 advice 会踩 TPB（Tax Practitioners Board）监管边界。产品姿态**只能是 information only**：
- 每句结论必附 ATO 来源引用。
- 显式免责，不输出"你应该怎么报/能省多少税"的拍板式个案建议。
- 定位是"帮你找到并理解官方指引"，不是"替你做税务决策"。

## 3. 目标与非目标

**目标**
1. ATO 指引问答：hybrid search + rerank + 句级引用溯源。
2. **公开检索工程对比报告**（本项目核心交付）。
3. groundedness / citation 精度可量化。
4. 轻 premium（报告导出、多轮追问）——可选，不作核心。

**非目标**
- ❌ 个案税务建议（合规红线）。
- ❌ 报税表填写 / 计算引擎。
- ❌ 重营收路径。
- ❌ 覆盖全部税种 → 选 2–3 个高频主题的语料即可支撑报告。

## 4. 核心功能（v1）

1. **语料 ingest**：选定 ATO 指引主题，chunk + 双索引（BM25 + dense），语料版本化（复用 `@kit/reg-rag`）。
2. **Hybrid retrieve + rerank**：BM25+dense 融合 → rerank。
3. **句级 citation**：答案每句可溯源到具体 ATO 段落。
4. **问答 UI**：提问 → 带引用作答 + 免责。
5. **检索评测管线**：产出对比报告的数据来源。

## 5. 核心交付：检索工程对比报告

在 **~100 问答对 eval set** 上，横比三档检索：
- dense-only
- BM25 + dense（hybrid）
- hybrid + rerank

指标：**recall@k、groundedness、citation 精度**。报告含方法、数据、每档数字、结论与取舍。公开发布（博客 + portfolio）。**即便开关 A 触发砍掉产品 UI 与增长，这份报告照出——它才是旗舰价值本体。**

## 6. 技术方案（初步）

- `@kit/reg-rag`（LeaseGuard 已首建）：本项目复用，仅换语料 + 调检索配置。
- 检索：BM25（pg 全文或 lite 方案）+ dense（Neon pgvector）+ rerank（rerank 模型经 01 Gateway）。
- 问答 LLM：经 01 Gateway。
- 前端：Next.js on Vercel（轻量）。
- eval：100 问答对接 `@kit/evals` / EvalGate。

## 7. 数据

- ATO 指引语料（选定主题）+ 版本。
- ~100 问答对 eval set（含标准答案与应引段落）。
- 检索运行指标（供报告）。

## 8. 成功指标

- 检索对比报告公开发布（**硬指标**）。
- 三档检索的 recall@k / groundedness / citation 精度产出真实数字。
- 问答结论 100% 附引用 + 免责（0 裸结论）。
- 报税季窗口内上线（时机指标，尽力）。

## 9. Roadmap

- **v1（本窗口）**：选定主题问答 + 对比报告。
- **v2**：扩主题、rerank 策略细化、cache。
- **v3**：轻 premium 正式化（若有真实需求）。

## 10. DoD

**降级分层**：
- **未触发开关 A**：Production Kit 基线 + 问答 UI 上线 + 报告公开 + case study 当天完成。
- **触发开关 A**：报告公开 + eval 管线 + case study 即达标；UI 打磨与增长动作豁免。

## 11. 风险（置顶）

- **TPB 合规**：information only + 逐句引用 + 免责，红线不可越。
- **排期最脆**：4 天窗口 + 紧邻其后，开关 A 是它的安全阀，报告优先级永远高于 UI。
- **报税季数据敏感**：不收集用户税务隐私，问答不落敏感输入到长期存储。