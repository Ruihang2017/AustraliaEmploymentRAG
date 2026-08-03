# AustraliaEmploymentRAG Discovery Conversation Transcript

This file is mechanically generated from the local Codex rollout and contains only visible user and assistant messages.

- System/developer instructions, hidden reasoning, tool calls, tool outputs and injected environment metadata are excluded.
- `conversation-transcript.jsonl` is the canonical machine-readable copy of the same message content.
- Some early timestamps reflect session rehydration/compaction time rather than the original display time; message ordering and text are retained.
- Exported at: 2026-08-03T13:42:19.6883165+10:00
- Visible messages: 345

## 1 | User | 2026-08-02T07:26:11.558Z

<pre>
&lt;image name=[Image #1] path=&quot;C:\Users\HoraceHou\OneDrive - Coates Group\Pictures\Screenshots\Screenshot 2026-07-30 114500.png&quot;&gt;
&lt;/image&gt;
我有这么一个产品的PRD，file:///c:/Users/HoraceHou/project/personal/taxrag/PRD.md  我想先和你讨论一下，[Image #1] 从图中这几个角度（需求与约束，估算，API与数据模型，深挖与trafeoff，最后到架构). 然后再生成一份详细的，技术实现方案清晰的PRD。
</pre>

## 2 | Assistant | 2026-08-02T07:26:11.558Z

<pre>
我先通读现有 `PRD.md` 和仓库里的相关说明，再按你图里的顺序整理第一轮讨论框架：需求与约束 → 估算 → API/数据模型 → 深挖与 trade-off → 架构。这个阶段我会先把关键问题、默认假设和决策点摊开，不急着直接重写 PRD。
</pre>

## 3 | Assistant | 2026-08-02T07:26:11.559Z

<pre>
文件本身看起来是 UTF‑8，但刚才被 PowerShell 按本地编码读成了乱码；我正在按 UTF‑8 重新读取。顺手会检查仓库现状，因为“4 天 timebox、复用 `@kit/reg-rag`、公开评测报告”是否现实，很依赖现有代码和依赖到底已经落到什么程度。
</pre>

## 4 | Assistant | 2026-08-02T07:26:11.559Z

<pre>
现有 PRD 的产品方向很清楚，但有一个关键矛盾已经浮出来了：它同时想做“4 天可交付的产品”和“可信的公开检索实验”。真正最耗时的不是 RAG 管线，而是语料范围、100 条 gold eval、标注规范和可复现实验；如果这些不先收紧，后面的 API 与架构都会建立在虚假的估算上。

另外，PRD 把 TPB 边界作为红线。我会只核对官方 ATO/TPB 的当前口径，用它来区分“产品护栏”与“法律结论”，避免把一句免责声明误当成充分合规。
</pre>

## 5 | Assistant | 2026-08-02T07:26:11.560Z

<pre>
我读完了现有 PRD。方向是对的，但目前更像“产品概念 + 技术关键词清单”，还不足以直接进入实现。

我建议先锁定一个核心判断：

&gt; TaxRAG v1 的第一产品不是聊天 UI，而是一个可复现、可解释的检索质量实验；问答 UI 只是实验结果的演示界面。

这会直接影响需求范围、排期和架构。

## 1. 需求与约束

### 核心用户

当前 PRD 没有明确第一用户是谁。这里至少有三种不同产品：

- 普通纳税人：需要简单解释和强合规护栏。
- 税务从业者：需要精准检索、版本信息和原文定位。
- 招聘方/技术评审者：关注实验方法、可复现性和工程判断。

结合“公开检索工程报告”的目标，我建议：

- 第一用户：招聘方/技术评审者。
- 第二用户：需要查找一般性 ATO 信息的公众。
- 暂不面向税务专业工作流。

这样可以避免为了“消费者产品感”投入过多 UI 和多轮对话能力。

### v1 的建议范围

不要一开始覆盖 2–3 个宽泛税种。四天版本最好只覆盖一个领域，例如：

- Work-related expenses；
- Working from home expenses；
- Vehicle and travel expenses。

它们属于同一信息域，但词汇表达和文档结构足够丰富，可以测试关键词检索、语义检索和 rerank。

Rental property、CGT、crypto 等主题具有更多条件分支、年份差异和个案性，适合后续扩展。

### 合规边界需要从“免责声明”升级为“行为约束”

官方 TPB 口径表明，一般税务信息、不结合用户具体情况时，通常不属于 tax agent service；但是否构成用户可依赖的个案服务，需要结合完整交互判断，免责声明本身并不能自动解决这个问题。[TPB 数字服务商指引](https://www.tpb.gov.au/tpb-gs-14-2011-digital-service-providers-and-tax-agent-services-act-2009)、[Tax agent services](https://www.tpb.gov.au/tax-agent-services)

因此 v1 应至少有以下产品护栏：

- 不询问收入、支出金额、职业和家庭情况等个案变量。
- 识别“我能不能申报”“我能省多少”等个案问题。
- 对个案问题不直接作结论，而是：
  - 解释适用的一般规则；
  - 列出用户需要自行核实的条件；
  - 链接 ATO 原文；
  - 建议必要时咨询注册税务代理。
- 不提供税额计算、报表字段填写或资格最终判断。
- 回答必须注明适用财年或来源生效时间。
- 证据不足、来源冲突或来源过期时拒绝生成确定性答案。

PRD 里的“每句必须有引用”也建议改成：

&gt; 每个可验证的事实性 claim 必须由一个或多个引用支持。

“句级引用”容易被句子结构绑架；一个句子可能包含三个事实，而一个引用只能支持其中两个。技术实现应该是 claim-level citation。

## 2. 估算

### 目前的 4 天估算不成立的部分

RAG 管线如果 `@kit/reg-rag` 已经成熟，四天内复用是可能的。真正高估的是：

&gt; 四天内建立 100 条高质量 gold eval，并完成三组可信实验和公开报告。

一条合格 eval case 至少需要：

- 明确的问题；
- 查询类型和难度标签；
- 应命中的 ATO 文档版本；
- gold evidence 段落；
- 可接受答案要点；
- 不应回答的边界；
- 人工复核。

即使每条只用 8–15 分钟，100 条也需要约 13–25 小时，尚未包括文档研究、规范设计和二次复核。

### 推荐的 4 天版本

| 工作 | 时间 |
|---|---:|
| 主题、语料与评测规范冻结 | 0.5 天 |
| 结构化 ingest、FTS、vector index | 0.75 天 |
| dense / hybrid / rerank 三档实现 | 0.75 天 |
| 30–40 条人工复核 gold set | 1 天 |
| 跑实验、分析失败案例、生成报告 | 0.5 天 |
| 最小问答 UI、部署和收尾 | 0.5 天 |

四天版本建议：

- 30–40 条人工复核 gold cases；
- 可以额外生成约 100 条 synthetic cases，但必须明确标为辅助集；
- 公开报告的主要结论只基于人工复核集；
- UI 只做单轮问答；
- 多轮、登录、导出、付费全部移出 v1。

如果一定要求 100 条人工 gold set，我会把可信版本估为 7–10 个工作日。

另外，PRD 还写着“7 月中启动”，但当前日期已经是 2026 年 7 月 31 日，这部分时间线需要重置。

## 3. API 与数据模型

我建议不要让前端解析 LLM 生成的 Markdown 引用。回答应返回强类型结构。

### 核心查询 API

```http
POST /api/v1/queries
```

```json
{
  &quot;question&quot;: &quot;What records should I keep for working from home expenses?&quot;,
  &quot;taxYear&quot;: &quot;2025-26&quot;,
  &quot;conversationId&quot;: null
}
```

返回：

```json
{
  &quot;queryId&quot;: &quot;qry_123&quot;,
  &quot;status&quot;: &quot;answered&quot;,
  &quot;scope&quot;: {
    &quot;type&quot;: &quot;general_information&quot;,
    &quot;taxYear&quot;: &quot;2025-26&quot;
  },
  &quot;claims&quot;: [
    {
      &quot;claimId&quot;: &quot;clm_1&quot;,
      &quot;text&quot;: &quot;You need records showing the hours you worked from home.&quot;,
      &quot;citationIds&quot;: [&quot;cit_1&quot;],
      &quot;support&quot;: &quot;supported&quot;
    }
  ],
  &quot;citations&quot;: [
    {
      &quot;citationId&quot;: &quot;cit_1&quot;,
      &quot;documentId&quot;: &quot;doc_12&quot;,
      &quot;documentVersionId&quot;: &quot;docv_37&quot;,
      &quot;title&quot;: &quot;Working from home expenses&quot;,
      &quot;url&quot;: &quot;https://www.ato.gov.au/...&quot;,
      &quot;quote&quot;: &quot;…&quot;,
      &quot;sectionPath&quot;: [&quot;Records you need to keep&quot;],
      &quot;retrievedAt&quot;: &quot;2026-07-31T10:00:00Z&quot;
    }
  ],
  &quot;disclaimer&quot;: &quot;...&quot;,
  &quot;retrievalRunId&quot;: &quot;run_456&quot;
}
```

### 主要数据实体

- `source_document`
  - canonical URL、标题、ATO 内容类型、主题。
- `document_version`
  - 内容哈希、抓取时间、生效日期、失效日期、状态。
- `chunk`
  - 结构路径、正文、token 数、FTS 字段、embedding。
- `query`
  - 规范化问题、范围分类、财年、隐私处理状态。
- `retrieval_run`
  - 策略、配置版本、候选结果、耗时和成本。
- `answer`
  - 模型、prompt 版本、最终状态、拒答原因。
- `claim`
  - 原子事实、support 状态。
- `citation`
  - claim、chunk、原文范围和来源版本。
- `eval_case`
  - 问题、gold chunks、答案要点、难度和标签。
- `eval_run`
  - 数据集版本、检索配置、模型版本、代码 commit。
- `metric_result`
  - recall@k、MRR/nDCG、citation correctness、latency、cost。

其中 `retrieval_run` 和 `eval_run` 的配置必须完整保存，否则公开报告无法复现。

## 4. 需要重点深挖的 trade-offs

### PostgreSQL FTS 还是独立搜索引擎

v1 推荐 PostgreSQL FTS + pgvector：

- 系统简单；
- 一个数据库即可复现实验；
- 足以支持受控的小规模 ATO 语料。

不建议四天项目引入 Elasticsearch/OpenSearch。它会提升调优空间，但部署、分析器和运维成本不值得。

### Hybrid 融合方式

v1 建议用 Reciprocal Rank Fusion，而不是直接混合 BM25 和 cosine 分数。

原因是两个分数空间不可直接比较，RRF 参数少、解释简单，也更适合作为公开实验基线。

### Chunking

不要只按固定 token 数切块。ATO 页面有明显标题层级，推荐：

1. 按标题和列表结构切分；
2. 保留 `section_path`；
3. 超长 section 再按段落/token 拆分；
4. 让每个 chunk 带少量父标题上下文。

这很可能比更换 embedding 模型带来更明显的质量收益，也更值得写入报告。

### Groundedness 评测

不要只用一个 LLM judge 给 groundedness 打分。建议分三层：

- 检索：gold evidence 是否进入 top-k；
- 引用：引用文本是否真的支持 claim；
- 回答：回答是否遗漏条件、扩张结论或引入无来源事实。

LLM judge 可以用于扩展评测，但公开报告应包含人工抽检和评分规范。

### “逐句引用”还是“生成后验证”

推荐流程：

1. 检索证据；
2. LLM 生成结构化 claims；
3. 每个 claim 显式绑定 evidence；
4. verifier 检查 entailment/support；
5. 不支持的 claim 删除、降级措辞或拒答。

仅靠 prompt 要求“每句加 citation”不能保证引用正确。

### 多轮追问

建议移出 v1。多轮会引入：

- 上下文中的个人情况；
- 问题改写偏移；
- 引用继承错误；
- 更高的合规和隐私风险。

它不利于一个干净的检索对比实验。

## 5. 建议架构

```text
ATO source pages
      │
      ▼
Fetch / parse / version
      │
      ▼
Structure-aware chunking
      │
      ├── PostgreSQL FTS
      └── pgvector
              │
Question ──► Scope classifier / safety gate
              │
              ▼
       BM25 + dense retrieval
              │
              ▼
             RRF
              │
              ▼
        Optional reranker
              │
              ▼
   Structured answer generation
              │
              ▼
 Claim–citation verification
              │
        ┌─────┴─────┐
        ▼           ▼
     Answer       Abstain
```

离线 eval 必须调用与线上完全相同的 retrieval package，不能另写一套“实验专用检索逻辑”。否则报告数字和线上行为会逐渐分叉。

## 我建议先确认的三个决策

1. 是否同意把 v1 定义成“检索实验 + 最小演示 UI”，而不是完整消费者产品？
2. 是否接受将人工 gold set 从 100 条改为 30–40 条，并把 100 条作为后续或 synthetic 辅助集？
3. 第一版语料是否聚焦在 work-related expenses 这一信息域？

我目前对这三个问题的推荐答案都是“是”。确认后，下一轮我们可以继续把评测集设计、指标定义和失败案例 taxonomy 深挖清楚，再把最终 PRD 写到可以直接据此开发的程度。
</pre>

## 6 | User | 2026-08-02T07:26:11.561Z

<pre>
1）不同意，这个项目分2步走，第一步MVP，在AI的加持下，我完全可以跳过POC, 不要管4天的交付时间，这个时间可以延长。但是一个项目没有做上线，客户不愿意付钱用，就一点意义都没有。2）一开始100条synthetic 3）这个我们再决定，有多少不同的语料？我们为什么要只选work-related expenses，毕竟我们是要做一个完整的税务规则检索工具。 还有，我不要你一口气全部写出方案，我们一步一步的慢慢推导，先从需求开始，毕竟我自己现在也不确定改做一个什么样的软件，目前PRD只是别人的模板。
</pre>

## 7 | Assistant | 2026-08-02T07:26:11.561Z

<pre>
明白，我先把前提彻底改过来：这个项目的目标是做成有人愿意付费使用的上线产品，公开评测报告只是证明质量的手段，不是产品本体；4 天限制取消；100 条 synthetic questions 可以作为冷启动；这一轮只讨论“为谁解决什么问题、覆盖什么边界”，不进入 API、模型或架构。

你问“有多少不同语料”非常关键。我先按权威性和用户任务把澳洲税务信息源分层梳理一下，用它帮助我们判断“完整税务规则检索工具”究竟意味着什么。
</pre>

## 8 | Assistant | 2026-08-02T07:26:11.561Z

<pre>
理解了。我们需要先把“作品型 RAG 项目”的思路放下，改成“真正上线并验证付费意愿的税务产品”。

当前确定的前提是：

- 产品必须上线，并以真实客户愿意付费为成功标准。
- 工期可以延长，不受 4 天限制。
- 第一批评测数据采用 100 条 synthetic questions。
- 暂不预设只覆盖 work-related expenses。
- 不急着写完整 PRD，先逐步完成需求发现。

## “税务语料”其实有多少种？

“完整税务规则”不是一套平铺的 ATO 网页，而是一个有权威层级、时间版本和相互引用关系的知识体系。

大致可以分成六层：

| 语料层 | 典型内容 | 用户价值 |
|---|---|---|
| 法律原文 | Income Tax Assessment Acts、Taxation Administration Act、GST 等法规 | 最终法律依据 |
| ATO 公开裁定 | Taxation Rulings、Determinations、Class/Product Rulings | ATO 对法律的正式解释 |
| ATO 行政与解释文件 | Practice Statements、Decision Impact Statements、Taxpayer Alerts、部分 Interpretative Decisions | 理解 ATO 如何执行和解释规则 |
| ATO 通俗指引 | deductions、income、CGT、GST、super 等网站内容 | 最容易理解和直接使用 |
| 法院和仲裁决定 | Federal Court、High Court、ART 税务案件 | 处理争议、例外和法律解释变化 |
| 时效性资料 | 税率、threshold、截止日期、表格、计算方法、财年更新 | 回答“今年适用什么” |

例如，Income Tax Assessment Act 本身有大量历史版本和修订记录；ATO 的 Practice Statement 还可能标记为“正在因法院判决接受复审”。所以“检索完整”不只是多抓网页，而是必须知道：

- 哪个来源的法律权威更高；
- 内容是否仍然有效；
- 适用于哪个财年；
- 是否已 withdrawn、superseded 或 under review；
- 某项裁定与法规、案例之间有什么关系。

这些并不是理论问题。[Federal Register of Legislation](https://www.legislation.gov.au/Latest/C2023C00472)会维护法规版本；[ATO Practice Statement 示例](https://www.ato.gov.au/law/view/document?LocID=%22PSR%2FPS200524%2FNAT%2FATO%22&amp;PiT=20240701000001)会明确标记文件状态；税务案件则分布在 [Federal Court Taxation NPA](https://www.fedcourt.gov.au/law-and-practice/national-practice-areas/taxation) 等来源中。

因此，我收回之前“先做 work-related expenses”的默认建议。那个建议适合做一份检索实验报告，不一定适合你现在强调的商业产品。

但是，“完整工具”仍然有两个不同含义：

1. **主题完整**：覆盖个人税、企业税、GST、CGT、super 等所有主题。
2. **法律来源完整**：同时理解法规、裁定、ATO 指引、案例及其版本关系。

第二种难度远高于第一种，但也可能产生更强的付费价值。

## 现在必须先决定的不是语料，而是谁付钱

同一批税务语料可以做成三种完全不同的软件：

### 面向普通纳税人

用户问：

&gt; 我在家办公，可以申报哪些费用？

价值是简单、易懂、节省搜索时间。

问题是：

- ATO 已经免费提供大量通俗内容；
- 用户一年可能只使用一次；
- 付费意愿可能较弱；
- 很容易进入个案建议和合规边界。

### 面向会计师或税务从业者

用户问：

&gt; 关于员工差旅费用，当前有效的 ruling、相关条款和最近判例是什么？

价值是：

- 减少研究时间；
- 跨来源查找；
- 检查文件效力和版本；
- 形成可审阅的 research trail。

这类用户使用频率更高，也更可能为节省专业时间付费，但对准确性和语料完整性的要求明显更高。

### 面向企业或软件平台

产品表现为 API、内部知识库或嵌入式助手：

&gt; 给 payroll、expense、accounting 软件提供带来源的税务规则检索。

它可能有更高的合同价值，但销售周期、集成成本和责任边界也更重。

这三类用户不能在 MVP 中同时服务。它们的提问方式、答案深度、UI、合规风险和付费模型都不同。

所以我们先只回答一个需求问题：

&gt; 你希望第一笔真实收入来自谁：普通纳税人、会计师/税务从业者，还是需要嵌入税务检索能力的软件公司？

我目前更倾向于“中小型会计事务所或独立税务从业者”，因为他们有高频、重复、可量化的税务研究成本。但在你选择之前，我们先不继续定义功能。
</pre>

## 9 | User | 2026-08-02T07:26:11.562Z

<pre>
面向企业或软件平台
</pre>

## 10 | Assistant | 2026-08-02T07:26:11.562Z

<pre>
很好，这会显著改变产品定义。我们现在不是做一个直接服务纳税人的“税务 ChatGPT”，而是在做：

&gt; 面向澳洲财务软件企业的税务规则智能服务，帮助其产品、客服和合规团队检索、解释并追踪权威税务依据。

付费方可能包括 accounting、payroll、expense management、tax preparation、fintech 等软件公司。

但企业购买的“结果”仍有四种，需求差异非常大：

| 使用场景 | 典型用户 | 产品承担的任务 |
|---|---|---|
| 内部研究助手 | 客服、产品、合规人员 | 查规则、找依据、回答工单 |
| 嵌入式问答 | 软件平台的终端客户 | 在原产品中回答税务问题 |
| 税务规则 API | 软件的计算或决策模块 | 返回适用规则、条件和依据 |
| 规则变更监控 | 产品与合规团队 | 发现法规、ATO 指引和税率变化 |

我的初步建议是从“内部研究助手”开始，同时底层按照未来可提供 API 的方向设计。原因是：

- 企业内部有人审核结果，错误风险相对可控；
- 可以直接衡量是否减少客服或合规研究时间；
- 不需要第一天就保证结果能自动驱动工资、GST 或税额计算；
- 更容易找到愿意参与付费试点的企业；
- 积累真实问题后，才能知道哪些能力适合开放成 API 或嵌入式问答。

这里有一条重要边界：

&gt; “返回税务依据”与“直接控制企业软件如何计算税额”不是同一种产品。

后者不仅需要检索，还需要确定性的规则引擎、测试案例、变更审批和审计流程，产品复杂度会跃升一个数量级。

所以下一步我们只确定第一个使用场景：

**你希望第一家客户购买它来做什么——内部客服/合规研究、嵌入客户问答、驱动软件规则，还是监控税务规则变化？**
</pre>

## 11 | User | 2026-08-02T07:26:11.562Z

<pre>
“内部客服/合规研究、嵌入客户问答” 这两个不能是同一个产品吗？
</pre>

## 12 | Assistant | 2026-08-02T07:26:11.562Z

<pre>
可以，而且组合起来反而比单独做其中一个更有价值。它们可以是同一个“企业税务知识平台”的两个使用界面，而不是两套产品。

核心闭环可以是：

```text
终端客户提出税务问题
        │
        ▼
嵌入式助手检索已批准的规则与答案
        │
   ┌────┴────┐
证据充分    证据不足/高风险
   │             │
直接回答          转交内部团队
                 │
                 ▼
        客服/合规人员研究与修订
                 │
                 ▼
          审核并发布标准答案
                 │
                 ▼
       嵌入式助手以后可以复用
```

这样企业购买的不是一个简单聊天机器人，而是：

&gt; 能够研究税务规则、管理企业认可的解释，并安全地向终端客户提供答案的税务知识平台。

两者共享的部分包括：

- 官方税务语料；
- 检索与引用；
- 财年和规则版本；
- 企业自己的政策与帮助文档；
- 用户权限；
- 查询记录；
- 审计记录；
- API 和反馈数据。

但两种模式的权限和行为必须不同。

| 内部客服/合规模式 | 嵌入式客户模式 |
|---|---|
| 可以探索全部相关资料 | 只使用允许外部展示的资料 |
| 可以展示冲突和不确定性 | 不确定时应拒答或转人工 |
| 可以生成待审核草稿 | 优先使用已审核答案 |
| 可以查看复杂法规和案例 | 输出需要更简洁 |
| 人员对最终判断负责 | 系统需要更严格的自动护栏 |
| 可编辑、批注和批准 | 只读消费答案 |

最关键的产品机制是“审核与发布”：

- AI 找到规则并生成答案草稿；
- 企业内部人员修订、批准；
- 批准后的答案成为该企业的受控知识；
- 嵌入式助手优先复用批准内容；
- 当来源更新或规则失效时，相关答案自动进入待复核状态。

这让内部研究不断提高外部问答质量，也给企业一个愿意付费的理由：它不仅减少单次搜索时间，还在积累可审计、可复用的税务知识资产。

所以答案是：**可以是同一个产品，但必须是同一平台下的两种风险模式。**

接下来需要确定的是第一类目标企业，因为不同软件需要的税务语料完全不同。比如 payroll 关注 PAYG、super、FBT 和 STP；expense management 关注 GST credits、deductibility、records 和 FBT；accounting 平台的范围则更广。

下一步我们可以只讨论这一件事：**第一类目标企业应该是哪种软件平台。**
</pre>

## 13 | User | 2026-08-02T07:26:11.563Z

<pre>
终极目标肯定是都做，但是也不可能一口气全做。一块一块做，首先你推荐哪个？
</pre>

## 14 | Assistant | 2026-08-02T07:26:11.563Z

<pre>
我会把几个候选垂直按同一套标准比较：痛点频率、付费意愿、语料边界、嵌入式问答适配度、出错风险，以及能否自然扩展到下一块。由于这是会影响产品投入的选择，我先核对一下 2026 年澳洲各领域的监管变化和现有软件能力，再给你明确推荐。
</pre>

## 15 | Assistant | 2026-08-02T07:26:11.563Z

<pre>
我首先推荐：**澳洲 payroll / HR 软件平台**。

但切入点不是替它们计算工资，而是：

&gt; 为 payroll 平台提供“澳洲雇主税务与 super 规则知识层”，供内部客服、产品合规团队和嵌入式客户问答共同使用。

## 为什么先做 payroll

### 1. 问题高频，不只发生在报税季

Payroll 每个 pay cycle 都会产生问题：

- 为什么这笔收入需要或不需要计算 super？
- contractor 是否属于 super guarantee 范围？
- PAYG withholding 应参考什么规则？
- STP 字段是什么意思？
- 更正错误申报应该遵循什么流程？
- 某项规则从哪一天开始适用？

相比个人所得税问答，它不是一年使用一次。

### 2. 企业有明确的付费理由

Payroll 平台需要持续投入客服和合规人员解释规则。我们能销售的价值可以量化成：

- 减少客服查询处理时间；
- 提高首次解决率；
- 缩短合规研究时间；
- 降低客服给出过时答案的概率；
- 减少相同问题被重复研究；
- 加快新税务规则进入产品帮助中心。

这比“AI 搜索更聪明”更容易形成采购理由。

### 3. 当前有强烈的规则变化窗口

Payday Super 已于 2026 年 7 月 1 日实施。ATO 对软件服务商明确提出了新的 qualifying earnings、STP reporting、支付时限和错误处理要求，软件平台必须更新产品与支持内容。[ATO Software Developers – Payday Super](https://softwaredevelopers.ato.gov.au/PaydaySuper)

同时，ATO 的 Small Business Superannuation Clearing House 已于 2026 年 7 月 1 日关闭，企业需要迁移到其他支付方式或 payroll 软件。[ATO SBSCH](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-to-pay-super/small-business-superannuation-clearing-house?=redirected_sbsch)

这类变化正好说明企业为什么需要“规则变更 → 内部审核 → 客户回答”的闭环。

### 4. 同时适合两个产品界面

内部人员可以问：

&gt; Payday Super 对现有 STP 字段和错误处理有什么影响？

终端客户可以问：

&gt; 为什么我这次 pay run 的 super 处理方式发生了变化？

二者可以使用相同的知识底座，只是外部答案必须更加严格，并优先采用企业审核过的解释。

### 5. 范围相对可控，又能自然扩展

第一块可以覆盖：

- PAYG withholding；
- Super Guarantee；
- Payday Super；
- Single Touch Payroll；
- payroll 相关记录保存；
- 雇员与 contractor 的一般性税务分类信息；
- 与 payroll 直接相关的 FBT 基础问题。

后续扩展路径很自然：

```text
Payroll / Super
      ↓
Employee expenses / FBT
      ↓
GST / BAS
      ↓
Business income tax
      ↓
Broader accounting and tax
```

## 为什么暂时不先做其他方向

| 方向 | 暂不首选的原因 |
|---|---|
| Accounting 平台 | 范围太宽，而且 Xero 等大型平台已经在建设自己的 AI 与审计能力 |
| Expense management | 适合第二阶段，但单纯税务问答频率和采购紧迫性可能弱于 payroll |
| Tax preparation | 季节性强，更容易涉及个案税务判断和 TPB 边界 |
| 通用税务 API | 买家很难理解第一版到底解决哪个具体业务问题 |

Xero 已经把 AI、GST、BAS、STP 和审计记录整合进自身平台；Employment Hero 也在加入 AI payroll compliance checks。这说明需求存在，但也意味着第一批客户不应该直接瞄准这些拥有庞大内部团队的头部平台。[Xero AI](https://www.xero.com/au/ai-in-accounting/)、[Employment Hero Pre-Payroll Checker](https://help.employmenthero.com/hc/en-au/articles/16360452778639-Using-the-Hero-AI-Pre-Payroll-Checker)

更现实的第一客户是：

- 中小型澳洲 payroll/HR SaaS；
- 垂直行业 payroll 产品；
- 想进入澳洲市场的海外 payroll/HR 平台；
- 为多个 payroll 产品提供服务的 BPO 或 managed payroll provider。

所以，我推荐的第一块可以暂定为：

&gt; **TaxRAG Employer Compliance：面向 payroll/HR 软件平台的澳洲雇主税务与 super 知识服务。**

下一步只需要确定第一批客户是哪一类：**澳洲现有的中小 payroll 平台，还是准备进入澳洲市场的海外 payroll/HR 平台？** 这两个客户面对的痛点并不一样。
</pre>

## 16 | User | 2026-08-02T07:26:11.563Z

<pre>
澳洲现有的中小 payroll 平台和还是准备进入澳洲市场的海外 payroll/
  HR 平台都做
</pre>

## 17 | Assistant | 2026-08-02T07:26:11.564Z

<pre>
可以，两类客户可以由同一个产品服务。它们不是两个不同市场，而是处于澳洲 payroll 合规生命周期的不同阶段。

我们可以把目标市场统一定义为：

&gt; 已经服务或计划服务澳洲市场的中小型 payroll / HR 软件平台。

但为两类客户提供不同的产品入口：

| 客户类型 | 购买动机 | 产品入口 |
|---|---|---|
| 澳洲现有 payroll 平台 | 持续跟进规则变化、降低客服和合规成本 | Maintain Australia Compliance |
| 准备进入澳洲的海外平台 | 快速理解本地规则、缩短本地化周期 | Launch Payroll in Australia |

它们共享同一个核心需求：

&gt; 把分散、不断变化的澳洲 payroll 税务规则，转化成产品、合规和客服团队可以检索、审核、复用并向客户解释的知识。

共同需要覆盖：

- PAYG withholding；
- super guarantee / Payday Super；
- STP reporting；
- contractor 与 employee 相关的一般规则；
- payroll 记录保存要求；
- 相关 FBT 基础规则；
- 规则的生效日期、版本和变更历史；
- 官方来源及引用；
- 企业自己的产品文档和处理政策。

两者的差异主要在使用方式：

### 澳洲现有平台

更关注：

- 最近什么规则变了；
- 哪些现有帮助文章和标准答案受影响；
- 客服如何回答新问题；
- 产品是否需要修改；
- 过去批准的答案是否已经过期。

### 海外进入者

更关注：

- 澳洲 payroll 合规涉及哪些规则；
- 某个 payroll 概念在澳洲如何定义；
- 产品实现需要考虑哪些条件和例外；
- 哪些问题尚未覆盖；
- 上线前需要由哪些专家审核。

所以产品可以有一个统一定位：

&gt; **Australian Payroll Compliance Knowledge Platform**  
&gt; 帮助 payroll 软件公司进入并持续运营澳洲市场。

不过，市场可以同时覆盖两类客户，MVP 的“首要购买理由”仍需保持单一，否则首页、销售演示和产品优先级会变得模糊。

我建议将首要价值定义为：

&gt; **缩短 payroll 软件团队理解和处理澳洲税务规则的时间，并确保每个结论可追溯到当前有效的官方来源。**

这样：

- 对现有澳洲平台，它意味着降低持续维护和客服成本；
- 对海外平台，它意味着加快澳洲本地化；
- 内部研究和嵌入式问答都属于这个价值的具体应用。

下一步我们应该确定企业内部的首要用户。通常会有三个角色：

- Payroll compliance/domain expert；
- 产品经理或工程师；
- 客服人员。

我的推荐是：**以 payroll compliance/domain expert 作为产品负责人和审核者，以客服人员作为最高频使用者，产品经理/工程师作为第二使用者。**

接下来我们只需要确认：你的目标客户内部是否通常有 payroll compliance/domain expert；如果没有，产品就不能依赖客户自己审核答案，整个责任模型会完全不同。
</pre>

## 18 | User | 2026-08-02T07:26:11.564Z

<pre>
客户内部无payroll compliance/domain expert
</pre>

## 19 | Assistant | 2026-08-02T07:26:11.565Z

<pre>
这会改变产品的根本性质。

如果客户内部没有 payroll compliance expert，那么“让客户审核 AI 答案”的假设不成立。专业判断并没有消失，只是必须转移到我们这一侧。

因此产品不能只是一个 RAG SaaS，而应该是：

&gt; **软件 + 专家维护的 Australian Payroll Compliance Knowledge Service。**

## 推荐的责任模型

```text
ATO / legislation / official updates
               │
               ▼
    AI 发现、整理和关联变化
               │
               ▼
   我方 payroll/tax 专家审核
               │
               ▼
      发布为 Verified Rule
               │
       ┌───────┴────────┐
       ▼                ▼
内部客服助手       嵌入式客户问答
```

我们负责维护一套经过审核的通用知识：

- 规则说明；
- 适用条件和例外；
- 生效日期；
- 官方依据；
- 变更历史；
- 推荐的安全回答；
- 哪些情况必须转人工或外部专家。

客户仍然需要确认“我们的软件实际上如何处理这条规则”，但不要求他们自己解释税法。

## 为什么不能完全依赖 AI

如果企业购买并依赖系统来满足 payroll、tax 或 super 义务，那么“information only”免责声明未必足够。TPB 明确指出，免责声明不会自动免除服务商的监管责任，是否构成 tax agent service 要结合用户是否合理依赖该服务等完整情境判断。[TPB 数字服务商指引](https://www.tpb.gov.au/tpb-gs-14-2011-digital-service-providers-and-tax-agent-services-act-2009)

所以，我们需要：

- 在商业上线前取得澳洲专业法律意见；
- 判断服务是否构成 tax agent service；
- 确定哪些内容需要 registered tax agent 审核；
- 明确税务、super 与 employment law 的边界；
- 为发布、复核、撤回和客户通知建立责任记录。

尤其 payroll 不只有税务，还会碰到 Fair Work、modern awards、leave 和州级 payroll tax。一个注册税务代理也不一定覆盖所有这些领域。因此第一阶段仍应只覆盖 ATO 管辖的 PAYG、STP 和 super 相关内容，暂不承诺完整 payroll 合规。

## 商业模式也随之改变

产品卖的不再只是软件席位或 API 调用量，而是：

- Compliance knowledge subscription；
- 持续规则更新；
- 专家审核的标准答案；
- 规则变更通知；
- 客服升级到专家的服务；
- 可选的澳洲市场进入评估。

这反而更容易形成企业付费，因为客户购买的是自己缺少的专业能力，而不只是另一个搜索框。

但代价是：

- 毛利不如纯 SaaS 高；
- 需要建立专家网络；
- 要有内容审核 SLA；
- 要承担更高的专业责任和保险成本；
- 初期扩张速度受专家产能约束。

所以现在出现了一个必须明确的商业选择：

&gt; **你是否接受 TaxRAG 第一阶段是“专家服务驱动的软件产品”，而不是纯 SaaS？**

我的建议是接受。没有客户侧专家，又希望提供嵌入式客户问答，纯软件模式的责任链是不完整的。后续随着 verified rule library 成熟，再逐步提高自动化比例。
</pre>

## 20 | User | 2026-08-02T07:26:11.565Z

<pre>
部分接受，我是单人公司，没有税务专家，我也不想复杂化我们的产品，我们是单纯的建立一个税务的知识检索系统，有免责申明，客户用这个产品总比用chatgpt放心吧，至于对不对，请不请自己的税务专家，那是他们自己的事。
</pre>

## 21 | Assistant | 2026-08-02T07:26:11.565Z

<pre>
这样可以。我们把产品边界收回来，不做专家服务，也不承诺“合规正确”。

更准确的定位应该是：

&gt; **TaxRAG 是面向软件平台的澳洲税务知识检索与引用系统。它从指定的官方来源检索、整理和引用相关信息，但不提供经过税务专家认证的意见，也不替客户作合规决定。**

客户是否聘请税务专家、如何把结果用于自身产品，由客户负责。

不过，“比 ChatGPT 更放心”目前只能作为待验证的产品假设，不能直接作为营销事实。我们需要用以下能力证明它：

- 只检索受控的澳洲官方税务语料；
- 每个事实都能打开对应原文；
- 展示文件类型、权威层级和状态；
- 展示适用财年或生效日期；
- 区分 current、withdrawn、superseded、draft、under review；
- 找不到充分依据时明确说不知道；
- 保存一次查询使用了哪些来源和版本；
- 不利用模型的通用知识补充无来源结论。

用户获得的安全感来源于“可验证”，不是因为系统自称正确。

## 免责声明的实际作用

可以有免责声明，但不能把它当作唯一保护。TPB 的官方指引明确说明，免责声明不会自动免除服务商的监管责任，实际产品如何工作、用户是否会合理依赖结果，也会被考虑。[TPB 指引](https://www.tpb.gov.au/tpb-gs-14-2011-digital-service-providers-and-tax-agent-services-act-2009)

因此我们不需要把产品复杂化成专家服务，但需要保持几个简单边界：

- 不计算 payroll、PAYG、super 或税额；
- 不自动修改客户的软件配置；
- 不提交 STP、BAS 或其他申报；
- 不声称答案“compliant”“approved”或“verified by experts”；
- 不把 AI 输出包装成最终专业意见；
- 客户决定是否向终端用户展示，以及是否需要专业审核。

这更像 Bloomberg、Westlaw 或企业搜索工具的责任模式：提供高质量信息和研究能力，最终判断属于使用者。

## 产品可以同时提供两种输出

### Search API

返回相关官方资料：

- 标题；
- 原文片段；
- URL；
- 文件类型；
- 发布和生效日期；
- 当前状态；
- 相关规则和文档。

这是风险最低、最基础的能力。

### Answer API

基于检索结果生成简洁摘要：

- 只使用返回的证据；
- 每个事实附引用；
- 明确不确定性和条件；
- 证据不足时拒绝总结；
- 固定附带免责声明。

客户可以把 Search API 用于内部研究，把 Answer API 嵌入自己的客服或产品界面。

因此当前需求定义可以暂时冻结为：

&gt; **为已经进入或准备进入澳洲市场的 payroll/HR 软件平台，提供基于澳洲官方来源、带版本与引用的税务信息搜索和问答 API。客户负责对结果的审核、解释和最终使用。**

我认为这个定义既符合单人公司的现实，也保留了未来扩展到更广税务领域的空间。

下一步最需要确定的是：**系统只检索 ATO 发布的内容，还是从第一版开始也检索法律原文？** 这会决定我们所谓“官方税务知识”的真正边界。
</pre>

## 22 | User | 2026-08-02T07:26:11.566Z

<pre>
从第一版开始也检索法律原文
</pre>

## 23 | Assistant | 2026-08-02T07:26:11.566Z

<pre>
好，这意味着第一版不是“ATO 网站搜索”，而是“法规原文 + ATO 解释”的双层检索。这里最关键的需求不再只是收录哪些网页，而是能否把同一问题对应到具体法条、适用版本和 ATO 解释。我先核对 payroll/super 相关的联邦法规集合，然后只定义第一版语料边界，不进入抓取或架构方案。
</pre>

## 24 | Assistant | 2026-08-02T07:26:11.567Z

<pre>
好。第一版的产品边界就确定为：

&gt; 同时检索澳洲联邦税务法律原文和 ATO 发布的解释性内容，并明确区分“法律规定”与“ATO 的解释/操作指引”。

这会成为 TaxRAG 相比普通 ChatGPT 和普通网站搜索的重要差异。

## 第一版建议纳入的法律语料

围绕 payroll、PAYG、STP、super 和 FBT，第一批法律原文至少包括：

- `Taxation Administration Act 1953`
  - PAYG withholding；
  - STP reporting；
  - penalties、records 和 administration。
- `Taxation Administration Regulations 2017`
- `Superannuation Guarantee (Administration) Act 1992`
  - employee/employer 定义；
  - qualifying earnings；
  - super guarantee；
  - shortfall 和 charge。
- `Income Tax Assessment Act 1936`
- `Income Tax Assessment Act 1997`
  - employment income、allowances、deductions 等相关条款。
- `Fringe Benefits Tax Assessment Act 1986`
  - 雇主提供福利时的 FBT 规则。
- 上述法规直接引用的重要 legislative instruments。

这只是 payroll 领域的初始法规集合，不代表完整澳洲税法。系统后续可以沿法规引用关系逐步扩展。

Federal Register 本身提供法律的 compilation、历史版本和有效日期。例如 `Superannuation Guarantee (Administration) Act 1992` 在 2026 年 7 月 1 日已经形成新的 compilation，并加入 qualifying earnings 等 Payday Super 相关内容。[SGAA 1992](https://www.legislation.gov.au/Latest/C2022C00095)

## 同时纳入的 ATO 语料

第一版对应收录：

- ATO 通俗业务指引；
- Taxation Rulings；
- Taxation Determinations；
- Law Administration Practice Statements；
- Decision Impact Statements；
- ATO Software Developers 文档；
- 与目标法规直接相关的其他 ATO legal database 文件。

第一版暂时不纳入：

- 法院和 ART 案例；
- Fair Work 和 modern awards；
- 各州 payroll tax；
- 私人出版商的税务解读；
- 尚未成为法律的政策宣传或新闻报道。

Draft legislation 和未来已知修订可以检索，但必须单独标记为“尚未生效”，不能与当前法律混在一起。

## 用户看到的结果必须分层

对于一个问题，系统不能只给出一段混合答案，而应让用户看到：

```text
问题：从 2026 年 7 月起，super 应该何时支付？

法律依据
└─ SGAA 1992 &#183; section/subsection &#183; compilation C78
   生效日期：1 July 2026

ATO 解释
└─ Payday Super guidance
   最后更新日期：...

软件开发者指引
└─ STP / qualifying earnings reporting requirements
   最后更新日期：...
```

每条法律引用至少需要展示：

- 法律名称；
- section/subsection；
- compilation ID；
- 生效区间；
- 原文摘录；
- Federal Register 链接；
- 当前、历史或未来状态。

ATO 内容则展示：

- 文件类型；
- 标题；
- 发布和更新时间；
- current、withdrawn、superseded、draft 或 under review；
- 原文链接。

不能用一个笼统的“官方来源”标签掩盖两者的不同性质。

## 下一个需求决策：历史版本

Payroll 平台经常需要处理回溯问题，例如：

&gt; 2025 年 10 月的某次支付，当时适用的 super 规则是什么？

这时只搜索最新法律可能给出错误答案。法规拥有大量 compilation，例如 `Income Tax Assessment Act 1936` 已有数百个版本记录。[ITAA 1936 versions](https://www.legislation.gov.au/Series/C1936A00027)

我的建议是第一版支持有限的历史检索：

- 默认回答当前规则；
- 用户可以指定 `as at` 日期或财年；
- 初期至少覆盖最近三个财年；
- 回答必须使用该日期有效的法规版本和 ATO 内容；
- 没有足够历史资料时明确提示覆盖不足。

下一步只确认这一点：**第一版是否支持最近三个财年的历史规则检索，还是先只回答当前有效规则？**
</pre>

## 25 | User | 2026-08-02T07:26:11.567Z

<pre>
是，“支持最近三个财年的历史规则检索”
</pre>

## 26 | Assistant | 2026-08-02T07:26:11.568Z

<pre>
确定。第一版的时间覆盖定义为：

- 当前财年：2026–27；
- 上一个财年：2025–26；
- 再上一个财年：2024–25；
- 默认按提问当天有效的规则回答；
- 用户可以指定财年或具体日期；
- 每个答案必须标明使用的法规版本和适用日期；
- 未来已通过但尚未生效的规则单独展示，不能与当前规则混合。

系统需要支持三类时间问题：

1. **当前规则**

   &gt; Payday Super 现在要求什么时候付款？

2. **历史规则**

   &gt; 2025 年 10 月当时适用什么 super payment deadline？

3. **规则变化**

   &gt; 2025–26 和 2026–27 的 super guarantee rules 有什么变化？

如果问题没有时间信息，并且不同财年的答案明显不同，系统不能静默选择一个版本，应提示当前默认日期，或者要求用户明确期间。

还有一个现实限制：法律原文通常有正式 compilation history，但普通 ATO 网页不一定公开完整历史版本。因此系统应区分：

- 已确认的历史版本；
- 仅确认当前版本；
- 通过归档获得但未经官方版本标识的内容；
- 历史资料缺失。

不能把今天的 ATO 网页内容假装成三年前的解释。

下一个需求决策是：**是否允许企业客户加入自己的产品文档和客服知识库？**

例如客户问：

&gt; 为什么 Acme Payroll 把这笔 payment 标记为 qualifying earnings？

只检索法律和 ATO，我们只能解释 qualifying earnings 的一般规则；要解释 Acme Payroll 的实际行为，还需要检索客户自己的：

- 帮助中心；
- 产品规则说明；
- 配置文档；
- 已批准的客服答案；
- release notes。

我的建议是第一版支持“官方公共语料 + 每个企业的私有知识库”，但两类来源必须清楚分开，不能把客户文档标成官方税务依据。你是否希望第一版包含客户私有文档？
</pre>

## 27 | User | 2026-08-02T07:26:11.568Z

<pre>
我不是特别想包含客户私有文档，因为这样我一开始就没法测试了
</pre>

## 28 | Assistant | 2026-08-02T07:26:11.568Z

<pre>
那第一版不包含客户私有文档。这是合理的取舍，也会让产品更容易测试、复现和公开演示。

第一版的知识边界确定为：

&gt; 只检索公开、权威的澳洲联邦税务来源，包括法律原文与 ATO 内容，不接收企业内部文档。

这意味着系统可以回答：

- qualifying earnings 的法律定义是什么？
- contractor 在什么一般条件下涉及 super guarantee？
- 2025–26 和 2026–27 的规则有什么变化？
- ATO 对某个法条如何解释？
- 某项规则的法律原文在哪里？

但不能回答：

- 为什么某个 payroll 产品这样计算？
- 某个平台的配置应该怎么设置？
- 某个客户账户为什么产生这个结果？
- 企业自己的处理方式是否正确？

遇到这类问题，系统应明确说明：

&gt; 可以提供相关的一般法律和 ATO 信息，但无法判断特定软件实现或客户情况。

这个选择还有几个好处：

- 所有客户使用同一套公共知识库；
- 暂时不需要做企业文档上传和权限隔离；
- 不需要处理客户数据泄露风险；
- 100 条 synthetic questions 可以直接围绕统一语料生成；
- 所有检索结果都可以重复验证；
- 产品质量不会依赖客户是否提供了好文档。

客户私有知识库可以以后作为独立扩展，而不是第一版前提。

现在下一个需求决策是产品的第一个使用入口。我建议先上线：

&gt; **面向 payroll 平台客服和产品人员的托管式 Web 检索工作台。**

用户可以搜索、提问、切换财年、查看法律原文与 ATO 解释。它先验证企业是否真的愿意为这种研究能力付费。

嵌入式 API 作为下一步：复用同一个搜索和回答能力，让客户接入自己的产品。否则第一版同时做内部工作台、API、SDK 和嵌入式 UI，会稀释最重要的使用验证。

所以接下来要确认：**第一版先以 Web 检索工作台上线，验证后再开放嵌入式 API，可以吗？**
</pre>

## 29 | User | 2026-08-02T07:26:11.569Z

<pre>
没事，我到时候会多agent同时开发，token管够，第一版的目标就是MVP，所以不要偷懒。一起做
</pre>

## 30 | Assistant | 2026-08-02T07:26:11.569Z

<pre>
同意，第一版同时做 Web 工作台和 API，不把 API 推迟。MVP 的范围应由“能否验证完整客户价值”决定，而不是单纯压缩开发量。

现在冻结为：

## MVP 的两个产品入口

### Web 检索工作台

供 payroll 平台的客服、产品和工程人员直接使用：

- 搜索法律及 ATO 内容；
- 自然语言提问；
- 指定财年或具体日期；
- 比较不同财年的规则；
- 查看答案、引用和法律原文；
- 查看来源状态和版本。

### Developer API

供客户嵌入自己的产品：

- Search API：返回相关法条和 ATO 资料；
- Answer API：返回带引用的结构化答案；
- Timeline/Compare API：返回规则在不同日期的变化；
- Source API：返回具体来源、版本和引用范围。

Web 工作台和 API 使用相同能力、相同语料、相同答案规则。Web 产品同时也是 API 的 reference implementation，避免出现“网页回答和 API 回答不一样”。

暂时不等同于提供现成的聊天 widget。客户可以通过 API 构建自己的界面；是否提供官方 widget，我们后面单独决定。

## 当前 MVP 产品定义

&gt; TaxRAG 为已经进入或准备进入澳洲市场的 payroll/HR 软件平台，提供覆盖最近三个财年的澳洲联邦 payroll 税务法律和 ATO 内容检索。产品同时提供 Web 工作台和嵌入式 API，所有答案可追溯到具体法规版本或 ATO 来源。

下一项需求决策是：系统是否接受带具体事实的场景问题。

例如：

&gt; A contractor is paid mainly for their labour, uses their own ABN and invoices monthly. Does the business need to pay super?

如果完全不接受场景问题，产品会比较像高级法律搜索，实际客服价值有限。我的建议是接受，但系统不直接给出最终裁决，而是返回：

- 可能相关的规则；
- 需要判断的条件；
- 已知事实与各条件的对应关系；
- 缺失信息；
- 支持和可能反对该结论的来源；
- 不能由系统确定的部分。

也就是回答“哪些规则可能适用以及为什么”，而不是替客户宣布“必须支付”或“不必支付”。

**第一版是否允许这种具体事实场景检索？**
</pre>

## 31 | User | 2026-08-02T07:26:11.570Z

<pre>
接受
</pre>

## 32 | Assistant | 2026-08-02T07:26:11.570Z

<pre>
确定。第一版接受具体事实场景，但产品仍然定位为“规则研究”，不是自动合规裁决。

场景型回答应包含：

1. **问题理解**：系统识别出的关键事实。
2. **可能适用的规则**：对应法条和 ATO 解释。
3. **条件分析**：哪些条件可能满足、哪些尚不明确。
4. **缺失信息**：还需要确认哪些事实。
5. **时间范围**：使用的财年或具体生效日期。
6. **结论边界**：可以确定什么、不能确定什么。
7. **完整引用**：支持或限制结论的原文。

例如不能只回答：

&gt; Yes, the business must pay super.

而应该回答：

&gt; The contractor may be treated as an employee for super guarantee purposes if the contract is wholly or principally for their labour. The facts provided indicate X, but Y and Z remain unclear. Relevant sources are…

这也意味着产品需要支持追问，因为第一次提问经常缺少必要事实。后面我们将决定多轮对话如何工作。

现在必须先确定隐私边界。场景问题可能包含真实 payroll 数据，例如：

- 员工姓名和地址；
- TFN；
- 工资和 payslip；
- 银行信息；
- super fund 信息；
- 具体雇佣合同；
- 客户内部记录。

我的强烈建议是第一版只接受匿名化场景：

- 可以输入角色、付款类型、日期、金额和工作安排；
- 不应输入姓名、TFN、银行账户或可识别员工的信息；
- Web 和 API 都明确提示不要提交个人信息；
- 检测到明显敏感字段时自动遮盖或拒绝；
- 查询日志默认不长期保存原始敏感文本。

这样仍然可以测试真实业务问题，但避免第一版立刻进入复杂的 payroll 数据安全和隐私合规范围。

**第一版是否确定为“支持匿名化事实场景，但不接受真实员工个人资料”？**
</pre>

## 33 | User | 2026-08-02T07:26:11.570Z

<pre>
只接受匿名化场景
</pre>

## 34 | Assistant | 2026-08-02T07:26:11.571Z

<pre>
确定。第一版的数据边界为：

&gt; 支持匿名化事实场景，不接受或处理可识别的员工个人资料。

具体要求：

- 允许：职位类型、合同性质、付款类型、金额、日期、工作方式、是否提供工具等匿名事实。
- 禁止：姓名、TFN、地址、电话、邮箱、银行账户、员工编号、payslip 原件等身份信息。
- Web 和 API 均提示调用方先完成匿名化。
- 系统检测到明显个人信息时，遮盖敏感部分或拒绝处理。
- 不提供员工档案、工资单上传或 payroll 数据同步。
- 客户必须在嵌入式界面中展示相同的数据输入限制。

下一步是多轮交互。具体场景往往缺少决定性事实，例如 contractor 问题可能需要继续确认：

- 合同主要是购买劳动还是交付结果；
- 是否可以委派他人；
- 谁提供工具和设备；
- 谁承担返工风险；
- 问题发生在哪个财年。

我的建议是第一版支持“有限目的的多轮澄清”：

1. 系统先识别缺失的关键事实；
2. 一次提出最重要的 1–3 个澄清问题；
3. 用户补充匿名信息；
4. 系统更新分析和引用；
5. 对话只围绕当前研究问题，不建立长期员工档案；
6. 每轮答案都保留适用日期和引用来源。

它不是开放式聊天记忆，而是一个有边界的税务研究 session。

**第一版是否支持这种有限多轮澄清？**
</pre>

## 35 | User | 2026-08-02T07:26:11.571Z

<pre>
支持
</pre>

## 36 | Assistant | 2026-08-02T07:26:11.571Z

<pre>
确定。第一版支持有限多轮澄清：

- 每个对话围绕一个税务研究问题；
- 系统识别决定性事实和缺失事实；
- 每轮只询问最关键的 1–3 个问题；
- 用户只能补充匿名化信息；
- 补充事实后重新检索和更新分析；
- 不建立长期员工档案；
- 用户切换财年时重新验证全部来源；
- Web 工作台和 API 保持相同的对话行为。

下一项是“不知道时怎么办”。这是产品能否比通用 ChatGPT 更可信的核心。

我建议答案必须有明确状态：

- `SUPPORTED`：来源充分支持；
- `CONDITIONAL`：取决于尚未确定的事实；
- `INSUFFICIENT_EVIDENCE`：现有语料不足；
- `CONFLICTING_SOURCES`：来源之间存在冲突或时间差异；
- `OUT_OF_SCOPE`：属于 Fair Work、州 payroll tax、个案计算等范围；
- `SOURCE_NOT_CURRENT`：只找到历史或已失效来源。

当证据不足时，系统必须拒绝拼凑答案；当法律原文与 ATO 通俗指引表达不同，必须分别展示，而不是让模型自行消除冲突。

例如：

&gt; Based on the available sources, TaxRAG cannot determine whether this payment forms part of qualifying earnings. The contract terms concerning X are missing.

而不是输出一个概率性的“Yes, probably”。

**第一版是否接受这种严格拒答机制，即宁愿少回答，也不使用模型常识补全没有官方依据的结论？**
</pre>

## 37 | User | 2026-08-02T07:26:11.571Z

<pre>
对的，必须准确，不知道就说不知道拒绝幻想与不准确用语
</pre>

## 38 | Assistant | 2026-08-02T07:26:11.572Z

<pre>
确定。这是第一版不可降级的产品原则：

&gt; 所有答案只能来自当前检索到的适用官方证据。没有充分证据就明确拒答，不使用模型记忆、常识或猜测补全。

具体要求包括：

- 每个事实性 claim 必须有直接支持它的引用；
- 引用必须真的支持该 claim，不能只是在同一主题下；
- 不得静默假设用户未提供的事实；
- 不得把 `may`、`generally`、`in some circumstances` 改写成确定结论；
- 不得省略官方来源中的重要条件和例外；
- 必须说明适用财年或日期；
- 来源冲突时展示冲突，不擅自选择；
- 找到的只有旧版本时，不得当作当前规则回答；
- 无法判断时使用清晰语言说明“不知道什么、为什么不知道、缺少什么”；
- 每次回答都能查看完整原文，而不只是模型生成的引用标签。

我们不能在商业上承诺“绝对不会出错”，但可以把产品承诺定义为：

&gt; **答案可验证、假设可见、证据不足时拒答。**

下一项需求是语言。目标客户在澳洲，法律和 ATO 原文也是英文。为了避免翻译改变 `must`、`may`、`reasonable`、`principally` 等法律措辞，我建议 MVP：

- 产品界面和答案使用英文；
- 保留英文法律原文；
- 不提供自动中文或其他语言翻译；
- 后续再加入“翻译仅供理解，英文原文优先”的多语言能力。

**第一版是否确定为 English-only？**
</pre>

## 39 | User | 2026-08-02T07:26:11.572Z

<pre>
对的英文，而且app本身也是英文，中文只出现在你我对话之间
</pre>

## 40 | Assistant | 2026-08-02T07:26:11.573Z

<pre>
确定。MVP 的所有用户可见内容均为英文：

- Web application；
- API fields、messages 和 documentation；
- Answers and refusal messages；
- Source metadata；
- Disclaimers；
- Evaluation dataset；
- Product website and onboarding。

法律与 ATO 原文保持英文，不做自动翻译。中文只用于我们之间的产品讨论。

下一步需要冻结第一块税务领域的边界。我建议 MVP 的第一个 coverage pack 是：

### Australian Payroll Tax Core

包括：

- PAYG withholding；
- withholding schedules；
- Single Touch Payroll；
- employee/contractor definitions 与 payroll tax obligations 的关联；
- Super Guarantee；
- Payday Super；
- late payment、shortfall 和相关一般性义务；
- 与上述内容直接相关的 record keeping；
- 最近三个财年的法律和 ATO 版本。

明确暂不包括：

- Fair Work、modern awards、minimum wage、leave；
- 各州和领地的 payroll tax；
- 完整 FBT；
- 员工个人所得税 deductions；
- 工资或税额计算引擎；
- 报税、STP submission 或 super payment execution。

我建议把 FBT 做成第二个独立 coverage pack。因为 FBT 本身包含车辆、住房、贷款、expense payments、entertainment、remote area benefits、估值方法和大量豁免，规模足以成为一个独立产品模块。把它塞进 Payroll Core 会让“覆盖完整”的定义变得模糊。

因此下一项只确认：**MVP 先完成 PAYG + STP + Super/Payday Super，FBT 作为紧接着的第二个 coverage pack，可以吗？**
</pre>

## 41 | User | 2026-08-02T07:26:11.573Z

<pre>
不行，全做了
</pre>

## 42 | Assistant | 2026-08-02T07:26:11.573Z

<pre>
明白，FBT 不拆到第二阶段。MVP 直接覆盖完整的联邦 employer payroll tax and super domain。

第一版 coverage pack 调整为：

- PAYG withholding；
- withholding schedules；
- Single Touch Payroll / STP Phase 2；
- STP corrections and finalisation；
- Super Guarantee；
- Payday Super；
- qualifying earnings；
- employee and contractor classifications；
- allowances、reimbursements 和 deductions 的 payroll 处理规则；
- salary sacrifice；
- employment termination payments；
- lump sum payments；
- reportable employer super contributions；
- 完整 Fringe Benefits Tax：
  - cars；
  - car parking；
  - expense payments；
  - loans；
  - housing；
  - living-away-from-home allowances；
  - entertainment；
  - residual benefits；
  - exemptions and reductions；
  - valuation rules；
  - reportable fringe benefits；
- employer record keeping；
- reporting deadlines、corrections、penalties；
- 最近三个财年的法规和 ATO 内容。

“全覆盖”指知识检索覆盖完整，但产品仍然不是 calculation engine。它可以检索和解释官方计算公式，却不接收真实员工数据并自动算出应缴金额。

接下来还有一个边界需要单独确认：**州和领地 payroll tax 是否也进入 MVP？**

这不是 ATO 管辖的联邦税，每个州和领地都有独立的：

- Revenue Office；
- legislation；
- thresholds；
- rates；
- exemptions；
- grouping rules；
- interstate wage rules；
- historical versions。

如果加入，就意味着 MVP 覆盖 NSW、Victoria、Queensland、WA、SA、Tasmania、ACT 和 NT 八套体系。你刚才说的“全做”，我目前理解为联邦 payroll tax/super + 完整 FBT；是否也包括这八套州和领地 payroll tax？
</pre>

## 43 | User | 2026-08-02T07:26:11.573Z

<pre>
加入包括这八套州和领地 payroll tax
</pre>

## 44 | Assistant | 2026-08-02T07:26:11.573Z

<pre>
确定。MVP 同时覆盖联邦 employer tax/super 和八个州、领地的 payroll tax。

## 州与领地覆盖

- New South Wales
- Victoria
- Queensland
- Western Australia
- South Australia
- Tasmania
- Australian Capital Territory
- Northern Territory

每个 jurisdiction 需要覆盖：

- payroll tax legislation and regulations；
- taxable wages；
- rates and thresholds；
- registration requirements；
- grouping rules；
- contractor provisions；
- exemptions；
- interstate and multi-state wages；
- allowances and fringe benefits；
- superannuation treatment；
- termination payments；
- lodgment and payment deadlines；
- penalties and interest；
- rulings、revenue guidance 和 official examples；
- 2024–25、2025–26、2026–27 三个财年。

## 地域处理原则

州级 payroll tax 不能在没有 jurisdiction 的情况下直接回答。系统需要：

- 用户明确指定州或领地；
- 未指定时先询问；
- 涉及多个州时分别检索各 jurisdiction；
- 不把一个州的 threshold 或 exemption 应用到另一个州；
- 每个数字都标明 jurisdiction、财年和来源；
- 支持比较问题，例如：

&gt; Compare the payroll tax treatment of contractor payments in NSW, Victoria and Queensland for 2025–26.

第一版的知识覆盖现在已经是：

```text
Federal
├─ PAYG withholding
├─ STP
├─ Super / Payday Super
├─ Employee and contractor rules
├─ Employment payments
└─ Full FBT

States and territories
├─ NSW payroll tax
├─ VIC payroll tax
├─ QLD payroll tax
├─ WA payroll tax
├─ SA payroll tax
├─ TAS payroll tax
├─ ACT payroll tax
└─ NT payroll tax
```

下一个相邻边界是 employment law。Payroll 用户很可能会询问 minimum wage、modern awards、overtime、leave、penalty rates 和 termination entitlements，但这些不是税务规则，主要属于 Fair Work 体系。

我的建议是 MVP 明确拒答 employment law，只覆盖上述 tax、reporting 和 super 范围，否则产品会从 TaxRAG 扩展成完整 payroll compliance platform。

**MVP 是否排除 Fair Work、modern awards、wages 和 leave entitlement？**
</pre>

## 45 | User | 2026-08-02T07:26:11.574Z

<pre>
不排除，因为这些都是related
</pre>

## 46 | Assistant | 2026-08-02T07:26:11.574Z

<pre>
明白。那产品边界已经从“税务知识检索”扩大为“澳洲 payroll compliance knowledge retrieval”，TaxRAG 可以继续作为项目名，但对外定位不能再只写 tax。

我先核对 Fair Work 官方语料的组成，尤其是 modern awards、Commission 文件与企业协议的边界，然后把这一扩展准确地写进需求；这一轮仍只确定覆盖范围。
</pre>

## 47 | Assistant | 2026-08-02T07:26:11.574Z

<pre>
确定。MVP 不排除 Fair Work。产品的实际定位现在应调整为：

&gt; **Australian Payroll Compliance Knowledge Retrieval Platform**

`TaxRAG` 可以保留为项目代号，但对外如果继续只强调“Tax”，会让客户误以为不覆盖 wages、awards 和 employment entitlements。

## Fair Work 语料范围

第一版加入：

- `Fair Work Act 2009` 及最近三个财年的版本；
- `Fair Work Regulations 2009`；
- National Employment Standards；
- National Minimum Wage；
- Annual Wage Review decisions；
- 全部 current modern awards；
- modern award variation history；
- Modern Awards Pay Database；
- Fair Work Ombudsman guidance；
- Fair Work Commission 的相关决定和解释；
- record-keeping and payslip requirements。

覆盖的问题包括：

- award coverage；
- employee classification；
- minimum rates；
- casual loading；
- overtime；
- penalty rates；
- allowances；
- ordinary hours and breaks；
- annualised salaries；
- leave entitlements；
- public holidays；
- termination and redundancy；
- payslips and employment records；
- 不同财年规则和费率变化。

FWC 已提供结构化的 Modern Awards Pay Database，包含当前和历史的 minimum rates、allowances、overtime 和 penalty rates，历史可追溯到 2015 年，因此与我们最近三个财年的时间范围相容。[FWC Modern Awards Pay Database API](https://www.fwc.gov.au/work-conditions/awards/modern-awards-pay-database/modern-awards-pay-database-api)

但官方也明确说明：

- 数据库不能判断哪个 award 或 classification 适用；
- 不能判断员工实际应获得哪些 entitlement；
- 某些工资和 entitlement 不包含在数据库里；
- 如果数据库与 modern award 原文冲突，以 award 原文为准。[FWC API limitations](https://developer.fwc.gov.au/important-information)

这些限制正好需要进入我们的严格拒答和来源优先规则。

## 更新后的完整知识边界

```text
Federal tax and reporting
├─ PAYG
├─ STP
├─ Super / Payday Super
└─ FBT

State and territory tax
└─ Payroll tax &#215; 8 jurisdictions

Employment law
├─ Fair Work Act and Regulations
├─ NES
├─ Modern awards
├─ Minimum wages
├─ Overtime and penalty rates
├─ Allowances
├─ Leave and termination
└─ Payroll records and payslips
```

下一个必须单独决定的是 **enterprise agreements**。

Enterprise agreements 也是公开注册的法律文件，并且可能取代 modern award 中的部分适用条件。它们数量很多、针对特定企业或企业群体，而且判断某份 agreement 是否适用需要具体雇佣背景。

**MVP 是否也检索 Fair Work Commission 公布的 enterprise agreements，还是第一版先覆盖 legislation、NES 和 modern awards？**
</pre>

## 48 | User | 2026-08-02T07:26:11.574Z

<pre>
是，检索 Fair Work Commission 公布的 enterprise agreements
</pre>

## 49 | Assistant | 2026-08-02T07:26:11.575Z

<pre>
好，enterprise agreements 进入 MVP。这里不能把 `nominal expiry date` 简单当成“失效日期”，也不能把 agreement 条款和 modern award 条款混为一谈。我先核对 FWC 对 agreement 状态、替代关系和公开检索范围的官方定义，再把它转成产品需求。
</pre>

## 50 | Assistant | 2026-08-02T07:26:11.575Z

<pre>
确定。MVP 检索 Fair Work Commission 公布的 enterprise agreements，以及判断其状态所需的相关文件。

## Enterprise agreement 覆盖要求

纳入：

- approved enterprise agreements；
- agreement variations；
- approval decisions and orders；
- replacement agreements；
- termination decisions and orders；
- agreement coverage information；
- related modern award；
- relevant NES and Fair Work Act provisions。

支持按以下字段检索：

- employer legal or trading name；
- ABN；
- agreement title；
- agreement/agreement application ID；
- industry；
- workplace/location；
- classification；
- clause subject；
- approval and operation dates。

## 不能按最近三年简单截断

Enterprise agreement 的 `nominal expiry date` 不等于失效日期。FWC 明确说明，agreement 在 nominal expiry 后仍可能继续有效，直到被替代或由 Commission 终止。[FWC nominal expiry guidance](https://www.fwc.gov.au/nominal-expiry-date)

因此：

- 最近三个财年的查询可能需要检索十年前批准的 agreement；
- 不能因为 nominal expiry 已过就标记为 inactive；
- 只有发现 replacement 或 termination 依据时，才能确认停止适用；
- 无法建立完整状态链时，应标记为 `STATUS_UNCONFIRMED`；
- 历史查询必须使用当时实际生效的 agreement 版本；
- zombie agreements 等特殊历史状态需要单独处理。

回答还必须区分：

- agreement 是否覆盖某个 employer/employee；
- agreement 是否在相关时间实际适用；
- modern award 是否只构成背景或最低比较依据；
- NES 是否继续提供不可降低的最低标准。

如果用户没有提供 employer、location、classification 或 employment context，系统不能自行断言某份 agreement 适用。

## 更新后的定位

现在它已经不是一个狭义税务 RAG，而是：

&gt; **An authoritative Australian payroll compliance search and question-answering platform covering tax, superannuation, payroll tax, employment legislation, modern awards and enterprise agreements.**

下一个不可避免的边界是州和领地 employment law。Fair Work 并不覆盖所有 payroll entitlement，例如：

- long service leave；
- 部分 public holidays；
- WA state industrial relations system；
- state public-sector employment instruments；
- child employment；
- 某些 state-based leave and employment obligations。

**MVP 是否也覆盖八个州和领地的 employment legislation 与相关官方指引？**
</pre>

## 51 | User | 2026-08-02T07:26:11.575Z

<pre>
覆盖八个州和领地的 employment legislation 与相关官方指引
</pre>

## 52 | Assistant | 2026-08-02T07:26:11.575Z

<pre>
确定。MVP 覆盖八个州和领地的 employment legislation 与官方指引。

这部分包括：

- long service leave；
- public holidays；
- child employment restrictions that affect hours or pay；
- state industrial relations systems；
- WA state-system employment rules；
- state awards and wage instruments；
- state public-sector employment instruments；
- leave、termination 和 redundancy 的州级特殊规定；
- payroll record-keeping requirements；
- 各州 regulator 发布的官方 guidance；
- 最近三个财年的历史版本。

对于可能长期继续适用的 award、agreement 或 instrument，不能仅按发布日期截断；必须根据实际有效状态决定是否纳入历史查询。

## 需要建立统一的范围判断规则

否则“employment-related”会无限扩大到招聘、签证、反歧视、工会治理、职业安全和员工绩效等整个 HR 法律领域。

我建议 MVP 使用下面这条边界：

&gt; A rule is in scope when it directly determines or changes an amount, entitlement, contribution, deduction, tax, reporting field, payment deadline, leave balance, payslip item or payroll record.

按照这个标准：

### 属于范围

- wages and classifications；
- ordinary hours、overtime、penalties；
- allowances and reimbursements；
- leave and public holidays；
- termination and redundancy pay；
- PAYG、STP、super、FBT；
- state payroll tax；
- award and agreement monetary conditions；
- payroll records and payslips；
- workers compensation payments 对 payroll 的处理；
- back pay and corrections。

### 不属于范围

- recruitment and interviewing；
- performance management；
- workplace investigations；
- discrimination and harassment；
- workplace health and safety，除非直接影响 payroll payment；
- immigration and visa compliance；
- union governance；
- general HR policy；
- industrial dispute procedure，除非问题直接涉及应付金额或 payroll obligation。

这样产品可以覆盖完整 payroll compliance，但不会变成整个澳洲 employment law 搜索系统。

**是否接受这条范围原则：只要规则直接影响 payroll 的金额、entitlement、reporting、payment 或 record，就纳入；其他一般 HR/employment 问题排除？**
</pre>

## 53 | User | 2026-08-02T07:26:11.575Z

<pre>
等等为什么不变成成整个澳洲 employment law 搜索系统，这样其实更是我想要的。
</pre>

## 54 | Assistant | 2026-08-02T07:26:11.576Z

<pre>
可以，而且从你现在不断扩展的需求看，**整个澳洲 employment law 搜索系统可能才是真正的产品愿景**。

之前限制在 payroll，是因为我们最初选择了 payroll/HR 软件平台作为第一个客户群，而不是因为产品技术上只能做 payroll。现在看来，更准确的关系是：

```text
Australian Employment Law Platform
├─ Employment standards
├─ Awards and agreements
├─ Payroll compliance
├─ Tax and super
├─ Workplace safety
├─ Discrimination
├─ Industrial relations
└─ State and territory employment law
```

Payroll 应该是其中一个高价值模块，而不是整个产品边界。

## 更新后的产品定位

&gt; **An authoritative Australian employment law search and question-answering platform for software companies, employers and professional teams.**

它通过 Web 工作台和 API 检索澳洲官方法律、监管指引和法律文件，支持历史版本、具体场景、多轮澄清、精确引用和严格拒答。

最初的 payroll/HR 软件平台仍然可以是第一批客户，但产品不再被限制为 payroll 工具。

## 完整 employment law 语料版图

### Employment conditions

- Fair Work Act and Regulations；
- National Employment Standards；
- modern awards；
- enterprise agreements；
- minimum wages；
- leave、hours、termination、redundancy；
- casual、fixed-term、contractor 和 employee rules。

### Payroll, tax and super

- PAYG、STP；
- super and Payday Super；
- FBT；
- 八个州和领地 payroll tax；
- pay records and payslips。

### Workplace health and safety

- Commonwealth、state and territory WHS/OHS legislation；
- regulations；
- approved codes of practice；
- Safe Work Australia guidance；
- state regulator guidance。

### Discrimination and workplace rights

- sex、age、race and disability discrimination；
- adverse action and general protections；
- harassment；
- equal opportunity；
- workplace bullying；
- protected attributes；
- Australian Human Rights Commission 和州级机构指引。

### Industrial relations

- union and employer rights；
- bargaining；
- protected industrial action；
- right of entry；
- disputes；
- Fair Work Commission orders and decisions。

### Additional employment-related areas

- workers compensation；
- labour hire licensing；
- portable long service leave；
- workplace surveillance；
- employee privacy；
- whistleblower protections；
- child employment；
- public-sector employment rules；
- right-to-work and employment-related visa questions。

其中有些法律不完全属于 employment law，例如 privacy、corporations 或 migration，但当问题与雇佣关系直接相关时可以检索对应条款。

## 不变的产品原则

即使范围扩大，之前确认的原则仍然成立：

- English-only；
- 只使用公开官方语料；
- 不接收客户私有知识库；
- 只接受匿名化场景；
- 支持有限多轮澄清；
- 支持当前财年和最近两个财年的历史查询；
- Web workspace 与 API 同时上线；
- 每个事实必须有来源；
- 不知道就拒答；
- 不替用户作最终法律判断。

## 下一个关键边界：判例

如果做完整 employment law 搜索，只检索 legislation、awards 和 regulator guidance 还不够。大量概念的实际含义来自法院和 tribunal 的解释，例如：

- employee vs contractor；
- adverse action；
- reasonable additional hours；
- serious misconduct；
- redundancy；
- casual employment；
- award interpretation。

因此我的建议是 MVP 也加入公开判例：

- High Court；
- Federal Court and Full Court；
- Federal Circuit and Family Court；
- Fair Work Commission decisions；
- 各州和领地相关法院与 tribunal；
- regulator 发布的 decision summaries 和 impact materials。

FWC 自己的公开检索已经包含 decisions、orders、modern awards 和 enterprise agreements，可作为其中一个官方入口。[FWC Document Search](https://www.fwc.gov.au/document-search?search-ui=agreements)

**MVP 是否也完整检索这些 employment-related court and tribunal decisions？**
</pre>

## 55 | User | 2026-08-02T07:26:11.576Z

<pre>
是，加入这些“  - High Court；
  - Federal Court and Full Court；
  - Federal Circuit and Family Court；
  - Fair Work Commission decisions；
  - 各州和领地相关法院与 tribunal；
  - regulator 发布的 decision summaries 和 impact materials。

  FWC 自己的公开检索已经包含 decisions、orders、modern awards 和 enterprise
  agreements，可作为其中一个官方入口。FWC Document Search
  (https://www.fwc.gov.au/document-search?search-ui=agreements)”
</pre>

## 56 | Assistant | 2026-08-02T07:26:11.576Z

<pre>
确定。MVP 加入完整的 employment-related case law layer：

- High Court of Australia；
- Federal Court and Full Court；
- Federal Circuit and Family Court；
- Fair Work Commission decisions and orders；
- 各州和领地相关法院；
- 各州和领地相关 tribunal；
- regulator decision summaries；
- regulator impact statements and related materials。

## 判例检索必须保留的元数据

每份 judgment 或 decision 至少需要：

- court or tribunal；
- jurisdiction；
- neutral citation；
- case number；
- decision date；
- judges or members；
- parties；
- decision type；
- appeal level；
- outcome；
- paragraph numbers；
- cited legislation；
- cited awards or agreements；
- cited and citing cases；
- related appeal or subsequent decision；
- official source URL。

引用必须定位到具体 paragraph，而不能只引用整份判决。

## 法律权威必须分层

系统不能把所有搜索结果都标成“legal authority”。至少要区分：

1. Binding or potentially binding court authority；
2. Persuasive court authority；
3. Tribunal or Commission decision；
4. Regulator interpretation；
5. Decision summary or impact material。

Regulator summary 可以帮助理解，但不能替代 judgment 原文；如果 summary 与原判决表达不同，必须展示原判决。

## 判例不能只覆盖最近三个财年

“三个财年”适用于回答某个时间点有效的规则，但判例语料不能按最近三年截断。较早的判例可能仍然是当前重要 authority。

因此建议：

- 法规和规则支持最近三个财年的 point-in-time 查询；
- 判例库尽可能覆盖完整历史；
- 默认优先展示当前仍相关的判例；
- 不因为判例较旧就自动降低其法律效力；
- 追踪 appeal、overruled、distinguished、followed 和 considered 状态；
- 无法确认后续处理时显示 `SUBSEQUENT_TREATMENT_UNKNOWN`；
- 不允许模型自行宣布某个判例已经“不是 good law”。

下一步是未来法律。Employment law 经常存在已经通过但尚未生效的修法、仍在 Parliament 的 bill，以及 regulator consultation。

我的建议是全部可检索，但严格分区：

- `IN_FORCE`
- `ENACTED_NOT_IN_FORCE`
- `BILL_NOT_ENACTED`
- `DRAFT_OR_CONSULTATION`
- `REPEALED_OR_SUPERSEDED`

默认答案只使用 `IN_FORCE`；其他状态只能作为 upcoming changes 单独展示。

**MVP 是否也纳入 bills、explanatory memoranda、已通过但尚未生效的修法，以及 regulator consultation materials？**
</pre>

## 57 | User | 2026-08-02T07:26:11.577Z

<pre>
是，但是要注明他们是已通过但尚未生效的修法等等
</pre>

## 58 | Assistant | 2026-08-02T07:26:11.577Z

<pre>
确定。MVP 纳入未来和拟议法律材料，但必须与现行法律严格隔离。

每份材料都要显示明确状态：

- `IN_FORCE`
- `ENACTED_NOT_IN_FORCE`
- `BILL_NOT_ENACTED`
- `DRAFT_OR_CONSULTATION`
- `REPEALED`
- `SUPERSEDED`
- `STATUS_UNCONFIRMED`

同时展示：

- jurisdiction；
- document type；
- introduced date；
- passage and assent date；
- commencement date；
- commencement 是否依赖 proclamation 或其他事件；
- last verified date；
- official source；
- 替代或修改了哪些现行条款。

例如，答案不能写：

&gt; Employers must comply with X.

而应写：

&gt; The amendment has been enacted but is not yet in force. It is scheduled to commence on 1 January 2027. The current rule remains Y until commencement.

对于 bill：

&gt; This is a bill and has not been enacted. Its provisions may change or may never become law.

对于 consultation：

&gt; This is a consultation proposal and does not create a legal obligation.

## 当前与未来必须并列展示

当用户询问即将变化的规则时，推荐格式是：

```text
Current law
- Rule currently in force
- Effective version and source

Upcoming change
- Enacted amendment
- Commencement date
- Provisions affected

Not yet enacted
- Relevant bill or consultation
- Current parliamentary/regulatory status
```

默认回答当前义务时，只允许使用 `IN_FORCE` 来源形成结论。其他状态只能出现在“Upcoming or proposed changes”部分。

下一项需求是规则变更监控。既然系统已经收录：

- legislation versions；
- bills and amendments；
- awards；
- enterprise agreements；
- court decisions；
- regulator guidance；
- tax and payroll rates；

它可以在来源发生变化时主动通知企业，而不只是等待用户搜索。

我建议 MVP 同时包含：

- 按 topic、jurisdiction、award、agreement 或 legislation 建立 watchlist；
- 新规则、修订、生效、废止和状态变化提醒；
- 旧版本与新版本的内容差异；
- Web notification；
- email notification；
- webhook/API event，供软件平台接入内部流程；
- 所有变更都附官方来源，AI 摘要仅作为说明。

**MVP 是否加入这种 change monitoring 与 alerts？**
</pre>

## 59 | User | 2026-08-02T07:26:11.577Z

<pre>
是
</pre>

## 60 | Assistant | 2026-08-02T07:26:11.577Z

<pre>
确定。MVP 加入 change monitoring and alerts。

提醒覆盖：

- legislation amended；
- amendment commenced；
- bill introduced、passed、assented or rejected；
- consultation opened or closed；
- ATO、FWO、FWC 或州级 regulator guidance 更新；
- modern award varied；
- wage、allowance、overtime 或 penalty rate 更新；
- enterprise agreement approved、varied、replaced or terminated；
- new court or tribunal decision；
- existing decision 出现 appeal 或 subsequent treatment；
- source withdrawn、superseded or placed under review。

每个 alert 至少包含：

- what changed；
- previous and new text；
- effective date；
- affected jurisdiction and topics；
- document status；
- affected provisions、awards 或 agreements；
- official source；
- AI-generated summary 标识；
- uncertainty or missing impact information。

通知渠道包括 Web、email 和 webhook/API events。

下一项需求是企业账户模型。虽然不接收客户私有文档，但客户仍然会保存：

- search history；
- research sessions；
- watchlists；
- alerts；
- bookmarked sources；
- API keys；
- API usage；
- webhook configuration。

我建议 MVP 从第一版就支持 organization workspace，而不是只有个人账号：

- `Owner`：billing、organization 和所有权限；
- `Admin`：成员、API keys、webhooks 和配置；
- `Researcher`：搜索、提问、保存研究和创建 watchlists；
- `Viewer`：查看共享研究与 alerts；
- `Developer`：管理 API integration，但不能管理 billing。

嵌入式终端用户不需要 TaxRAG 账号；由客户的软件后端调用 TaxRAG API。

**MVP 是否采用这种 organization workspace + role-based access 模型？**
</pre>

## 61 | User | 2026-08-02T07:26:11.578Z

<pre>
是，还有我们是不是不应该叫TaxRAG了？可以叫AustraliaBusinessRAG
</pre>

## 62 | Assistant | 2026-08-02T07:26:11.578Z

<pre>
对，`TaxRAG` 已经不能准确描述现在的产品；但我也不太建议直接用 `AustraliaBusinessRAG`：它会让客户期待公司法、ASIC、隐私、消费者法等整个 business law，而我们当前核心仍是 employment、payroll、tax 和 workplace compliance。另外，“RAG”更适合作为技术或项目代号，不一定适合作为企业客户看到的产品名。

我先做一个轻量的现有名称冲突检查，再给你一个命名方向，不会在这一轮展开成完整品牌项目。
</pre>

## 63 | Assistant | 2026-08-02T07:26:11.579Z

<pre>
是，`TaxRAG` 应该改名。它现在只描述了产品的一小部分。

但我不建议把 `AustraliaBusinessRAG` 直接作为面向客户的正式产品名，原因有三个：

- `Business` 太宽，会让客户期待公司法、ASIC、消费者法、隐私、金融监管等全部商业法律；
- `RAG` 是技术实现，不是客户购买的价值；
- 名称较长，不容易形成品牌和域名。

初步搜索没有发现明显同名的 `AustraliaBusinessRAG`，所以它可以作为仓库名或内部项目代号。但这不是完整的商标、公司名和域名审查。

我的建议是暂时分成两层：

- 内部项目/仓库：`australia-business-rag`
- PRD 工作名称：**Australian Employment Intelligence Platform**

先用描述性名称把需求写准确，等产品边界稳定后，再单独做一次品牌命名和 IP Australia/domain clearance。

不建议使用 `WorkLaw`，澳洲已经存在同名或高度相似的 WHS 服务商。[Worklaw Australia](https://www.worklaw.com.au/)

如果想要更像品牌的方向，可以后续探索：

- `RegScope AU`
- `WorkRule AU`
- `AusWork Intelligence`

这些目前只能算候选，不能在正式检索商标和域名前确认使用。

另外，你刚才也确认了 organization workspace 和 role-based access，这项需求一起保留。

现在产品覆盖已经从 payroll 平台扩展成完整 employment law intelligence，因此下一个客户边界需要重新确认：

&gt; 除了向 HR/payroll 软件平台销售 API，是否也直接向企业 HR、People、payroll、compliance 和 in-house legal teams 销售 Web 工作台？

我的建议是两者都做：

- Software platforms 购买 API；
- Employers and professional teams 购买 Web workspace；
- 两者共享同一个官方语料、问答、历史检索和 alerts。

这样 Web 工作台不只是 API 演示，而是独立可付费的产品。
</pre>

## 64 | User | 2026-08-02T07:26:11.579Z

<pre>
那这样，叫AustraliaEmploymentRAG，以后我们再把它做成AustraliaBusinessRAG，现在先不考虑。对，都做
</pre>

## 65 | Assistant | 2026-08-02T07:26:11.579Z

<pre>
确定。当前项目正式工作名称改为：

# AustraliaEmploymentRAG

未来如果扩展到公司法、消费者法、隐私、金融监管等更广泛的商业法律，再升级为 `AustraliaBusinessRAG`。现阶段不提前设计那些领域。

## 当前销售渠道

MVP 同时支持两类客户：

### Direct Web customers

- HR teams；
- People teams；
- payroll teams；
- compliance teams；
- in-house legal teams；
- employment law and HR professional services teams。

他们购买 organization workspace，通过 Web 使用：

- legal search；
- cited Q&amp;A；
- historical research；
- jurisdiction comparison；
- case law research；
- watchlists and alerts；
- shared research sessions。

### Platform/API customers

- HRIS；
- payroll software；
- workforce management platforms；
- compliance platforms；
- legal technology products。

他们通过 API 使用：

- search；
- structured answers；
- source retrieval；
- historical comparison；
- change events and webhooks。

两类客户共享完全相同的官方知识底座和答案标准。

下一项需要确认用户边界。我的建议是 MVP 保持 **B2B-only**：

- 不直接向普通员工或公众销售；
- 不提供个人劳动纠纷建议；
- 不接收真实员工资料；
- 可以提供有限的公开 demo，但完整回答需要企业账号；
- 客户可以通过自己的平台把 API 结果展示给其终端用户。

这样产品可以服务 employment law 研究，但商业、隐私和产品设计仍然围绕企业用户。

**MVP 是否确定为 B2B-only，不直接做面向普通员工的消费者产品？**
</pre>

## 66 | User | 2026-08-02T07:26:11.579Z

<pre>
对，B2B-only
</pre>

## 67 | Assistant | 2026-08-02T07:26:11.579Z

<pre>
确定，MVP 为 **B2B-only**。

目标客户限定为：

- Australian employers；
- HR、People、payroll、compliance 和 in-house legal teams；
- employment/HR professional services firms；
- HRIS、payroll、workforce、legal-tech 和 compliance software platforms。

普通员工和公众不作为直接客户。客户平台可以通过 API 服务自己的终端用户，但由客户控制界面、免责声明和最终使用方式。

## Web 产品的四个核心任务

1. **Ask**
   - 提出匿名化事实场景；
   - 多轮补充缺失事实；
   - 获得带状态和引用的研究答案。

2. **Search**
   - 搜索 legislation、awards、agreements、cases 和 regulator guidance；
   - 使用 jurisdiction、日期、document type 等筛选。

3. **Compare**
   - 比较不同财年；
   - 比较不同州和领地；
   - 比较旧版与新版规则；
   - 比较 legislation、award 和 agreement。

4. **Monitor**
   - 建立 watchlist；
   - 查看变更；
   - 接收 email、Web 和 webhook alerts。

下一项需求是研究成果如何保存。我的建议是回答不能只停留在聊天记录，而要形成一个可复查的 **Research Record**，包含：

- original question；
- anonymised facts；
- assumptions；
- jurisdiction；
- applicable date or financial year；
- answer status；
- analysis；
- unresolved questions；
- complete citations；
- source versions；
- search timestamp；
- subsequent updates affecting the answer。

用户可以：

- 保存到 organization workspace；
- 添加内部 notes；
- 分享给组织内其他成员；
- 复制只读链接；
- 导出 PDF；
- 导出 Word；
- API 返回对应的 structured JSON；
- 当引用来源变化时，将旧研究标记为 `REVIEW_REQUIRED`。

这不会变成客户私有知识库，因为我们不检索用户上传的文档；它只是保存他们在 AustraliaEmploymentRAG 中完成的研究记录。

**MVP 是否包含这种可保存、共享和导出的 Research Record？**
</pre>

## 68 | User | 2026-08-02T07:26:11.580Z

<pre>
包含
</pre>

## 69 | Assistant | 2026-08-02T07:26:11.580Z

<pre>
确定。MVP 包含可保存、共享和导出的 Research Record。

额外边界：

- 用户 notes 不能自动进入公共检索语料；
- notes 不用于训练或影响其他客户答案；
- notes 同样禁止保存真实员工个人资料；
- 导出文件必须显示生成时间、适用日期、来源版本和免责声明；
- 来源更新后，历史记录不能被静默改写，而是标记需要重新检查。

下一项建议加入轻量的团队审阅和审计流程：

- `DRAFT`
- `IN_REVIEW`
- `CUSTOMER_REVIEWED`
- `REVIEW_REQUIRED`
- `ARCHIVED`

并支持：

- comments；
- @mentions；
- assign reviewer；
- version history；
- 谁创建、修改、审阅或导出了记录；
- 当时使用的答案和来源快照；
- 来源发生变化后的影响记录。

`CUSTOMER_REVIEWED` 只表示客户内部人员完成了审核，不能显示成 `AustraliaEmploymentRAG Verified` 或暗示我们提供了法律认证。

**MVP 是否也包含这种团队 review workflow 和 audit trail？**
</pre>

## 70 | User | 2026-08-02T07:26:11.580Z

<pre>
包含
</pre>

## 71 | Assistant | 2026-08-02T07:26:11.580Z

<pre>
确定。MVP 包含团队 review workflow 和完整 audit trail。

下一项是企业数据安全。虽然只接受匿名化场景，客户的查询仍可能暴露：

- 未公开的 workplace issue；
- 拟议中的 termination 或 restructuring；
- 内部合规问题；
- 企业正在研究的法律风险；
- API usage 和产品路线。

建议 MVP 的安全基线为：

- organization 数据相互隔离；
- encryption in transit and at rest；
- customer queries 不用于训练模型；
- 模型供应商采用 zero-data-retention 配置；
- 日志自动去除明显个人信息和 credentials；
- API keys 可撤销、轮换并设置 scope；
- configurable retention；
- organization 可导出和删除数据；
- backups 与生产数据采用相同保护；
- subprocessor list；
- security and privacy contact；
- 所有管理操作进入 audit log。

这里需要确认数据驻留要求。我建议采用：

&gt; 客户持久化数据、数据库、文件和备份存储在澳洲区域；如果 LLM 推理可能在澳洲以外短暂处理匿名化内容，必须披露供应商和处理方式，并确保不留存、不训练。

这比承诺“任何字节永远不离开澳洲”更现实，同时能满足多数早期 B2B 客户的安全审查。

**MVP 是否要求持久化客户数据使用 Australian data residency，并禁止模型供应商留存或训练客户输入？**
</pre>

## 72 | User | 2026-08-02T07:26:11.580Z

<pre>
是
</pre>

## 73 | Assistant | 2026-08-02T07:26:11.580Z

<pre>
确定。MVP 的数据安全要求包括：

- customer database、research records、audit logs、exports 和 backups 持久化在 Australian region；
- customer inputs 不用于模型训练；
- LLM 和 rerank providers 必须支持 zero-data-retention，或提供等效合同保证；
- 不满足要求的供应商不能处理客户查询；
- subprocessors 和可能的跨境临时处理必须公开披露；
- organization 可配置 retention、导出和删除数据；
- 删除操作同时覆盖 active storage，并按明确周期清理 backups；
- API、Web 和 notification 系统遵守相同数据政策。

下一项是企业身份认证。我建议 MVP 包含：

- email magic link；
- Google Workspace sign-in；
- Microsoft Entra ID sign-in；
- mandatory MFA for Owner/Admin；
- optional MFA enforcement for the whole organization；
- SAML/OIDC enterprise SSO；
- organization domain verification；
- invitation and member lifecycle；
- session revocation；
- role-based access；
- scoped service accounts for API integrations。

这样直接客户可以管理团队账号，软件平台也不需要把 API integration 绑定到某个员工账号。

**MVP 是否包含 enterprise SSO、MFA 和 service accounts？**
</pre>

## 74 | User | 2026-08-02T07:26:11.581Z

<pre>
enterprise SSO、MFA 和 service accounts是好，但是比较麻烦，我毕竟是一人公司，让我想5分钟再回答你这个问题。
</pre>

## 75 | Assistant | 2026-08-02T07:26:11.581Z

<pre>
好的，你慢慢考虑。这个决定会明显影响 MVP 的开发量和企业销售能力，值得单独权衡。你回复后我们再从这里继续。
</pre>

## 76 | User | 2026-08-02T07:26:11.581Z

<pre>
包含 enterprise SSO、MFA 和 service accounts每个月要花多少钱
</pre>

## 77 | Assistant | 2026-08-02T07:26:11.581Z

<pre>
我会按“单人公司、早期 B2B MVP”的现实场景算，不只看标价，还会拆开三项：MFA、service accounts 和真正昂贵的 enterprise SSO。先核对几家主流身份服务商的当前官方价格，再给你一个月度区间和我建议的最省钱方案。
</pre>

## 78 | Assistant | 2026-08-02T07:26:11.582Z

<pre>
价格本身比我预期低，甚至早期可以做到接近零；但还有一个与你刚确认的要求冲突的地方：这些托管身份服务是否能把身份数据持久化在澳洲。这个限制可能比订阅价格更决定选型，我再核对一下。
</pre>

## 79 | Assistant | 2026-08-02T07:26:11.582Z

<pre>
不一定贵。真正产生持续费用的是每家客户的 SAML/OIDC enterprise SSO connection；MFA 和 service accounts 本身可以非常便宜。

以下按约 `US$1 ≈ A$1.43` 粗略换算，不含 GST。

| 方案 | 初期月费 | 增加企业客户后的费用 | 注意事项 |
|---|---:|---:|---|
| Stytch B2B | A$0 | 前 5 个 SSO/SCIM connections 免费，之后约 A$179/connection/月 | 还包括 10,000 MAU、MFA、组织权限和 1,000 个 M2M tokens，但要确认澳洲数据驻留 |
| Clerk Pro | 约 A$29/月，按年付 | 包含 1 个 enterprise connection；额外约 A$107/connection/月 | 包含 MFA、API keys/M2M，但官方说明不提供 regional data residency |
| WorkOS | MFA/User Management A$0 | 约 A$179/SSO connection/月 | 价格透明、B2B 能力强，但澳洲数据驻留需要进一步书面确认 |
| Auth0 | 取决于套餐 | B2B SSO 和高级能力可能需要报价 | 有 Australia tenant/region 路径，但当前完整 B2B 成本需要向销售确认 |
| 澳洲区域自托管 | 约 A$20–100/月增量 | 通常无 per-customer license | 软件费最低，但开发和维护责任最高 |

价格来源：[Stytch pricing](https://stytch.com/pricing)、[Clerk pricing](https://clerk.com/pricing)、[WorkOS pricing](https://workos.com/pricing)。

## 三项能力分别多少钱

### MFA

如果使用：

- TOTP authenticator；
- passkeys；
- recovery codes；

通常没有明显的按次成本，包含在多数身份平台的基础套餐里。

只有 SMS MFA 会产生短信费用，而且安全性和用户体验未必更好。MVP 完全可以不做 SMS，只做 TOTP + passkeys。

### Service accounts

如果我们的 service account 是：

- organization 创建 API key；
- key 只显示一次；
- 数据库只保存 hash；
- 支持 scope、expiry、rotation 和 revocation；

那么额外供应商月费可以是 **A$0**。主要成本是开发时间。

只有采用外部供应商提供的 M2M token 服务并超过免费额度，才可能产生用量费用。

### Enterprise SSO

这是主要成本。通常“一家客户配置一个 SAML/OIDC connection”：

- 1 家：约 A$0–179/月；
- 5 家：约 A$0–895/月；
- 10 家：约 A$715–1,790/月，取决于供应商免费额度和折扣。

SSO 可以作为 Enterprise plan 的收费功能。例如每家需要 SSO 的客户至少多收 A$300–500/月，用客户收入覆盖 connection 成本。

## 澳洲数据驻留是关键限制

你刚才要求持久化客户数据位于澳洲。身份系统会保存姓名、邮箱、organization membership 和认证信息，也属于客户数据。

- Clerk 明确不支持 regional data residency，因此和严格的澳洲驻留要求冲突。[Clerk security/data residency](https://clerk.com/articles/clerk-security-how-we-protect-your-users)
- WorkOS 和 Stytch 的公开定价很好，但我没有在其官方公开资料中找到明确的 Australia data region 承诺，正式选型前必须取得书面确认。
- Auth0 存在 Australia tenant 的历史和产品路径，但当前套餐、数据边界和 B2B 价格需要向其销售确认。
- 自托管到澳洲云区域最容易满足驻留要求，但需要自己承担安全更新和运维。

## 我的建议

作为单人公司，我建议：

1. **MVP 立即包含 MFA**
   - TOTP；
   - passkeys；
   - recovery codes；
   - 不做 SMS。

2. **MVP 立即包含 service accounts**
   - 自己实现 scoped API keys；
   - 月度供应商成本接近零。

3. **代码层面完整支持 enterprise SSO**
   - SAML/OIDC connection；
   - domain enforcement；
   - organization login policy；
   - JIT provisioning。

4. **只有客户真正启用 SSO 时才产生 connection 成本**
   - 没有 SSO 客户时，不应每月白付钱；
   - 将 SSO 放入 Enterprise pricing；
   - 每个 SSO 客户的售价覆盖认证供应商费用。

5. **身份数据严格澳洲驻留时优先考虑自托管或确认支持 AU region 的 Auth0**
   - 预计基础设施增量约 A$20–100/月；
   - 最大成本是开发和持续维护，不是云账单。

所以最实际的答案是：

&gt; 初期可以控制在每月 A$20–100；如果使用托管 SSO，则每启用一家企业客户大约增加 A$0–179/月。MFA 和 service accounts 几乎不增加月费。

基于这个成本，我认为可以把三项都保留在 MVP，但 SSO 按客户启用并作为付费 Enterprise 功能，而不是默认给所有客户开启。
</pre>

## 80 | User | 2026-08-02T07:26:11.583Z

<pre>
能告诉我这个钱都花哪了吗A$20–100/月？
</pre>

## 81 | Assistant | 2026-08-02T07:26:11.583Z

<pre>
可以。先纠正一下：**A$20–100/月不是 enterprise SSO 的许可费**，而是我对“在澳洲区域自托管身份认证组件”的保守基础设施估算。

如果认证系统与 AustraliaEmploymentRAG 共用现有服务器和数据库，认证本身的增量成本可能只有 **A$0–20/月**。

| 项目 | 共用现有基础设施 | 单独部署认证服务 |
|---|---:|---:|
| 澳洲区域 compute | A$0 | A$10–40 |
| PostgreSQL auth tables | A$0 | A$15–40 |
| Backups and logs | A$0–5 | A$5–15 |
| 登录/邀请邮件 | A$0–15 | A$0–20 |
| TOTP MFA | A$0 | A$0 |
| Passkeys | A$0 | A$0 |
| Recovery codes | A$0 | A$0 |
| Service account/API keys | A$0 | A$0 |
| TLS certificates | A$0 | A$0 |
| SAML/OIDC library | A$0 | A$0 |

### 更符合这个项目的实际情况

AustraliaEmploymentRAG 本来就需要：

- 澳洲区域 application hosting；
- PostgreSQL；
- backups；
- logging；
- email notifications。

认证可以直接使用同一套基础设施：

```text
Application
├─ Users
├─ Organizations
├─ Sessions
├─ MFA credentials
├─ Service accounts
└─ API key hashes
```

因此没有必要专门为认证再开一台服务器和一个数据库。

早期更现实的认证增量费用是：

- TOTP/passkeys：A$0；
- service accounts：A$0；
- auth database：A$0，使用现有 PostgreSQL；
- compute：A$0，使用现有 application；
- 登录和邀请邮件：A$0–15；
- 合计：约 **A$0–20/月**。

### 什么时候会变贵？

主要是以下情况：

- 使用 SMS MFA：产生每条短信费用；
- 为认证部署独立高可用服务和数据库；
- 购买托管 SAML/OIDC connection；
- 购买 SCIM directory sync；
- 购买商业 SLA 或安全支持；
- 客户要求专用 tenant 或 dedicated infrastructure。

如果使用 WorkOS，每个正式 SSO customer connection 约 A$179/月；这与上面的 A$0–20 自托管基础费用是两笔不同成本。

所以准确说法应该是：

&gt; MFA 和 service accounts 基本没有额外月费。自托管认证并复用现有基础设施时，增量约 A$0–20/月；只有启用托管 enterprise SSO connection 后，才可能为每家客户增加约 A$100–180/月。

最大的成本其实不是月费，而是你需要维护认证安全、session、key rotation、account recovery 和漏洞升级的开发时间。
</pre>

## 82 | User | 2026-08-02T07:26:11.583Z

<pre>
我肯定是想便宜点，毕竟现在没有其他收入
</pre>

## 83 | Assistant | 2026-08-02T07:26:11.583Z

<pre>
那就按“零收入阶段不产生固定认证订阅费”来定，不因为 enterprise checklist 提前背上每客户月费。我会核对一个可自托管的认证方案是否已经覆盖 organization、MFA、API keys 和 SSO；目标是尽量复用现有数据库与应用，只在客户真的为 SSO 付费后再考虑托管服务。
</pre>

## 84 | Assistant | 2026-08-02T07:26:11.584Z

<pre>
那就采用“先不产生固定认证订阅费”的方案。

## 最省钱的实现

使用 **Better Auth 开源框架，自托管在澳洲区域**，并复用 AustraliaEmploymentRAG 现有的应用和 PostgreSQL。

它目前原生支持：

- organizations；
- MFA / 2FA；
- passkeys；
- SAML 2.0 enterprise SSO；
- OIDC enterprise SSO；
- organization provisioning；
- session management。

其 SSO 插件支持 OIDC、OAuth2 和 SAML 2.0，并带有 replay protection、timestamp validation 和 assertion validation 等安全机制。[Better Auth SSO](https://better-auth.com/docs/plugins/sso)

Service accounts 不依赖认证供应商，我们自己实现 scoped API keys。

## 零收入阶段的预计认证成本

| 能力 | 月费 |
|---|---:|
| Better Auth framework | A$0 |
| Organization/RBAC | A$0 |
| TOTP MFA | A$0 |
| Passkeys | A$0 |
| Recovery codes | A$0 |
| Service accounts/API keys | A$0 |
| 手动配置 SAML/OIDC connection | A$0 |
| 共用现有 PostgreSQL | A$0 增量 |
| 共用现有 application hosting | A$0 增量 |
| 登录和邀请邮件 | 约 A$0–10 |
| 合计 | **约 A$0–10/月增量** |

这意味着可以把 enterprise SSO、MFA 和 service accounts 都做进 MVP，但暂时不购买 WorkOS、Clerk 或 Stytch。

## 哪些地方需要自己做

没有订阅费的代价是需要自己负责：

- SSO configuration 页面；
- 加密保存 IdP metadata 和 secrets；
- customer domain verification；
- certificate rotation；
- SAML/OIDC integration testing；
- account recovery；
- session revocation；
- API key rotation；
- authentication audit events；
- 安全升级。

不过 Better Auth 已经承担了最危险的底层协议解析，我们不需要自己手写 SAML。

## 有收入后再升级

Better Auth 的 managed infrastructure 是可选的：

- framework 本身免费开源；
- managed Pro 为 US$20/月，约 A$29；
- 包含一个 self-service SSO connection；
- 额外 connection 为 US$50/月，约 A$72。[Better Auth pricing](https://better-auth.com/pricing)

只有出现以下情况时再考虑付费：

- 已有企业客户需要自行配置 SSO；
- 手动 onboarding 开始占用大量时间；
- 需要供应商提供 abuse protection 或支持；
- 企业客户的收入足以覆盖费用。

在启用 managed infrastructure 前仍需确认它保存哪些数据以及是否满足澳洲数据驻留要求。

所以我们可以把需求正式定为：

&gt; MVP 包含 self-hosted enterprise SSO、MFA 和 service accounts；不购买按 connection 收费的身份服务。认证数据与应用数据共同存储在澳洲区域。

这样既不删企业能力，也不会在没有收入时承担每月数百澳元的固定成本。
</pre>

## 85 | User | 2026-08-02T07:26:11.584Z

<pre>
Backups and logs 还做吗？
</pre>

## 86 | Assistant | 2026-08-02T07:26:11.584Z

<pre>
要做，而且自托管认证后更不能省掉。省钱应该省供应商订阅，不应该省可恢复性和安全审计。

但可以采用低成本版本。

## Backups

必须备份：

- users and organizations；
- MFA credentials；
- SSO configurations；
- service accounts and API key metadata；
- research records；
- watchlists；
- review workflow；
- audit events；
- billing and entitlement data。

建议 MVP：

- PostgreSQL 每日自动备份；
- 保留最近 7 天；
- 每周加一份加密备份；
- 周备份保留 30 天；
- 所有备份位于澳洲区域；
- 每月至少执行一次 restore test；
- 删除 organization 后，按公开的 backup retention 周期完成清除。

不需要重点备份：

- embeddings；
- vector indexes；
- 可从官方来源重新生成的搜索索引；
- 临时 cache。

这些可以重建，备份只会浪费空间。

## Logs

需要区分三种日志。

### Security logs

记录：

- login success/failure；
- MFA enrollment/reset；
- password or passkey changes；
- SSO configuration changes；
- suspicious login attempts；
- session revocation；
- API key creation、rotation 和 revocation。

### Product audit trail

记录：

- 谁创建或修改 Research Record；
- 谁完成 review；
- 谁导出或分享；
- watchlist changes；
- webhook configuration；
- organization and role changes。

### Application logs

用于排查：

- API errors；
- failed retrieval；
- model provider failures；
- webhook delivery；
- ingestion failures；
- latency and rate limits。

## 绝对不能写入日志的内容

- passwords；
- MFA secrets；
- recovery codes；
- session cookies；
- bearer tokens；
- 完整 API keys；
- SAML assertions；
- OIDC tokens；
- 未处理的原始个人信息；
- 完整用户问题正文，除非它属于明确保存的 Research Record。

普通运行日志只保存 request ID、organization ID、状态和必要诊断信息。

## 低成本策略

早期可以：

- 使用 PostgreSQL 已包含的自动备份；
- 使用应用托管平台包含的基础日志；
- audit events 存入现有 PostgreSQL；
- 不购买 Datadog、Splunk 等独立平台；
- 不备份可重建的 corpus index；
- 对日志设置 7–30 天自动过期。

这样 backups 和 logs 的增量费用通常很小，可能仍在现有数据库和托管套餐额度内。具体金额要等架构阶段选定 hosting provider 后才能准确计算。

因此结论是：

&gt; Backups、security logs 和 audit trail 全部保留；采用现有基础设施和短期 retention 控制成本，不购买昂贵的独立监控产品。
</pre>

## 87 | User | 2026-08-02T07:26:11.584Z

<pre>
好的
</pre>

## 88 | Assistant | 2026-08-02T07:26:11.584Z

<pre>
好的，认证、备份和日志的低成本方案就按上述要求保留。

下一项需求是内容更新速度。既然产品强调“current law”，每个来源必须显示：

- last checked；
- last changed；
- last successfully ingested；
- current processing status；
- ingestion failure or coverage gap。

我建议 MVP 的 freshness target 为：

- 官方来源发布后 24 小时内发现变化；
- 发现后 24 小时内完成解析、索引和状态更新；
- 重要生效事件尽可能当天发出 alert；
- ingestion 失败时显示 `FRESHNESS_DEGRADED`，不能继续暗示内容是最新的；
- 每个答案显示其来源最近成功检查时间；
- 不承诺人工专家审核，只承诺自动检测和可追溯处理。

也就是正常情况下，官方变化应在最多约 24–48 小时内进入可检索状态。

**你是否接受 MVP 以“24 小时发现、24 小时处理”为内容更新目标？**
</pre>

## 89 | User | 2026-08-02T07:26:11.584Z

<pre>
是
</pre>

## 90 | Assistant | 2026-08-02T07:26:11.585Z

<pre>
确定。MVP 内容更新目标为：

- 24 小时内发现官方来源变化；
- 再于 24 小时内完成处理和检索更新；
- ingestion 异常公开显示 freshness 状态；
- 答案和来源页面展示最近成功检查时间；
- alerts 保留检测、处理和发送时间。

下一项是性能与可用性。我建议单人公司 MVP 不承诺昂贵的 enterprise SLA，但设置内部目标：

- monthly availability target：99.5%；
- Search API p95：2 秒内；
- source/document retrieval p95：1 秒内；
- Answer API：3 秒内开始 streaming；
- 普通答案：30 秒内完成；
- 跨 jurisdiction、历史比较或复杂 case-law research：60 秒内完成；
- 长任务显示进度，允许用户离开后再返回；
- timeout 时保留已找到的来源，不生成残缺结论；
- 暂不承诺 24/7 support 或 99.99% SLA。

等有付费 enterprise customer 后，再销售更高 SLA。

**是否接受这组 MVP 性能与 99.5% availability target？**
</pre>

## 91 | User | 2026-08-02T07:26:11.585Z

<pre>
是
</pre>

## 92 | Assistant | 2026-08-02T07:26:11.585Z

<pre>
确定。MVP 采用上述性能目标，不提供付费 SLA。

下一项是质量验收。之前确定的首批 100 条 synthetic questions 仍然保留，但现在产品范围已经从 payroll tax 扩展到完整 employment law，100 条只能作为 smoke test，不能代表上线质量。

我建议分两层：

### Initial smoke set

首批 100 条 synthetic questions，用于尽快跑通：

- retrieval；
- dates and jurisdictions；
- citations；
- answer structure；
- refusal；
- multi-turn clarification。

### Pre-launch evaluation set

上线前扩展到至少 600 条、按范围分层：

| 范围 | 数量 |
|---|---:|
| Federal employment law and NES | 80 |
| Modern awards and pay data | 80 |
| Enterprise agreements | 60 |
| Federal payroll tax, STP, super and FBT | 80 |
| State/territory payroll tax | 80 |
| State/territory employment law | 80 |
| Case law | 60 |
| Bills, future law and change monitoring | 40 |
| Refusal, conflict and out-of-scope cases | 40 |
| 合计 | 600 |

每条 synthetic case 必须由官方来源反向生成，并包含：

- question；
- jurisdiction；
- applicable date；
- expected answer status；
- gold source；
- exact supporting paragraphs；
- required conditions；
- prohibited unsupported claims。

建议上线质量门槛：

- factual claim citation coverage：100%；
- citation precision：≥98%；
- retrieval recall@10：≥90%；
- jurisdiction/date mismatch：0 critical errors；
- unsupported definitive claims：0；
- correct refusal rate：≥95%；
- source status identification：≥98%。

这仍然不是法律专家认证，但可以证明系统是否忠实检索、引用和拒答。

**是否接受“先做 100 条 smoke set，MVP 上线前扩展到 600 条 synthetic eval set”？**
</pre>

## 93 | User | 2026-08-02T07:26:11.585Z

<pre>
直接做600条，按范围分层
</pre>

## 94 | Assistant | 2026-08-02T07:26:11.585Z

<pre>
确定。不做 100 条过渡集，直接建设 600 条分层 synthetic evaluation set。

数据集内部拆分为：

- 360 条 development set：用于检索和提示调优；
- 120 条 validation set：用于选择配置；
- 120 条 blind test set：发布前最终验收，开发期间不参与调优。

每条 case 都必须从官方来源反向构建，不能只让模型凭知识生成答案。数据集需要版本号、source hash、生成方法和固定随机种子，确保结果可复现。

除了普通问题，还要包含：

- wrong jurisdiction traps；
- outdated-law traps；
- nominal-expiry traps；
- bill-not-enacted traps；
- conflicting-source cases；
- insufficient-fact scenarios；
- unsupported-premise questions；
- questions that must be refused；
- multi-turn clarification cases。

600 条 eval set 成为 MVP 上线门槛，未达到前面确定的 citation、retrieval、temporal 和 refusal 指标，不进入公开生产环境。

下一项是商业成功标准。既然你明确说“没有客户愿意付钱就没有意义”，我建议 MVP 的成功不能定义成“上线完成”，而应定义成：

- 至少 3 家付费 B2B organizations；
- 至少 1 家使用 Web workspace；
- 至少 1 家实际调用 API；
- 客户连续使用 4 周；
- 至少 2 家愿意续费或转正式订阅；
- 有可量化的 research time reduction 或 support deflection；
- 免费试用和内部测试不计入付费验证。

**是否接受这组付费客户验证作为 MVP 的商业成功标准？**
</pre>

## 95 | User | 2026-08-02T07:26:11.586Z

<pre>
是不是太难了，一个自愿付费用户就算成功
</pre>

## 96 | Assistant | 2026-08-02T07:26:11.586Z

<pre>
对，3 家对单人公司第一版确实偏高。MVP 的商业成功标准改为：

&gt; **获得 1 个与项目无利益关系的真实 B2B 客户，自愿付费使用 AustraliaEmploymentRAG。**

有效条件：

- 客户不是你本人；
- 不是朋友帮忙付的象征性费用；
- 不是免费试用；
- 不是单纯购买你的咨询或定制开发；
- 客户为 Web workspace、API access 或 paid pilot 付费；
- 付款已经实际完成；
- 客户至少真实使用过一次核心搜索、问答、监控或 API 能力。

续费、连续使用四周和更多客户属于下一阶段指标，不作为 MVP 是否成功的硬门槛。

所以成功指标分成：

- **MVP success：1 个真实自愿付费 B2B customer**
- 后续验证：续费、使用频率、更多客户和单位经济性

这更符合单人公司的现实，也不会把“成功”定义成单纯上线。
</pre>

## 97 | User | 2026-08-02T07:26:11.586Z

<pre>
好
</pre>

## 98 | Assistant | 2026-08-02T07:26:11.586Z

<pre>
好的，MVP 商业成功标准就冻结为一个真实、自愿付费的 B2B 客户。

下一项是如何收第一笔钱。我建议第一版不必先建设复杂的 self-service billing：

- 通过销售沟通确定 paid pilot；
- 手动发送 invoice 或 Stripe payment link；
- 收款后由管理员为 organization 开通套餐和到期日；
- 系统内部保留 subscription、entitlement 和 payment reference；
- 暂不做复杂的 seat proration、usage overage 和自动催款；
- API usage 仍然完整计量，为以后正式定价准备数据。

这更符合早期 B2B 销售，也能最快验证客户是否真的愿意付费。

**MVP 是否接受“第一位客户使用 paid pilot + 手动 invoice/payment link”，暂不要求完整 self-service billing portal？**
</pre>

## 99 | User | 2026-08-02T07:26:11.586Z

<pre>
接受
</pre>

## 100 | Assistant | 2026-08-02T07:26:11.586Z

<pre>
确定。首位客户使用 paid pilot，通过手动 invoice 或 payment link 收款；完整 billing portal 不作为 MVP 要求。具体价格等成本估算完成后再决定。

接下来开始细化核心功能，先讨论 Search。

我建议 MVP 同时提供两种搜索方式：

### Simple Search

适合 HR、payroll 和普通企业用户：

- natural-language query；
- semantic matching；
- typo tolerance；
- suggested queries；
- jurisdiction and date prompts；
- 结果按相关性展示。

### Advanced Legal Search

适合 in-house legal、compliance 和专业研究人员：

- exact phrase；
- Boolean `AND / OR / NOT`；
- citation search；
- section/clause/paragraph search；
- case name and neutral citation；
- award/agreement ID；
- employer name or ABN；
- filters：
  - jurisdiction；
  - source type；
  - court/tribunal；
  - document status；
  - effective date；
  - financial year；
  - topic；
  - legislation、award 或 agreement；
- sort by relevance、date 或 authority。

两种搜索使用同一个索引。Simple Search 隐藏复杂语法，Advanced Search 暴露精确控制。

**MVP 是否同时包含 Simple Search 和 Advanced Legal Search？**
</pre>

## 101 | User | 2026-08-02T07:26:11.587Z

<pre>
是
</pre>

## 102 | Assistant | 2026-08-02T07:26:11.587Z

<pre>
确定。MVP 同时包含 Simple Search 和 Advanced Legal Search。

下一项是 Ask 的深度。我建议提供两个明确模式，而不是让所有问题都走同一种昂贵流程：

### Quick Answer

用于明确、范围较小的问题：

- 默认单一 jurisdiction 和日期；
- 给出简洁结论、条件和引用；
- 目标 30 秒内完成；
- 适合客服和日常 HR 查询。

### Deep Research

用于复杂法律研究：

- 跨 legislation、awards、agreements 和 case law；
- 可比较多个 jurisdiction 或时间点；
- 展开支持与反对某种解释的 authorities；
- 识别冲突、未解决问题和后续判例；
- 可以多轮询问缺失事实；
- 自动生成完整 Research Record；
- 目标 60 秒内完成，超时则转为后台任务。

两个模式都遵守相同的 citation、时间版本和严格拒答规则；区别只是检索广度、分析深度、延迟和成本。

API 中也分别提供 quick 和 deep research 能力，客户可以按场景选择。

**MVP 是否包含 Quick Answer 和 Deep Research 两种模式？**
</pre>

## 103 | User | 2026-08-02T07:26:11.587Z

<pre>
包含
</pre>

## 104 | Assistant | 2026-08-02T07:26:11.587Z

<pre>
确定。MVP 包含 Quick Answer 和 Deep Research 两种模式。

下一项细化 Compare。我建议支持三种比较：

### Jurisdiction Comparison

例如：

&gt; Compare long service leave requirements across all Australian states and territories.

输出统一维度的对比表，并为每个 jurisdiction 单独引用来源。没有对应规则时显示 `NOT FOUND` 或 `NOT APPLICABLE`，不能用其他州规则补齐。

### Time Comparison

例如：

&gt; What changed in casual employment rules between 2024–25 and 2026–27?

展示：

- old rule；
- new rule；
- effective date；
- amending instrument；
- transitional provisions；
- affected guidance and cases。

### Authority Comparison

例如：

&gt; Compare the Fair Work Act, applicable modern award and enterprise agreement provisions on overtime.

分别展示不同 authority 的规定、适用关系和潜在冲突，不把它们合并成一个无来源结论。

Compare 结果可以：

- 保存为 Research Record；
- 导出 PDF/Word；
- API 返回结构化 JSON；
- 来源更新后标记 `REVIEW_REQUIRED`。

**MVP 是否包含这三种结构化比较？**
</pre>

## 105 | User | 2026-08-02T07:26:11.587Z

<pre>
包含
</pre>

## 106 | Assistant | 2026-08-02T07:26:11.588Z

<pre>
确定。MVP 包含 jurisdiction、time 和 authority 三种结构化比较。

下一项是 API 客户的开发体验。既然 API 是独立付费产品，它不能只是几条未文档化的内部接口。我建议 MVP 包含：

- versioned REST API，例如 `/v1`；
- JSON responses；
- Quick Answer 和 Deep Research streaming；
- published OpenAPI specification；
- interactive API documentation；
- TypeScript SDK；
- Python SDK；
- sandbox environment；
- test API keys；
- scoped production service accounts；
- usage dashboard；
- request IDs；
- idempotency support；
- signed webhooks；
- webhook retry and replay；
- documented errors、rate limits 和 refusal statuses；
- API changelog；
- breaking-change policy。

Sandbox 只能使用测试 organization 和非生产配置，但检索同一套公开法律语料，因此客户可以在接入前验证真实查询结果。

**MVP 是否包含 OpenAPI、TypeScript/Python SDK、sandbox 和完整 developer portal？**
</pre>

## 107 | User | 2026-08-02T07:26:11.588Z

<pre>
包含
</pre>

## 108 | Assistant | 2026-08-02T07:26:11.588Z

<pre>
确定。MVP 包含完整 developer experience：OpenAPI、TypeScript SDK、Python SDK、sandbox 和 developer portal。

下一项是是否提供现成的嵌入式界面。API 客户可以自己开发 UI，但 ready-made widget 能显著降低接入成本。

我建议 MVP 提供 JavaScript/React embed widget：

- customer 使用一段 script 或 React component 接入；
- 支持 customer logo、colour 和 theme；
- English-only；
- 显示匿名化输入提醒；
- 固定展示免责声明和来源；
- 支持 Quick Answer；
- 可选择开放 Deep Research；
- 支持有限多轮澄清；
- 可限制 jurisdiction、topic 和 source type；
- 支持客户自己的 escalation/contact link；
- 不允许客户隐藏来源、答案状态或必要免责声明；
- 通过短期 frontend token 调用，不能在浏览器暴露 service account key；
- widget usage 归属对应 organization，并进入 usage/audit records。

它仍然只检索公共官方语料，不接入客户私有知识库。

**MVP 是否也包含这个可定制的 JavaScript/React embed widget？**
</pre>

## 109 | User | 2026-08-02T07:26:11.588Z

<pre>
包含
</pre>

## 110 | Assistant | 2026-08-02T07:26:11.588Z

<pre>
确定。MVP 包含可定制的 JavaScript/React embed widget。

下一项是 accessibility 和设备支持。我建议 MVP 要求：

- Web workspace：desktop-first，但支持 tablet/mobile；
- embed widget：完全 responsive；
- WCAG 2.2 AA；
- keyboard-only navigation；
- screen-reader labels；
- visible focus states；
- sufficient colour contrast；
- no colour-only status indicators；
- accessible tables for jurisdiction comparisons；
- citations and footnotes 可由辅助技术读取；
- charts or diffs 提供文本等价内容；
- reduced-motion support；
- exported PDF/Word 尽量保留 headings、links 和 reading order；
- English (Australia) formatting；
- timestamps 默认显示 organization timezone，法律日期始终明确标注 jurisdiction/date。

**MVP 是否以 WCAG 2.2 AA 和 responsive Web/widget 为验收要求？**
</pre>

## 111 | User | 2026-08-02T07:26:11.589Z

<pre>
是
</pre>

## 112 | Assistant | 2026-08-02T07:26:11.589Z

<pre>
确定。下一项我想先处理一个会直接决定产品能不能合法上线的需求：官方资料是否允许我们抓取、缓存、展示原文和用于商业 API。不同政府网站的版权、开放许可和自动访问条款不一定相同；“公开可看”不等于“可以完整复制进商业产品”。我会只核对官方许可页面，然后把语料使用边界定义清楚。
</pre>

## 113 | Assistant | 2026-08-02T07:26:11.589Z

<pre>
初步核对后，ATO 的公开网站内容许可相对宽松：ATO 明确允许复制、修改、传输和分发其材料，但不得暗示 ATO 或 Commonwealth 对产品背书。[ATO copyright notice](https://www.ato.gov.au/about-ato/using-our-website)

其他来源不能一概而论。不同法院、州政府、regulator、PDF 和第三方附件可能采用不同许可，有些文件还包含：

- third-party material；
- logos and trademarks；
- Commonwealth or state coats of arms；
- images；
- commercial publisher headnotes；
- 非官方判决副本。

因此 MVP 需要一套 source licensing policy：

### 对每个来源维护许可记录

- publisher；
- official URL；
- licence/copyright URL；
- permitted commercial reuse；
- full-text storage allowed；
- adaptation/summarisation allowed；
- attribution requirements；
- redistribution restrictions；
- automated-access restrictions；
- last reviewed date。

### 展示策略

- 明确允许商业复制：可以缓存、索引和展示原文；
- 允许索引但限制再发布：展示必要引用和官方链接；
- 权利不明确：只保存 metadata，在完成确认前不对客户重新发布全文；
- 禁止商业再利用：不纳入商业产品，或取得书面许可；
- third-party headnotes：不使用，优先使用法院原始 judgment；
- logos、coats of arms 和非必要图片：不复制。

每个页面和导出都保留 attribution，且不使用“ATO approved”“FWC verified”等暗示官方背书的表述。

系统还必须遵守官方 API 条款、robots rules 和合理 rate limits，不能为了更新时效破坏来源网站。

所以建议将需求定为：

&gt; AustraliaEmploymentRAG 只商业使用具有明确许可或已完成书面授权确认的内容；对权利不明确的来源，只提供 metadata、有限引用和官方链接，直到完成许可审查。

这会让部分来源在早期只能“可搜索但不全文再发布”，但比上线后遇到版权问题安全。

**是否接受这套保守的 source licensing policy？**
</pre>

## 114 | User | 2026-08-02T07:26:11.589Z

<pre>
是
</pre>

## 115 | Assistant | 2026-08-02T07:26:11.589Z

<pre>
确定。MVP 采用保守的 source licensing policy，并为每个来源维护可审计的许可记录。

下一项是错误报告和纠正机制。既然产品强调准确性，就必须允许客户指出：

- citation 不支持 claim；
- 使用了错误财年；
- jurisdiction 错误；
- source 已失效；
- case status 不正确；
- agreement 已被替换；
- AI 遗漏关键条件；
- content licensing 存疑。

我建议 MVP 在每个 answer、claim、citation 和 source 上提供 `Report an issue`，并支持：

- issue category and severity；
- customer explanation；
- affected jurisdiction/date；
- optional screenshot；
- admin review queue；
- 暂时将高风险内容标记为 `UNDER_REVIEW`；
- 必要时停止使用相关 source 生成新答案；
- 修复后重新运行受影响 eval cases；
- 通知保存过相关 Research Record 的 organizations；
- 保留发现、调查、修复和重新发布的 audit trail。

对于可能导致错误法律结论的 critical issue，系统应优先降级或拒答，不能等到完整调查结束后继续正常生成。

**MVP 是否包含这种 correction and incident workflow？**
</pre>

## 116 | User | 2026-08-02T07:26:11.590Z

<pre>
是
</pre>

## 117 | Assistant | 2026-08-02T07:26:11.590Z

<pre>
确定。MVP 包含 correction and incident workflow。

这也意味着需要一个仅供你使用的内部 Admin Console。否则作为单人公司，来源、错误、客户和索引只能靠数据库命令维护，风险太高。

建议 Admin Console 包含：

- source registry and licensing status；
- crawler/connector health；
- last successful ingestion；
- failed documents and retry；
- document version history；
- source status overrides；
- bills and commencement status；
- agreement replacement/termination links；
- case subsequent-treatment status；
- correction queue；
- affected Research Records；
- evaluation runs and failed cases；
- organization and subscription entitlement；
- API usage and rate limits；
- webhook delivery failures；
- security events；
- backup/restore status；
- audit logs。

并提供 kill switches：

- disable a source；
- disable a document version；
- disable a model/provider；
- disable Answer while retaining Search；
- disable Deep Research；
- disable an organization or API key；
- pause alerts；
- force `FRESHNESS_DEGRADED`；
- place affected answers into `UNDER_REVIEW`。

所有管理员操作同样进入不可静默修改的 audit trail。

**MVP 是否包含这个内部 Admin Console 和 kill switches？**
</pre>

## 118 | User | 2026-08-02T07:26:11.590Z

<pre>
是
</pre>

## 119 | Assistant | 2026-08-02T07:26:11.590Z

<pre>
确定。MVP 包含内部 Admin Console 和完整 kill switches。

下一项是客户查询能否用于改进产品。之前已经确定“不用于训练模型”，但还需要明确是否能进入 eval、失败分析和搜索调优。

我建议采用严格的默认策略：

- customer questions 默认不用于 model training；
- 默认不加入 evaluation dataset；
- 默认不允许人工浏览完整 Research Record，除非客户发起 support/incident；
- 只收集匿名化的运行指标，例如 latency、status、source count 和 error code；
- organization 可以主动开启 `Share anonymised queries to improve the product`；
- opt-in 后仍需再次去除公司名、个人信息和可识别事实；
- 用户主动提交的 issue report 可以用于调查该问题；
- 进入永久 eval set 前需要单独去标识化并记录来源许可；
- 客户可以随时关闭 opt-in，并申请删除已保存的改进数据。

600 条 launch eval set 仍然全部来自官方来源生成，不依赖客户查询。

**是否接受“客户查询默认不用于训练或评测，只有 organization 主动 opt-in 后才能用于产品改进”？**
</pre>

## 120 | User | 2026-08-02T07:26:11.590Z

<pre>
是
</pre>

## 121 | Assistant | 2026-08-02T07:26:11.590Z

<pre>
确定。客户查询默认不用于训练、评测或人工分析；只有 organization 主动 opt-in 后才能用于产品改进。

下一项是法律文件与免责声明。MVP 至少需要：

- Terms of Service；
- Privacy Policy；
- Acceptable Use Policy；
- Data Processing terms；
- Source attribution and copyright notices；
- AI-generated content disclosure；
- Web、widget、API 和 exports 中一致的 disclaimer；
- disclaimer version and acceptance record。

核心说明包括：

- information and research assistance only；
- not legal, tax or professional advice；
- no lawyer-client relationship；
- not a substitute for reviewing official sources；
- customer remains responsible for decisions and compliance；
- source coverage or currency may occasionally be incomplete；
- prohibited from using the output as the sole basis for termination、discipline、pay reduction 或其他高影响 employment decision；
- no submission of personal employee information。

API 需要返回 `answerStatus`、`sourceStatus` 和 `disclaimerVersion`，不能只把免责声明放在网站 footer。

鉴于这是一个商业化法律信息产品，我建议在接受第一笔客户付款前，安排一次澳洲律师对以下内容做有限范围审查：

- product positioning；
- disclaimers；
- Terms and Privacy；
- source licensing approach；
- unauthorized legal practice risk；
- liability limitations。

这不是让律师审核整个知识库，也不是持续专家服务，只是上线前的一次产品法律边界审查。

**是否把“一次性的 pre-launch Australian legal review”列为接受首位付费客户前的要求？**
</pre>

## 122 | User | 2026-08-02T07:26:11.591Z

<pre>
不行，我实在没钱请律师
</pre>

## 123 | Assistant | 2026-08-02T07:26:11.591Z

<pre>
明白，那就不把付费律师审查设为 MVP 阻塞条件。我们不能假装风险不存在，但可以把它改成“零预算下的最低法律卫生”：用清晰产品边界、公开模板、免责声明版本记录和保守行为降低风险，等有收入后再做专业审查。我先查一下澳洲是否有适合小企业的免费或低成本官方法律资源，避免给你推荐并不存在的渠道。
</pre>

## 124 | Assistant | 2026-08-02T07:26:11.591Z

<pre>
接受。**付费律师审查不作为 MVP 或首位付费客户的上线门槛。**

零预算方案调整为：

- 我们起草 Terms of Service、Privacy Policy、Acceptable Use Policy 和 disclaimers；
- 参考澳洲官方服务的公开表述和结构，但不直接复制；
- 保持严格的 information-only 产品行为；
- 不宣称提供 legal advice、verified answers 或 guaranteed compliance；
- 每个答案保留官方来源和适用日期；
- 禁止把输出作为高影响 employment decision 的唯一依据；
- 保存条款版本和客户接受记录；
- 在内部风险登记中标记 `LEGAL_REVIEW_PENDING`；
- 有收入后再把专业审查列为优先再投资项目。

澳洲官方 ABLIS 自身也明确将信息定位为 general guidance，声明不构成 professional/legal advice，并建议用户针对具体情况取得独立意见；我们可以采用类似的产品边界，但最终文本由我们自己起草。[ABLIS disclaimer](https://ablis.business.gov.au/disclaimer)

目前查到的免费渠道并不能稳定解决这个问题：

- Justice Connect 主要服务符合条件的 charities、not-for-profits 和部分 social enterprises；
- ASBFEO 的低成本法律支持主要面向已经发生的 small-business disputes，不是通用 SaaS 条款审查。

所以不把这些渠道假设成项目依赖。

下一项是客户支持。我建议单人公司 MVP 提供：

- email support；
- in-app issue reporting；
- public status page；
- response target：2 business days；
- critical security/incorrect-law incident：best effort same business day；
- 不承诺电话支持、24/7 support 或固定解决时间。

**是否接受这个低成本 customer support 模型？**
</pre>

## 125 | User | 2026-08-02T07:26:11.592Z

<pre>
接受
</pre>

## 126 | Assistant | 2026-08-02T07:26:11.592Z

<pre>
接受。客户支持采用 email + in-app reporting + status page，不承诺 24/7。

到这里，“需求与约束”阶段已经足够完整，可以暂时冻结。

核心结论：

- 产品名：`AustraliaEmploymentRAG`
- B2B-only
- Web workspace + REST API + TypeScript/Python SDK + embed widget
- 覆盖完整澳洲 employment law、payroll、tax、super、WHS、discrimination、industrial relations
- 覆盖联邦及八个州/领地
- 包含 legislation、awards、enterprise agreements、case law、regulator guidance、bills 和未来修法
- 最近三个财年的 point-in-time 查询；判例和仍有效 instruments 不按三年截断
- Simple Search + Advanced Legal Search
- Quick Answer + Deep Research
- jurisdiction/time/authority comparison
- change monitoring、email/Web/webhook alerts
- 匿名化场景和有限多轮澄清
- 不接受客户私有文档和真实员工资料
- 官方证据不足时严格拒答
- Research Records、分享、PDF/Word export、review workflow 和 audit trail
- organization、RBAC、MFA、self-hosted enterprise SSO、service accounts
- 澳洲数据驻留、禁止模型训练和留存客户输入
- backups、security logs 和 Admin Console
- WCAG 2.2 AA
- 99.5% availability target
- 24 小时发现、24 小时处理内容变化
- 600 条分层 synthetic eval set
- conservative source licensing policy
- 一次性律师审查因预算取消，记录为风险
- paid pilot + manual invoice
- MVP 商业成功：1 个真实自愿付费 B2B organization

明确非目标：

- consumer product；
- legal representation；
- guaranteed compliance；
- 自动作出 termination、discipline 或其他高影响决定；
- 真实员工档案或 payroll data ingestion；
- 客户私有知识库；
- 自动执行 payroll、tax filing 或 government submission；
- 完整 self-service billing。

下一步可以进入你图里的第二部分：**估算**。这次不受 4 天限制，我会先把整个 MVP 拆成独立工作流，再估算开发时间、持续月费、一次性成本和最容易失控的部分，不直接跳到 API 或架构。
</pre>

## 127 | User | 2026-08-02T07:26:11.592Z

<pre>
好的
</pre>

## 128 | Assistant | 2026-08-02T07:26:11.593Z

<pre>
进入估算阶段。先给一个重要判断：

&gt; 目前确认的 MVP 已经是全国级 employment-law intelligence platform，不是普通 RAG 应用。即使大量使用多 Agent，主要瓶颈也会是数据源接入、时间版本关系、测试和人工验收，而不是写页面或接口。

初步拆成十个工作流：

1. Source inventory and licensing registry
2. Crawling、parsing and document versioning
3. Legal metadata and temporal relationships
4. Search and ranking
5. Quick Answer、Deep Research and refusal
6. Change detection and alerts
7. Web workspace and Research Records
8. API、SDKs and widget
9. Auth、organizations、security and Admin Console
10. 600-case evaluation and production hardening

粗略工作量可能在 **35–60 个工程人周**。多 Agent 可以并行处理连接器、测试、UI 和文档，但你仍需完成合并、决策、验收与部署。当前很早的日历估算大约是：

- 全职投入：4–6 个月；
- 每周约 20 小时：7–10 个月；
- 业余每周约 10 小时：12 个月以上。

这只是第一轮范围估算，后面会逐项校准，尤其是数据源数量和可抓取性。

为了换算成你的实际日历时间，我先只确认一个输入：

**你预计平均每周能投入多少小时？**
</pre>

## 129 | User | 2026-08-02T07:26:11.593Z

<pre>
这样，因为我们都是多agent开发，真正卡点是人工测试，我准备晚上让agent自己写代码，白天我做测试。我觉得不用这么就
</pre>

## 130 | Assistant | 2026-08-02T07:26:11.593Z

<pre>
你说得对，我上一版按“单人串行开发”估算，没有充分计入你的昼夜多 Agent 工作方式。

如果采用：

- 晚上多个 Agent 并行实现；
- 白天你集中测试、验收和反馈；
- 每天形成一轮 specification → implementation → acceptance；
- 允许多个数据源连接器、UI、API 和 eval 并行；

那么更合理的日历估算是：

- **激进目标：6 周**
- **较现实目标：8 周**
- **外部数据源出现严重问题：10–12 周**

## 建议的 6 周目标

| 周 | 主要验收结果 |
|---|---|
| 1 | 项目基础、organization/auth、数据库、Admin Console 骨架、首个端到端 source |
| 2 | Federal legislation、ATO、FWO、FWC、awards、agreements ingestion |
| 3 | 八州/领地、courts/tribunals、历史版本、document status relationships |
| 4 | Simple/Advanced Search、Quick Answer、Deep Research、Compare、strict refusal |
| 5 | Web workspace、Research Records、API、SDKs、widget、monitoring/alerts |
| 6 | 600-case eval、security、backups、accessibility、performance、production launch |

这里不是等一周完成后才开始下一周。例如第 2 周 Agent 可以同时做：

- FWC connector；
- ATO connector；
- legislation connector；
- award parser；
- enterprise agreement parser；
- ingestion tests。

而你白天按统一验收清单检查。

## 真正的关键路径

不是代码量，而是三个验收队列：

1. **Source acceptance**
   - 文档是否完整；
   - 日期和状态是否正确；
   - paragraph/section 是否可引用。

2. **Answer acceptance**
   - claim 是否被引用支持；
   - 是否混淆 jurisdiction 或时间；
   - 不知道时是否真的拒答。

3. **Production acceptance**
   - auth、权限、数据驻留、backups 和 API 是否可靠。

只要每天限制待验收工作量，避免 Agent 一晚上制造大量无法审查的代码，6–8 周是可争取的。

因此我建议正式估算采用：

&gt; **6 周开发目标 + 2 周质量和数据风险缓冲，计划上线时间为 8 周。**

这比 4–6 个月更符合你的开发方式，同时没有假设 Agent 产出的代码天然可上线。
</pre>

## 131 | User | 2026-08-02T07:26:11.593Z

<pre>
好的同意
</pre>

## 132 | Assistant | 2026-08-02T07:26:11.593Z

<pre>
确定。交付估算暂定为：

- 6 周功能开发目标；
- 2 周质量、数据源和上线缓冲；
- 总计划周期：8 周。

下一步估算运行成本，需要先定义一个统一的早期用量场景。否则 LLM、数据库和抓取成本无法计算。

我建议按以下 MVP 容量规划：

- 10 个 customer organizations；
- 100 个 registered users；
- 5,000 次 Search/月；
- 1,000 次 Quick Answer/月；
- 100 次 Deep Research/月；
- 100 个 active watchlists；
- 10,000 个 API calls/月；
- 全量官方语料每日检查；
- 600 条 eval 每周完整运行一次；
- 不包含大规模公开免费流量。

这是容量目标，不代表必须先获得 10 个客户。

**是否接受这组 early-stage usage assumptions，用它来估算每月运行成本？**
</pre>

## 133 | User | 2026-08-02T07:26:11.594Z

<pre>
接受
</pre>

## 134 | Assistant | 2026-08-02T07:26:11.594Z

<pre>
接受这组使用量。

不过，在计算月费前还要加入一个比用户流量更大的成本变量：**法律语料规模**。

完整覆盖 legislation、awards、enterprise agreements、FWC documents、联邦及州法院判例和监管指引，初步不应按“小型 RAG”估算。仅 FWC Document Search 就包含十多万级别的公开文件。

建议采用下面的容量假设：

- 约 250,000–400,000 份 source documents；
- 约 3–5 million searchable chunks；
- 原始 HTML/PDF/Word 文件约 50–150 GB；
- 解析文本、metadata、relationships 和 embeddings 约 50–100 GB；
- 搜索索引和数据库合计按 100–200 GB 规划；
- 每天约 1–5% 来源需要检查或重新处理；
- 大规模初始 ingest 属于一次性成本；
- 后续只做增量更新。

这不意味着第一天必须把所有数据同时抓完，但基础设施和成本不能只按几千个 ATO 页面设计。

为了控制早期费用，可以采用：

- metadata-first；
- full text 按许可和优先级摄取；
- embeddings 按需或分批生成；
- 原始文件放低成本 object storage；
- 可重建的 vector/search index 不做昂贵长期备份；
- 热门和当前文档进入 hot index；
- 低频历史判例保留在 cold storage，并按需提升到 hot index。

**是否接受以“约 30 万 documents、400 万 chunks、总存储约 150 GB”作为 MVP 成本估算基线？**
</pre>

## 135 | User | 2026-08-02T07:26:11.594Z

<pre>
接受
</pre>

## 136 | Assistant | 2026-08-02T07:26:11.594Z

<pre>
我现在按刚确认的规模计算低成本运行预算。为了避免用过时价格，我会核对支持澳洲区域的数据库、对象存储和计算服务当前公开价格；然后给你“最低可运行”和“更稳妥”两档，而不是直接推荐昂贵企业方案。模型费用会单独列为可变成本。
</pre>

## 137 | Assistant | 2026-08-02T07:26:11.595Z

<pre>
好，那我就以“约 30 万份文档、400 万 chunks、约 150GB 总存储”作为成本估算基线。接下来我会把一次性建库成本、开发期月费和上线后月费分开算，避免一个总数掩盖真正贵的部分。
</pre>

## 138 | Assistant | 2026-08-02T07:26:11.595Z

<pre>
接受后，按我们刚才冻结的规模和用量，我建议把 MVP 的成本边界定成：

| 阶段 | 预计成本 |
|---|---:|
| 开发前 5–6 周 | A$0–100/月 |
| 初次建库 | 一次性 A$100–400 |
| MVP 正式上线 | A$450–800/月 |
| 预算硬上限 | A$1,000/月 |

上线后的 A$450–800 大致花在：

- 数据库、向量索引、原文存储：A$300–400
- Web/API/采集任务计算资源：A$40–100
- LLM、embedding、reranking：A$60–250
- 邮件、监控、日志和异地备份：A$10–50

估算按 `US$1 ≈ A$1.43`。Supabase Pro 当前为 US$25/月，Sydney 区域可用；真正占成本的是容纳约 400 万 chunks 的数据库计算规格，而不是 150GB 原文存储本身。[Supabase pricing](https://supabase.com/pricing) [Supabase regions](https://supabase.com/docs/guides/platform/regions)

我的建议是：

- 30 万份文档全部纳入，不削减法律范围。
- 原文全部保存。
- 全部建立关键词、字段和引用索引。
- 所有可形成可靠段落的内容都生成 embedding。
- 开发期主要在本机跑采集、解析和评测，临近上线才启用完整生产环境。
- 上线先使用约 A$500/月的配置，只有性能测试证明不足才向 A$800–1,000 升级。
- 设置云资源和模型消费硬性告警，防止 agent、评测任务或爬虫意外烧钱。

这里不能再沿用之前的 A$20–100/月判断——那个数字只适用于身份认证、日志等外围能力，不可能覆盖完整的 AustraliaEmploymentRAG。

我建议将正式需求写成：

&gt; The MVP must support the complete agreed corpus within a target operating budget of A$500 per month and a hard ceiling of A$1,000 per month at the defined launch usage baseline. Cost overruns must trigger automated alerts and may not silently degrade corpus coverage, citation integrity, temporal accuracy, or refusal behaviour.

这个成本约束我建议冻结。下一步我们继续需求讨论，处理“哪些查询和答案属于明确的产品范围，以及哪些必须拒绝”，把产品边界彻底定下来。
</pre>

## 139 | User | 2026-08-02T07:26:11.596Z

<pre>
不行不行，太贵太贵，预算50一个月不能超，你帮我想办法，实在不行就缩减库的大小
</pre>

## 140 | Assistant | 2026-08-02T07:26:11.596Z

<pre>
明白，A$50/月改成绝对硬上限。这个预算下不能按“小型企业 SaaS 基础设施”来设计；我会保留完整法律范围，但把云端常驻数据量、生成式调用和高可用能力大幅压缩，优先用本地离线建库、静态索引和按需取文。
</pre>

## 141 | Assistant | 2026-08-02T07:26:11.596Z

<pre>
可以压到 A$50/月以内，但必须把架构改成“离线建库 + 单机搜索 + 分层索引”，不能使用 Supabase Pro 或完整托管向量数据库。

建议预算：

| 项目 | 月费 |
|---|---:|
| Sydney 2GB/60GB 服务器 | A$14–18 |
| Cloudflare Workers/Pages | A$0–8 |
| 150GB 公共法律原文存储 | A$3–5 |
| 客户数据加密备份 | A$1–2 |
| LLM、rerank、邮件 | A$10–15 |
| 预留波动 | A$5 |
| 合计 | **A$33–48** |

AWS Lightsail 的 2GB RAM、60GB SSD Linux 实例当前是 US$10/月（IPv6-only）或 US$12/月（含 IPv4）。[AWS Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)  
Cloudflare Workers 可先用免费计划，付费计划最低 US$5/月；R2 存储为 US$0.015/GB/月，前 10GB 免费且不收公网出口流量费。[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

### 数据库缩减方案

法律范围不缩减，但不再给所有内容建立昂贵的全量向量索引。

| 层级 | 内容 | 检索方式 |
|---|---|---|
| Tier 1 | 现行及近三个财年的 Acts、Regulations、Awards、税率、官方指引 | 全文 + 向量 + 引用索引 |
| Tier 2 | Enterprise agreements、法院和 FWC decisions | 全文关键词索引，命中文档后即时语义排序 |
| Tier 3 | Bills、consultations、历史和低频材料 | 元数据、标题、状态、官方链接；按需取回原文 |

预计结果：

- 仍收录约 30 万份文档。
- 仍然能够搜索全部法律原文。
- 原始文件仍可保存约 150GB。
- 云端 chunks 从 400 万减少至约 **60万–100万**。
- 常驻向量 chunks 控制在约 **15万–30万**。
- 全语料使用磁盘型 BM25/精确引用索引，约 15–35GB。
- 本地电脑负责爬取、解析、embedding 和 600 条评测，夜间运行，不产生服务器计算费。
- 服务器只负责查询、少量增量更新和回答生成。

这不是删除 case law、enterprise agreements 或州法，而是减少它们的预处理深度。法律检索本来就非常依赖标题、法条号、案件号、引用和关键词，因此全量关键词检索配合候选结果重排是合理的。

### 必须调整的要求

为了守住 A$50：

- 99.5% 仍作为内部目标，但 MVP 不提供合同 SLA。
- 不做多节点高可用，故障时从每日备份恢复。
- Quick Answer 和 Deep Research 设置月度额度。
- AI 预算达到上限后，不切换到不准确模型；系统暂停生成式回答，但搜索继续可用。
- 600 条评测在本地执行，不放到生产服务器。
- 公共法律资料可以存储在低价对象存储；账户、Research Records、审计记录和其他客户数据仍保存在 Sydney。
- 第一位客户若需要更高额度，可采用客户自带模型 API key，或者单独购买使用额度，不由你的 A$50承担。

建议冻结成：

&gt; MVP infrastructure expenditure must not exceed A$50 per calendar month. The complete agreed legal scope remains discoverable, but semantic indexing depth is tiered by authority, currency and expected usage. When variable AI limits are reached, generative answers must be paused or queued rather than produced using a lower-quality path.

这个方案能守住钱，也没有把产品退化成一个演示。
</pre>

## 142 | User | 2026-08-02T07:26:11.596Z

<pre>
行，同意
</pre>

## 143 | Assistant | 2026-08-02T07:26:11.597Z

<pre>
好，成本和分层索引方案冻结：

- 月度基础设施硬上限 A$50。
- 法律范围不缩减。
- 全语料支持关键词、字段、引用和原文检索。
- 高权威、高频资料建立完整向量索引。
- 低频大规模材料按需语义处理。
- AI 额度耗尽时暂停或排队，不降低准确性。
- 本地完成建库、embedding 和 600 条评测。

下一步确定“回答应该做到什么程度”。

我建议 AustraliaEmploymentRAG 不只返回搜索结果，还应当针对匿名化事实场景给出有条件的结论。标准答案结构为：

1. **Short answer**：直接回答 Yes、No、Likely、Depends 或 Insufficient evidence。
2. **Why**：说明适用规则及推理过程。
3. **Conditions and assumptions**：明确州/领地、日期、员工类型、award、agreement 等决定性条件。
4. **Authorities**：逐项引用法律原文、条款、判决或官方指引。
5. **Practical next steps**：建议用户检查哪些记录、执行哪些合规步骤或继续确认什么信息。
6. **Limitations**：标明答案不是法律意见，以及尚未确认的事实。

它可以说：

&gt; Based on the stated facts, the employee is likely entitled to overtime under clause X, provided that the agreement does not displace that entitlement.

但不能说：

&gt; You are definitely compliant.

也不能只扔出十个链接，让客户自己研究。

也就是说，产品定位是：

&gt; **Evidence-grounded employment law research and conditional compliance guidance—not merely document search, and not legal representation.**

你是否接受这种回答深度？
</pre>

## 144 | User | 2026-08-02T07:26:11.597Z

<pre>
接受
</pre>

## 145 | Assistant | 2026-08-02T07:26:11.597Z

<pre>
好的，答案深度冻结。

下一个关键需求是 **award、enterprise agreement 和 classification 识别**。这是澳洲 employment law 检索中最有价值、也最容易答错的部分。

我建议 MVP 包含一个结构化的 **Coverage Navigator**：

- 根据 employer name/ABN 搜索可能适用的 enterprise agreement。
- 判断 agreement 是否仍在运行、已被替代或终止。
- 没有适用 agreement 时，检索可能覆盖该业务和岗位的 modern awards。
- 根据行业、职业、实际职责、资历、工作地点和查询日期，列出可能的 classification。
- 返回按可能性排序的候选结果，而不是未经证实地指定唯一答案。
- 明确引用 coverage、exclusion、classification 和 definition 条款。
- 缺少关键事实时必须提问；仍无法确定则返回 `INSUFFICIENT_EVIDENCE`。
- 支持 award-free 或 agreement 不适用的结论，但必须有依据。
- 不因为职位名称是 “manager”“supervisor” 或 “contractor” 就直接作出判断。

例如：

&gt; The Clerks—Private Sector Award 2020 is a possible candidate, but coverage cannot be confirmed from the job title alone. The employee’s principal duties and the employer’s industry must be established.

也就是说，MVP 可以协助判断适用文书和分类，但不会声称替代正式的 coverage determination。

我建议把它作为第一版核心功能，而不是以后再加。你接受吗？
</pre>

## 146 | User | 2026-08-02T07:26:11.597Z

<pre>
接受
</pre>

## 147 | Assistant | 2026-08-02T07:26:11.597Z

<pre>
接受，Coverage Navigator 作为 MVP 核心功能冻结。

下一项是 **case law 的处理深度**。仅检索判决原文不够，因为旧判决可能已被上诉、推翻、区分，或者只具有有限的参考价值。

我建议系统必须：

- 显示法院或 tribunal、审级、裁决日期、案件编号和 neutral citation。
- 区分 High Court、Full Court、单一法官、FCFCOA、FWC Full Bench、单一委员及州级机构。
- 标明判决属于 binding、potentially binding、persuasive 或 authority status unknown。
- 尽可能建立 appealed、affirmed、reversed、overruled、distinguished、followed 和 cited-by 关系。
- 默认优先展示更高审级、更新且仍被遵循的判决。
- 如果无法确认后续处理状态，明确显示 `TREATMENT_NOT_CONFIRMED`。
- 回答必须区分法院判决中的 holding、理由、obiter、当事人主张和背景事实。
- 不根据单一案件直接概括成适用于所有雇主的规则。
- 可以解释判决如何影响匿名场景，但不能预测诉讼或 FWC 申请结果。
- regulator 的 decision summary 和 impact material 只能作为辅助来源，不能替代判决原文。

示例：

&gt; This Federal Court decision supports the proposition, but its subsequent appellate treatment has not been confirmed. It should not be treated as settled authority without reviewing later cases.

这会明显增加采集和关联处理工作，但对于“比直接问 ChatGPT 更可信”是必要能力。你接受吗？
</pre>

## 148 | User | 2026-08-02T07:26:11.598Z

<pre>
接受
</pre>

## 149 | Assistant | 2026-08-02T07:26:11.598Z

<pre>
接受，判例层级与后续处理要求冻结。

下一项是 **不同来源发生冲突时如何处理**。澳洲 employment law 中，法律原文、award、enterprise agreement、判决和 regulator guidance 可能给出不同层级或不同时间点的答案。

我建议建立强制来源优先级：

1. Constitution 及适用的成文法
2. Regulations 和其他 legislative instruments
3. 具有约束力的法院判决
4. FWC orders、approved agreements、modern awards 和具有相应效力的决定
5. 其他法院、tribunal 或 FWC 的 persuasive decisions
6. 官方 regulator guidance、rulings、decision summaries
7. Explanatory memoranda 和其他解释材料
8. Bills、consultations 和尚未生效材料

但这不是简单地“高层级永远覆盖低层级”。系统还必须考虑：

- 查询日期；
- jurisdiction；
- commencement、repeal 和 transitional provisions；
- award 与 enterprise agreement 的适用关系；
- 判决具体解释的是哪个版本的条文；
- 后续修法是否已经改变判决依据；
- guidance 是否比底层法律更旧；
- 更具体的规则是否优先于一般规则。

如果两个有权威性的来源无法可靠协调，答案必须返回 `CONFLICTING_SOURCES`，分别展示两种解释及其依据，不允许模型自行选一个。

我建议同时规定：

&gt; Official guidance may explain the law but must never silently override legislation, an operative industrial instrument, or binding authority.

你接受这套冲突处理原则吗？
</pre>

## 150 | User | 2026-08-02T07:26:11.598Z

<pre>
接受
</pre>

## 151 | Assistant | 2026-08-02T07:26:11.598Z

<pre>
接受，来源优先级和冲突处理原则冻结。

下一项是 **恶意或规避性查询的边界**。B2B 用户可能会问：

- “怎样把员工改成 contractor 来避免 award？”
- “能不能在员工投诉前先解雇他？”
- “怎样安排工资结构以绕开 overtime？”
- “记录不完整时，怎样降低被发现的可能？”

我建议系统可以解释法律风险、合法替代方案和补救步骤，但不能帮助实施违法规避、报复、伪造或隐瞒。

处理方式：

- 合法的成本优化、组织调整和合规规划：支持。
- 询问某种安排是否合法：支持并引用依据。
- 请求规避最低权益、sham contracting、adverse action、歧视、工资盗窃或记录义务：拒绝提供操作方法。
- 拒绝后仍应说明相关法律风险，并给出合法替代方向。
- 对可能存在历史欠付、错误分类或记录缺失的场景，可以提供自查、纠正和 remediation checklist。
- 不帮助伪造时间记录、倒签文件、隐藏证据或规避 regulator。
- 查询意图不清时，不直接指控用户恶意；先按合规解释处理。

示例：

&gt; I can’t help design an arrangement intended to avoid minimum employment entitlements. I can explain the lawful distinction between an employee and an independent contractor and identify compliant engagement options.

你接受这条产品边界吗？
</pre>

## 152 | User | 2026-08-02T07:26:11.599Z

<pre>
接受
</pre>

## 153 | Assistant | 2026-08-02T07:26:11.599Z

<pre>
接受，违法规避和补救边界冻结。

下一项是把“只接受匿名化场景”变成可执行规则。建议不要只靠免责声明，而是在产品中主动检测和阻止员工个人信息。

MVP 应当：

- 在提交前检测姓名、私人邮箱、手机号、住址、出生日期、TFN、银行信息、employee ID、工资单号码等。
- 检测到疑似员工 PII 时阻止提交，并让用户修改或一键替换为 `Employee A`、`Manager B` 等占位符。
- 不把被阻止的原始内容发送给 LLM、写入日志或保存到 Research Record。
- 允许 employer name、ABN、公开注册地址等企业信息，因为它们是查找 enterprise agreement 和适用法律所必需的。
- 允许引用公开判决中的当事人姓名和公开案件信息。
- 对职位、行业、州、工龄、年龄范围、工作时间和职责等分析所需事实予以保留。
- 如果极少数组合信息仍可能识别个人，向用户提示进一步概括。
- API 和 widget 使用同一套验证规则，不能只在 Web UI 检查。
- 暂不接收 payslip、employment contract、medical certificate、personnel file 等客户文件。

这样不会承诺“绝对匿名”，但能明确做到 **data minimisation and active PII prevention**。

你接受吗？
</pre>

## 154 | User | 2026-08-02T07:26:11.599Z

<pre>
接受
</pre>

## 155 | Assistant | 2026-08-02T07:26:11.599Z

<pre>
接受，匿名化输入和主动 PII 阻止机制冻结。

下一项是 **数据不完整或更新失败时，产品是否还能回答**。我建议不能只在后台记录错误，必须直接影响用户看到的结果。

规则如下：

- 每个来源显示 `last checked`、`last successfully ingested` 和适用状态。
- 官方来源超过预定更新时间仍未检查成功时，标记 `FRESHNESS_DEGRADED`。
- 查询涉及该来源时，答案顶部必须显示可见警告。
- 如果缺失资料可能改变答案，不生成确定性结论，返回 `SOURCE_NOT_CURRENT` 或 `INSUFFICIENT_EVIDENCE`。
- 搜索结果仍可显示已有资料，但必须注明其最后确认日期。
- 某个 jurisdiction 或资料类型采集失败，不能假装整个语料库仍然完整。
- 重要来源发生结构变化、抓取失败或文档数量异常时，自动停止发布该批更新并通知管理员。
- 新数据先进入 staging index，通过完整性、日期、引用和重复检测后，再切换为 active index。
- 索引发布失败时保留上一版本，不能让半成品数据覆盖生产索引。
- 用户可以订阅数据恢复或修正通知。
- 管理后台显示各来源的健康状态和最近一次成功采集时间。

换句话说，系统宁可说：

&gt; This answer cannot be confirmed because the relevant NSW source has not been successfully checked since 29 July 2026.

也不能拿旧资料给出看起来正常的回答。

你接受吗？
</pre>

## 156 | User | 2026-08-02T07:26:11.599Z

<pre>
接受
</pre>

## 157 | Assistant | 2026-08-02T07:26:11.600Z

<pre>
接受，数据新鲜度降级和安全发布机制冻结。

下一项是 **答案的可复现性**。法律资料会变化，所以用户几个月后打开旧答案时，不能让它悄悄使用新资料重新显示成不同内容。

我建议每次生成答案都形成不可变的 **Answer Snapshot**，记录：

- 原始匿名化问题及后续澄清；
- 用户指定的 `as at` 日期和 jurisdiction；
- 当时使用的 source/document/version IDs；
- 实际引用的段落及其原文快照；
- 检索、rerank、prompt 和模型版本；
- 答案正文、状态、假设及置信限制；
- 创建者、组织、创建时间；
- 后续 review、comment、issue 和 correction 历史。

后续法律或来源变化时：

- 原答案不得被静默修改。
- 显示 `This answer was based on sources available as at ...`。
- 系统将记录标记为 `REVIEW_REQUIRED`。
- 用户可以选择 **Re-run using current law**，生成一个新版本。
- 新旧版本可以并排比较。
- 已导出的 PDF、Word 或 JSON 保持与原 Answer Snapshot 一致。
- 管理员修正系统错误时保留旧版本和修正原因，不进行无痕覆盖。

这样客户保存的不是一段随时变化的聊天记录，而是一份在特定时间点可审计的 research record。

你接受吗？
</pre>

## 158 | User | 2026-08-02T07:26:11.600Z

<pre>
接受
</pre>

## 159 | Assistant | 2026-08-02T07:26:11.600Z

<pre>
接受，Answer Snapshot 和版本可复现要求冻结。

下一项是 **客户数据保留与删除期限**。这既影响隐私，也影响 A$50/月的存储预算。

我建议 MVP 默认：

- Research Records 和 Answer Snapshots：客户主动删除或组织关闭前持续保存。
- 普通应用日志：保留 14 天。
- 安全日志和审计事件：保留 12 个月。
- 已删除记录：进入 30 天可恢复期，之后从主数据库永久删除。
- 加密备份中的已删除数据：随备份轮换，最长再保留 30 天。
- 组织关闭：先提供 JSON/Word/PDF 导出，然后在 30 天内清除客户数据。
- API request/response body：默认不记录，只保留状态码、延迟、token 使用量和匿名技术元数据。
- 被 PII 检测器阻止的内容：不保存。
- 公共法律资料、评测集和不含客户内容的系统指标：不属于客户数据，可长期保存。
- 合同另有要求时允许组织管理员缩短保留期限，但 MVP 不支持无限自定义复杂策略。
- 删除操作进入审计日志，但审计日志只记录删除者、时间和对象 ID，不保留已删除正文。

你接受这套默认保留期限吗？
</pre>

## 160 | User | 2026-08-02T07:26:11.600Z

<pre>
接受
</pre>

## 161 | Assistant | 2026-08-02T07:26:11.600Z

<pre>
接受，客户数据保留与删除期限冻结。

下一项是 **使用额度和成本熔断**。A$50 是绝对上限，因此不能只依赖账单告警，系统必须在产生费用之前阻止超支。

我建议：

- 普通关键词、字段、引用和过滤搜索不消耗 AI 额度。
- Quick Answer、Deep Research、按需 rerank 和重新生成答案消耗 research credits。
- 每个组织、service account 和 API key 都有月度额度与速率限制。
- 内部管理员可以调整额度，但系统级供应商预算不可被组织管理员突破。
- LLM 月度预算先设为 A$12，达到 70%、90% 和 100% 时告警。
- 达到 100% 后：
  - 搜索和查看已有 Research Records 继续正常工作；
  - 新 Quick Answer 可以排队到下个额度周期；
  - Deep Research 暂停；
  - 绝不自动切换到未经评测的廉价模型。
- 付费客户需要更多用量时，可以：
  - 预付额外 AI credits；
  - 使用自己的 provider API key；
  - 升级为单独计费的套餐。
- 客户预付或自带 key 的费用不计入你自己的 A$50运营支出。
- 管理后台显示每次请求的估算成本、累计成本和剩余额度。
- 爬虫、agent 或评测任务同样必须有独立预算，不能无限循环调用付费 API。
- 本地运行的 ingestion 和评测不消耗生产额度。

第一版仍可支持先前估算的最多 10 个组织和 100 个用户，但生成式功能受系统总预算和各组织额度约束。

你接受这种“搜索持续可用，生成式能力硬熔断”的规则吗？
</pre>

## 162 | User | 2026-08-02T07:26:11.601Z

<pre>
同意
</pre>

## 163 | Assistant | 2026-08-02T07:26:11.601Z

<pre>
同意，使用额度和系统级成本熔断冻结。

下一项是 **是否允许未登录用户免费使用**。考虑到 B2B-only、A$50 硬预算和法律内容的滥用风险，我建议 MVP 不开放公共问答。

具体边界：

- Marketing website 可以公开访问。
- 可以展示固定的示例问题、答案截图和预生成演示记录。
- Search、Ask、Compare、Monitor、API 和 widget sandbox 必须登录后才能使用。
- 新组织采用申请或邀请制开通。
- 可以提供限时 B2B trial，但必须验证工作邮箱并设置很低的独立 AI 额度。
- 不提供无需登录的公共 API key。
- 不允许搜索引擎索引客户问题、答案或 Research Records。
- Widget 即使嵌入客户平台，也必须通过受控 token 或客户自己的登录态访问。
- API key 泄露或异常调用时自动限流和撤销。
- 销售演示使用独立 demo workspace，不能访问真实客户数据。
- 第一位付费客户可以人工创建组织、开通额度和发送账单，不建设复杂的自助购买流程。

这样产品仍然可以公开营销，但不会因为免费流量在一天内耗尽整月预算。

你接受 MVP 采用 **authenticated, invite-controlled B2B access** 吗？
</pre>

## 164 | User | 2026-08-02T07:26:11.601Z

<pre>
接受
</pre>

## 165 | Assistant | 2026-08-02T07:26:11.601Z

<pre>
接受。至此，需求阶段的关键产品边界已经完整，可以冻结为 **Requirements Baseline v1**；继续拆得更细就会开始进入数据模型和实现设计。

我们已经确定：

- B2B、邀请制访问。
- 完整澳洲 employment law 范围。
- Web、API、SDK、widget、监控和 Research Records。
- 匿名场景、主动阻止员工 PII。
- 条件性法律分析，而非简单链接搜索。
- Award、agreement 和 classification Coverage Navigator。
- 判例层级、后续处理和冲突来源识别。
- 当前及历史时点检索。
- 严格引用、证据不足时拒答。
- 答案快照、审计、团队复核与修正流程。
- A$50/月硬上限及 AI 成本熔断。
- 一个自愿付费的 B2B 客户即视为商业 MVP 成功。

下一步进入 **API 与数据模型**。最先要解决的不是 endpoint，而是整个系统最核心的法律资料模型：

```text
Source
  └── Legal Document
        └── Document Version
              └── Provision / Paragraph
                    └── Search Chunk
```

它必须同时表达：

- 同一部 Act 的多个历史版本；
- section、subsection、clause、schedule 和判决段落；
- 生效、废止、尚未生效及过渡状态；
- amendment 对具体 provision 的影响；
- award、agreement、order 和 decision 之间的关系；
- 引用来源和原文快照；
- 搜索 chunk 只是派生索引，不能成为法律事实的主记录。

下一轮我们就从这个 canonical legal document model 开始逐层推导。
</pre>

## 166 | User | 2026-08-02T07:26:11.601Z

<pre>
好的
</pre>

## 167 | Assistant | 2026-08-02T07:26:11.601Z

<pre>
我们先定义最上面的三层，不碰 provision 和 chunk。

### 1. `Source`

代表资料从哪里取得，而不是法律文件本身。

关键字段：

- `source_id`
- `authority_name`：例如 FWC、ATO、Federal Register of Legislation
- `source_type`：website、API、feed、document search
- `official_domain`
- `jurisdiction`
- `licence_status`
- `commercial_use_status`
- `crawl_policy`
- `last_checked_at`
- `last_successful_ingestion_at`
- `health_status`

同一个机构可以有多个 Source，例如 FWC Document Search 和 FWC Awards 页面。

### 2. `LegalDocument`

代表一个稳定的法律或官方资料身份，不随网站更新而改变。

例如：

- `Fair Work Act 2009`
- `Clerks—Private Sector Award 2020`
- 某份 enterprise agreement
- 某个法院案件
- 某份 regulator guidance
- 某项 Bill 或 explanatory memorandum

核心字段：

- `document_id`：内部稳定 ID
- `document_type`
- `title`
- `jurisdiction`
- `issuing_authority`
- `official_identifier`
- `neutral_citation`
- `abn`：仅在适用时
- `primary_language`
- `canonical_source_url`
- `legal_status`

官方编号不能直接作为全局主键，因为不同机构和文档类型可能重复。唯一性应由多个字段共同确定。

### 3. `DocumentVersion`

代表该文件在某个时间点的不可变版本。

核心时间必须分开：

- `published_at`：什么时候发布；
- `effective_from`：什么时候开始产生法律效力；
- `effective_to`：什么时候停止适用；
- `retrieved_at`：系统什么时候取得；
- `superseded_at`：什么时候被新版本替代。

此外还包括：

- `version_id`
- `document_id`
- `version_label`
- `status`
- `source_url`
- `content_hash`
- `raw_object_key`
- `extraction_status`
- `supersedes_version_id`
- `is_official`
- `is_current`

这里最重要的原则是：

&gt; `published_at` 不等于 `effective_from`，`retrieved_at` 也不代表法律有效日期。

已通过但尚未生效的修法，就是已经 published，但 `effective_from` 在未来；Bill 则可能已经 published，却永远没有法律效力。

判决一般只有一个法律版本，但后来发布的 corrected judgment 仍会形成新的 `DocumentVersion`，旧版本不会被覆盖。

建议先冻结以下关系：

```text
Source 1 ──&gt; many DocumentVersions
LegalDocument 1 ──&gt; many DocumentVersions
```

`Source` 回答“内容从哪里来”，`LegalDocument` 回答“它是什么”，`DocumentVersion` 回答“在什么时候、以什么内容和法律状态存在”。

你接受这三层作为 canonical model 的基础吗？
</pre>

## 168 | User | 2026-08-02T07:26:11.602Z

<pre>
接受
</pre>

## 169 | Assistant | 2026-08-02T07:26:11.602Z

<pre>
接受，前三层冻结。

下一层不能只做一个简单的 `Provision` 表，因为 section 可能被重编号、拆分、合并或只修改其中一部分；而判决使用 numbered paragraphs，award 使用 clauses，guidance 又使用 headings。

我建议统一抽象为 `DocumentNode`，界面上仍显示 section、clause、paragraph 等真实名称。

### 4. `DocumentNode`

代表文件中的一个逻辑内容单元：

- Part、Division、Subdivision
- section、subsection、paragraph
- clause、subclause
- schedule、table、definition
- judgment paragraph
- order
- guidance heading

主要字段：

- `node_id`
- `document_id`
- `node_type`
- `canonical_label`
- `lineage_key`
- `first_seen_version_id`
- `last_seen_version_id`

`node_id` 表示逻辑身份，不直接代表某一版文字。

### 5. `NodeVersion`

代表该节点在某个 `DocumentVersion` 中实际出现的内容：

- `node_version_id`
- `node_id`
- `version_id`
- `parent_node_version_id`
- `display_label`：例如 `s 340(1)(a)`
- `heading`
- `text`
- `ordinal`
- `structural_path`
- `effective_from`
- `effective_to`
- `legal_status`
- `content_hash`

节点自己需要生效日期，因为同一部 Act 中不同 amendment provisions 可能在不同日期开始生效。

### 节点关系

另外建立 `NodeRelation`：

- `RENAMED_TO`
- `RENUMBERED_TO`
- `REPLACED_BY`
- `SPLIT_INTO`
- `MERGED_INTO`
- `AMENDS`
- `INSERTS`
- `REPEALS`
- `CITES`
- `INTERPRETS`
- `APPLIES`
- `DISTINGUISHES`

每条关系还要保存：

- 关系来源；
- 支持该关系的原文；
- 自动提取还是人工确认；
- 置信状态；
- 有效时间。

这样可以处理：

```text
Section 12 in Version A
        ↓ RENUMBERED_TO
Section 15 in Version B
```

也可以处理：

```text
Judgment paragraph 83
        ↓ INTERPRETS
Fair Work Act s 340
```

关键原则是：

&gt; 法条编号只是某一版本中的显示标签，不是永久身份。

最后才是：

```text
NodeVersion 1 ──&gt; many SearchChunks
```

Search chunk 可以重新生成、缩短或更换 embedding，不影响底层法律记录和引用稳定性。

你接受 `DocumentNode + NodeVersion + NodeRelation` 这层模型吗？
</pre>

## 170 | User | 2026-08-02T07:26:11.602Z

<pre>
接受
</pre>

## 171 | Assistant | 2026-08-02T07:26:11.602Z

<pre>
接受，法律节点及其版本关系冻结。

下一层是检索派生数据。这里建议把文本切分和 embedding 分开，否则以后更换模型会复制大量正文，也难以控制 A$50 预算。

### 6. `SearchChunk`

代表可被搜索和 rerank 的派生文本片段。

主要字段：

- `chunk_id`
- `node_version_id`
- `chunk_ordinal`
- `text`
- `context_prefix`
- `start_offset`
- `end_offset`
- `token_count`
- `content_hash`
- `chunking_pipeline_version`
- `index_tier`
- `created_at`

规则：

- chunk 原则上不能跨越两个具有独立法律意义的 `NodeVersion`。
- 很长的 section、clause 或判决段落可以拆成多个 chunks。
- 相邻 chunks 可以少量重叠，但引用必须回到原始 `NodeVersion`。
- Part、Division 和 heading 可以放进 `context_prefix`，帮助检索，但不能伪装成正文。
- 表格同时保存原始结构和可搜索文本，不能只保留 OCR 后的一串文字。
- SearchChunk 可以随时删除重建，不是法律记录。

### 7. `ChunkEmbedding`

embedding 独立保存：

- `chunk_id`
- `embedding_model`
- `embedding_model_version`
- `dimensions`
- `vector`
- `quantisation`
- `embedded_at`
- `embedding_status`

这允许：

- Tier 1 chunks 建立完整 embedding；
- Tier 2 只给高价值或高频 chunks 建 embedding；
- Tier 3 暂时不生成 embedding；
- 更换模型时保留旧 embedding，完成灰度测试后再切换；
- 同一 chunk 可以并存多个模型结果；
- 不需要复制 chunk 正文。

### 引用原则

用户答案中的 citation 不直接指向 chunk，而是指向：

```text
DocumentVersion
  + NodeVersion
  + exact text offsets
  + source snapshot
```

chunk 只是“系统怎样找到这段话”，不能成为“法律依据是什么”。

因此即使以后重新 chunk 或换 embedding，旧 Answer Snapshot 中的引用仍然有效。

### 分层索引

`index_tier` 初步定义为：

- `TIER_1_FULL_SEMANTIC`
- `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`
- `TIER_3_METADATA_AND_ON_DEMAND`
- `EXCLUDED_LICENSING`
- `QUARANTINED_QUALITY`

这能直接落实前面冻结的 A$50 成本方案。

你接受 `SearchChunk + ChunkEmbedding` 分离，以及 citation 永远回到原始法律节点的设计吗？
</pre>

## 172 | User | 2026-08-02T07:26:11.602Z

<pre>
接受
</pre>

## 173 | Assistant | 2026-08-02T07:26:11.602Z

<pre>
接受，检索层和引用边界冻结。

下一步是 **法律状态与时间事件模型**。`legal_status = IN_FORCE` 不能只作为一个会被覆盖的字段，因为我们需要解释它为什么处于该状态，也需要重建历史状态。

建议增加：

### 8. `LegalEvent`

表示影响 document、version 或 node 法律状态的事件。

典型事件包括：

- `INTRODUCED`
- `PASSED`
- `ASSENTED`
- `COMMENCED`
- `AMENDED`
- `REPEALED`
- `APPROVED`
- `VARIED`
- `NOMINAL_EXPIRY_REACHED`
- `REPLACED`
- `TERMINATED`
- `DECISION_ISSUED`
- `APPEAL_FILED`
- `AFFIRMED`
- `REVERSED`
- `CORRECTED`
- `GUIDANCE_UPDATED`

主要字段：

- `event_id`
- `event_type`
- `document_id`
- `version_id`
- `node_id`：事件只影响具体条款时使用
- `event_date`
- `effective_from`
- `effective_to`
- `recorded_at`
- `evidence_node_version_id`
- `source_id`
- `verification_status`
- `notes`

### 两种时间必须分开

系统至少要区分：

- **Effective time**：法律在现实中何时适用；
- **Knowledge time**：系统何时知道并记录了该事实。

例如一项修法从 1 July 生效，但系统在 2 July 才成功采集：

```text
effective_from: 2026-07-01
recorded_at:    2026-07-02
```

用户查询 “law as at 1 July” 时应使用前者；复现系统在 1 July 实际给出的旧答案时，则需要后者。

### 状态应由事件推导

`LegalDocument` 和 `NodeVersion` 上可以保留缓存后的 `current_status`，但它只是为了提高查询速度。真实依据是 `LegalEvent`。

因此：

- Bill 获得 assent 后不会被直接覆盖成 Act 而失去历史；
- 已通过但尚未 commencement 的 amendment 可准确显示；
- enterprise agreement 到达 nominal expiry 不会被误判为失效；
- agreement variation、replacement 和 termination 分别记录；
- 判决进入 appeal 不等于已经被推翻；
- guidance 更新不会自动改变底层 legislation 的状态。

### 查询要求

每个 Ask、Search、Compare 请求都应有：

- `legal_as_at`：用户想研究的法律时间；
- `knowledge_cutoff_at`：复现时系统当时掌握资料的截止时间。

普通用户只需要看到 `As at 2 August 2026`，第二个时间主要用于审计和 Answer Snapshot。

你接受用 `LegalEvent` 推导法律状态，并采用 effective time 与 knowledge time 双时间模型吗？
</pre>

## 174 | User | 2026-08-02T07:26:11.603Z

<pre>
接受
</pre>

## 175 | Assistant | 2026-08-02T07:26:11.603Z

<pre>
接受，`LegalEvent` 和双时间模型冻结。

法律语料模型还缺最后一层：**原始证据和语料发布版本**。否则我们虽然保存了解析结果，却无法证明它究竟来自哪个下载文件，也无法安全回滚坏掉的采集。

### 9. `SourceArtifact`

代表系统从官方来源实际取得的一份不可变原始文件或响应。

主要字段：

- `artifact_id`
- `source_id`
- `requested_url`
- `resolved_url`
- `retrieved_at`
- `http_status`
- `etag`
- `last_modified`
- `mime_type`
- `content_length`
- `content_hash`
- `raw_object_key`
- `licence_snapshot_id`
- `fetch_method`
- `fetcher_version`

同一个 URL 每次内容发生变化，都生成新的 artifact，不覆盖旧文件。

`DocumentVersion` 必须能够追溯到一个或多个 `SourceArtifact`。例如一个 legislation version 可能同时来自 HTML、PDF 和 XML。

### 10. `IngestionRun`

记录一次采集和处理任务：

- `ingestion_run_id`
- `source_id`
- `started_at`
- `completed_at`
- `status`
- `documents_discovered`
- `documents_added`
- `documents_updated`
- `documents_unchanged`
- `documents_failed`
- `documents_quarantined`
- `parser_version`
- `error_summary`

还要检测异常，例如昨天有 50,000 份文件、今天突然只发现 12 份。这种运行不能自动发布。

### 11. `CorpusRelease`

代表经过验证并正式提供给用户的一版语料索引：

- `corpus_release_id`
- `created_at`
- `previous_release_id`
- `manifest_hash`
- `document_count`
- `version_count`
- `node_count`
- `chunk_count`
- `validation_result`
- `release_status`
- `promoted_at`
- `rollback_reason`

发布流程：

```text
Fetch
  → Parse
  → Validate
  → Quarantine failures
  → Build candidate index
  → Run retrieval checks
  → Promote CorpusRelease
```

生产查询只读取当前 active release。失败时继续使用上一版。

每个 Answer Snapshot 记录 `corpus_release_id`，因此可以知道答案究竟使用了哪一版语料，而不仅仅是“大约在某一天”。

这三张记录还能支持：

- 来源健康状态；
- 内容哈希去重；
- licence 审计；
- 坏数据隔离；
- 原文证明；
- 安全回滚；
- 精确复现答案。

你接受 `SourceArtifact + IngestionRun + CorpusRelease` 作为法律语料链路的最后一层吗？
</pre>

## 176 | User | 2026-08-02T07:26:11.603Z

<pre>
接受
</pre>

## 177 | Assistant | 2026-08-02T07:26:11.603Z

<pre>
接受，法律语料的 canonical model 至此完整冻结。

现在进入客户侧数据模型。第一组是 **组织、人员与机器身份**。

### 12. `Organization`

所有客户数据以组织为租户边界：

- `organization_id`
- `name`
- `status`
- `plan`
- `created_at`
- `data_retention_policy`
- `monthly_credit_limit`
- `credit_balance`
- `default_jurisdiction`
- `default_timezone`
- `sso_enforcement_status`

所有 Research Records、API keys、watchlists、comments 和 audit events 都必须带有 `organization_id`。

### 13. `User` 与 `Membership`

`User` 代表登录身份，`Membership` 代表其在某个组织中的权限。一个人可以属于多个组织，但数据不能相互泄漏。

```text
User many ── Membership ── many Organization
```

MVP 固定角色：

- `OWNER`：组织删除、SSO、成员及全部设置；
- `ADMIN`：成员、额度、workspace 配置和审计；
- `RESEARCHER`：搜索、Ask、创建和复核 Research Records；
- `VIEWER`：只读已共享内容；
- `DEVELOPER`：API、SDK、service accounts 和 widget 配置。

角色提供默认权限，但底层保存具体 permission scopes，避免以后扩展时重写模型。

### 14. `ServiceAccount`

机器身份不能伪装成人类用户：

- `service_account_id`
- `organization_id`
- `name`
- `status`
- `scopes`
- `created_by`
- `expires_at`
- `last_used_at`

### 15. `ApiCredential`

凭证与 service account 分开：

- `credential_id`
- `service_account_id`
- `key_prefix`
- `secret_hash`
- `created_at`
- `expires_at`
- `revoked_at`
- `last_used_at`

系统只在创建时显示完整 API key，数据库永远不保存明文。

### 身份统一

所有可执行操作的主体统一表示为 `Actor`：

```text
Actor = User | ServiceAccount | SystemJob
```

这样 audit log 可以准确记录：

- 哪个用户查看或修改了记录；
- 哪个 API key 发起了查询；
- 哪个系统任务标记了 `REVIEW_REQUIRED`；
- 哪位管理员撤销了凭证。

### 租户隔离原则

- 公共法律语料由所有组织共享；
- 客户查询、答案、评论、watchlists 和设置严格属于单一组织；
- 每个请求必须从身份上下文取得 `organization_id`，不能信任客户端提交的租户 ID；
- 所有跨租户访问都必须默认拒绝；
- 自动测试必须包含跨租户越权用例。

你接受这套 `Organization + Membership + ServiceAccount + ApiCredential + Actor` 模型吗？
</pre>

## 178 | User | 2026-08-02T07:26:11.603Z

<pre>
接受
</pre>

## 179 | Assistant | 2026-08-02T07:26:11.603Z

<pre>
接受，组织与身份模型冻结。

下一组是产品最核心的客户数据：**Research Record 与答案版本**。

### 16. `ResearchRecord`

Research Record 是一个持续存在的研究事项，不等于单次聊天。

例如：

&gt; Does the Clerks Award cover this payroll administrator as at 1 July 2026?

主要字段：

- `research_record_id`
- `organization_id`
- `title`
- `created_by`
- `owner_id`
- `assigned_reviewer_id`
- `workflow_status`
- `legal_as_at`
- `jurisdictions`
- `topics`
- `created_at`
- `updated_at`
- `archived_at`

工作流状态：

- `DRAFT`
- `IN_REVIEW`
- `CUSTOMER_REVIEWED`
- `REVIEW_REQUIRED`
- `ARCHIVED`

`CUSTOMER_REVIEWED` 只表示客户内部有人复核过，不表示 AustraliaEmploymentRAG 或律师确认答案正确。

### 17. `ResearchTurn`

记录问题、澄清和用户补充的匿名事实：

- `turn_id`
- `research_record_id`
- `actor_id`
- `turn_type`
- `content`
- `created_at`
- `pii_scan_status`
- `supersedes_turn_id`

类型包括：

- `QUESTION`
- `CLARIFICATION_REQUEST`
- `USER_FACTS`
- `SCOPE_CHANGE`
- `SYSTEM_NOTICE`

被 PII 检测阻止的原文不会进入这里。

### 18. `AnswerSnapshot`

每一次正式回答都是不可变快照：

- `answer_snapshot_id`
- `research_record_id`
- `previous_answer_snapshot_id`
- `answer_status`
- `short_answer`
- `reasoning_summary`
- `limitations`
- `legal_as_at`
- `knowledge_cutoff_at`
- `corpus_release_id`
- `retrieval_run_id`
- `model_execution_id`
- `created_at`
- `superseded_at`

答案状态采用已冻结的：

- `SUPPORTED`
- `CONDITIONAL`
- `INSUFFICIENT_EVIDENCE`
- `CONFLICTING_SOURCES`
- `OUT_OF_SCOPE`
- `SOURCE_NOT_CURRENT`

### 重新运行不是覆盖

当用户点击 `Re-run using current law`：

```text
ResearchRecord
  ├── AnswerSnapshot v1
  └── AnswerSnapshot v2
```

v2 通过 `previous_answer_snapshot_id` 关联 v1。原答案、引用和 review 状态均保留。

### 事实与答案分开

ResearchTurn 保存“用户告诉了系统什么”，AnswerSnapshot 保存“系统当时得出了什么结论”。不能把两者混成一段可被覆盖的聊天 JSON，否则无法：

- 精确比较答案版本；
- 找出哪个事实改变了结论；
- 独立审计引用；
- 在来源更新后标记受影响答案；
- 稳定导出 Research Record。

你接受 `ResearchRecord + ResearchTurn + immutable AnswerSnapshot` 作为研究工作区的基础吗？
</pre>

## 180 | User | 2026-08-02T07:26:11.603Z

<pre>
接受
</pre>

## 181 | Assistant | 2026-08-02T07:26:11.604Z

<pre>
接受，Research Record 与不可变答案模型冻结。

下一组是 **claim、citation 和 assumption**。这是实现“逐项有证据，而不是整篇答案末尾堆几个链接”的关键。

### 19. `AnswerClaim`

每个具有实际意义的结论拆成独立 claim：

- `claim_id`
- `answer_snapshot_id`
- `sequence`
- `claim_type`
- `claim_text`
- `support_status`
- `materiality`
- `created_at`

`claim_type` 包括：

- `CONCLUSION`
- `LEGAL_RULE`
- `APPLICATION`
- `DEFINITION`
- `DATE_OR_STATUS`
- `RATE_OR_THRESHOLD`
- `PROCEDURAL_STEP`
- `LIMITATION`

`support_status` 包括：

- `DIRECTLY_SUPPORTED`
- `SUPPORTED_BY_INFERENCE`
- `CONDITIONAL`
- `CONTRADICTED`
- `NOT_SUPPORTED`

不向用户显示虚假的“87% confidence”。系统展示的是证据状态和限制。

### 20. `ClaimCitation`

一个 claim 可以有多个 citation，一个 citation 也可以支持多个 claims。

主要字段：

- `citation_id`
- `claim_id`
- `document_version_id`
- `node_version_id`
- `start_offset`
- `end_offset`
- `pinpoint_label`
- `quoted_text`
- `quoted_text_hash`
- `citation_role`
- `authority_level`
- `verified_at`

`citation_role`：

- `SUPPORTS`
- `QUALIFIES`
- `CONTRADICTS`
- `DEFINES`
- `BACKGROUND_ONLY`

`BACKGROUND_ONLY` 的材料不能单独支撑确定性法律结论。

### 21. `AnswerAssumption`

所有影响答案的假设必须结构化保存：

- `assumption_id`
- `answer_snapshot_id`
- `assumption_text`
- `assumption_source`
- `confirmation_status`
- `materiality`
- `impact_if_false`

例如：

&gt; Assumption: the employee is covered by the national workplace relations system.  
&gt; Impact if false: state industrial relations legislation may apply instead.

假设来源区分：

- 用户明确提供；
- 根据其他事实推导；
- 为了给出条件性答案而暂时采用。

模型不得把推导出来的事实伪装成用户陈述。

### 强制规则

- 每个 material legal or factual claim 必须至少有一个有效 citation，或者明确标为 assumption/inference。
- Citation 必须指向 `NodeVersion` 和精确位置，不能只链接首页或 SearchChunk。
- 来源之间存在冲突时，反方 citation 也必须保留。
- 引用文本必须与保存的 source snapshot 哈希匹配。
- 删除或重新生成 SearchChunk 不影响 citation。
- Answer Snapshot 发布前执行 citation coverage validator。
- 未通过验证的答案不能显示为 `SUPPORTED`。

最终结构为：

```text
AnswerSnapshot
  ├── AnswerClaims
  │     └── ClaimCitations
  └── AnswerAssumptions
```

你接受这种 claim-level evidence model 吗？
</pre>

## 182 | User | 2026-08-02T07:26:11.604Z

<pre>
接受
</pre>

## 183 | Assistant | 2026-08-02T07:26:11.604Z

<pre>
接受，claim-level evidence model 冻结。

接下来记录系统“为什么找到了这些材料、用了哪个模型以及花了多少钱”。

### 22. `RetrievalRun`

每次 Search 或 Ask 都产生检索记录：

- `retrieval_run_id`
- `organization_id`
- `actor_id`
- `corpus_release_id`
- `query_text`
- `query_type`
- `legal_as_at`
- `jurisdiction_filters`
- `document_type_filters`
- `retrieval_pipeline_version`
- `started_at`
- `completed_at`
- `status`
- `latency_ms`

### 23. `RetrievalCandidate`

记录候选材料及其排名过程：

- `retrieval_run_id`
- `chunk_id`
- `node_version_id`
- `lexical_rank`
- `lexical_score`
- `semantic_rank`
- `semantic_score`
- `rerank_position`
- `rerank_score`
- `selected_for_context`
- `used_as_citation`
- `exclusion_reason`

这样可以分析：

- 正确文档根本没被召回；
- 被召回但 reranker 排错；
- 已进入上下文但模型没有引用；
- 因日期或 jurisdiction 过滤而被排除。

这对 600 条评测和问题修复非常重要。

### 24. `ModelExecution`

记录一次模型调用，但不保存模型的隐藏推理内容：

- `model_execution_id`
- `organization_id`
- `retrieval_run_id`
- `provider`
- `model`
- `model_version`
- `prompt_template_version`
- `input_hash`
- `structured_output`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `retention_mode`
- `started_at`
- `completed_at`
- `status`
- `failure_code`

原则：

- 保存最终结构化输出、claim/citation 映射和必要的审计信息；
- 不要求或保存 hidden chain-of-thought；
- 不把客户查询发送给未批准或会用于训练的 provider；
- prompt 内容只能使用已经通过 PII 检查的场景；
- 模型调用失败不能留下半成品 `SUPPORTED` 答案。

### 25. `UsageLedger`

成本不能只依赖供应商账单：

- `usage_event_id`
- `organization_id`
- `actor_id`
- `operation_type`
- `provider`
- `units`
- `estimated_cost`
- `charged_credits`
- `created_at`

系统在调用前预留预算，完成后按实际使用结算；失败或取消则释放预留额度。这能避免多个并发请求一起突破 A$12 的 LLM 月度预算。

你接受 `RetrievalRun + ModelExecution + UsageLedger` 这组可观测性和成本数据模型吗？
</pre>

## 184 | User | 2026-08-02T07:26:11.604Z

<pre>
接受
</pre>

## 185 | Assistant | 2026-08-02T07:26:11.604Z

<pre>
接受，检索、模型执行和成本账本冻结。

下一组是 **复核、评论、问题报告和修正**。这些记录不能只塞进 Research Record 的一个状态字段里，否则无法审计是谁在什么时候做了什么。

### 26. `ReviewAction`

记录工作流中的每次状态变化：

- `review_action_id`
- `research_record_id`
- `answer_snapshot_id`
- `actor_id`
- `action_type`
- `from_status`
- `to_status`
- `comment`
- `created_at`

例如：

- `SUBMITTED_FOR_REVIEW`
- `ASSIGNED`
- `RETURNED_TO_DRAFT`
- `CUSTOMER_APPROVED`
- `MARKED_REVIEW_REQUIRED`
- `ARCHIVED`

### 27. `Comment`

评论可以锚定不同层级：

- 整个 Research Record；
- 某个 Answer Snapshot；
- 某个 claim；
- 某条 citation。

主要字段：

- `comment_id`
- `organization_id`
- `target_type`
- `target_id`
- `author_id`
- `content`
- `created_at`
- `resolved_at`
- `resolved_by`

支持 mentions，但邮件通知中不包含完整法律场景正文。

### 28. `IssueReport`

用户可以针对答案、claim、citation 或 source 报告问题：

- `issue_report_id`
- `organization_id`
- `reported_by`
- `target_type`
- `target_id`
- `issue_type`
- `severity`
- `description`
- `status`
- `created_at`
- `resolved_at`

`issue_type` 包括：

- `INCORRECT_CITATION`
- `OUTDATED_SOURCE`
- `WRONG_JURISDICTION`
- `WRONG_EFFECTIVE_DATE`
- `UNSUPPORTED_CLAIM`
- `MISSING_AUTHORITY`
- `PII_OR_PRIVACY`
- `OTHER`

处理状态：

- `OPEN`
- `TRIAGED`
- `UNDER_REVIEW`
- `FIX_IN_PROGRESS`
- `RESOLVED`
- `REJECTED`

### 29. `Correction`

确认存在错误后建立修正记录：

- `correction_id`
- `issue_report_id`
- `affected_answer_snapshot_id`
- `replacement_answer_snapshot_id`
- `root_cause`
- `correction_summary`
- `affected_scope`
- `customer_notification_required`
- `published_at`

修正不会覆盖旧答案，而是：

```text
Original Answer
  → marked REVIEW_REQUIRED
  → Correction
  → Replacement Answer
```

如果问题来自某个错误的 `NodeVersion`、parser 或 source status，系统还要查找所有引用同一对象的 Answer Snapshots，形成受影响列表。

所有复核和修正动作同时写入不可变 audit log。

你接受这组 `ReviewAction + Comment + IssueReport + Correction` 模型吗？
</pre>

## 186 | User | 2026-08-02T07:26:11.604Z

<pre>
接受
</pre>

## 187 | Assistant | 2026-08-02T07:26:11.604Z

<pre>
接受，复核、问题报告和修正模型冻结。

下一组是 **Monitor、watchlist 和变更通知**。

### 30. `Watchlist`

代表组织订阅的一组监控规则：

- `watchlist_id`
- `organization_id`
- `name`
- `created_by`
- `status`
- `notification_channels`
- `created_at`

### 31. `WatchTarget`

一个 watchlist 可以监控多种对象：

- 指定 Act、award 或 agreement；
- 指定 section、clause 或 classification；
- 指定 employer/ABN；
- 指定 jurisdiction 和 topic；
- 指定 saved search；
- 指定 Research Record 所引用的全部 authorities。

主要字段：

- `watch_target_id`
- `watchlist_id`
- `target_type`
- `target_id`
- `query_definition`
- `change_types`
- `minimum_significance`

### 32. `DetectedChange`

系统发现的变化必须结构化，而不是简单发送“页面发生变化”：

- `detected_change_id`
- `source_artifact_before_id`
- `source_artifact_after_id`
- `document_id`
- `node_id`
- `change_type`
- `effective_from`
- `detected_at`
- `significance`
- `change_summary`
- `verification_status`

变化类型包括：

- `TEXT_AMENDED`
- `COMMENCEMENT_CHANGED`
- `STATUS_CHANGED`
- `RATE_CHANGED`
- `DOCUMENT_REPLACED`
- `AGREEMENT_VARIED`
- `DECISION_APPEALED`
- `GUIDANCE_UPDATED`
- `SOURCE_REMOVED`
- `FRESHNESS_DEGRADED`

### 33. `Alert`

将一次变化与受影响客户对象连接：

- `alert_id`
- `detected_change_id`
- `organization_id`
- `watchlist_id`
- `affected_research_record_id`
- `impact_status`
- `created_at`
- `acknowledged_at`

如果变化影响某个旧答案引用的 node，相关 Research Record 自动进入 `REVIEW_REQUIRED`。

### 34. `AlertDelivery`

每个通知渠道独立记录：

- `alert_delivery_id`
- `alert_id`
- `channel`
- `destination`
- `status`
- `attempt_count`
- `last_attempt_at`
- `delivered_at`

渠道包括：

- `IN_APP`
- `EMAIL`
- `WEBHOOK`

Webhook 必须签名、重试且具有幂等 ID；邮件不包含完整客户问题，只发送变更摘要和登录链接。

关键原则：

&gt; 页面 HTML 变化不等于法律变化；只有经过解析、对比和状态判断的 `DetectedChange` 才能触发正式法律提醒。

你接受 `Watchlist + DetectedChange + Alert + AlertDelivery` 模型吗？
</pre>

## 188 | User | 2026-08-02T07:26:11.605Z

<pre>
接受
</pre>

## 189 | Assistant | 2026-08-02T07:26:11.605Z

<pre>
接受，监控和通知模型冻结。

下一组是此前已经确定、但还没有落到数据结构上的 **licensing registry**。因为我们要处理大量不同政府机构和法院来源，不能只在代码里写几个例外判断。

### 35. `LicenceSnapshot`

保存某个来源在某个时间点公开的版权或使用条款：

- `licence_snapshot_id`
- `authority_name`
- `terms_title`
- `terms_url`
- `retrieved_at`
- `terms_text_hash`
- `raw_artifact_id`
- `licence_type`
- `supersedes_snapshot_id`

条款页面发生变化时创建新版本，旧版本不覆盖。

### 36. `LicenceAssessment`

记录系统对该条款允许用途的保守判断：

- `licence_assessment_id`
- `licence_snapshot_id`
- `source_id`
- `assessment_status`
- `commercial_use`
- `full_text_storage`
- `search_indexing`
- `embedding`
- `display_full_text`
- `limited_quotation`
- `customer_export`
- `required_attribution`
- `prohibited_uses`
- `assessed_at`
- `review_due_at`
- `notes`

状态包括：

- `PERMITTED`
- `PERMITTED_WITH_ATTRIBUTION`
- `METADATA_AND_LINK_ONLY`
- `UNCLEAR_RESTRICTED`
- `PROHIBITED`
- `REVIEW_REQUIRED`

### 使用策略

系统根据 assessment 决定内容进入哪种模式：

| 许可结果 | 产品行为 |
|---|---|
| 明确允许 | 保存、索引、embedding、合理展示和引用 |
| 允许但要求署名 | 同上，并强制显示 attribution |
| 权限不明确 | 只保存必要元数据、有限引用和官方链接 |
| 明确禁止 | 不保存受保护正文，不生成 embedding |
| 条款发生变化 | 暂停新内容发布并重新评估 |

其他规则：

- 每个 `SourceArtifact` 必须关联采集当时的 `LicenceSnapshot`。
- Citation 和 export 根据许可规则限制可显示的原文长度。
- 第三方 headnotes、commercial case summaries、logos 和 coats of arms 单独处理，不能因为判决本身公开就一并复制。
- 任何 attribution 必须引用来源，但不能暗示政府背书。
- 条款不清楚时默认采用更严格模式。
- 后续取得更明确许可后，可以重新处理原文，不必改变 `LegalDocument` 身份。

这个 registry 是产品内部的风险控制记录，不声称构成律师提供的版权意见。

你接受 `LicenceSnapshot + LicenceAssessment` 及默认保守使用策略吗？
</pre>

## 190 | User | 2026-08-02T07:26:11.605Z

<pre>
接受
</pre>

## 191 | Assistant | 2026-08-02T07:26:11.605Z

<pre>
接受，licensing registry 和保守使用策略冻结。

法律语料模型最后还需要单独设计 **600 条 synthetic evaluation dataset**，不能把测试问题散落在代码文件中。

### 37. `EvaluationCase`

每条评测案例包含：

- `evaluation_case_id`
- `dataset_version`
- `split`
- `scenario`
- `question`
- `legal_as_at`
- `jurisdictions`
- `topics`
- `difficulty`
- `expected_answer_status`
- `expected_short_answer`
- `required_facts`
- `prohibited_assumptions`
- `trap_types`
- `created_at`
- `review_status`

数据集划分保持：

- 360 条 development；
- 120 条 validation；
- 120 条 blind test。

blind test 默认不进入开发 agent 的普通上下文。

### 38. `GoldAuthority`

每条 case 对应一个或多个权威依据：

- `evaluation_case_id`
- `document_version_id`
- `node_version_id`
- `citation_role`
- `required_or_optional`
- `gold_excerpt_hash`

评测答案必须引用正确版本和具体条款，而不是只命中正确文档。

### 39. `ExpectedClaim`

保存答案中必须出现或禁止出现的 claims：

- `expected_claim_id`
- `evaluation_case_id`
- `claim_type`
- `claim_pattern`
- `expectation`
- `materiality`

`expectation`：

- `REQUIRED`
- `OPTIONAL`
- `PROHIBITED`
- `MUST_BE_CONDITIONAL`

### 40. `EvaluationRun`

记录一次完整或部分评测：

- `evaluation_run_id`
- `dataset_version`
- `corpus_release_id`
- `retrieval_pipeline_version`
- `prompt_template_version`
- `model_version`
- `started_at`
- `completed_at`
- `run_environment`
- `status`

### 41. `EvaluationResult`

每条 case 保存：

- retrieval recall；
- citation precision；
- citation coverage；
- jurisdiction correctness；
- temporal correctness；
- answer-status correctness；
- refusal correctness；
- unsupported-claim count；
- latency；
- estimated cost；
- failure classification。

### 测试案例分层

600 条按范围分配，而不是平均随机抽样：

- federal employment law；
- modern awards 和 classification；
- enterprise agreements；
- 八州和领地 legislation；
- payroll tax、PAYG、STP、super、FBT；
- WHS/OHS、workers compensation；
- discrimination、privacy、surveillance；
- case law 和 authority hierarchy；
- bills、future commencement 和历史时点；
- insufficient evidence、conflicting sources、PII 和恶意规避；
- API、search、compare 和 monitor 行为。

所有 scenario 均为 synthetic，但必须从已保存的官方 source nodes 推导，并保留 gold provenance。客户查询默认不能自动转成评测案例。

你接受这套 evaluation data model 吗？
</pre>

## 192 | User | 2026-08-02T07:26:11.605Z

<pre>
接受
</pre>

## 193 | Assistant | 2026-08-02T07:26:11.605Z

<pre>
接受，600 条评测数据模型冻结。至此 canonical data model 已经足够完整，可以进入 API 设计。

先确定 API 的总体契约。

### API 形式

MVP 使用版本化 REST API：

```text
https://api.australiaemploymentrag.com/v1/
```

第一版不同时维护 GraphQL，减少开发和安全测试面积。TypeScript/Python SDK 都封装同一套 REST API。

### 基本规则

- 所有请求使用 HTTPS 和 JSON。
- API key 只属于一个 organization 和 service account。
- `organization_id` 从认证上下文取得，客户端不能通过请求正文切换租户。
- 人类用户跨组织切换使用短期 workspace session，不复用 service account key。
- 所有时间使用 ISO 8601 UTC；法律查询日期单独使用澳洲本地日期。
- 所有列表采用 cursor pagination，不使用不稳定的 page number。
- 所有响应包含 `request_id`。
- 所有可能重试的写请求支持 `Idempotency-Key`。
- 稳定 ID 不暴露数据库自增序号。
- API 返回的法律对象包含官方 identifier，但内部主键仍使用不可猜测 ID。
- 批量接口有明确数量、大小和成本限制。

### 同步与异步

同步完成：

- lexical/field/citation search；
- document、version、node 获取；
- Research Record 读取；
- health 和 usage 查询。

异步 job：

- Quick Answer；
- Deep Research；
- Compare；
- 大型 export；
- 批量 API 请求；
- watchlist backfill。

回答通过 Server-Sent Events 流式返回；SDK 同时提供等待最终结果的方法。

### 错误结构

所有错误统一为：

```json
{
  &quot;error&quot;: {
    &quot;code&quot;: &quot;INSUFFICIENT_EVIDENCE&quot;,
    &quot;message&quot;: &quot;The available sources do not support a reliable answer.&quot;,
    &quot;request_id&quot;: &quot;req_...&quot;,
    &quot;details&quot;: {},
    &quot;retryable&quot;: false
  }
}
```

HTTP 状态与产品状态分开：

- HTTP `200` 可以包含合法的 `INSUFFICIENT_EVIDENCE` 答案；
- `400` 表示请求格式错误；
- `401/403` 表示认证或权限问题；
- `409` 表示版本或幂等冲突；
- `422` 表示 PII、无效日期或不支持的查询范围；
- `429` 表示速率或额度耗尽；
- `503` 表示来源或系统暂不可用。

### 兼容性原则

`/v1` 内允许新增可选字段，但不删除或改变既有字段含义。破坏性变更进入 `/v2`。Webhook payload 同样带独立 schema version。

你接受这套 REST、版本、认证、异步任务和错误处理基础契约吗？
</pre>

## 194 | User | 2026-08-02T07:26:11.606Z

<pre>
接受
</pre>

## 195 | Assistant | 2026-08-02T07:26:11.606Z

<pre>
接受，API 基础契约冻结。

先设计最基础且必须始终可用的 **Search API**。

### `POST /v1/search`

使用 POST 是因为高级过滤条件可能复杂，但该接口仍是只读、可安全重试的。

请求示例：

```json
{
  &quot;query&quot;: &quot;\&quot;ordinary hours\&quot; AND overtime&quot;,
  &quot;mode&quot;: &quot;ADVANCED&quot;,
  &quot;legal_as_at&quot;: &quot;2026-07-01&quot;,
  &quot;filters&quot;: {
    &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;, &quot;NSW&quot;],
    &quot;document_types&quot;: [&quot;ACT&quot;, &quot;AWARD&quot;, &quot;DECISION&quot;],
    &quot;legal_statuses&quot;: [&quot;IN_FORCE&quot;],
    &quot;authorities&quot;: [&quot;FWC&quot;],
    &quot;employer_abn&quot;: null,
    &quot;date_from&quot;: null,
    &quot;date_to&quot;: null
  },
  &quot;sort&quot;: &quot;RELEVANCE&quot;,
  &quot;limit&quot;: 20,
  &quot;cursor&quot;: null
}
```

`mode`：

- `SIMPLE`：自然语言和普通关键词；
- `ADVANCED`：Boolean、exact phrase、citation、section、clause、case number、ABN 和字段过滤。

### 返回结果

```json
{
  &quot;request_id&quot;: &quot;req_...&quot;,
  &quot;legal_as_at&quot;: &quot;2026-07-01&quot;,
  &quot;corpus_release_id&quot;: &quot;corpus_...&quot;,
  &quot;results&quot;: [
    {
      &quot;document_id&quot;: &quot;doc_...&quot;,
      &quot;document_version_id&quot;: &quot;ver_...&quot;,
      &quot;node_version_id&quot;: &quot;nodev_...&quot;,
      &quot;document_type&quot;: &quot;AWARD&quot;,
      &quot;title&quot;: &quot;Clerks—Private Sector Award 2020&quot;,
      &quot;pinpoint&quot;: &quot;cl 13.2&quot;,
      &quot;snippet&quot;: &quot;...&quot;,
      &quot;jurisdiction&quot;: &quot;COMMONWEALTH&quot;,
      &quot;legal_status&quot;: &quot;IN_FORCE&quot;,
      &quot;effective_from&quot;: &quot;2025-07-01&quot;,
      &quot;effective_to&quot;: null,
      &quot;authority_level&quot;: &quot;OPERATIVE_INSTRUMENT&quot;,
      &quot;official_url&quot;: &quot;https://...&quot;,
      &quot;source_last_checked_at&quot;: &quot;2026-08-02T01:00:00Z&quot;
    }
  ],
  &quot;next_cursor&quot;: &quot;cur_...&quot;,
  &quot;warnings&quot;: []
}
```

### Search 行为规则

- 默认只搜索 `legal_as_at` 当天适用的版本。
- 未提供日期时，使用请求时的当前澳洲日期，并在响应中明确返回。
- proposed、future、repealed 和 superseded 材料默认不混入结果；用户必须主动选择。
- 当前法律与 future/proposed results 分组显示。
- Search 不调用生成式模型，因此不消耗 research credits。
- 可以使用 lexical、citation 和已有 semantic index，但不执行付费 Deep Research。
- 搜索结果 snippet 必须来自真实 `NodeVersion`，不能由模型改写。
- 许可不允许全文展示时，只返回合规长度的 snippet、元数据和官方链接。
- 来源新鲜度异常时仍返回结果，但在 `warnings` 中显示 `FRESHNESS_DEGRADED`。
- 不返回不适用于目标日期的版本，除非用户明确要求历史或比较模式。
- `sort` 支持 `RELEVANCE`、`AUTHORITY`、`DATE_DESC` 和 `DATE_ASC`。

### 防止“搜索到了但用户理解错”

每个结果必须同时显示：

- 法律状态；
- 适用日期；
- jurisdiction；
- authority 类型；
- 是否属于 future/proposed law；
- 来源最后检查时间。

你接受这套 Search API 契约吗？
</pre>

## 196 | User | 2026-08-02T07:26:11.606Z

<pre>
接受
</pre>

## 197 | Assistant | 2026-08-02T07:26:11.606Z

<pre>
接受，Search API 冻结。

下一组是 **Document、Version、Node 和 Timeline API**，用于打开搜索结果并查看法律原文。

### 获取法律文件

```http
GET /v1/documents/{document_id}
```

返回稳定身份、文档类型、jurisdiction、官方编号、canonical URL 和当前状态，不默认返回全部正文。

### 获取指定日期版本

```http
GET /v1/documents/{document_id}/versions?legal_as_at=2026-07-01
```

默认返回该日期适用的版本，也可以显式请求：

```http
GET /v1/documents/{document_id}/versions?include=historical,future
```

### 获取结构目录

```http
GET /v1/document-versions/{version_id}/nodes
```

支持：

- `parent_node_id`
- `node_type`
- `depth`
- `cursor`
- `limit`

用于加载 Act、award 或判决的目录树，不一次返回整份超大文档。

### 获取具体原文节点

```http
GET /v1/node-versions/{node_version_id}
```

返回：

- heading 和正文；
- section/clause/paragraph pinpoint；
- parent path；
- effective dates；
- legal status；
- official URL；
- attribution；
- permitted display mode；
- source snapshot 信息；
- 前后节点导航。

如果许可不允许全文展示，响应为：

```json
{
  &quot;display_mode&quot;: &quot;LIMITED_QUOTATION_AND_LINK&quot;,
  &quot;snippet&quot;: &quot;...&quot;,
  &quot;official_url&quot;: &quot;https://...&quot;
}
```

### 查看历史时间线

```http
GET /v1/documents/{document_id}/timeline
GET /v1/nodes/{node_id}/timeline
```

返回相关 `LegalEvent`：

- commencement；
- amendment；
- repeal；
- agreement variation/replacement/termination；
- appeal/correction；
- guidance update。

### 查看关系

```http
GET /v1/documents/{document_id}/relations
GET /v1/nodes/{node_id}/relations
```

可按关系类型过滤：

```text
CITES
INTERPRETS
AMENDS
REPLACES
APPLIES
DISTINGUISHES
APPEALED_BY
```

### 稳定引用链接

每个 node 返回稳定产品链接：

```text
/app/authorities/{document_id}?version={version_id}&amp;node={node_version_id}
```

旧 Answer Snapshot 始终链接到原版本；打开时可以提示存在更新版本，但不会自动跳转并替换原文。

### 权限

公共法律资料允许所有已认证用户读取，但：

- licence policy 决定可展示的正文长度；
- 内部 ingestion、licence notes 和未发布版本不对客户公开；
- `QUARANTINED_QUALITY` 内容只能由内部管理员查看。

你接受这组 Document/Version/Node/Timeline API 吗？
</pre>

## 198 | User | 2026-08-02T07:26:11.606Z

<pre>
接受
</pre>

## 199 | Assistant | 2026-08-02T07:26:11.606Z

<pre>
接受，法律文件读取与时间线 API 冻结。

下一组是核心的 **Ask API**。Quick Answer 和 Deep Research 使用同一结构，但执行深度、额度和完成方式不同。

### 创建回答

```http
POST /v1/answers
Idempotency-Key: ...
```

请求示例：

```json
{
  &quot;mode&quot;: &quot;QUICK&quot;,
  &quot;question&quot;: &quot;Is this employee likely covered by the Clerks Award?&quot;,
  &quot;facts&quot;: {
    &quot;employer_industry&quot;: &quot;Payroll software&quot;,
    &quot;principal_duties&quot;: [
      &quot;Processing payroll&quot;,
      &quot;Maintaining employee records&quot;
    ],
    &quot;work_location&quot;: &quot;NSW&quot;
  },
  &quot;legal_as_at&quot;: &quot;2026-07-01&quot;,
  &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;, &quot;NSW&quot;],
  &quot;include_future_law&quot;: false,
  &quot;research_record_id&quot;: null,
  &quot;retention_mode&quot;: &quot;SAVE&quot;
}
```

`mode`：

- `QUICK`：有限检索和一次主要回答流程；
- `DEEP`：拆分子问题、多轮检索、来源冲突检查和更完整的 research record。

### 提交前处理

API 按顺序执行：

1. authentication 和权限；
2. PII 检测；
3. 日期、jurisdiction 和范围验证；
4. 额度预留；
5. 创建异步 job；
6. 开始检索。

如果缺少决定性事实，可以返回：

```json
{
  &quot;status&quot;: &quot;NEEDS_CLARIFICATION&quot;,
  &quot;questions&quot;: [
    {
      &quot;field&quot;: &quot;principal_duties&quot;,
      &quot;question&quot;: &quot;What are the employee&#39;s principal duties?&quot;
    }
  ]
}
```

这时不应浪费完整回答额度。

### 异步结果

创建成功返回：

```json
{
  &quot;answer_job_id&quot;: &quot;job_...&quot;,
  &quot;status&quot;: &quot;QUEUED&quot;,
  &quot;stream_url&quot;: &quot;/v1/answer-jobs/job_.../events&quot;
}
```

查询状态：

```http
GET /v1/answer-jobs/{answer_job_id}
```

取消：

```http
POST /v1/answer-jobs/{answer_job_id}/cancel
```

### 流式事件

SSE 只发送安全的进度与结果，不发送隐藏推理：

- `job.started`
- `retrieval.completed`
- `clarification.required`
- `answer.section`
- `citation.added`
- `job.completed`
- `job.failed`

### 最终回答

```json
{
  &quot;answer_snapshot_id&quot;: &quot;ans_...&quot;,
  &quot;status&quot;: &quot;CONDITIONAL&quot;,
  &quot;short_answer&quot;: &quot;...&quot;,
  &quot;claims&quot;: [
    {
      &quot;claim_id&quot;: &quot;claim_...&quot;,
      &quot;type&quot;: &quot;LEGAL_RULE&quot;,
      &quot;text&quot;: &quot;...&quot;,
      &quot;support_status&quot;: &quot;DIRECTLY_SUPPORTED&quot;,
      &quot;citations&quot;: []
    }
  ],
  &quot;assumptions&quot;: [],
  &quot;limitations&quot;: [],
  &quot;warnings&quot;: [],
  &quot;legal_as_at&quot;: &quot;2026-07-01&quot;,
  &quot;source_freshness&quot;: &quot;CURRENT&quot;
}
```

### 保存策略

- Web workspace 默认 `SAVE`，形成 Research Record 和 Answer Snapshot。
- API/widget 可以选择 `EPHEMERAL`。
- `EPHEMERAL` 不创建可长期访问的 Research Record，完成响应后按短期技术窗口清除问题和答案正文。
- 即使 ephemeral，也保留不含正文的 usage、latency、status 和 cost metadata。
- 需要导出、复核、重新运行或变更提醒时，必须使用 `SAVE`。

### 强制行为

- `SUPPORTED` 必须通过 claim-level citation validator。
- `INSUFFICIENT_EVIDENCE` 是正常产品结果，不是 HTTP 错误。
- 额度耗尽返回 `429 BUDGET_EXHAUSTED`，搜索仍可使用。
- 来源状态不可靠时返回 `SOURCE_NOT_CURRENT`，不能偷偷使用模型常识补足。
- 用户取消任务后释放未实际消耗的额度。
- 同一 Idempotency-Key 不得重复收费或重复创建答案。

你接受这套 Quick/Deep 共用的异步 Ask API，以及 `SAVE`/`EPHEMERAL` 两种保留模式吗？
</pre>

## 200 | User | 2026-08-02T07:26:11.607Z

<pre>
接受
</pre>

## 201 | Assistant | 2026-08-02T07:26:11.607Z

<pre>
接受，Ask API 和保存策略冻结。

下一组是 **Compare API**。它不能只是把两段文字做 diff，而要比较在不同日期、jurisdiction 或 authority 下法律结论为什么不同。

### 创建比较任务

```http
POST /v1/comparisons
Idempotency-Key: ...
```

请求示例：

```json
{
  &quot;question&quot;: &quot;When must final pay be made after termination?&quot;,
  &quot;facts&quot;: {
    &quot;employee_type&quot;: &quot;Permanent employee&quot;
  },
  &quot;dimensions&quot;: [
    {
      &quot;label&quot;: &quot;NSW&quot;,
      &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;, &quot;NSW&quot;],
      &quot;legal_as_at&quot;: &quot;2026-08-02&quot;
    },
    {
      &quot;label&quot;: &quot;VIC&quot;,
      &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;, &quot;VIC&quot;],
      &quot;legal_as_at&quot;: &quot;2026-08-02&quot;
    }
  ],
  &quot;research_record_id&quot;: null,
  &quot;retention_mode&quot;: &quot;SAVE&quot;
}
```

支持三类比较：

- `JURISDICTION`：例如 NSW 与 Victoria；
- `TIME`：例如 2024–25 与 2026–27；
- `AUTHORITY_OR_INSTRUMENT`：例如 award 与 enterprise agreement、旧条款与新条款。

### 返回结构

```json
{
  &quot;comparison_job_id&quot;: &quot;cmpjob_...&quot;,
  &quot;status&quot;: &quot;QUEUED&quot;
}
```

最终结果：

```json
{
  &quot;comparison_id&quot;: &quot;cmp_...&quot;,
  &quot;status&quot;: &quot;CONDITIONAL&quot;,
  &quot;common_rules&quot;: [],
  &quot;differences&quot;: [
    {
      &quot;topic&quot;: &quot;Timing of final payment&quot;,
      &quot;dimensions&quot;: [
        {
          &quot;label&quot;: &quot;NSW&quot;,
          &quot;conclusion&quot;: &quot;...&quot;,
          &quot;claims&quot;: [],
          &quot;citations&quot;: []
        },
        {
          &quot;label&quot;: &quot;VIC&quot;,
          &quot;conclusion&quot;: &quot;...&quot;,
          &quot;claims&quot;: [],
          &quot;citations&quot;: []
        }
      ],
      &quot;reason_for_difference&quot;: &quot;...&quot;
    }
  ],
  &quot;assumptions&quot;: [],
  &quot;unresolved_conflicts&quot;: [],
  &quot;warnings&quot;: []
}
```

### 比较规则

- 每个 comparison dimension 独立执行日期和 jurisdiction 过滤。
- 每一列都必须有自己的 claim-level citations。
- 不允许把 Commonwealth、state legislation、award 和 agreement 混成一个模糊答案。
- 某一列证据不足时，只把该列标记为 `INSUFFICIENT_EVIDENCE`，不伪造对称结果。
- 时间比较必须说明差异来自 amendment、commencement、repeal 还是来源更新。
- 纯文字变化与实际法律效果变化分开显示。
- enterprise agreement 比较必须考虑 replacement、variation 和 nominal expiry。
- 比较八个州和领地时自动使用 Deep 模式，避免一次上下文过大。
- Compare 消耗 research credits，并在执行前显示或返回最大预计消耗。
- 保存后成为 Research Record 中的一种不可变 `ComparisonSnapshot`。

你接受这种基于法律结论和依据、而不是简单文本 diff 的 Compare API 吗？
</pre>

## 202 | User | 2026-08-02T07:26:11.607Z

<pre>
接受
</pre>

## 203 | Assistant | 2026-08-02T07:26:11.607Z

<pre>
接受，Compare API 冻结。

下一组是已经确定为核心功能的 **Coverage Navigator API**。

### 创建 coverage assessment

```http
POST /v1/coverage-assessments
Idempotency-Key: ...
```

请求示例：

```json
{
  &quot;legal_as_at&quot;: &quot;2026-08-02&quot;,
  &quot;employer&quot;: {
    &quot;name&quot;: &quot;Example Payroll Pty Ltd&quot;,
    &quot;abn&quot;: &quot;00000000000&quot;,
    &quot;industry&quot;: &quot;Payroll software&quot;
  },
  &quot;role&quot;: {
    &quot;job_title&quot;: &quot;Payroll Administrator&quot;,
    &quot;principal_duties&quot;: [
      &quot;Processes customer payroll&quot;,
      &quot;Maintains payroll records&quot;,
      &quot;Responds to payroll queries&quot;
    ],
    &quot;qualifications&quot;: [],
    &quot;supervisory_responsibility&quot;: false
  },
  &quot;work_location&quot;: &quot;NSW&quot;,
  &quot;employment_context&quot;: {
    &quot;public_sector&quot;: false,
    &quot;enterprise_agreement_known&quot;: null
  },
  &quot;retention_mode&quot;: &quot;SAVE&quot;
}
```

不得提交员工姓名、工资单或其他个人资料。

### 判断顺序

Coverage Navigator 强制按以下顺序执行：

1. 判断可能适用的 workplace relations system；
2. 搜索 employer/ABN 相关 enterprise agreements；
3. 检查 agreement 的 approval、variation、replacement、termination 和 coverage；
4. 没有适用 agreement 时检索 modern award candidates；
5. 检查 industry、occupational coverage 和 exclusions；
6. 根据实际 duties 寻找 classification candidates；
7. 列出仍需确认的决定性事实。

模型不能跳过 enterprise agreement，直接选择一个看起来相似的 award。

### 返回结果

```json
{
  &quot;coverage_assessment_id&quot;: &quot;cov_...&quot;,
  &quot;status&quot;: &quot;CONDITIONAL&quot;,
  &quot;workplace_system&quot;: {
    &quot;result&quot;: &quot;NATIONAL_SYSTEM_LIKELY&quot;,
    &quot;claims&quot;: [],
    &quot;citations&quot;: []
  },
  &quot;agreement_candidates&quot;: [],
  &quot;award_candidates&quot;: [
    {
      &quot;document_id&quot;: &quot;doc_...&quot;,
      &quot;title&quot;: &quot;Clerks—Private Sector Award 2020&quot;,
      &quot;rank&quot;: 1,
      &quot;evidence_status&quot;: &quot;POSSIBLE&quot;,
      &quot;matching_factors&quot;: [],
      &quot;excluding_factors&quot;: [],
      &quot;classification_candidates&quot;: [
        {
          &quot;classification&quot;: &quot;Level 2&quot;,
          &quot;evidence_status&quot;: &quot;POSSIBLE&quot;,
          &quot;matching_duties&quot;: [],
          &quot;missing_facts&quot;: [],
          &quot;citations&quot;: []
        }
      ]
    }
  ],
  &quot;required_clarifications&quot;: [],
  &quot;limitations&quot;: []
}
```

### 结果状态

不返回虚假的百分比概率，而采用：

- `CONFIRMED_FROM_STATED_FACTS`
- `LIKELY`
- `POSSIBLE`
- `UNLIKELY`
- `EXCLUDED`
- `INSUFFICIENT_EVIDENCE`

`CONFIRMED_FROM_STATED_FACTS` 仍然只是基于用户提供事实的系统结论，不代表律师认证。

### 强制边界

- 职位名称本身不足以确定 classification。
- employer name 模糊或 ABN 不确定时必须显示候选企业。
- agreement 达到 nominal expiry 不自动排除。
- 同时可能存在多个 awards 时必须全部显示并解释区分条件。
- award-free 结论必须引用 coverage/exclusion 依据。
- 不能因为找不到 agreement 就断言不存在 agreement。
- 所有 coverage 和 exclusion 结论必须有具体条款引用。
- Assessment 可以导出、复核和在法律变化后标记 `REVIEW_REQUIRED`。

你接受这套 Coverage Navigator API 吗？
</pre>

## 204 | User | 2026-08-02T07:26:11.607Z

<pre>
接受
</pre>

## 205 | Assistant | 2026-08-02T07:26:11.607Z

<pre>
接受，Coverage Navigator API 冻结。

下一组是 **Research Records 与协作 API**。

### Research Record

```http
POST   /v1/research-records
GET    /v1/research-records
GET    /v1/research-records/{record_id}
PATCH  /v1/research-records/{record_id}
DELETE /v1/research-records/{record_id}
```

列表支持按以下字段过滤：

- workflow status；
- owner/reviewer；
- topic；
- jurisdiction；
- legal-as-at date；
- updated date；
- `REVIEW_REQUIRED`；
- unresolved issues。

删除先进入 30 天可恢复期。

### Research Turns

```http
POST /v1/research-records/{record_id}/turns
GET  /v1/research-records/{record_id}/turns
```

新增事实不能修改已有 turn。需要纠正时创建一个带 `supersedes_turn_id` 的新 turn。

### Answer 版本

```http
GET  /v1/research-records/{record_id}/answers
GET  /v1/answers/{answer_snapshot_id}
POST /v1/answers/{answer_snapshot_id}/rerun
```

`rerun` 创建新 Answer Snapshot，可指定：

- current law；
- 新的 `legal_as_at`；
- 更新后的匿名事实；
- 新模型或 pipeline；
- 是否比较旧答案。

### Review workflow

```http
POST /v1/research-records/{record_id}/review-actions
```

示例：

```json
{
  &quot;action&quot;: &quot;SUBMIT_FOR_REVIEW&quot;,
  &quot;assigned_reviewer_id&quot;: &quot;usr_...&quot;,
  &quot;comment&quot;: &quot;Please verify the award coverage analysis.&quot;
}
```

API 根据当前状态和角色验证合法转换，客户端不能直接 PATCH 任意 workflow status。

### Comments

```http
POST  /v1/comments
GET   /v1/comments?target_type=CLAIM&amp;target_id=claim_...
PATCH /v1/comments/{comment_id}
POST  /v1/comments/{comment_id}/resolve
```

评论修改保留编辑时间；审计日志保留修改记录。

### 并发修改

可编辑资源返回 `ETag` 或 `version`。更新请求必须带：

```http
If-Match: &quot;version-7&quot;
```

版本不一致返回 `409 CONCURRENT_MODIFICATION`，避免两个用户互相覆盖。

### 权限

- Viewer：只读已授权分享的记录；
- Researcher：创建、编辑和提交复核；
- Reviewer 权限由 Researcher/Admin 承担；
- Admin：重新分配、恢复和查看组织审计；
- Owner：组织级导出和删除；
- Developer：默认不能读取 Research Record 正文，除非另行授予 research scope；
- Service account：严格按照 scopes 操作。

### 分享边界

MVP 只支持组织内部分享，不创建无需登录的公开链接。跨组织分享通过导出文件完成，避免租户隔离复杂化。

你接受这组 Research Records、版本重跑、review、comments 和并发控制 API 吗？
</pre>

## 206 | User | 2026-08-02T07:26:11.607Z

<pre>
接受
</pre>

## 207 | User | 2026-08-02T07:26:11.608Z

<pre>
接受还有我们问答到哪啦？ 要不要把现有的对话先存档在这个项目内，全部对话完我们一起总结？
</pre>

## 208 | Assistant | 2026-08-02T07:26:11.608Z

<pre>
我们现在已经完成了需求阶段、成本/交付约束、canonical data model，并正在逐项设计 API；刚刚冻结到 Research Records/协作 API，下一项原本是 Monitor/Webhook API。

我赞成现在先落一份阶段存档。我会保存“已确认决定 + 当前进度 + 尚未讨论项”，不修改现有 `PRD.md`；全部讨论结束后，再从这份记录生成最终英文 PRD。
</pre>

## 209 | Assistant | 2026-08-02T07:26:11.608Z

<pre>
我检查到现有 `PRD.md` 还是旧的 TaxRAG 模板，而且文件本身存在乱码；我会保持原文件不动，并新建独立的 discovery decision log。它不是最终 PRD，而是我们后续讨论的唯一阶段性依据。
</pre>

## 210 | Assistant | 2026-08-02T07:26:11.609Z

<pre>
已经存档到项目：

[Discovery Decision Log](/C:/Users/HoraceHou/project/personal/taxrag/docs/discovery/decision-log-2026-08-02.md)

当前进度：

- 需求与约束：完成
- 工期、运行成本和语料分层：完成
- Canonical data model：完成
- API 设计：进行中
- 已讨论到 Research Records、版本重跑、review、comments 和并发控制
- 下一项：Monitor、watchlist 和 webhook API
- 后续：Export、认证、SDK/widget、trade-offs、最终架构
- 最后：共同总结并生成完整英文 PRD

存档是约 21KB 的结构化决策记录，不是逐字聊天 transcript，但已覆盖目前所有实质性结论、接受项、当前进度和待讨论事项。旧的 [PRD.md](/C:/Users/HoraceHou/project/personal/taxrag/PRD.md) 没有修改；它仍是乱码且已经过时的 TaxRAG 模板。

以后每完成一个讨论模块，我会同步更新这份 decision log。全部冻结后，再据此替换旧 PRD。
</pre>

## 211 | User | 2026-08-02T07:26:11.609Z

<pre>
好的，我们继续？
</pre>

## 212 | Assistant | 2026-08-02T07:26:11.609Z

<pre>
继续。我们从中断处进入 **Monitor、watchlist 和 webhook API**。

### Watchlist 管理

```http
POST   /v1/watchlists
GET    /v1/watchlists
GET    /v1/watchlists/{watchlist_id}
PATCH  /v1/watchlists/{watchlist_id}
DELETE /v1/watchlists/{watchlist_id}
```

创建示例：

```json
{
  &quot;name&quot;: &quot;Clerks Award monitoring&quot;,
  &quot;targets&quot;: [
    {
      &quot;type&quot;: &quot;DOCUMENT&quot;,
      &quot;document_id&quot;: &quot;doc_...&quot;
    },
    {
      &quot;type&quot;: &quot;TOPIC_QUERY&quot;,
      &quot;query&quot;: &quot;overtime OR ordinary hours&quot;,
      &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;]
    }
  ],
  &quot;change_types&quot;: [
    &quot;TEXT_AMENDED&quot;,
    &quot;COMMENCEMENT_CHANGED&quot;,
    &quot;RATE_CHANGED&quot;,
    &quot;DOCUMENT_REPLACED&quot;
  ],
  &quot;minimum_significance&quot;: &quot;MATERIAL&quot;,
  &quot;channels&quot;: [&quot;IN_APP&quot;, &quot;EMAIL&quot;, &quot;WEBHOOK&quot;]
}
```

支持的 target：

- `DOCUMENT`
- `NODE`
- `EMPLOYER_OR_ABN`
- `JURISDICTION_TOPIC`
- `SAVED_SEARCH`
- `RESEARCH_RECORD_AUTHORITIES`

### Alerts

```http
GET  /v1/alerts
GET  /v1/alerts/{alert_id}
POST /v1/alerts/{alert_id}/acknowledge
POST /v1/alerts/{alert_id}/resolve
```

Alert 返回：

- 发生了什么变化；
- 旧版和新版的准确引用；
- 生效日期；
- 变化是否已经生效；
- 受影响的 Research Records；
- 是否需要重新运行答案；
- 来源新鲜度状态。

页面 HTML、导航或样式变化不产生法律 alert。

### Webhook subscriptions

```http
POST   /v1/webhook-subscriptions
GET    /v1/webhook-subscriptions
PATCH  /v1/webhook-subscriptions/{id}
DELETE /v1/webhook-subscriptions/{id}
POST   /v1/webhook-subscriptions/{id}/rotate-secret
POST   /v1/webhook-subscriptions/{id}/test
```

Webhook 事件：

- `legal_change.detected`
- `document.status_changed`
- `source.freshness_degraded`
- `research_record.review_required`
- `answer.corrected`
- `alert.resolved`

### 安全和重试

每次 delivery 包含：

```http
X-AER-Event-Id: evt_...
X-AER-Timestamp: 1785632400
X-AER-Signature: v1=...
```

- 使用 HMAC-SHA256 签名；
- 客户验证时间戳，防止重放；
- event ID 支持幂等处理；
- 失败后指数退避重试；
- 达到最大失败次数后暂停 subscription 并通知管理员；
- webhook secret 只在创建或轮换时显示一次；
- payload 默认不包含完整客户问题或答案正文；
- 接收方用认证 API 获取详细内容。

### A$50 成本保护

- 100 个 watchlists 不是运行 100 次独立爬虫。
- 官方来源只采集和对比一次，再将同一个 `DetectedChange` 分发给所有匹配 watchlists。
- 法律变更检测和结构化 diff 不依赖付费 LLM。
- AI 变化摘要只在额度允许时生成；额度不足时发送准确的结构化 diff，不生成低质量摘要。
- 大量相近变化合并为 digest，避免邮件和 webhook 风暴。
- 默认邮件 digest 每日一次；`CRITICAL` 变化可即时发送。

你接受这套 Monitor、Alerts 和 Webhook API 吗？
</pre>

## 213 | User | 2026-08-02T07:26:11.609Z

<pre>
接受
</pre>

## 214 | Assistant | 2026-08-02T07:26:11.609Z

<pre>
接受，Monitor/Alerts/Webhook API 冻结。我先把这个模块同步进 decision log，然后继续讨论 Export API 和导出文件契约。
</pre>

## 215 | Assistant | 2026-08-02T07:26:11.609Z

<pre>
下一组是 **Export API 与文件内容契约**。

### 创建导出任务

```http
POST /v1/exports
Idempotency-Key: ...
```

请求示例：

```json
{
  &quot;target_type&quot;: &quot;RESEARCH_RECORD&quot;,
  &quot;target_id&quot;: &quot;rr_...&quot;,
  &quot;format&quot;: &quot;PDF&quot;,
  &quot;options&quot;: {
    &quot;include_answer_history&quot;: false,
    &quot;include_comments&quot;: false,
    &quot;include_source_appendix&quot;: true,
    &quot;include_audit_summary&quot;: true
  }
}
```

支持导出目标：

- `RESEARCH_RECORD`
- `ANSWER_SNAPSHOT`
- `COMPARISON_SNAPSHOT`
- `COVERAGE_ASSESSMENT`
- `SEARCH_RESULTS`
- `ORGANIZATION_DATA_EXPORT`

支持格式：

- `PDF`
- `DOCX`
- `JSON`

MVP 不同时维护 HTML、CSV 等重复格式；特定列表数据可包含在 JSON 中。

### 异步任务

```http
GET  /v1/exports/{export_id}
POST /v1/exports/{export_id}/cancel
```

完成后返回短期 signed download URL：

```json
{
  &quot;export_id&quot;: &quot;exp_...&quot;,
  &quot;status&quot;: &quot;COMPLETED&quot;,
  &quot;format&quot;: &quot;PDF&quot;,
  &quot;content_hash&quot;: &quot;...&quot;,
  &quot;expires_at&quot;: &quot;2026-08-09T04:00:00Z&quot;,
  &quot;download_url&quot;: &quot;https://...&quot;
}
```

导出文件默认保存七天，然后删除；原 Answer Snapshot 继续保留，可以重新生成相同内容。

### PDF/DOCX 内容

正式 research export 包含：

1. 产品名称和导出标题；
2. Research Record ID 和版本；
3. 查询日期与 `legal_as_at`；
4. Answer status；
5. Short answer；
6. claims、assumptions 和 limitations；
7. claim-level pinpoint citations；
8. 来源状态和最后确认时间；
9. source appendix；
10. disclaimer；
11. 生成时间与文件校验哈希。

必须清楚显示：

&gt; This record reflects the source versions and corpus release identified in this document. It may not reflect later legal developments.

旧答案导出不能静默替换为当前法律。

### JSON 契约

JSON 是机器可读的完整结构化记录，包含：

- schema version；
- stable IDs；
- Answer Snapshot；
- claims/citations/assumptions；
- document、version 和 node references；
- review/correction status；
- corpus release；
- content hashes。

JSON 不包含：

- API secrets；
- hidden prompts；
- hidden model reasoning；
- 内部 licence assessment notes；
- 其他组织数据；
- 默认情况下的内部 comments。

### 版权与隐私

- source appendix 受 `LicenceAssessment` 控制；
- 不允许完整复制的来源只导出有限摘录、pinpoint 和官方链接；
- comments 默认不导出，必须显式选择且拥有权限；
- 组织级数据导出仅 Owner 可以启动，并要求重新认证；
- 导出前重新运行 PII 检查；
- signed URL 有效期短、不可被搜索引擎索引；
- 每次下载写入 audit log；
- 同一 Answer Snapshot 和相同选项应产生可验证的一致内容。

### 成本控制

- 导出在后台低优先级队列执行；
- 重复请求复用已有且仍有效的 artifact；
- 限制单次文件大小和并发数；
- 不使用生成式模型重新撰写内容；
- 导出失败不消耗 research credits。

你接受这套 PDF、DOCX、JSON Export API 和七天临时 artifact 策略吗？
</pre>

## 216 | User | 2026-08-02T07:26:11.610Z

<pre>
接受
</pre>

## 217 | Assistant | 2026-08-02T07:26:11.610Z

<pre>
接受，Export API 与文件契约冻结。我会同步存档；接下来讨论客户可见的 Usage/Audit API，以及只对内部管理员开放的 incident 和 kill-switch 边界。
</pre>

## 218 | Assistant | 2026-08-02T07:26:11.610Z

<pre>
### Usage API

客户可以查看额度，但不能看到其他组织或内部供应商密钥：

```http
GET /v1/usage/current
GET /v1/usage/events
GET /v1/usage/limits
```

返回：

- 当前计费周期；
- search、Quick、Deep、Compare、API 和 webhook 使用量；
- 已用和剩余 research credits；
- 估算 AI 成本；
- 70%、90%、100% 告警状态；
- 各 service account 的用量；
- 下次额度重置时间。

Owner/Admin 可以降低组织内部额度，但不能突破系统级 A$50 硬上限。

### Audit API

```http
GET /v1/audit-events
GET /v1/audit-events/{event_id}
```

支持按以下字段过滤：

- actor；
- action；
- resource type/ID；
- date；
- IP/security category；
- success/failure。

Audit event 记录：

- 谁执行；
- 在哪个组织；
- 对什么对象；
- 何时执行；
- 结果；
- request ID；
- 安全相关技术元数据。

不记录完整问题正文、答案正文、secret、token 或 SAML assertion。Owner/Admin 可读；普通 Researcher 只能看到与其可访问 Research Record 相关的协作历史。

### Issue API

```http
POST /v1/issues
GET  /v1/issues
GET  /v1/issues/{issue_id}
POST /v1/issues/{issue_id}/comments
```

客户可报告 citation、日期、jurisdiction、来源、PII 或 unsupported claim 问题，并查看处理状态。客户不能自行把 issue 标成 `RESOLVED`。

### 内部管理 API

内部管理面与客户 API 分离：

```text
/internal/v1/...
```

包括：

- source health；
- ingestion runs；
- candidate/active corpus releases；
- quarantined documents；
- licence review queue；
- evaluation runs；
- global usage/cost；
- customer issue triage；
- corrections and impact analysis；
- incident management；
- kill switches。

该 API 不通过客户 SDK 暴露，必须使用内部管理员身份、MFA 和更短 session。

### Kill switches

支持按粒度暂停：

- 所有生成式回答；
- 指定 provider/model；
- Deep Research；
- 指定 source；
- 指定 jurisdiction；
- corpus promotion；
- ingestion；
- webhook delivery；
- 新组织邀请；
- 某个异常 API key 或组织。

触发 kill switch 必须记录：

- actor；
- reason；
- affected scope；
- start time；
- expiry/review time；
- related incident ID。

Kill switch 默认具有复查时间，避免紧急开关被永久遗忘。它不能删除数据或绕过 audit。

### Incident API

内部 incident 状态：

- `INVESTIGATING`
- `IDENTIFIED`
- `MITIGATING`
- `MONITORING`
- `RESOLVED`
- `POSTMORTEM_REQUIRED`

严重级别：

- `SEV_1`：跨组织数据暴露、系统性错误法律答案等；
- `SEV_2`：关键来源或主要回答功能故障；
- `SEV_3`：局部功能或单一来源问题；
- `SEV_4`：低影响缺陷。

SEV-1/2 可自动触发对应 kill switch 和客户通知评估。

### 公开状态

```http
GET /v1/system-status
```

只返回一般服务、搜索、回答和 source freshness 状态，不暴露内部基础设施或安全细节。

你接受这套 Usage、Audit、Issue、内部管理、Incident 和 kill-switch API 边界吗？
</pre>

## 219 | User | 2026-08-02T07:26:11.610Z

<pre>
接受
</pre>

## 220 | Assistant | 2026-08-02T07:26:11.610Z

<pre>
接受，Usage/Audit/Issue、内部管理、Incident 和 kill-switch API 冻结并记入存档。下一项是认证契约：邀请、MFA、SSO、session 和 service-account key 的完整生命周期。
</pre>

## 221 | Assistant | 2026-08-02T07:26:11.610Z

<pre>
### 邀请与成员

MVP 不允许公开注册：

```http
POST   /v1/invitations
GET    /v1/invitations
DELETE /v1/invitations/{invitation_id}
POST   /v1/invitations/{token}/accept
GET    /v1/memberships
PATCH  /v1/memberships/{membership_id}
DELETE /v1/memberships/{membership_id}
```

规则：

- 只有 Owner/Admin 可以邀请；
- invitation 有到期时间且只能使用一次；
- 不能移除组织最后一位 Owner；
- 提升为 Owner 或 Admin 要求当前用户重新认证；
- 成员角色改变立即影响新请求并写入 audit log。

### 登录方式

支持：

- email/password；
- email magic link；
- passkey；
- SAML/OIDC enterprise SSO。

Owner、Admin 和内部管理员必须启用 MFA。其他角色可以由组织管理员强制启用。

密码不是唯一恢复方式；支持 recovery codes。Recovery codes 只显示一次并以哈希形式保存。

### MFA 与 session

认证接口由 Better Auth 的安全端点承载，但产品契约必须支持：

- enroll/remove TOTP；
- enroll/remove passkey；
- regenerate recovery codes；
- list active sessions；
- revoke one/all sessions；
- require recent authentication for sensitive actions。

敏感操作包括：

- 修改 SSO；
- 创建或轮换 API key；
- 组织导出或删除；
- 修改 Owner；
- 降低安全要求；
- 查看安全 audit；
- 启动内部 kill switch。

### Enterprise SSO

```http
POST   /v1/sso-connections
GET    /v1/sso-connections
PATCH  /v1/sso-connections/{id}
DELETE /v1/sso-connections/{id}
POST   /v1/sso-connections/{id}/test
POST   /v1/sso-connections/{id}/activate
```

连接状态：

- `DRAFT`
- `TESTING`
- `ACTIVE`
- `ERROR`
- `DISABLED`

支持：

- OIDC discovery/configuration；
- SAML metadata URL 或 XML；
- issuer/entity ID；
- allowed email domains；
- attribute mappings；
- signing certificate rotation；
- enforced SSO。

初期由你协助客户人工配置，不建设复杂自助向导。

启用强制 SSO 前必须成功测试。组织保留一个 MFA 保护的 Owner break-glass account，防止客户 IdP 故障导致完全锁死；每次使用都会产生高优先级安全事件。

### SSO provisioning

MVP 采用邀请优先：

- 已受邀邮箱可以通过 SSO 激活 membership；
- 可选允许已验证企业域的 JIT provisioning；
- JIT 用户默认获得最低权限；
- 不根据未经验证的 email domain 自动加入组织；
- **SCIM provisioning 不包含在 MVP**。

### Service accounts

```http
POST   /v1/service-accounts
GET    /v1/service-accounts
PATCH  /v1/service-accounts/{id}
DELETE /v1/service-accounts/{id}

POST   /v1/service-accounts/{id}/credentials
GET    /v1/service-accounts/{id}/credentials
POST   /v1/credentials/{id}/rotate
POST   /v1/credentials/{id}/revoke
```

可用 scopes 示例：

- `search:read`
- `answers:create`
- `records:read`
- `records:write`
- `coverage:create`
- `monitor:read`
- `monitor:write`
- `exports:create`
- `usage:read`

规则：

- key 只在创建时显示一次；
- 数据库只保存 prefix 和 secret hash；
- 支持重叠轮换窗口；
- 可设置 expiry、IP allowlist、速率和费用上限；
- Developer 可以管理 service accounts，但不能自动获得 Research Record 正文读取权限；
- service account 不能登录 Web UI；
- 删除 service account 立即撤销其全部 credentials。

### 安全默认值

- Web 使用 secure、HttpOnly、SameSite cookie；
- API 使用 scoped Bearer credential；
- MFA/SSO secret 加密保存；
- 登录、恢复、邀请和 key 创建均有限流；
- 认证失败不泄露邮箱是否存在；
- SSO assertion、password、TOTP secret 和完整 API key 永不进入日志。

你接受这套邀请制、MFA、企业 SSO、break-glass、session 和 service-account 生命周期吗？其中 SCIM 明确不进入 MVP。
</pre>

## 222 | User | 2026-08-02T07:26:11.611Z

<pre>
接受
</pre>

## 223 | Assistant | 2026-08-02T07:26:11.611Z

<pre>
接受，认证与机器身份生命周期冻结；SCIM 明确排除在 MVP 外。我先同步存档，然后进入 TypeScript/Python SDK 与嵌入式 widget 的公开接口。
</pre>

## 224 | Assistant | 2026-08-02T07:26:11.611Z

<pre>
### TypeScript/Python SDK

两套 SDK 都从同一份 OpenAPI schema 生成基础类型和请求代码，再手写 streaming、重试、错误映射和便捷方法，避免两套实现逐渐不一致。

示例：

```ts
const aer = new AustraliaEmploymentRAG({
  apiKey: process.env.AER_API_KEY
});

const results = await aer.search({
  query: &quot;ordinary hours overtime&quot;,
  legalAsAt: &quot;2026-08-02&quot;,
  jurisdictions: [&quot;COMMONWEALTH&quot;]
});

const answer = await aer.answers.createAndWait({
  mode: &quot;QUICK&quot;,
  question: &quot;...&quot;,
  facts: { ... }
});
```

Python 保持相同资源命名：

```python
answer = client.answers.create_and_wait(...)
```

SDK 支持：

- search；
- document/node/timeline；
- answer streaming、wait 和 cancel；
- compare；
- coverage assessment；
- Research Records；
- watchlists/alerts；
- exports；
- usage；
- webhook signature verification。

重试规则：

- GET 和带 `Idempotency-Key` 的安全请求才自动重试；
- `429` 遵守 `Retry-After`；
- 支持 timeout、abort/cancellation；
- 不自动重试 PII、权限、额度或证据不足结果；
- SDK telemetry 只发送版本和技术错误，不发送问题或答案正文。

SDK 采用 semantic versioning，并声明兼容的 API major version。

### Widget session

客户不能把长期 service-account key 放进浏览器。客户后端先创建短期 widget session：

```http
POST /v1/widget-sessions
```

```json
{
  &quot;external_user_id&quot;: &quot;customer-internal-pseudonymous-id&quot;,
  &quot;features&quot;: [&quot;SEARCH&quot;, &quot;ASK&quot;],
  &quot;allowed_jurisdictions&quot;: [&quot;COMMONWEALTH&quot;, &quot;NSW&quot;],
  &quot;retention_mode&quot;: &quot;EPHEMERAL&quot;,
  &quot;credit_limit&quot;: 10,
  &quot;expires_in&quot;: 900
}
```

返回一个短期、单一组织、有限权限 token。

不接受用户姓名或邮箱作为 `external_user_id`；客户应使用不可逆或无直接识别意义的内部标识。

### Widget 交付方式

建议采用：

```text
JavaScript loader
    → sandboxed iframe
        → AustraliaEmploymentRAG widget app
```

并额外提供 React wrapper。

采用 iframe 的原因：

- 客户页面 CSS 不会破坏 widget；
- widget CSS/脚本不会污染客户应用；
- 更容易实施 CSP、origin checks 和安全升级；
- token、认证状态和内部路由边界更清晰。

React wrapper 负责初始化和类型化事件，但不把完整实现打包进客户应用。

### 初始化示例

```ts
AERWidget.mount({
  element: &quot;#employment-law-assistant&quot;,
  sessionToken,
  mode: &quot;search-and-ask&quot;,
  theme: {
    primaryColor: &quot;#0F766E&quot;
  }
});
```

支持事件：

- `ready`
- `search.completed`
- `answer.started`
- `answer.completed`
- `clarification.required`
- `citation.opened`
- `error`
- `session.expiring`

所有 `postMessage` 通信验证 origin 和 schema version。

### Widget 限制

- 只能在预先配置的 customer origins 加载；
- token 最长约 15 分钟，可由客户后端刷新；
- token 不保存到 localStorage；
- widget 不能创建 service accounts、修改 SSO 或访问管理功能；
- 功能、jurisdiction、额度和保留模式由 session token 限制；
- 无有效客户登录态和 widget session 时不能使用；
- 达到额度后搜索继续、生成式问答暂停；
- 英文界面、键盘导航和 WCAG 2.2 AA；
- disclaimer 和 citations 不能被客户 CSS 隐藏；
- 客户可以设置颜色和品牌文字，但不能移除 AustraliaEmploymentRAG 来源标识或制造政府背书。

### Sandbox

开发者 portal 提供独立 sandbox organization：

- 独立 API keys 和 widget origins；
- 很低的 AI 额度；
- 可以使用固定 synthetic scenarios；
- 不访问任何生产客户 Research Records；
- webhook test events 明确标记 `sandbox: true`。

你接受 SDK 由 OpenAPI 驱动，以及 widget 使用短期 session token、sandboxed iframe 和 React wrapper 的设计吗？
</pre>

## 225 | User | 2026-08-02T07:26:11.611Z

<pre>
接受
</pre>

## 226 | Assistant | 2026-08-02T07:26:11.611Z

<pre>
接受，SDK 和 widget 契约冻结。我会记入存档；接下来完成 API 阶段最后一个模块：ingestion、quarantine、corpus release、promotion 与 rollback 的内部接口。
</pre>

## 227 | Assistant | 2026-08-02T07:26:11.612Z

<pre>
### Source 管理

仅内部管理员可用：

```http
GET    /internal/v1/sources
POST   /internal/v1/sources
GET    /internal/v1/sources/{source_id}
PATCH  /internal/v1/sources/{source_id}
POST   /internal/v1/sources/{source_id}/test
POST   /internal/v1/sources/{source_id}/pause
POST   /internal/v1/sources/{source_id}/resume
```

Source 配置包括：

- authority、jurisdiction 和 document types；
- official domains/endpoints；
- crawl schedule；
- rate limit 和 concurrency；
- fetch/parser adapter；
- licence assessment；
- expected document-count range；
- freshness target；
- index tier policy。

新增来源必须先 `test`，不能直接进入自动发布。

### Ingestion runs

```http
POST /internal/v1/ingestion-runs
GET  /internal/v1/ingestion-runs
GET  /internal/v1/ingestion-runs/{run_id}
POST /internal/v1/ingestion-runs/{run_id}/cancel
POST /internal/v1/ingestion-runs/{run_id}/retry-failures
```

启动时可以选择：

- 单一 source；
- discovery only；
- incremental；
- full rebuild；
- parser replay from existing artifacts；
- dry run。

`full rebuild` 不删除当前 production corpus，只创建新的 candidate release。

### Artifact 与 quarantine

```http
GET  /internal/v1/source-artifacts/{artifact_id}
GET  /internal/v1/quarantine
POST /internal/v1/quarantine/{item_id}/retry
POST /internal/v1/quarantine/{item_id}/accept
POST /internal/v1/quarantine/{item_id}/exclude
```

进入 quarantine 的原因包括：

- 内容哈希或格式异常；
- parser failure；
- 日期或 status 无法确认；
- licence 不明确；
- 文档数量突变；
- OCR 质量不足；
- duplicate identity conflict；
- 引用结构损坏。

人工 `accept` 必须记录理由，不能只把错误标志清掉。

### Candidate corpus release

```http
POST /internal/v1/corpus-releases
GET  /internal/v1/corpus-releases/{release_id}
POST /internal/v1/corpus-releases/{release_id}/validate
POST /internal/v1/corpus-releases/{release_id}/promote
POST /internal/v1/corpus-releases/{release_id}/reject
```

验证至少包括：

- source completeness；
- document/version/node counts；
- unexpected deletion；
- effective-date consistency；
- duplicate identities；
- broken citations；
- licence-policy compliance；
- search smoke tests；
- relevant evaluation subset；
- index manifest/hash verification。

### Promotion

`promote` 只切换 active corpus pointer，不原地修改当前 release。

执行前要求：

- recent MFA；
- explicit reason；
- validation passed；
- release manifest immutable；
- 当前 active release 已记录；
- 成功或失败均写入 audit。

你是单人公司，所以 MVP 不要求双人审批；使用“recent MFA + explicit confirmation + immutable rollback point”代替。

### Rollback

```http
POST /internal/v1/corpus-releases/{release_id}/rollback-to
```

Rollback：

- 只允许切换到已验证、未删除的历史 release；
- 不删除失败 release，保留事故分析；
- 自动创建 incident/audit event；
- 查找在故障 release 期间生成的 Answer Snapshots；
- 将可能受影响的 records 标记为 `REVIEW_REQUIRED`；
- 必要时启动 correction 和客户通知流程。

### Source adapter 边界

每个官方来源通过独立 adapter 实现：

```text
discover
fetch
identify
parse
normalise
extractEvents
extractRelations
validate
```

单个来源页面结构变化时，只影响对应 adapter，不能迫使整个 ingestion pipeline 重写。

### 成本与安全

- 日常 discovery 优先检查 ETag、Last-Modified、目录和哈希；
- 未变化内容不重复下载、解析或 embedding；
- 大型 rebuild 默认在本地执行；
- 云端只接收验证后的 artifacts/index release；
- 每次 run 有时间、文档量、下载量和付费 API 硬限制；
- 内部接口不能绕过 licensing registry；
- `pause source` 后旧的已验证资料仍可搜索，但显示 freshness warning；
- 删除原始证据、历史 release 或 audit records 不提供普通 API 操作。

你接受这套 ingestion、quarantine、candidate release、promotion 和 rollback API 吗？接受后，API 与数据模型阶段就可以整体结束。
</pre>

## 228 | User | 2026-08-02T07:26:11.612Z

<pre>
接受
</pre>

## 229 | Assistant | 2026-08-02T07:26:11.612Z

<pre>
接受。至此 API 与数据模型阶段整体完成。我会更新阶段存档并把进度切换到“深挖与 trade-offs”；第一项从最影响准确率和 A$50预算的检索策略开始。
</pre>

## 230 | Assistant | 2026-08-02T07:26:11.612Z

<pre>
API 与数据模型阶段正式结束。现在进入“深挖与 trade-offs”。

第一个取舍是：**vector-first 还是 lexical-first hybrid retrieval**。

我建议采用 **legal-aware lexical-first hybrid**，而不是把所有问题先交给向量搜索。

### 为什么不能 vector-first

向量检索擅长语义近似，但法律检索中很多差一个词就可能完全不同：

- `must` 与 `may`
- `employee` 与 `independent contractor`
- `s 340` 与 `s 341`
- `in force` 与 `enacted but not commenced`
- NSW 与 national system
- 当前条文与历史版本

纯向量相似度还可能把语言类似、但 jurisdiction、日期或权威层级错误的材料排在前面。

### 推荐检索管线

```text
Query classification
        ↓
Hard legal filters
        ↓
Exact/citation retrieval
        ↓
Full-corpus BM25
        ↓
Selective dense retrieval
        ↓
Rank fusion
        ↓
Rerank
        ↓
Evidence sufficiency check
```

#### 1. Query classification

先识别：

- 普通自然语言；
- 法条/case citation；
- employer/ABN；
- award/agreement；
- historical/future query；
- jurisdiction comparison；
- coverage/classification 问题。

#### 2. Hard legal filters

在相关性排名前过滤：

- `legal_as_at`
- jurisdiction
- legal status
- document type
- operative/future/proposed
- licence/display constraints

模型相关性分数不能推翻这些硬条件。

#### 3. Exact retrieval

法条号、case number、neutral citation、award code、agreement title 和 ABN 精确匹配优先级最高。

#### 4. Full-corpus BM25

全部可检索语料都进入磁盘型 lexical index。这是 30 万文档和长尾判决、agreements 的完整覆盖基础。

#### 5. Selective dense retrieval

- Tier 1：完整 dense retrieval；
- Tier 2：已 embedding 的高价值节点参与；
- Tier 3：首次通过 lexical 命中后，可以进入按需 semantic cache。

#### 6. Rank fusion

不能只把 BM25 和 vector score 直接相加，因为分数尺度不同。采用 rank-based fusion，再加入：

- exact-match boost；
- authority weight；
- temporal fit；
- jurisdiction fit；
- operative-status boost；
- document relationship；
- heading/definition match。

“更新”不能成为通用加分项——历史查询必须优先返回当时适用版本。

#### 7. Rerank 分层

- 普通 Search：默认不调用付费 reranker；
- Quick Answer：对较小候选集进行轻量 rerank；
- Deep Research：允许多轮检索和更强 rerank；
- citation/case-number 精确命中不应被 semantic reranker降到后面。

### 成本与准确率结果

这个选择意味着：

- 全语料仍然可搜；
- 大部分普通搜索不产生 AI 成本；
- 只有需要生成答案的请求才使用更昂贵的 rerank；
- 长尾材料第一次可能稍慢，但随后进入缓存；
- 法律日期、状态和 jurisdiction 的正确性高于语义“看起来相似”。

建议把核心原则冻结为：

&gt; Exact legal identifiers and hard temporal, jurisdictional and status constraints take precedence over semantic similarity. Dense retrieval and reranking improve recall and ordering but may not override legal applicability.

你接受 lexical-first legal-aware hybrid retrieval 吗？
</pre>

## 231 | User | 2026-08-02T07:26:11.612Z

<pre>
接受
</pre>

## 232 | Assistant | 2026-08-02T07:26:11.612Z

<pre>
接受，检索原则冻结：法律硬过滤和精确标识优先，dense/rerank 只能改善召回与排序，不能改变适用性。我会同步记录；下一项决定本地模型与付费模型各负责什么。
</pre>

## 233 | Assistant | 2026-08-02T07:26:11.613Z

<pre>
第二个取舍是：**哪些模型在本地运行，哪些调用付费 API**。

完全使用云端模型会突破预算；完全本地运行又无法在 2GB 服务器上稳定提供高质量法律回答。建议采用混合模型层。

### 本地负责

#### Embedding

- 文档 embedding 在开发电脑离线批量生成；
- 线上查询 embedding 使用同一小型、固定版本的模型；
- 模型升级先建立新 embedding 版本并通过评测；
- 不因为供应商涨价而需要重建整个索引。

#### Query classification

以下工作使用规则和小型本地模型：

- citation/section/case number 识别；
- jurisdiction、日期、文档类型识别；
- employer/ABN 识别；
- Search、Coverage、Compare 等 intent 分类；
- PII 初筛。

#### 轻量 rerank

小型本地 reranker 只处理很小的候选集合，例如 top 20–30：

- 普通 Search 可根据延迟预算选择性使用；
- Quick Answer 默认使用；
- 如果本地 reranker 超时，保留 hybrid rank，而不是无限等待。

### 付费 API 负责

#### Answer generation

法律解释和 claim/citation 结构化输出使用经过评测的托管模型，因为 2GB 实例无法运行足够可靠的生成模型。

#### Deep Research

允许使用更强模型完成：

- query decomposition；
- 多来源协调；
- 冲突解释；
- jurisdiction/time comparison；
- 最终结构化 synthesis。

#### 复杂 rerank

只有 Deep Research 或轻量 reranker无法区分的候选集，才调用付费 reranker。

### 模型路由

```text
Search
  → local only by default

Quick Answer
  → local retrieval/rerank
  → validated economical hosted model

Deep Research
  → local retrieval
  → optional hosted rerank
  → validated stronger hosted model
```

### 不允许的 fallback

- 供应商故障时不能自动切换到未经600条评测验证的模型。
- 强模型额度耗尽时不能用弱模型假装完成 Deep Research。
- 模型版本发生变化时先进入 shadow evaluation，不能立即替换 production alias。
- 输出 schema 验证失败时可以有限重试；仍失败则返回技术错误或证据不足，不展示残缺答案。

### 成本控制

- 文档 embedding 和批量评测尽量在本地完成；
- provider 调用前预留最大估算成本；
- 使用检索压缩后的最小必要上下文；
- 相同 source passages 采用 provider 支持的安全缓存时才启用缓存；
- Quick 与 Deep 使用不同额度；
- 客户可以使用自己的 provider key；
- 系统级月度 AI 支出继续保持 A$12 左右的熔断值。

### 模型可替换性

业务代码不直接依赖具体供应商。统一 Model Gateway 接受：

- structured input；
- required JSON schema；
- retention policy；
- maximum cost；
- timeout；
- allowed model aliases。

回答快照保存实际 provider、model/version 和 prompt-template version。

建议冻结为：

&gt; Local models handle retrieval-oriented tasks; validated hosted models handle legal synthesis. No unvalidated model substitution is permitted during provider failure or budget exhaustion.

你接受这种 local retrieval intelligence + hosted legal synthesis 的混合方案吗？
</pre>

## 234 | User | 2026-08-02T07:26:11.613Z

<pre>
接受
</pre>

## 235 | Assistant | 2026-08-02T07:26:11.613Z

<pre>
接受，模型分工冻结：本地处理检索型任务，经过600条评测的托管模型负责法律综合；故障或额度耗尽时不切换到未经验证的模型。下一项讨论“缩减索引”是否意味着不保存长尾原文。
</pre>

## 236 | Assistant | 2026-08-02T07:26:11.613Z

<pre>
第三个取舍是：**长尾资料只保存 metadata，还是仍保存完整原文**。

我的建议是：

&gt; 缩减的是昂贵的在线索引，不是已经允许保存的法律原文。

### 允许保存的官方资料

只要 licensing registry 明确允许：

- 原始 HTML、XML、PDF 或 JSON 全部保存到低价对象存储；
- 同时保存提取后的 normalized text；
- 保留内容哈希、取得时间和 licence snapshot；
- 不依赖每次用户查询时重新访问官方网站。

150GB 公共资料在低价对象存储中只占约几澳元/月。真正贵的是常驻 RAM、SSD 索引、向量和计算。

### 三层分别保存什么

| 层级 | 原始文件 | 全文 lexical | Dense embedding |
|---|---|---|---|
| Tier 1 | 保存 | 完整 | 完整 |
| Tier 2 | 保存 | 完整 | 选择性/按需 |
| Tier 3 | 保存（许可允许时） | metadata 或压缩全文 | 默认不生成 |

对于 licence 不明确的来源：

- 保存允许的最小 provenance；
- metadata、官方 URL 和有限摘录；
- 不持久化受限全文；
- 查询命中后可以实时打开官方页面，但必须检查来源新鲜度和可用性。

### 为什么要保存长尾原文

如果每次查询才去官方页面获取，会产生几个问题：

- 官方网站临时故障；
- URL 或页面结构发生变化；
- corrected judgment 覆盖旧文件；
- 无法复现旧答案；
- 无法证明某日系统看到的内容；
- 查询延迟不可控。

因此只要许可允许，raw artifact 应当不可变保存。

### 在线磁盘如何控制

60GB 服务器磁盘只保留：

- 应用和客户数据库；
- 当前 lexical/citation index；
- 当前高价值向量索引；
- 高频 normalized text cache；
- 少量工作空间和日志。

150GB 原始 corpus 放对象存储，不占服务器 SSD。

### 按需 semantic cache

Tier 2/3 材料第一次通过 lexical search 命中后：

1. 读取已保存的 normalized text；
2. 对相关 nodes 生成或取得 embedding；
3. 加入有容量上限的 semantic cache；
4. 根据引用频率、权威性和更新时间决定保留；
5. 淘汰 embedding 时不删除原文或 lexical metadata。

如果需要重新生成 embedding，可以在开发电脑批量完成并发布新索引，不在生产服务器烧计算。

### 结论

这样我们不是“少收资料”，而是：

- 全量保存允许保存的证据；
- 全量提供法律检索入口；
- 只把高价值部分放入昂贵的在线语义层；
- 长尾通过 lexical-first 和按需 semantic processing 进入答案。

你接受“raw corpus 尽量全量保存，但 hot semantic index 分层受限”的策略吗？
</pre>

## 237 | User | 2026-08-02T07:26:11.614Z

<pre>
接受
</pre>

## 238 | Assistant | 2026-08-02T07:26:11.614Z

<pre>
接受，存储策略冻结：只缩减 hot semantic index，不删除许可允许保存的原始证据；长尾仍有完整 provenance、lexical discovery 和按需 semantic processing。下一项是法律关系图应当自动化到什么程度。
</pre>

## 239 | Assistant | 2026-08-02T07:26:11.614Z

<pre>
第四个取舍是：**法律关系图由规则、LLM 还是人工建立**。

30 万份资料不可能全部人工审核；但让 LLM 直接断言某判决“推翻”另一判决也不可接受。建议采用证据分级的半自动模型。

### 第一层：官方结构化事实

最高可信度，直接采用官方 metadata 或法律文件中的明确事件：

- legislation register 的 amendment、commencement 和 repeal；
- FWC 的 agreement approval、variation、replacement 和 termination；
- 法院/FWC 提供的 appeal 或 corrected judgment 信息；
- 文档正式标示的 instrument/case identifiers。

状态：

```text
OFFICIAL_ASSERTION
```

### 第二层：确定性解析

使用 citation parser 和明确文本规则：

- neutral citation；
- section、clause 和 schedule reference；
- `amended by`、`repealed by`、`commences on`；
- judgment 中明确引用的其他案件；
- agreement 中明确 incorporated/replaced instruments。

状态：

```text
DETERMINISTIC_EXTRACTION
```

每个关系必须保存原文位置和 parser version。

### 第三层：模型建议

LLM 可以发现候选关系，例如：

- 某段可能在区分另一个案件；
- 某 guidance 可能解释某条法条；
- 某判决可能限制早期判决的适用范围。

但只保存为：

```text
MODEL_SUGGESTED
```

它不能直接：

- 改变 legal status；
- 把判决标为 overruled；
- 触发确定性法律结论；
- 提升答案为 `SUPPORTED`。

### Treatment 分类必须保守

一个案件引用另一个案件，只能先确认：

```text
CITES
```

不能因为出现案名就自动判断：

- `FOLLOWS`
- `DISTINGUISHES`
- `DOUBTS`
- `OVERRULES`
- `REVERSES`

只有官方 metadata、明确措辞或足够证据支持时，才升级为具体 treatment。否则显示：

```text
TREATMENT_NOT_CONFIRMED
```

### 人工测试如何集中

你不需要人工检查整个关系图。人工精力集中在：

- 会改变现行法律状态的关系；
- 搜索和回答中高频出现的 authorities；
- blind evaluation 涉及的关系；
- 系统建议 `OVERRULES`、`REVERSES`、`REPEALS` 等高影响关系；
- 用户报告的问题；
- 自动检测到的关系冲突。

其余长尾关系可以保持 unconfirmed，而不是假装完整。

### 回答使用规则

| 关系状态 | 可否用于确定性结论 |
|---|---|
| Official assertion | 可以 |
| Deterministic extraction | 可以，但必须有原文证据 |
| Model suggested | 不可以 |
| Treatment not confirmed | 只能作为限制提示 |

这种方案不会达到商业 citator 的人工编辑深度，但会诚实表达系统掌握和未掌握的内容。

你接受“official/deterministic relations 可用，LLM relations 只作为待验证建议”的策略吗？
</pre>

## 240 | User | 2026-08-02T07:26:11.615Z

<pre>
接受
</pre>

## 241 | Assistant | 2026-08-02T07:26:11.615Z

<pre>
接受，法律关系图策略冻结：官方和确定性解析关系可作为依据；LLM 只能提出带证据的待验证候选，不能自行改变法律状态或判例 treatment。下一项讨论答案是“先自由生成再补引用”，还是“先固定证据再生成”。
</pre>

## 242 | Assistant | 2026-08-02T07:26:11.615Z

<pre>
第五个取舍是答案生成顺序。

我强烈建议采用 **evidence-first structured synthesis**，不允许“模型先写答案、然后再找几个引用贴上去”。

### 推荐流程

```text
Retrieve
  → build evidence pack
  → generate structured claims
  → deterministic validation
  → render answer
  → final safety/status check
```

### 1. Evidence pack

模型只能看到经过筛选的 evidence objects：

```json
{
  &quot;evidence_id&quot;: &quot;ev_12&quot;,
  &quot;document_version_id&quot;: &quot;ver_...&quot;,
  &quot;node_version_id&quot;: &quot;nodev_...&quot;,
  &quot;pinpoint&quot;: &quot;s 340(1)&quot;,
  &quot;text&quot;: &quot;...&quot;,
  &quot;jurisdiction&quot;: &quot;COMMONWEALTH&quot;,
  &quot;legal_status&quot;: &quot;IN_FORCE&quot;,
  &quot;effective_from&quot;: &quot;2025-01-01&quot;,
  &quot;effective_to&quot;: null,
  &quot;authority_level&quot;: &quot;LEGISLATION&quot;
}
```

URL、文档标题、日期和法律状态由系统提供，模型不能自行编造。

### 2. Structured claims

模型先返回 JSON，而不是自由 Markdown：

```json
{
  &quot;answer_status&quot;: &quot;CONDITIONAL&quot;,
  &quot;claims&quot;: [
    {
      &quot;text&quot;: &quot;...&quot;,
      &quot;type&quot;: &quot;LEGAL_RULE&quot;,
      &quot;support&quot;: [
        {
          &quot;evidence_id&quot;: &quot;ev_12&quot;,
          &quot;start_offset&quot;: 10,
          &quot;end_offset&quot;: 98
        }
      ]
    }
  ],
  &quot;assumptions&quot;: [],
  &quot;missing_facts&quot;: [],
  &quot;limitations&quot;: []
}
```

模型只能引用 evidence pack 中存在的 IDs。

### 3. Deterministic validator

程序验证：

- evidence ID 是否真实存在；
- quote offsets 是否与原文完全匹配；
- document/node version 是否属于当前 corpus release；
- jurisdiction 是否适用；
- `legal_as_at` 是否落在有效区间；
- status 是否允许用于当前答案；
- claim 是否有足够 citation；
- background-only evidence 是否被错误用于结论；
- contradictory evidence 是否被遗漏；
- licence 是否允许展示该摘录长度。

### 4. 验证失败

处理顺序：

1. 使用明确错误信息进行一次受限修复；
2. 仍失败则删除不受支持的 claim；
3. 如果删除后无法支撑核心结论，降级为 `INSUFFICIENT_EVIDENCE` 或 `CONDITIONAL`；
4. 绝不能把 validator failure 隐藏起来并展示原始答案。

### 5. 最终渲染

只有验证后的结构化 claims 才被渲染成用户看到的英文答案。Citation 链接、pinpoint、标题和 status badge 全部由程序生成，而不是模型手写。

因此模型负责：

- 理解；
- 归纳；
- 条件分析；
- 清晰表达。

程序负责：

- 引用真实性；
- 日期；
- jurisdiction；
- status；
- source identity；
- licence；
- Answer Snapshot。

### 6. 推理透明度

向用户展示 concise reasoning summary、assumptions 和 evidence mapping，但不保存或暴露模型隐藏的 chain-of-thought。

建议冻结为：

&gt; The model may synthesise only from a system-supplied evidence pack. Citations, legal applicability and answer status are deterministically validated before any answer is shown.

你接受 evidence-first、structured claims、deterministic validation 的答案生成方案吗？
</pre>

## 243 | User | 2026-08-02T07:26:11.615Z

<pre>
接受
</pre>

## 244 | Assistant | 2026-08-02T07:26:11.615Z

<pre>
接受，答案生成顺序冻结：证据包先行，模型只输出结构化 claims，程序验证引用、日期、jurisdiction、status 和 licence 后才渲染。下一项是 Deep Research 应采用自由 agent，还是有上限的研究状态机。
</pre>

## 245 | Assistant | 2026-08-02T07:26:11.616Z

<pre>
第六个取舍是 **Deep Research 的 agent 自由度**。

完全自由的 research agent 可能不断改写查询、打开资料和再次调用模型，成本与结果都不可预测。建议使用 **bounded research state machine**，允许 agentic decomposition，但限制每一步。

### 固定阶段

```text
Scope
  → Decompose
  → Retrieve
  → Check gaps/conflicts
  → Targeted follow-up
  → Synthesis
  → Validation
```

每个阶段有明确输入、输出和停止条件。

### Research Plan

Deep Research 首先产生结构化计划：

```json
{
  &quot;subquestions&quot;: [
    {
      &quot;id&quot;: &quot;sq_1&quot;,
      &quot;question&quot;: &quot;...&quot;,
      &quot;jurisdictions&quot;: [&quot;COMMONWEALTH&quot;],
      &quot;required_authority_types&quot;: [&quot;ACT&quot;, &quot;AWARD&quot;]
    }
  ],
  &quot;decisive_facts&quot;: [],
  &quot;expected_conflicts&quot;: [],
  &quot;stop_conditions&quot;: []
}
```

计划不能修改用户给定的 `legal_as_at` 或擅自增加 jurisdiction。

### 硬上限

每个任务配置：

- maximum subquestions；
- maximum retrieval rounds；
- maximum candidate nodes；
- maximum hosted rerank calls；
- maximum generation calls；
- maximum input/output tokens；
- maximum estimated cost；
- maximum elapsed time。

达到任何上限后，系统必须使用当前证据完成条件性答案或返回证据不足，不能无限继续。

### 允许并行，不允许无限递归

独立子问题可以并行检索，例如：

- applicable Commonwealth framework；
- state-specific rule；
- relevant award/agreement；
- later case treatment。

但是子任务不能任意再创建无限子任务。只有“发现明确缺口或冲突”才能启动一次有上限的 follow-up round。

### 来源边界

Production Deep Research 只能使用：

- 当前 active corpus；
- 已批准的官方 source adapters；
- 为验证 source freshness 而实时取得的官方页面。

不能临时搜索普通博客、律所文章、论坛或模型记忆来填补答案。

### 停止条件

满足以下任一条件时停止继续研究：

- 已找到支撑核心 claim 的适用权威；
- 关键事实缺失，继续检索无法解决；
- 权威来源冲突且无法可靠协调；
- 来源不新鲜或不可用；
- 达到成本/时间上限；
- 问题超出产品范围。

### 过程展示

用户可以看到：

- 正在研究哪些子问题；
- 已找到哪些 authority categories；
- 是否存在缺口或冲突；
- 预计进度。

但不展示内部 chain-of-thought、原始 prompt 或模型草稿。

### 成本策略

Quick Answer 和 Deep Research 不是同一个 agent 只改一个参数：

- Quick：单计划、单主要检索轮次、有限候选集；
- Deep：结构化分解、最多一次 targeted follow-up、多来源协调；
- 超出额度时 Deep 排队或暂停；
- 不允许 production agent 自主增加预算。

建议冻结为：

&gt; Deep Research is agentic within a bounded, auditable state machine. It may decompose and follow evidence gaps, but it cannot recurse, browse unapproved sources, change scope, or exceed explicit cost and time limits.

你接受 bounded agentic research，而不是开放式自主 agent 吗？
</pre>

## 246 | User | 2026-08-02T07:26:11.616Z

<pre>
接受
</pre>

## 247 | Assistant | 2026-08-02T07:26:11.616Z

<pre>
接受，Deep Research 冻结为有边界、可审计的状态机，而不是能无限递归和扩大预算的自由 agent。下一项决定600条评测应依赖自动指标、LLM judge，还是人工判断。
</pre>

## 248 | Assistant | 2026-08-02T07:26:11.616Z

<pre>
第七个取舍是 **如何评测准确性**。

我的建议是：

&gt; Launch gates 以 deterministic metrics 为主，LLM judge 只做辅助，人工测试集中处理失败和边界案例。

### 可确定性验证的指标

这些不需要 LLM judge：

- 是否引用 gold document/node/version；
- quote offset 是否准确；
- citation 是否支持对应 claim；
- jurisdiction 是否正确；
- `legal_as_at` 是否匹配；
- source status 是否正确；
- 是否引用了 prohibited/future/superseded authority；
- answer status 是否符合预期；
- 应拒绝的问题是否拒绝；
- 是否出现 unsupported definitive claim；
- retrieval recall@k；
- latency 和 cost。

这些指标构成正式发布门槛。

### LLM judge 的有限用途

LLM judge 可以辅助评价：

- 回答是否清晰；
- 是否遗漏明显条件；
- reasoning summary 是否连贯；
- practical next steps 是否有用；
- 两个合格答案中哪一个表达更好。

但它不能单独决定：

- citation 是否正确；
- 法律是否适用；
- 判决是否 binding；
- 时间版本是否正确；
- 是否允许发布。

Judge 自身也要固定 model/version/prompt，并保存评测记录。

### 人工测试重点

你白天不需要逐字审核每次600条完整输出。人工优先查看：

- 所有 launch-gate failures；
- 与上次运行结果不同的 cases；
- 新 source adapter 影响的 cases；
- 新模型/prompt 影响的 cases；
- `CONFLICTING_SOURCES`；
- coverage/classification；
- case treatment；
- temporal traps；
- 看起来通过但 judge 与 deterministic metrics 不一致的案例。

### 运行节奏

建议：

- 代码提交：相关的小型 smoke subset；
- 每晚：360 development cases；
- 每周：360 development + 120 validation；
- release candidate：600 条全部运行；
- 120 blind cases 只用于 release candidate 和重要模型/pipeline 决策；
- source hotfix：运行受影响 topic/jurisdiction subset，再做关键 smoke tests。

此前“每周全量600条”可以保留为目标，但在本地计算时间不足时，release candidate 的600条全量优先级最高，不能因为例行周测耗尽开发时间。

### 防止测试集污染

- blind questions 和 gold answers 不放进普通 coding-agent context；
- synthetic scenario 不进入训练或 prompt examples；
- prompt 示例与 evaluation cases 分开；
- dataset version 一旦用于正式比较，不无痕修改；
- 修正错误 gold data 时建立新 dataset version 并记录原因。

### 回归判定

新版本不仅要达到绝对阈值，还不能出现：

- 关键 jurisdiction/time regression；
- supported 变 unsupported；
- refusal 变成 definitive answer；
- citation precision 下降；
- 同等准确率下成本或延迟失控。

你接受 deterministic launch gates + 辅助 LLM judge + 聚焦失败项的人工测试方案吗？
</pre>

## 249 | User | 2026-08-02T07:26:39.415Z

<pre>
接受
</pre>

## 250 | Assistant | 2026-08-02T07:26:49.516Z

<pre>
接受，评测策略冻结：发布门槛以可确定验证的法律、时间、jurisdiction 和 citation 指标为主，LLM judge 只辅助，人工时间集中在失败与变化项。下一项深挖 PII 阻止应依赖客户端、第三方服务，还是本地双层检测。
</pre>

## 251 | Assistant | 2026-08-02T07:27:27.597Z

<pre>
第八个取舍是 **PII 检测放在哪里**。

建议采用：

```text
Client-side assistance
       +
Authoritative server-side local detection
```

不把原始内容发送给第三方 PII 检测服务。

### 客户端检测

Web 和 widget 在提交前快速识别：

- TFN；
- email；
- phone；
- bank/account patterns；
- addresses；
- dates of birth；
- employee/payroll identifiers；
- 可能的人名。

作用是立即提醒和提供一键匿名化，但客户端结果不能作为最终安全边界。

### 服务端检测

API 收到请求后，在写日志、创建 ResearchTurn 或调用 LLM 之前，再运行：

1. 确定性 pattern rules；
2. checksum/format validation，例如 TFN/ABN 区分；
3. 本地命名实体识别；
4. context rules，区分员工姓名与公开案件/企业信息。

只有服务端通过后才允许继续。

### 区分允许和阻止内容

允许：

- employer name；
- ABN；
- 公开公司地址；
- 公布判决中的 party name；
- 公开 judge、commissioner、authority names；
- `Employee A` 等占位符；
- 年龄范围、岗位、工龄、职责、州和匿名工作时间。

阻止或要求替换：

- 实际员工姓名；
- 私人 email/phone/address；
- TFN、银行信息；
- employee/payroll IDs；
- 精确出生日期；
- 能明显识别非公开个人的组合信息。

### 返回方式

检测失败返回 `422 PII_DETECTED`：

```json
{
  &quot;error&quot;: {
    &quot;code&quot;: &quot;PII_DETECTED&quot;,
    &quot;message&quot;: &quot;Remove or anonymise employee personal information.&quot;,
    &quot;details&quot;: {
      &quot;findings&quot;: [
        {
          &quot;type&quot;: &quot;PERSON_NAME&quot;,
          &quot;field&quot;: &quot;question&quot;,
          &quot;start&quot;: 14,
          &quot;end&quot;: 25,
          &quot;replacement&quot;: &quot;Employee A&quot;
        }
      ]
    }
  }
}
```

响应只返回当前请求中的 offsets 和替换建议，不把命中的原文写入日志。

### False positives

- 用户可以在客户端修改后重新提交；
- 普通客户不能点击“ignore and send anyway”；
- 对误判的公开企业或案件实体，可以选择明确的结构化字段，例如 `employer.name` 或 `case_citation`；
- 内部管理员只看到匿名技术统计，不看到被阻止原文；
- pattern/model 调整必须用 synthetic PII test suite 回归。

### Fail-closed 边界

如果本地检测服务故障：

- Search 中纯公开 citation/keyword 请求仍可运行；
- 带自由文本事实的 Ask、Compare 和 Coverage 暂停；
- 不绕过检测直接发送给 LLM。

这套设计无法承诺数学意义上的绝对匿名，但能满足我们已经确定的 active prevention 和 data minimisation。

你接受客户端辅助 + 服务端本地权威检测，并在检测故障时对自由文本问答 fail closed 吗？
</pre>

## 252 | User | 2026-08-02T11:13:45.845Z

<pre>
接受
</pre>

## 253 | Assistant | 2026-08-02T11:13:57.688Z

<pre>
接受，PII 防线冻结：客户端只负责辅助，服务端本地检测才是权威边界；检测不可用时，自由文本问答 fail closed。下一项讨论怎样在 A$50 内兑现“24小时发现官方变化”。
</pre>

## 254 | Assistant | 2026-08-02T11:14:22.153Z

<pre>
第九个取舍是 **实时更新还是分层增量更新**。

A$50 预算无法每天重新下载、解析和索引30万份文件。建议把“24小时发现变化”定义为：

&gt; 在24小时内检查官方 collection/feed/index 是否出现变化，而不是每天重新抓取每一份文档正文。

### Discovery 与 processing 分开

```text
Lightweight discovery
        ↓
Changed identifiers/URLs
        ↓
Targeted fetch
        ↓
Parse and validate
        ↓
Candidate release
```

### 来源检查层级

#### Critical sources

例如：

- legislation registers；
- FWC awards、agreements、decisions；
- Fair Work Ombudsman；
- ATO employment/payroll materials；
- payroll-tax authorities。

每6–12小时检查一次低成本入口：

- official feed/API；
- sitemap；
- updated-date listing；
- collection index；
- ETag/Last-Modified；
- known document manifest。

#### Normal sources

法院、tribunal 和其他 regulator collections 每24小时检查一次 change index 或新发布列表。

#### Reconciliation

为了发现官方目录遗漏或 adapter bug：

- 每周进行 collection-level count/hash reconciliation；
- 每月执行更深的完整 manifest reconciliation；
- 不等于每月重新下载全部正文。

### 生产服务器与本地电脑分工

2GB Sydney server 持续运行轻量 discovery：

- 请求官方 change pages；
- 比较 ETag、manifest 和 document IDs；
- 下载小规模增量；
- 产生待处理 queue；
- 标记 freshness。

开发电脑负责：

- 大批量 parser replay；
- full rebuild；
- 大规模 embedding；
- 完整 evaluation；
- candidate index 构建。

少量紧急文本变更可以在生产服务器解析；大型变化等待本地构建 candidate release。

### Freshness 的准确表达

每个 Source 分别显示：

- `last_discovery_check_at`
- `last_successful_change_scan_at`
- `last_full_reconciliation_at`
- `last_content_ingested_at`
- `freshness_status`

不能只显示一个模糊的 `last updated`。

### 无 delta 接口的来源

如果官方来源没有 feed、updated listing、ETag 或稳定目录：

- 分批轮询文档；
- 明确记录 coverage window；
- 若无法在24小时内可靠发现变化，显示 `FRESHNESS_LIMITED`；
- 涉及该来源的确定性回答增加 warning；
- 不能虚假声称符合24小时目标。

### 变更发布

发现变化不等于立即对客户生效：

- 24小时内发现；
- 正常情况下再用24小时解析、验证和发布；
- 重大 commencement/rate/award 变化提高处理优先级；
- 解析失败保留旧 release 并显示 degraded status；
- 不因追求速度跳过时间、licence 和 citation 验证。

建议冻结为：

&gt; Freshness is achieved through frequent collection-level change detection and targeted incremental ingestion, backed by periodic reconciliation—not repeated full-corpus crawling.

你接受这种分层 discovery + targeted ingestion + periodic reconciliation 的方案吗？
</pre>

## 255 | User | 2026-08-02T11:33:20.058Z

<pre>
接受
</pre>

## 256 | Assistant | 2026-08-02T11:33:31.208Z

<pre>
接受，freshness 策略冻结：高频检查官方集合级变化，只定向处理增量，并用周期性 reconciliation 兜底；不能可靠满足24小时的来源必须显示 `FRESHNESS_LIMITED`。下一项是 A$50预算下最现实的取舍——高可用还是高可恢复性。
</pre>

## 257 | Assistant | 2026-08-02T11:33:59.895Z

<pre>
第十个取舍是：**高可用还是高可恢复性**。

A$50/月无法购买真正的多节点数据库、自动 failover 和跨可用区集群。建议 MVP 明确选择：

&gt; Single-node production with strong backups, immutable releases and tested recovery—not high availability.

### 可以实现的

- 单台 Sydney 生产服务器；
- Cloudflare 承担 DNS、TLS、静态前端和基础防护；
- 客户数据库持续或高频增量备份；
- 每日完整数据库备份；
- 每周加密备份保留30天；
- immutable corpus releases；
- active index 可以从对象存储重新部署；
- 基础设施配置和部署脚本可重复执行；
- 每月执行恢复测试；
- 外部状态页在主服务器故障时仍可访问。

### 无法承诺的

- 零停机部署；
- 自动多节点 failover；
- 单机故障时立即切换；
- 合同级99.5% SLA；
- 24/7人工响应；
- 零数据损失。

99.5% 仍然作为内部目标，但不是客户合同承诺。

### 建议恢复目标

对于 MVP：

- 客户数据 `RPO ≤ 15 minutes`：最坏情况下丢失不超过约15分钟的新变更；
- 服务 `RTO ≤ 4 hours`：目标是在四小时内恢复核心 Search 和 Research Records；
- public corpus 的 RPO 不重要，因为它来自不可变 artifacts，可以重建；
- active corpus release 和 manifests 必须在对象存储保留，可快速重新挂载或下载。

如果15分钟增量备份在实际实现中不稳定，系统必须诚实降级并显示内部风险，不能假装达到目标。

### 故障时的产品行为

- 静态 marketing/status page 保持可用；
- Search index 可用但客户数据库不可用时，不允许绕过认证开放搜索；
- customer database 恢复前，Ask、Records、API 和 widget 返回明确维护状态；
- 数据库与 corpus release 不一致时不生成答案；
- 恢复后执行 integrity check，再解除 maintenance mode；
- 故障期间已接收但未确认完成的幂等请求可以安全重试。

### 升级触发条件

当出现以下任一情况时，再升级 HA：

- 第一个客户把 SLA 写入合同；
- 月收入足以覆盖双节点和托管数据库；
- 单机故障已造成实质客户影响；
- 客户数量或写入量使四小时恢复不可接受。

升级费用应由商业收入支持，而不是在无收入阶段提前承担。

你接受 MVP 选择单节点、高可恢复性、RPO 15分钟/RTO 4小时、无合同 SLA 吗？
</pre>

## 258 | User | 2026-08-02T11:47:16.249Z

<pre>
接受
</pre>

## 259 | Assistant | 2026-08-02T11:47:36.933Z

<pre>
接受，可靠性取舍冻结：MVP 采用单节点和可验证恢复，目标 RPO 15分钟、RTO 4小时，不承诺合同 SLA。至此主要 trade-offs 已经闭环；我会更新存档，然后正式进入架构阶段，先确定 modular monolith 还是 microservices。
</pre>

## 260 | Assistant | 2026-08-02T11:48:14.636Z

<pre>
架构第一项：**modular monolith 还是 microservices**。

建议采用：

&gt; One repository, one versioned product release, one primary application, with separately supervised worker and search processes on the same server.

这属于 **modular monolith with isolated runtime processes**，不是把所有代码挤进一个文件，也不是微服务集群。

### 生产运行单元

```text
Sydney server
├── app
│   ├── Web/API
│   ├── Auth/RBAC
│   └── Product domain modules
├── worker
│   ├── Answer jobs
│   ├── Export
│   ├── Alerts
│   └── Lightweight ingestion
└── search
    ├── Lexical/citation index
    └── Local embedding/rerank
```

三个进程使用同一个版本化 release，但可以分别设置 CPU、memory limit 和重启策略。

这样 search OOM 或某个 export job 出错时，不必直接带崩 Web/API 进程。

### 代码模块边界

应用内部按领域分成：

- identity；
- organizations and authorization；
- legal corpus；
- retrieval；
- research and answers；
- coverage；
- comparisons；
- monitoring；
- exports；
- usage/budgets；
- issues/corrections；
- admin/incidents；
- audit。

模块只能通过明确的 service interfaces 和 domain events 交互，不能随意跨模块修改数据库对象。

### 后台任务

MVP 不引入 Kafka、RabbitMQ 或独立 Redis 集群。采用数据库支持的 durable job queue 和 transactional outbox：

```text
Database transaction
  ├── save domain change
  └── save outbox event

Worker
  → leases event/job
  → processes
  → records result
  → retries safely
```

这样不会出现“Research Record 已更新，但 alert event 因进程崩溃而丢失”。

### 本地重任务

大型 ingestion/build pipeline 是同一 repository 中的独立 CLI/workflow，不部署为长期在线微服务：

```text
Local workstation
  → fetch/parse/rebuild/embed/evaluate
  → produce signed candidate release
  → upload artifacts
  → production validates and promotes
```

### 明确不使用

MVP 不引入：

- Kubernetes；
- service mesh；
- Kafka；
- 多个独立数据库；
- 每个模块单独部署；
- 分布式 tracing 平台；
- 为“将来可能扩容”提前建立复杂微服务。

### 未来拆分点

如果以后负载增长，以下模块已有明确拆分边界：

- search service；
- ingestion pipeline；
- answer worker；
- notification delivery；
- model gateway。

但在出现真实规模需求前，它们共享一个服务器和 release lifecycle。

### 为什么适合当前项目

- 单人公司可以调试和部署；
- 多 agent 可以并行修改不同模块；
- 不产生额外基础设施月费；
- transaction、审计和租户隔离更容易验证；
- 仍能隔离搜索、worker 和 Web 的运行风险；
- 未来可以逐个拆出，不需要重写数据模型和 API。

你接受 modular monolith + isolated app/worker/search processes + database job queue，而不是 microservices 吗？
</pre>

## 261 | User | 2026-08-02T12:04:55.011Z

<pre>
接受
</pre>

## 262 | Assistant | 2026-08-02T12:05:13.443Z

<pre>
接受，架构风格冻结。下一项需要选具体技术栈；因为相关库和能力会变化，我会先核对官方文档，重点验证 SQLite 备份、Tantivy 磁盘索引、量化向量索引和 Better Auth 的兼容性，再给出一套能守住 A$50 的栈。
</pre>

## 263 | Assistant | 2026-08-02T12:05:58.022Z

<pre>
基于官方文档和我们的成本约束，我推荐三种语言、但边界非常清楚的技术栈：

| 层 | 技术 |
|---|---|
| Web、API、auth、业务逻辑 | TypeScript |
| 全文/向量搜索进程 | Rust |
| 本地采集、解析、评测 | Python |

这比“全部用一种语言”多一点构建配置，但能显著降低搜索内存和法律资料处理难度。

### TypeScript 应用层

建议：

- React + Vite：Web workspace、admin 和 widget；
- Fastify：REST API、SSE 和内部 API；
- Better Auth：password、magic link、passkey、MFA、SAML/OIDC；
- `better-sqlite3`；
- Drizzle 或 Kysely：schema/migrations；
- OpenAPI schema 生成 SDK；
- 当前 Active LTS Node.js，锁定精确版本。

Better Auth 官方支持 SQLite，并推荐稳定的 `better-sqlite3` 驱动；其 SSO 插件支持 OIDC 和 SAML、organisation provisioning 及 assertion replay protection。[Better Auth SQLite](https://better-auth.com/docs/adapters/sqlite) [Better Auth SSO](https://better-auth.com/docs/plugins/sso)

### 两个 SQLite 数据库

不要把客户写入数据和大规模法律语料塞在同一个 database file。

```text
app.sqlite
  ├── users/auth
  ├── organizations
  ├── Research Records
  ├── answers/comments
  ├── jobs/outbox
  ├── audit
  └── usage

corpus.sqlite
  ├── sources
  ├── legal documents/versions
  ├── nodes/events/relations
  ├── provenance/licensing
  └── release metadata
```

区别：

- `app.sqlite` 是可写业务数据库；
- `corpus.sqlite` 属于 immutable CorpusRelease，生产环境只读；
- promotion 通过切换 corpus bundle；
- customer backup 不需要复制几十GB rebuildable indexes；
- ingestion 不会与用户写入争抢数据库锁；
- corpus 损坏不会直接损坏客户记录。

`app.sqlite` 以 WAL 模式运行，并由 Litestream 持续复制到 Sydney object storage；Litestream 官方支持持续监控 SQLite 并复制到 S3-compatible storage。[Litestream replication](https://litestream.io/reference/replicate/)

### Rust Search

独立 `search` 进程使用：

- Tantivy：BM25、field filters、facets、citation/exact indexes；
- USearch：量化 dense vectors；
- 小型本地 embedding/rerank runtime；
- localhost/Unix socket API，仅 app/worker 可访问。

Tantivy 将索引 segments 写入磁盘，适合我们的 immutable release 方式；USearch 支持多种量化格式以及 memory-mapped/view-from-buffer 索引，适合2GB服务器的受限内存环境。[Tantivy](https://docs.rs/tantivy/latest/tantivy/) [USearch](https://docs.rs/crate/usearch/latest/source/rust/README.md)

一个 release bundle：

```text
corpus-release-2026-08-02/
├── corpus.sqlite
├── tantivy/
├── vectors.usearch
├── embedding-manifest.json
└── release-manifest.json
```

Search process 验证 manifest 和 hashes 后才加载。

### Python 本地 pipeline

Python 只负责离线和数据工程：

- official source adapters；
- HTML/XML/PDF parsing；
- OCR orchestration；
- normalization；
- document/node identity matching；
- event/relation extraction；
- embedding batches；
- evaluation；
- candidate release building。

Python 不作为长期 production Web server，因此不会增加生产进程和服务器内存。

### 进程关系

```text
Cloudflare
    ↓
TypeScript app
    ├── app.sqlite
    ├── Rust search
    └── TypeScript worker
             ↓
       hosted model APIs

Local Python pipeline
    ↓
candidate release bundle
    ↓
object storage
    ↓
production validation/promotion
```

### 为什么不直接使用 Postgres/pgvector

目前不选择的原因：

- 托管 Sydney Postgres 已经吃掉大部分 A$50预算；
- 400万或缩减后的大规模 vector index 需要更高 RAM；
- auth、客户记录和早期任务量不需要多写节点；
- corpus 本质上更适合 immutable read-only releases；
- SQLite + Tantivy + quantized vectors 可以把计算转移到本地构建。

未来迁移边界很清楚：收入和并发增长后，先把 `app.sqlite` 迁移到 Postgres；CorpusRelease 和 search API 不需要同时重写。

### 技术风险

最大风险是 Rust search service 自定义开发。因此必须先用真实规模样本验证：

- 100万 chunks 的 index size；
- 2GB RAM 下启动内存；
- p95 search latency；
- concurrent query behaviour；
- USearch recall；
- release切换峰值内存。

如果 benchmark 不通过，优先减少 hot dense vectors，不缩减 lexical corpus。

你接受 TypeScript application + two SQLite databases + Rust Tantivy/USearch + local Python pipeline 这套技术栈吗？
</pre>

## 264 | User | 2026-08-02T12:17:32.352Z

<pre>
接受
</pre>

## 265 | Assistant | 2026-08-02T12:18:00.775Z

<pre>
接受，技术栈冻结。我会把 TypeScript、双 SQLite、Rust search 和本地 Python pipeline 写入存档；下一项把它们映射到具体的云端/本地部署拓扑和 A$50账单。
</pre>

## 266 | Assistant | 2026-08-02T12:19:18.986Z

<pre>
具体部署拓扑建议如下。

### 云端

```text
Cloudflare
├── DNS / TLS / CDN
├── Pages: static Web assets
├── Tunnel/proxy to origin
└── R2: public legal corpus artifacts

AWS Sydney
├── Lightsail 2GB / 60GB
├── attached 32GB SSD
└── S3: encrypted customer-data backups
```

### Lightsail 实例

使用 Sydney 区域的：

- 2GB RAM；
- 2 vCPU；
- 60GB system SSD；
- IPv6-only US$10/月方案；
- 额外32GB block storage，US$3.20/月。

AWS 当前公开价格支持这一组合；block storage 为 US$0.10/GB/月。[Lightsail instance pricing](https://aws.amazon.com/lightsail/pricing/) [Lightsail block storage](https://aws.amazon.com/lightsail/pricing/?c=ls&amp;p=pm&amp;z=1)

如果 Cloudflare Tunnel 的实际连通性或客户网络出现 IPv6 问题，再切换到含 IPv4 的 US$12方案，只增加约 A$3/月。

### 磁盘分配

System disk：

```text
/opt/aer/
├── releases/       application releases
├── data/
│   └── app.sqlite
├── logs/
└── temp/
```

Attached disk：

```text
/mnt/corpus/
├── active → releases/release_x
├── previous → releases/release_w
└── releases/
    ├── release_w/
    └── release_x/
```

附加盘独立于实例生命周期，可以单独 detach、移动和备份；AWS 也建议把需要更高持久性的内容放在 attached disk，而不是只依赖 system disk。[AWS block-storage guidance](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-block-storage.html)

每个 hot CorpusRelease 暂定硬上限约30–35GB。promotion 时短暂保留 active 与 candidate；完成验证后，旧版本可移回 R2，只在本地保留一个 rollback release。

### 运行进程

用 Docker Compose 或等效的 systemd-supervised containers：

```text
app          350–450MB
worker       250–350MB
search       700–900MB
litestream    50–100MB
cloudflared   50–100MB
OS/cache     remaining memory
```

约束：

- worker concurrency 初始为1；
- export、ingestion 和 answer jobs 分优先级；
- search 使用 memory-mapped indexes；
- 容器设置 memory limits；
- 不在生产服务器编译、embedding 或构建大索引；
- 可以配置小型 swap 防止瞬时 OOM，但正常运行不能依赖 swap。

实际内存分配以真实 benchmark 为准。

### Cloudflare

- Pages 托管 marketing、workspace 和 widget 的静态 assets；
- 静态请求在免费计划下免费且不限量；Functions/Workers 使用免费额度。[Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- Tunnel 让 origin 主动向 Cloudflare 建立 outbound-only connection，避免直接公开应用端口。[Cloudflare reference architecture](https://developers.cloudflare.com/reference-architecture/static/multi-vendor-application-security-performance.pdf)
- API 禁止边缘缓存客户数据；
- 公开法律 metadata、静态 assets 和安全的公开 product content 可以缓存；
- `/status` 页面不依赖 origin。

### 对象存储

#### Cloudflare R2

只保存公共、许可允许的法律资料：

- raw artifacts；
- normalized text；
- candidate/archived corpus releases；
- rebuildable indexes；
- public-source export dependencies。

150GB 预计约 US$2–3/月，且 R2 不收直接公网 egress；前10GB属于免费额度。[R2 pricing](https://developers.cloudflare.com/r2/pricing/)

因为这些是公开法律资料，所以不要求澳洲数据驻留。

#### AWS S3 Sydney

只保存：

- Litestream encrypted replicas；
- daily/weekly customer database backups；
- encryption metadata；
- disaster-recovery manifests。

不把客户数据备份放到 R2。

### 本地环境

开发电脑负责：

```text
source discovery development
full fetch/parse
OCR
normalisation
embedding
Tantivy/USearch build
600-case evaluation
release signing
upload candidate
```

生产服务器仍负责轻量增量 discovery；本地电脑关机不会阻止 source-health 检查，只会延后大型 rebuild。

### 月度预算

按约 `US$1 ≈ A$1.43`：

| 项目 | 预算 |
|---|---:|
| Lightsail 2GB | A$14–15 |
| 32GB block storage | A$4–5 |
| R2 corpus | A$3–4 |
| S3 Sydney backups | A$1–2 |
| Cloudflare Pages/Tunnel | A$0 |
| LLM/rerank hard budget | A$12 |
| Domain/email/波动预留 | A$8–12 |
| 合计 | **A$42–50** |

Cloudflare Paid Workers 不作为默认依赖；只有产生收入或免费额度不足时才启用。

你接受这套 Cloudflare + Sydney Lightsail + R2 public corpus + Sydney S3 customer backups + local build workstation 的部署拓扑吗？
</pre>

## 267 | User | 2026-08-02T12:22:09.559Z

<pre>
接受，所以用两个object store是因为R2便宜？
</pre>

## 268 | Assistant | 2026-08-02T12:22:35.459Z

<pre>
对，但不只是因为 R2 便宜。两个 object stores 分工不同：

| 存储 | 数据 | 选择原因 |
|---|---|---|
| Cloudflare R2 | 公开法律原文、normalized text、rebuildable indexes、CorpusRelease | 150GB 大容量便宜、无直接公网 egress 费 |
| AWS S3 Sydney | 加密后的客户数据库备份、Research Records、auth/audit 数据备份 | 明确的澳洲区域驻留，适合敏感客户数据 |

核心原则是：

- **Public and rebuildable** → R2
- **Private and irreplaceable** → S3 Sydney

R2 最大优势其实是免费 egress。开发电脑下载 corpus、生产服务器取得 candidate release、故障时重新部署，都不会因为反复下载产生不可预测费用。

S3 Sydney 的客户备份数据量很小，通常只有几百MB到数GB，因此月费很低；恢复时才读取，不追求免费 egress。

这样也形成安全隔离：

- R2 credential 即使泄漏，不能访问客户数据库备份；
- S3 backup role 不能读取整个法律 corpus；
- production search 不需要 S3 customer-backup 读取权限；
- 客户数据不会因为错误的 corpus upload 流程进入全球对象存储。

确实可以只用 S3 Sydney，并建立两个 bucket，但会有两个问题：

- 大型 corpus 和 release 反复下载可能产生更多 egress；
- A$50预算的波动空间更小。

所以当前选择两个 provider 是 **成本可预测性 + 数据驻留 + 权限隔离**，并非单纯省几块钱。代价是多管理一套凭证，但这个复杂度值得。
</pre>

## 269 | User | 2026-08-02T12:24:18.440Z

<pre>
那为什么不全用R2
</pre>

## 270 | Assistant | 2026-08-02T12:24:25.166Z

<pre>
关键问题是 R2 能否对客户备份提供我们已经承诺的“澳洲区域驻留”，而不是它能不能加密。我先核对 Cloudflare 当前官方的数据位置能力，再给你明确结论。
</pre>

## 271 | Assistant | 2026-08-02T12:24:47.507Z

<pre>
因为 R2 当前不能保证对象存储在澳洲。

Cloudflare R2 提供：

- `Oceania` Location Hint，但官方明确说这只是 **best effort，不是保证**；
- jurisdictional buckets 可以保证数据位置，但目前公开支持的 jurisdiction 只有 `EU` 和 `FedRAMP`，没有 Australia。[R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)

Cloudflare 的 Australia Regional Services 只限制 HTTPS 在澳洲解密和处理，并不等于 R2 对象一定存储在澳洲；而且 Data Localization Suite 是 Enterprise 付费 add-on，显然不符合 A$50预算。[Cloudflare Regional Services](https://developers.cloudflare.com/data-localization/regional-services/) [Region support](https://developers.cloudflare.com/data-localization/region-support/)

即使我们在上传前自行加密：

- Cloudflare 看不到数据库内容；
- 但加密后的对象物理上仍可能位于澳洲境外；
- 数据驻留条款通常仍把密文视为客户数据；
- `app.sqlite` 备份还包含用户邮箱、身份、audit 和 Research Records。

所以全用 R2 有两个选择：

1. 放弃“客户数据和备份位于澳洲”这个已接受要求；
2. 以后购买 Cloudflare Enterprise，并取得合适的数据本地化能力——远超预算。

因此当前最合理的划分仍是：

- R2：公开、可重建的法律 corpus；
- S3 Sydney：很小但敏感、不可替代的客户数据备份。

如果你认为澳洲数据驻留不是必须条件，我们确实可以全用 R2；但对于面向 payroll/HR 平台的 B2B 产品，我不建议为了每月省不到几澳元放弃这个卖点和安全边界。
</pre>

## 272 | User | 2026-08-02T12:25:06.761Z

<pre>
好的，同意，继续
</pre>

## 273 | Assistant | 2026-08-02T12:25:14.088Z

<pre>
接受，两个对象存储的边界冻结：R2 只放公开可重建 corpus，S3 Sydney 只放加密客户备份；R2 的 Oceania hint 不是澳洲驻留保证。下一项架构重点是 SQLite 没有 Postgres RLS 时，如何保证跨组织数据不会泄漏。
</pre>

## 274 | Assistant | 2026-08-02T12:25:48.705Z

<pre>
SQLite 没有 Postgres Row-Level Security，因此 tenant isolation 不能依赖开发者“记得加 `WHERE organization_id`”。建议从数据库结构、repository API 和自动测试三层强制。

### 1. 数据结构

所有客户资源都带 `organization_id`：

```sql
research_record (
  organization_id,
  research_record_id,
  ...
)
```

唯一约束和外键尽量采用复合键：

```text
PRIMARY/UNIQUE (organization_id, research_record_id)

answer_snapshot
  FOREIGN KEY (organization_id, research_record_id)
  REFERENCES research_record (organization_id, research_record_id)
```

这样即使应用层写错，也不能把 Organization A 的答案关联到 Organization B 的 Research Record。

### 2. TenantContext

认证成功后，应用建立不可变 context：

```ts
type TenantContext = {
  organizationId: OrganizationId;
  actor: Actor;
  permissions: Permission[];
  requestId: RequestId;
};
```

`organizationId` 只能来自：

- 已验证的 Web session；
- 已验证的 widget session；
- service-account credential。

不能来自 request body、query parameter 或普通 header。

### 3. Repository 设计

禁止这种接口：

```ts
findResearchRecordById(recordId)
```

必须是：

```ts
findResearchRecord(ctx, recordId)
```

Repository 内部自动加入 tenant predicate。业务模块不能直接取得裸 database connection。

跨组织操作只能走独立的 internal-admin repository，并要求：

- internal-admin identity；
- recent MFA；
- purpose/reason；
- audit event；
- 明确的 organization scope。

### 4. 授权顺序

每个请求：

```text
Authenticate actor
  → resolve organization
  → check membership/service-account status
  → evaluate permission scope
  → load tenant-scoped resource
  → execute
```

不能先按 ID 读取对象，再检查它属于哪个组织，因为对象存在性本身也可能泄漏。

因此不存在、无权限和属于其他组织的资源，对普通客户统一返回 `404`，不暴露差异。

### 5. Search 与 customer data 分开

公共法律 corpus 没有 tenant boundary，但搜索请求仍经过认证和额度控制。

Search process：

- 只读取 `corpus.sqlite` 和 indexes；
- 不读取 `app.sqlite`；
- 不知道客户问题、组织成员或 Research Records；
- 收到的是经过分类和 PII 检查的检索条件；
- 返回公共 legal node IDs 和 ranking results。

这降低 search service 被攻破时的客户数据影响。

### 6. Jobs/outbox

每个 job 和 outbox event 都必须携带：

- `organization_id`
- `actor_id`
- `resource_id`
- `permission_snapshot` 或重新授权策略

长时间排队的 job 执行前重新确认：

- 组织仍有效；
- actor/service account 未被撤销；
- 额度仍有效；
- 目标资源仍属于该组织。

### 7. 测试要求

每一个 tenant-owned endpoint 至少包含：

- A 可以访问 A；
- A 不能读取 B；
- A 不能修改 B；
- 猜测 B 的 opaque ID 仍返回404；
- service account scope 不足；
- membership 被撤销后的 queued job；
- Developer 不自动读取 Research Records；
- export/download URL 不能跨组织使用。

另外建立自动 schema check：任何新增 tenant-owned table 没有 `organization_id` 或明确 exemption 时，migration test 失败。

### 8. 数据库文件保护

- `app.sqlite` 只允许 app、worker 和 Litestream 系统账户访问；
- search process 只拥有 corpus files 的只读权限；
- corpus promotion process 不能读取客户数据库；
- S3 backup credential 只能写入指定 Sydney backup prefix；
- application-level encryption保护 SSO private keys、provider credentials 和 webhook secrets。

建议冻结为：

&gt; Tenant isolation is enforced structurally through organisation-scoped keys and repositories, not by convention. The public search process has no access to the customer database.

你接受这套 SQLite 下的 tenant isolation 架构吗？
</pre>

## 275 | User | 2026-08-02T12:27:13.610Z

<pre>
接受
</pre>

## 276 | Assistant | 2026-08-02T12:27:25.154Z

<pre>
接受，SQLite tenant isolation 冻结：复合组织键、TenantContext、强制 tenant-scoped repositories、跨租户404和自动越权测试共同承担边界；search 进程完全不能读取客户数据库。下一项把一次 Quick/Deep Answer 从请求到保存的运行时数据流定下来。
</pre>

## 277 | Assistant | 2026-08-02T12:27:53.093Z

<pre>
一次生成式回答的运行时流程建议如下。

### 1. Request admission

```text
Client
  → Cloudflare
  → TypeScript app
```

App 同步完成：

1. authentication；
2. TenantContext；
3. permission/rate limit；
4. PII detection；
5. request schema；
6. legal date/jurisdiction validation；
7. provider budget预估；
8. 幂等检查。

失败时不创建付费任务。

### 2. Transactional admission

在一次 `app.sqlite` transaction 中：

- 预留最大预计 research credits；
- 创建 `AnswerJob`；
- 保存 sanitized ResearchTurn（仅 `SAVE`）；
- 记录 `corpus_release_id`；
- 写入 outbox `answer.requested`；
- 记录 request/audit metadata。

随后返回 `202` 和 SSE URL。

特别重要：job 在创建时固定 `corpus_release_id`。即使运行期间 corpus promotion，整份答案也必须使用同一 release，不能前半段查旧版、后半段查新版。

### 3. Worker lease

Worker 采用 at-least-once job delivery：

```text
QUEUED
  → LEASED
  → RUNNING
  → COMPLETED / FAILED / CANCELLED
```

lease 包含 owner 和 expiry。Worker 崩溃后，lease 到期可以安全重试。

系统不声称 exactly-once execution；通过：

- Idempotency-Key；
- unique job operation IDs；
- transaction；
- provider call records；
- immutable Answer Snapshot；

实现 exactly-once observable result，避免客户得到或支付两份答案。

### 4. Reauthorization

执行前重新检查：

- actor/service account 是否仍有效；
- organization 是否 active；
- permission 是否仍存在；
- Research Record 是否仍属于组织；
- budget reservation 是否有效；
- job 是否已取消。

### 5. Retrieval

Worker 调用 localhost search process，并传入：

- pinned `corpus_release_id`；
- sanitized query；
- `legal_as_at`；
- jurisdiction/status/document filters；
- query plan；
- maximum candidates。

Search 返回 evidence candidates 和确定性 metadata，不接触组织数据库。

### 6. Evidence and generation

Worker：

1. 建立 evidence pack；
2. 检查 evidence sufficiency；
3. 必要时执行有上限 follow-up；
4. 通过 Model Gateway 调用批准的 provider；
5. 接收 structured claims；
6. 运行 deterministic validator；
7. 有限修复或降级/refuse。

Model Gateway 负责：

- provider/model allowlist；
- zero-retention configuration；
- timeout；
- token/cost maximum；
- circuit breaker；
- request/response schema；
- usage measurement。

### 7. Atomic completion

成功时在一次 transaction 中：

- 创建 immutable Answer Snapshot；
- 保存 claims/citations/assumptions；
- 保存 RetrievalRun 和 ModelExecution metadata；
- 按实际成本结算 reservation；
- 释放未使用 credits；
- 更新 job status；
- 写入 outbox events；
- 记录 audit。

只有 transaction commit 后才发送 `job.completed`。客户端不会看到一个数据库中不存在的完成答案。

失败或取消时：

- 保存安全的 failure code；
- 结算已实际发生的供应商费用；
- 释放其余 reservation；
- 不创建半成品 `SUPPORTED` snapshot。

### 8. SSE delivery

SSE events 由已持久化 job events 驱动，不只存在内存里：

- 客户断线后可用 Last-Event-ID 继续；
- app 重启后仍能恢复进度；
- 多次 delivery 不改变 job；
- SSE 中不包含 hidden reasoning 或 provider raw payload。

### 9. Correction/alert fan-out

完成 transaction 中产生的 outbox events，再由 worker异步处理：

- email；
- webhook；
- watchlist impact；
- usage alert；
- review notification。

这些通知失败不会回滚已经完成的合法答案，但会独立重试。

建议冻结为：

&gt; Answer jobs use at-least-once processing with idempotent, transactionally committed observable results. Each job is pinned to one corpus release, and completion is visible only after evidence, validation, usage and snapshot data commit atomically.

你接受这套 Answer runtime data flow 吗？
</pre>

## 278 | User | 2026-08-03T00:50:58.030Z

<pre>
接受
</pre>

## 279 | Assistant | 2026-08-03T00:51:15.538Z

<pre>
接受，Answer runtime flow 冻结：任务固定单一 corpus release，以 at-least-once 执行配合幂等与原子提交；只有答案、证据、成本和审计都提交后才对客户端宣布完成。我先同步 3 August 的阶段记录，下一项确定 CorpusRelease 如何安全上线和回滚。
</pre>

## 280 | Assistant | 2026-08-03T00:51:47.436Z

<pre>
CorpusRelease 的上线流程建议做到“生产只验证和切换，不在生产上构建”。

### 1. 本地构建

本地 pipeline 从固定的 SourceArtifacts 构建 candidate：

```text
SourceArtifact manifest
  → parse/normalise
  → corpus.sqlite
  → Tantivy index
  → USearch index
  → evaluation subset
  → release manifest
```

Release manifest 至少记录：

- `corpus_release_id`
- parent release；
- schema versions；
- parser/chunker/embedding/index versions；
- included SourceArtifact hashes；
- document/version/node/chunk counts；
- jurisdiction/source coverage；
- quarantine summary；
- evaluation results；
- 每个文件的 size/hash；
- minimum compatible app/search versions；
- build timestamp。

### 2. 签名和上传

candidate 在本地构建完成后：

- 生成不可变 manifest；
- 使用 release-signing key 签名；
- 上传到 R2 staging prefix；
- 上传完成后再写 final marker；
- 缺少 final marker 的 release 永远视为 incomplete。

Signing private key 不放在生产服务器普通运行环境中。

### 3. Production preflight

生产管理员请求验证时：

1. 下载 manifest；
2. 验证签名；
3. 验证 app/search/schema compatibility；
4. 检查磁盘容量；
5. 下载到临时目录；
6. 校验每个文件 hash 和 size；
7. 以 read-only 方式打开 `corpus.sqlite`；
8. 检查 Tantivy/USearch index；
9. 运行 production smoke queries；
10. 对比 active release 的 counts 和 critical authorities。

任何一步失败，candidate 留在 quarantine，不影响当前 release。

### 4. Shadow search

candidate 由临时 shadow search process 加载：

- 不接收客户请求；
- 运行 citation、date、jurisdiction 和 known-query smoke tests；
- 测量启动内存和基本延迟；
- 确认没有意外删除关键 documents；
- 确认 manifest 中声明的版本与实际 index 一致。

2GB 内存不足以同时加载两套完整向量索引时，shadow process 采用逐项验证或 maintenance window，而不是冒险 OOM。

### 5. Atomic promotion

Promotion 顺序：

```text
freeze new Answer admissions briefly
  → wait for short pinned jobs to drain
  → switch active release pointer
  → restart/reload search
  → health and smoke checks
  → resume admissions
```

普通 Search 可以在旧 search process 存活期间继续；如果不能安全并存，则进入短暂 maintenance。

Active pointer 使用原子文件/symlink replacement，并同时写入 `app.sqlite` 的 active-release record。

### 6. 已运行任务

- 每个 Answer job 固定 release ID；
- promotion 前等待正在使用旧 release 的短任务完成；
- 超时的 Deep Research 可以取消并安全重试，或延后 promotion；
- 旧 release 在所有引用 lease 结束前不能删除；
- 已完成 Answer Snapshots 永远保留原 release ID，即使本地 index 后来被移回 R2。

### 7. Rollback

如果 promotion 后 health check 或用户流量发现问题：

```text
pause admissions
  → switch pointer to previous verified release
  → reload search
  → integrity check
  → resume
```

随后：

- 创建 incident；
- 保留 failed release；
- 找出故障 release 期间生成的 answers；
- 标记 `REVIEW_REQUIRED`；
- 运行影响评测；
- 必要时发 correction。

### 8. 磁盘管理

本地通常保存：

- active release；
- previous verified release；
- candidate only during promotion。

更旧 releases 保存在 R2。删除本地 release 前验证：

- 不是 active/previous；
- 没有运行中的 pinned job；
- R2 artifact/hash 完整；
- rollback policy 允许删除。

建议冻结为：

&gt; Corpus releases are built and signed offline, verified in production as immutable bundles, and promoted by an atomic active-pointer switch. Production never mutates or rebuilds an active corpus in place.

你接受这套 build、sign、shadow validate、atomic promote 和 rollback 流程吗？
</pre>

## 281 | User | 2026-08-03T00:52:09.588Z

<pre>
接受
</pre>

## 282 | Assistant | 2026-08-03T00:52:18.689Z

<pre>
接受，CorpusRelease 生命周期冻结：离线构建与签名、生产只读验证、shadow smoke test、原子 pointer promotion，以及保留失败版本进行影响分析。下一项是代码如何从多-agent开发环境安全进入单节点生产。
</pre>

## 283 | Assistant | 2026-08-03T00:52:53.119Z

<pre>
代码发布建议采用 **build once, deploy artifact, manual production promotion**。

### 环境

预算内不保留第二台长期 staging server：

- local：完整开发与数据 pipeline；
- CI：自动构建和测试；
- preview：仅静态前端预览；
- production：Sydney 单节点；
- sandbox：production 中严格隔离的 sandbox organization，不是另一套服务器。

### Multi-agent 开发边界

多个 coding agents 可以并行修改模块，但默认：

- 不持有 production SSH、database、S3 backup 或 signing credentials；
- 不直接部署 production；
- 不修改 active corpus；
- 不运行会产生无限 provider 费用的测试；
- 只能使用 synthetic/local fixtures；
- 所有合并结果经过统一 CI。

### CI gates

每次合并至少运行：

- TypeScript typecheck；
- unit tests；
- API schema/OpenAPI compatibility；
- database migration validation；
- tenant-isolation tests；
- auth/permission tests；
- PII synthetic suite；
- citation validator tests；
- Rust build/tests；
- Python parser/unit tests；
- small retrieval/evaluation smoke set；
- dependency/security scan；
- artifact checksums。

Release candidate 额外运行：

- integration tests；
- backup/restore smoke test；
- 360 development + 120 validation；
- production-compatible container build；
- migration upgrade test；
- rollback compatibility test。

600-case full run用于正式 release candidate。

### 应用 artifact

CI 只构建一次：

```text
app-release-{version}/
├── Web assets
├── TypeScript server bundle
├── worker bundle
├── Rust search binary
├── migrations
├── OpenAPI schema
├── SBOM/dependency manifest
└── release manifest + hashes
```

生产不能重新执行 `npm install`、Rust compilation 或从浮动 dependency versions 构建。

### Production deployment

部署步骤：

1. 上传 versioned artifact；
2. 验证 hashes 和兼容版本；
3. 检查磁盘、backup 和当前 health；
4. 对 `app.sqlite` 生成 forced backup；
5. 运行 migration preflight；
6. 部署到新 release directory；
7. 启动新进程并执行 localhost health checks；
8. 原子切换 application release pointer；
9. 执行外部 smoke tests；
10. 保留上一 application release。

应用 release 与 CorpusRelease 分开版本化，但双方通过 compatibility ranges 检查。

### Database migrations

SQLite migration 必须遵循 expand/contract：

- 先添加 nullable columns/tables/indexes；
- 新旧 application release 短期内都能工作；
- backfill 在低优先级 worker 中执行；
- 删除/重命名 column 等 destructive migration 不和普通部署一起自动运行；
- migration 前强制 Litestream sync/full snapshot；
- migration 失败立即停止，不启动新版本。

由于单人公司，production promotion 使用：

- recent MFA；
- explicit release/version confirmation；
- changelog；
- manual click/command。

不要求第二个人审批。

### Rollback

如果只是应用错误且 schema 仍兼容：

- 切回 previous application pointer；
- 重启；
- smoke test。

如果 migration 已经改变数据：

- 优先使用向前修复；
- 只有明确验证恢复点和数据影响后才做 database restore；
- 不自动执行 destructive rollback。

### Feature flags

高风险功能通过配置启用：

- Deep Research；
- SSO enforcement；
- new provider/model；
- new source adapter；
- new CorpusRelease；
- widget；
- webhook delivery。

新代码可以先部署为 disabled，再对 internal/sandbox/单一 pilot organization 逐步启用。

建议冻结为：

&gt; Coding agents and CI may build and verify releases, but production deployment is a founder-authorised promotion of a prebuilt immutable artifact. Database and corpus releases are versioned independently and must declare compatibility.

你接受无常驻 staging server、CI 严格验证、预构建 artifact、人工 production promotion 和 feature flags 的发布架构吗？
</pre>

## 284 | User | 2026-08-03T01:12:16.242Z

<pre>
接受
</pre>

## 285 | Assistant | 2026-08-03T01:12:31.461Z

<pre>
接受，代码发布架构冻结：没有常驻 staging，CI 产出不可变 artifact，production 由你在 MFA 和备份检查后人工 promotion；agents 默认无生产权限。下一项是低成本 observability——哪些必须记录、哪些不能记录，以及怎样在没有 Datadog 的情况下及时发现问题。
</pre>

## 286 | Assistant | 2026-08-03T01:13:10.237Z

<pre>
建议 observability 采用 **structured logs + lightweight metrics + external health checks**，不部署 Datadog、Splunk、完整 Prometheus/Grafana 集群。

### Structured logs

app、worker 和 search 都输出 JSON：

```json
{
  &quot;timestamp&quot;: &quot;...&quot;,
  &quot;level&quot;: &quot;INFO&quot;,
  &quot;service&quot;: &quot;worker&quot;,
  &quot;request_id&quot;: &quot;req_...&quot;,
  &quot;job_id&quot;: &quot;job_...&quot;,
  &quot;organization_id_hash&quot;: &quot;...&quot;,
  &quot;event&quot;: &quot;answer.completed&quot;,
  &quot;duration_ms&quot;: 8421,
  &quot;status&quot;: &quot;CONDITIONAL&quot;
}
```

可以记录：

- opaque/hashes 后的技术 IDs；
- operation type；
- status/error code；
- latency；
- token/cost；
- corpus/app/model versions；
- queue/attempt information。

禁止记录：

- question/answer正文；
- evidence passages；
- PII findings 原文；
- password/session；
- API/webhook secrets；
- SAML assertions；
- provider request/response payload；
-完整 source documents。

### Correlation

贯穿所有组件：

```text
request_id
  → job_id
  → retrieval_run_id
  → model_execution_id
  → answer_snapshot_id
```

Rust search 返回相同 request ID；provider raw payload 不进入日志，但保存 provider request ID 以便排障。

### Logs 与 audit 分开

- application logs：技术诊断，可轮换删除，14天；
- audit events：谁对客户/安全资源做了什么，保存12个月；
- security events：登录、MFA、SSO、key、越权、break-glass；
- Research Record content：只存在业务数据库，不复制进日志。

Audit 不能因为 log rotation 被删除。

### 必须监控的 metrics

#### Server

- CPU、memory、swap；
- system/attached disk；
- open files；
- process restart；
- Litestream replication lag；
- backup age。

#### Application

- request count/error/latency；
- authentication failures；
- active sessions；
- rate-limit events；
- tenant authorization failures；
- PII blocks；
- SSE connections。

#### Jobs

- queue depth；
- oldest queued age；
- lease expiry/retry；
- failed/dead jobs；
- Quick/Deep completion time；
- export/webhook backlog。

#### Search

- p50/p95 latency；
- zero-result rate；
- lexical/dense/rerank time；
- loaded corpus release；
- index load memory；
- candidate count；
- exact citation success。

#### Legal quality

- source freshness；
- ingestion failures；
- quarantine growth；
- citation-validator failures；
- `SOURCE_NOT_CURRENT`；
- `INSUFFICIENT_EVIDENCE`；
- corrections and impacted records；
- evaluation regressions。

#### Cost

- current AI spend/reservation；
- per-organization usage；
- abnormal token growth；
- provider failure/rate limits；
- R2/S3/Lightsail budget forecast。

### 存储

- local logs 按时间和大小双重 rotation；
- 总日志磁盘硬上限；
- warning/error 保留14天；
- debug 默认关闭，临时启用时自动过期；
- aggregated hourly/daily metrics 存入小型 metrics tables；
- 不保存高基数、无限增长的 raw traces；
- crash dumps 默认关闭，防止内存中的 secrets 被写盘。

### Alerts

即时告警：

- app/search process unavailable；
- disk &gt;85%；
- memory/OOM restart；
- backup/replication超过目标；
-跨租户授权异常；
- budget 90%/100%；
- critical source stale；
- citation validator 异常上升；
- CorpusRelease promotion失败；
- SEV-1/2 incident。

摘要告警：

- 普通 source failures；
- quarantine growth；
- queue latency；
- webhook failures；
- evaluation drift。

避免同一个底层故障发送数百封邮件，告警按 incident key 去重和合并。

### External checks

使用独立于 Lightsail 的外部检查：

- marketing/status page；
- `/health/live`；
- `/health/ready`；
- authenticated synthetic Search；
- 定期 synthetic Quick Answer，但严格受预算控制。

`live` 只表示进程运行；`ready` 还验证数据库、search release 和必要依赖一致。

### 隐私与调试

需要排查具体客户问题时：

- 由客户提交 Issue Report；
- 使用 request/answer IDs 定位；
- 必须获得适当权限；
- 不通过打开全量正文日志解决；
- 临时诊断访问写入 audit。

建议冻结为：

&gt; Observability records operational facts and correlations, not customer research content. Logs are bounded and disposable; audit/security records are separately retained and backed up.

你接受这套不依赖昂贵监控平台的 observability 架构吗？
</pre>

## 287 | User | 2026-08-03T01:45:19.960Z

<pre>
接受
</pre>

## 288 | Assistant | 2026-08-03T01:45:41.993Z

<pre>
接受，observability 架构冻结：有界结构化日志、轻量指标和外部健康检查；日志不复制客户研究正文，audit/security 单独保留。下一项把 RPO 15分钟、RTO 4小时落实成可执行的备份与灾难恢复流程。
</pre>

## 289 | Assistant | 2026-08-03T01:46:27.462Z

<pre>
备份按“不可替代数据”和“可重建数据”分别处理。

### 需要备份

`app.sqlite`：

- identities；
- organisations/memberships；
- Research Records；
- Answer Snapshots；
- comments/reviews；
- audit/security events；
- usage/jobs；
- SSO/widget/webhook configuration。

另外保存：

- application release manifest；
- active CorpusRelease ID；
- deployment configuration；
- encryption-key identifiers；
- recovery instructions。

### 不需要传统备份

以下从 immutable artifacts 重建：

- `corpus.sqlite`；
- Tantivy indexes；
- USearch vectors；
- application containers/binaries；
- static Web assets；
- downloaded public source files。

它们已存在于 R2 release/artifact storage，不能再重复占用 S3 backup。

### Litestream

`app.sqlite` 使用 WAL + Litestream 持续复制到 S3 Sydney：

```text
app.sqlite/WAL
  → Litestream
  → S3 Sydney backup bucket
```

目标是正常情况下 replication lag 小于15分钟。超过阈值立即告警。

### Retention

- continuous generations：满足约15分钟 RPO；
- daily forced snapshot：保留7天；
- weekly recovery point：保留30天；
- monthly restore test；
- organisation删除数据仍会随最长30天 backup lifecycle 消失。

Retention 由 S3 lifecycle 和备份策略控制，不能由普通 application API 更改。

### 加密与权限

- TLS in transit；
- S3 server-side encryption by default；
- 数据库中的 SSO private keys、provider credentials、webhook secrets 等额外做 application-level encryption；
- production backup writer 只获得指定 bucket/prefix 所需的最小权限；
- 普通 app/worker 不持有 backup credential；
- destructive backup deletion权限不放在生产服务器；
- restore credential 作为 break-glass secret 离线保存；
- bucket versioning/lifecycle 防止普通服务器故障同时破坏所有恢复点。

### Forced backup 时机

除周期任务外，下列操作前强制建立恢复点并确认完成：

- database migration；
- application release promotion；
- auth schema change；
- bulk customer-data operation；
- organisation-wide import/delete；
- encryption-key rotation。

CorpusRelease promotion 不改变 `app.sqlite` schema 时仍保存 active-pointer state，但不复制 corpus bundle 到 S3。

### Restore test

每月在隔离目录或本地测试环境：

1. 选择一个恢复时间点；
2. restore `app.sqlite`；
3. 运行 integrity check；
4. 验证 migrations/schema；
5. 加载对应 application artifact；
6. 取得声明的 CorpusRelease；
7. 验证 Research Record/Answer/citation references；
8. 生成 restore report；
9. 安全删除测试副本。

Restore 环境默认禁用：

- email；
- webhook；
- provider calls；
- SSO callbacks；
-真实 customer sessions。

避免恢复测试意外给客户发通知或产生费用。

### 整机恢复 runbook

Lightsail 实例彻底丢失时：

1. 创建新的 Sydney instance和attached disk；
2. 运行基础设施 bootstrap；
3. 安装受信 application artifact；
4. 用 break-glass credential恢复最新有效 `app.sqlite`；
5. 下载 active/previous CorpusRelease；
6. 验证 hashes和兼容性；
7. 启动 app/worker/search；
8. 运行 database、tenant、citation和search integrity checks；
9. 更新 Tunnel/origin；
10. 解除 maintenance mode；
11. 发布 incident update。

目标四小时内恢复核心 authenticated Search 和 Research Records；Quick/Deep 可以在模型和队列检查后稍晚恢复。

### 恢复优先级

1. Auth、组织和 Research Records；
2. Public legal Search；
3. Existing Answer Snapshots/citations；
4. Quick Answer；
5. Deep Research；
6. exports、alerts和非关键后台任务。

### 凭证恢复

离线 recovery package 至少包含：

- S3 restore access；
- encryption master-key recovery material；
- Cloudflare/AWS account recovery；
- release-signing public key；
- domain/DNS recovery；
- provider key rotation procedure。

不保存普通用户密码、完整 API keys 或可直接复用的客户 sessions。

建议冻结为：

&gt; Back up mutable customer state continuously to S3 Sydney; rebuild application and corpus components from immutable artifacts. Recovery is tested monthly in a notification- and provider-disabled environment.

你接受这套 backup、restore 和 whole-server disaster-recovery 架构吗？
</pre>

## 290 | User | 2026-08-03T01:51:05.669Z

<pre>
接受
</pre>

## 291 | Assistant | 2026-08-03T01:51:19.305Z

<pre>
接受，备份与灾难恢复冻结：只持续备份不可替代的 `app.sqlite` 到 S3 Sydney，可重建的应用和 corpus 从不可变 artifacts 恢复；每月在禁止通知和模型调用的隔离环境做 restore test。下一项完成安全架构与 RAG 特有威胁边界。
</pre>

## 292 | Assistant | 2026-08-03T01:51:54.604Z

<pre>
安全架构应覆盖普通 SaaS 威胁和 RAG 特有的 **source poisoning/prompt injection**。

### Trust boundaries

```text
Internet/customer input       = untrusted
Official source content       = untrusted data
Customer widget host page     = untrusted
Model output                  = untrusted
Signed application/corpus     = trusted after verification
Validated structured answer   = trusted for display
```

即使内容来自官方域名，也不能把 HTML、PDF 文本当成程序指令。

### Edge 与 origin

- Cloudflare 提供 TLS、基础 DDoS/rate limiting；
- origin 通过 outbound tunnel访问；
- app/search/database端口不直接公开；
- internal admin route 使用独立权限、短 session、MFA和更严格限流；
- `/health` 不返回版本、文件路径、数据库或依赖细节；
- production禁止目录浏览、debug endpoints和source maps公开泄漏。

### Web 安全

- secure/HttpOnly/SameSite cookies；
- CSRF protection；
- strict CSP；
- output encoding和sanitisation；
- frame ancestors限制；
- widget iframe只允许登记origin；
- `postMessage` 校验 exact origin与schema；
- signed download URL短期有效；
- 不把API/widget token放进URL、analytics或localStorage；
- 登入、邀请、恢复、MFA、SSO和key创建全部限流。

### Source adapter 安全

采集器只访问source allowlist：

- HTTPS only；
- 校验最终redirect domain；
- 拒绝private、loopback、link-local和metadata IP；
- 防DNS rebinding；
- 限制redirect次数；
- 限制content type、文件大小和下载时间；
- HTML禁用脚本执行；
- archive/PDF防zip bomb和解析资源耗尽；
- OCR/parser使用隔离进程和CPU/memory/time limits。

这样防止恶意或被入侵的官方页面利用采集器实施SSRF或耗尽本地资源。

### RAG prompt injection

Source text仅作为带边界的数据传给模型：

```text
[EVIDENCE ev_12]
...source text...
[/EVIDENCE]
```

规则：

- evidence中的“ignore previous instructions”只是引用文本；
- 模型不能根据source内容调用tool、扩大检索范围或修改system policy；
- source不能指定provider、URL、API或execution command；
- 模型只能引用系统提供的evidence IDs；
- generation无任意Web访问、shell、database或customer-data tool；
- structured output通过schema和deterministic validator；
- source中隐藏文本、极端重复、instruction-like内容可标记为suspicious。

### Model output

模型输出在进入Web前视为不可信：

- JSON schema validation；
- claim/citation validation；
- Markdown/HTML sanitisation；
- URL只允许来自系统source registry；
- 不执行模型输出中的代码；
- 不自动发email、webhook或修改watchlist；
- action suggestions只能显示给用户，不能成为自动高影响操作。

### Secrets

- production secrets不进入repository、CI logs或agent context；
- 独立凭证用于R2 corpus、S3 backup、email和model providers；
- S3 restore/signing authority离线；
- secrets支持轮换和expiry；
- webhook/API key只保存hash；
- SSO private keys和provider secrets进行application-level encryption；
- 暴露怀疑触发立即revoke/rotate并创建security event。

### Supply chain

- dependency lockfiles；
- immutable CI builds；
- artifact hashes；
- SBOM；
- dependency/security scans；
- container/base image固定digest；
- corpus manifest签名；
- release compatibility checks；
- high-risk dependency update触发相关security/retrieval tests。

不允许运行时从任意URL下载插件、模型或执行代码。

### Authorization 与滥用

- deny by default；
- TenantContext和复合组织键；
- scopes、rate limits、credit limits；
- API/widget异常模式自动暂停credential；
- internal admins不能无审计读取客户正文；
- support/debug访问有reason和expiry；
- break-glass使用即时告警。

### Security validation

MVP不要求昂贵渗透测试服务，但必须自动执行：

- OWASP API/Web测试；
- cross-tenant tests；
- SSRF/redirect/DNS tests；
- auth/session/MFA tests；
- prompt-injection corpus cases；
- XSS/Markdown tests；
- malicious file/parser tests；
- secret scanning；
- dependency/container scanning；
- backup credential和origin exposure checks。

同时发布 `security.txt` 和漏洞报告邮箱。

建议冻结为：

&gt; Source content and model output are always untrusted data. Neither may invoke tools, select URLs, execute actions, or bypass deterministic policy and citation validation.

你接受这套 Web、ingestion、RAG injection、secret、supply-chain 和 authorization 安全架构吗？
</pre>

## 293 | User | 2026-08-03T01:53:17.623Z

<pre>
接受
</pre>

## 294 | Assistant | 2026-08-03T01:53:27.838Z

<pre>
接受，安全架构冻结：official source text 和模型输出始终是不可信数据，不能调用工具、选择任意URL、执行动作或绕过确定性验证。下一项是为多-agent并行开发确定 monorepo 目录和模块所有权，避免大家同时改同一核心文件。
</pre>

## 295 | Assistant | 2026-08-03T01:54:06.890Z

<pre>
建议 monorepo 采用以下结构：

```text
australia-employment-rag/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   ├── admin/
│   └── widget/
│
├── services/
│   └── search-rs/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── database/
│   ├── auth/
│   ├── retrieval-client/
│   ├── model-gateway/
│   ├── pii/
│   ├── citations/
│   ├── jobs/
│   ├── observability/
│   ├── ui/
│   └── sdk-typescript/
│
├── pipelines/
│   ├── ingestion/
│   ├── adapters/
│   ├── corpus-builder/
│   ├── embeddings/
│   └── evaluation/
│
├── sdk/
│   └── python/
│
├── schemas/
│   ├── openapi/
│   ├── events/
│   ├── corpus-manifest/
│   └── evaluation/
│
├── evals/
│   ├── cases/
│   ├── gold/
│   ├── splits/
│   └── reports/
│
├── infra/
│   ├── compose/
│   ├── cloudflare/
│   ├── aws/
│   ├── backup/
│   ├── deploy/
│   └── recovery/
│
├── docs/
│   ├── discovery/
│   ├── adr/
│   ├── runbooks/
│   └── api/
│
└── tests/
    ├── integration/
    ├── tenant-isolation/
    ├── security/
    └── e2e/
```

### 边界说明

#### `apps`

只负责可部署入口：

- `web`：customer workspace；
- `api`：Fastify REST/SSE；
- `worker`：jobs/outbox；
- `admin`：内部管理UI；
- `widget`：sandboxed iframe app。

业务规则不能只写在 route handler 或 React component 中。

#### `packages/domain`

保存纯业务规则和类型：

- legal status；
- answer status；
- workflow transitions；
- permission decisions；
- evidence sufficiency；
- budget reservation；
- incident severity。

不依赖 Fastify、React 或具体数据库。

#### `packages/contracts`

唯一的跨进程 contract source：

- request/response schemas；
- SSE event types；
- internal search protocol；
- webhook payload；
- stable enums。

OpenAPI 和 SDK 类型从这里生成，不能分别手写三份。

#### `packages/database`

只管理 `app.sqlite`：

- schema；
- migrations；
- tenant-scoped repositories；
- transaction/outbox；
- encryption codecs。

`corpus.sqlite` schema/build logic属于 pipeline/search contract，不允许普通 application migration修改。

#### `services/search-rs`

Rust进程独立拥有：

- Tantivy schema/query；
- USearch index；
- query embedding/rerank；
- corpus release load/validation；
- localhost protocol。

它不导入customer database schema。

#### `pipelines`

Python pipeline拥有：

- source adapters；
- parsing/normalization；
- canonical identity resolution；
- event/relation extraction；
- chunk/embedding；
- evaluation；
- CorpusRelease build。

每个 official source adapter 在独立目录中，避免一个agent修改FWC时破坏ATO。

### Generated code

以下由生成器产生，禁止手工修改：

- OpenAPI clients；
- TypeScript/Python SDK models；
- event-schema bindings；
- corpus-manifest bindings；
- database migration snapshots。

CI 检查生成结果是否与source schema一致。

### Multi-agent ownership

并行开发时按 bounded workstream分配：

- Identity/tenancy；
- Corpus model/pipeline；
- Search；
- Ask/evidence validation；
- Web/workspace；
- API/SDK/widget；
- Monitor/exports；
- Evaluation/security/infra。

高冲突文件实行单一owner：

- root dependency lockfile；
- OpenAPI root；
- `app.sqlite` migration sequence；
- canonical enums；
- CorpusRelease manifest schema；
- production compose/deploy files。

Agent 需要修改这些文件时先提交小型contract change，再让各模块根据新contract适配。

### ADR

关键技术决策放进 `docs/adr/`：

- SQLite over Postgres；
- split app/corpus databases；
- Tantivy/USearch；
- R2 vs S3 boundary；
- immutable CorpusRelease；
- bounded agentic research；
- evidence-first generation；
- no persistent staging；
- single-node recovery targets。

Discovery decision log记录“产品决定了什么”；ADR记录“技术上为什么这样实现”。

### 测试就近放置

模块单元测试与代码同目录；跨模块测试集中在根 `tests/`。600条评测单独保存在 `evals/`，不能混成普通unit fixtures。

建议冻结为：

&gt; Contracts and domain rules are centralised; deployable apps, search, pipelines and SDKs consume them. Multi-agent work is divided by bounded modules, while migrations and public contracts have serialized ownership.

你接受这套 monorepo 和 multi-agent ownership 结构吗？
</pre>

## 296 | User | 2026-08-03T02:19:45.129Z

<pre>
接受
</pre>

## 297 | Assistant | 2026-08-03T02:20:01.557Z

<pre>
接受，monorepo 与多-agent ownership 冻结：contracts/domain集中，apps/search/pipelines/SDK分界清楚；migration、公开contract和release schema串行管理。下一步我会把所有已接受架构合成一张总图，检查有没有互相矛盾的地方，再决定架构阶段是否可以关闭。
</pre>

## 298 | Assistant | 2026-08-03T02:20:50.426Z

<pre>
把所有已接受决定合并后，整体架构如下：

```text
┌─────────────────────────────────────────────────────────┐
│ Clients                                                 │
│ Web &#183; Admin &#183; Widget &#183; TypeScript SDK &#183; Python SDK       │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────┐
│ Cloudflare                                               │
│ DNS &#183; TLS &#183; CDN &#183; Pages &#183; origin tunnel &#183; rate limits    │
│ Public static assets only; no customer-data caching      │
└──────────────────────────┬──────────────────────────────┘
                           │ private origin path
┌──────────────────────────▼──────────────────────────────┐
│ Sydney Lightsail                                         │
│                                                         │
│  ┌──────────────┐        ┌──────────────────────────┐   │
│  │ TypeScript   │        │ app.sqlite               │   │
│  │ app/API/auth ├───────►│ auth &#183; tenants &#183; records │   │
│  └──────┬───────┘        │ jobs &#183; audit &#183; usage     │   │
│         │                └──────────┬───────────────┘   │
│         │ durable job/outbox        │ Litestream         │
│  ┌──────▼───────┐                   │                    │
│  │ TypeScript   │                   │                    │
│  │ worker       │                   │                    │
│  └───┬─────┬────┘                   │                    │
│      │     │                        │                    │
│      │     └─────────────┐          │                    │
│  ┌───▼──────────┐  ┌─────▼───────┐  │                    │
│  │ Rust search  │  │ Model       │  │                    │
│  │ Tantivy      │  │ Gateway     │  │                    │
│  │ USearch      │  └─────┬───────┘  │                    │
│  └───┬──────────┘        │          │                    │
│      │ read-only         │          │                    │
│  ┌───▼────────────────┐  │          │                    │
│  │ CorpusRelease      │  │          │                    │
│  │ corpus.sqlite      │  │          │                    │
│  │ lexical + vectors  │  │          │                    │
│  └────────────────────┘  │          │                    │
└──────────────────────────┼──────────┼────────────────────┘
                           │          │
                   validated hosted  │
                   model provider    │
                           │          ▼
                   no training /   S3 Sydney
                   approved retention
                                      ├── customer DB backups
                                      └── private export artifacts

Official sources
      │
      ▼
Local Python pipeline
fetch &#183; parse &#183; normalise &#183; embed &#183; evaluate &#183; sign
      │
      ▼
Cloudflare R2
public legal artifacts &#183; candidate releases &#183; old indexes
      │
      ▼
Production verify &#183; shadow test &#183; atomic promotion
```

### 一个需要补正的细节

整合时发现：PDF/DOCX/JSON Research Record exports 包含客户内容，因此不能放进 R2。

正确分工应为：

- R2：仅公共法律 corpus 和可重建 indexes；
- S3 Sydney `backups/`：Litestream 和恢复点；
- S3 Sydney `exports/`：七天自动删除的私有客户导出文件。

两个 S3 prefixes 使用不同 IAM permissions。这个调整费用几乎可以忽略，但能保持澳洲数据驻留承诺。

### 系统不变量

整个架构依赖以下不可破坏规则：

1. 客户数据只存在 Sydney origin、S3 Sydney 或经过批准的瞬时模型处理链路。
2. R2 永远不保存客户 Research Records、answers、exports 或身份数据。
3. Search process 永远不能读取 `app.sqlite`。
4. 模型永远不能自行访问数据库、Web、shell 或任意工具。
5. 每份答案固定一个 CorpusRelease。
6. Citation 永远指向 immutable NodeVersion，而不是 SearchChunk。
7. CorpusRelease 和 application release 都不原地修改。
8. 所有客户资源访问先确定 TenantContext。
9. AI 额度耗尽时停止生成，不降低模型或引用标准。
10. active database、application 和 corpus 版本不兼容时，系统进入 maintenance，不带病回答。

### 仍需 benchmark 决定的参数

这些不是架构缺口，而是实现期评测参数：

- 最终 embedding model；
- Quick/Deep generation model aliases；
- 本地 reranker model；
- Tantivy schema/tokenizer细节；
- hot vector数量；
- 每个 CorpusRelease 的最大磁盘尺寸；
- 2GB环境下的并发和memory limits；
- source-specific chunking；
- provider timeout和token ceilings。

它们必须通过真实语料 benchmark 和600条评测决定，不能在没有数据时拍脑袋固定。

如果你接受这张总图及“private exports 改存 S3 Sydney”的补正，那么架构阶段就可以正式关闭。下一步先做一次完整决策复盘，然后再生成最终英文 PRD。
</pre>

## 299 | User | 2026-08-03T02:23:56.185Z

<pre>
接受
</pre>

## 300 | Assistant | 2026-08-03T02:24:14.572Z

<pre>
接受，整体架构和 S3 private-export 补正冻结。架构阶段正式结束。我会先更新存档并做一次“矛盾、缺口、仍是 TBD 的参数”审计；不会直接把未经复盘的内容写成最终 PRD。
</pre>

## 301 | Assistant | 2026-08-03T02:25:33.238Z

<pre>
第一轮一致性审计结果：目前没有发现架构级矛盾，A$50预算、澳洲客户数据驻留、完整法律范围、分层语义索引、严格引用和单节点恢复方案能够同时成立。

但在写最终 PRD 前，还有几个细节需要冻结：

1. 客户自带模型 API key 的安全生命周期；
2. `EPHEMERAL` 问答正文究竟保留多久；
3. 600条评测与模型选型的正式晋级流程；
4. 完整 source catalogue 的交付顺序；
5. MVP 组织额度和付费 pilot 的默认限制；
6. 最终 PRD 如何取代乱码的旧 `PRD.md`。

我们逐项处理。

### 客户 BYOK

建议 MVP 支持，但只允许平台已经集成和评测过的 provider，不能让客户填写任意 API endpoint。

组织 Owner/Admin 可以配置：

```text
Provider
Credential
Allowed model profiles
Monthly organisation limit
Status
```

安全规则：

- key 只在配置时提交；
- 使用 application-level encryption 保存；
- encryption master key 与 `app.sqlite` 分开；
- 只有 Model Gateway 可以在调用时解密；
- key 不进入日志、export、audit detail 或 support UI；
- UI 只显示 provider、key prefix、创建时间和最后使用时间；
- 支持 test、rotate、disable 和 delete；
- 客户 key 不用于我们的 evaluation、ingestion或其他客户；
- 不允许 arbitrary base URL，防止 SSRF 和数据外传；
- 仅允许通过600条评测晋级的 model profiles；
- BYOK provider失败时不自动使用你的平台 key；
- 客户必须明确开启“允许使用平台额度”才能 fallback，而且仍受A$12总预算限制；
- BYOK 调用不计入你的AI账单，但仍受rate limit、abuse control和technical quota约束；
- provider的数据处理、retention和region由客户自己的provider合同决定，产品必须明确提示这一点。

建议冻结为：

&gt; BYOK changes who pays and which customer-controlled provider account processes the request; it does not bypass the platform’s model allowlist, evidence pipeline, validation, safety rules or rate limits.

你接受这个 BYOK 边界吗？
</pre>

## 302 | User | 2026-08-03T02:26:21.069Z

<pre>
接受
</pre>

## 303 | Assistant | 2026-08-03T02:26:38.528Z

<pre>
接受，BYOK 边界冻结：客户只改变付费账户，不能绕过 provider/model allowlist、证据管线、安全验证和额度控制。我会记录；下一项给 `EPHEMERAL` 明确一个不会进入备份的保留期限。
</pre>

## 304 | Assistant | 2026-08-03T02:27:02.222Z

<pre>
### `EPHEMERAL` 保留策略

建议把 ephemeral 正文与 `app.sqlite` 分开，否则 Litestream 会把“临时内容”复制进30天备份。

使用本地、不可备份的：

```text
ephemeral.sqlite
```

它只保存：

- sanitized question/facts；
- temporary evidence pack；
- streamed answer sections；
- final ephemeral response；
- expiry time。

`app.sqlite` 只保存不含正文的：

- job ID；
- organization/actor；
- operation type；
- status；
- token/cost/latency；
- provider/model版本；
- failure code。

### TTL

- 任务运行期间保留；
- 完成后保留1小时，允许SSE重连和客户端取回结果；
- 从创建开始最长不超过24小时，包括排队时间；
- cancelled/failed任务正文最多保留1小时；
- cleanup job每5分钟删除过期内容；
- application启动时再次清理；
- `ephemeral.sqlite` 不进入Litestream、daily backup、export或support工具。

### 故障语义

因为内容不备份：

- server重启或磁盘故障可能丢失正在运行的ephemeral任务；
- 客户可以使用同一 `Idempotency-Key` 重新提交；
- 已经发生的provider费用仍记录；
- 产品不能承诺恢复ephemeral正文；
- 需要审计、export、review、version compare或法律变更提醒时必须使用 `SAVE`。

### 安全边界

- ephemeral不等于跳过PII检查；
- provider retention仍由平台配置或客户BYOK合同决定；
- ephemeral内容不进入日志；
- support只能看到技术metadata；
- completed response过期后返回 `410 EPHEMERAL_CONTENT_EXPIRED`；
- 删除后只保留usage/audit metadata，不保留可恢复的内容hash或snippet。

建议冻结为：

&gt; Ephemeral research content is stored only in a non-replicated local transient store, expires one hour after completion and no later than 24 hours after creation, and is not recoverable after expiry or server loss.

你接受这个 `EPHEMERAL` TTL 和不可备份策略吗？
</pre>

## 305 | User | 2026-08-03T02:27:11.425Z

<pre>
接受
</pre>

## 306 | Assistant | 2026-08-03T02:27:25.558Z

<pre>
接受，`EPHEMERAL` 保留策略冻结：正文仅进入不备份的临时数据库，完成后一小时、创建后二十四小时硬删除，故障后不承诺恢复。下一项是模型如何从 candidate 晋级为 Quick、Deep、rerank 或 embedding 的 production profile。
</pre>

## 307 | Assistant | 2026-08-03T02:27:59.678Z

<pre>
### Model profiles

生产系统不直接写死具体模型名称，而定义用途：

- `QUERY_EMBEDDING`
- `LOCAL_RERANK`
- `QUICK_SYNTHESIS`
- `DEEP_SYNTHESIS`
- `STRUCTURED_REPAIR`
- `EVALUATION_JUDGE`

每个 production profile 绑定精确 provider、model/version、参数、schema和retention policy。

### Candidate 晋级流程

#### 1. Compatibility gate

先检查：

- structured JSON/schema能力；
- context限制；
- pinned/versioned model可用性；
- no-training/retention条件；
-澳洲客户场景可接受的数据处理条款；
- token、latency和rate limits；
- 最大单次与月度成本。

不满足安全和成本条件的模型不进入质量测试。

#### 2. Development

使用360 development cases：

- 调整prompt；
- 调整evidence pack；
- 设置token/timeout；
- 分析failure categories。

只允许使用development split调参。

#### 3. Validation

冻结prompt和pipeline后运行120 validation cases。未达到launch thresholds的candidate淘汰，不能继续针对validation逐条调参。

#### 4. Blind test

通过validation后运行120 blind cases。Blind结果用于晋级决定，但具体gold答案不进入普通coding-agent context。

#### 5. Full regression

正式promotion前运行全部600条，并比较当前production profile：

- critical correctness；
- citation；
- refusal；
- latency；
- cost；
- schema failure；
- provider errors。

### 晋级条件

Candidate必须：

- 达到既定绝对launch gates；
- 没有critical temporal/jurisdiction regression；
- 没有新增unsupported definitive claims；
- schema成功率达到可接受阈值；
- 月度预测成本符合A$12模型预算或明确属于BYOK；
- latency符合对应Quick/Deep目标；
- provider retention和版本可锁定。

质量优先于价格。便宜但低于门槛的模型不能成为Quick profile。

### Fallback

Fallback不是“另一个看起来差不多的模型”。

每个fallback必须：

- 单独通过同样的评测；
- 拥有独立prompt/template version；
- 明确允许处理同类数据；
- 设置自己的cost ceiling；
- 只在配置允许时启用。

没有已验证fallback时，provider故障就返回temporarily unavailable。

### Embedding/reranker promotion

Embedding变化需要：

- 构建并存的新vector index；
- 对比retrieval recall@k；
- 检查legal identifier和long-tail recall；
- 验证内存/磁盘；
- 灰度切换index pointer；
- 保留旧index rollback。

Reranker变化必须验证它不会把精确citation、适用日期或高authority结果错误降级。

### Shadow evaluation

默认只使用synthetic/evaluation流量。不能把客户production查询偷偷发送给第二个candidate model。

只有客户明确opt-in anonymised product improvement时，才允许受控shadow；仍不得保存原始PII或把结果用于训练。

### Provider silent changes

- 保存provider返回的实际model/version；
- 检测alias或行为变化；
- 关键响应字段、cost或质量异常触发circuit breaker；
- 未重新评测前不把变化当作已批准版本。

建议冻结为：

&gt; A model is promoted by profile only after security/cost compatibility, development, validation, blind testing and full non-regression evaluation. Every fallback and embedding/reranker change requires its own evidence.

你接受这套模型晋级流程吗？
</pre>

## 308 | User | 2026-08-03T02:28:59.626Z

<pre>
接受
</pre>

## 309 | Assistant | 2026-08-03T02:29:17.071Z

<pre>
接受，模型晋级流程冻结：security/cost compatibility、development、validation、blind test和600条non-regression缺一不可；fallback、embedding和reranker都必须独立验证。下一项处理完整source catalogue的实施顺序，同时避免对客户声称无法证明的“绝对完整”。
</pre>

## 310 | Assistant | 2026-08-03T02:29:46.885Z

<pre>
完整 corpus 应通过一个公开可解释的 **Source Coverage Registry** 管理，而不是用一句“包含全部澳洲 employment law”掩盖资料缺口。

### Coverage 状态

每个 source group 必须标记：

- `FULL_TEXT_ACTIVE`
- `METADATA_AND_LINK_ACTIVE`
- `FRESHNESS_LIMITED`
- `LICENSING_RESTRICTED`
- `SOURCE_UNAVAILABLE`
- `PLANNED_NOT_ACTIVE`

MVP release 时，已同意的 mandatory source groups 不能仍是 `PLANNED_NOT_ACTIVE`。如果官方能力或licensing阻止全文，只能明确显示限制，不能假装完整。

### Wave 1：Primary operative law

优先建立整个时间和jurisdiction骨架：

- Federal Register of Legislation；
- NSW、Victoria、Queensland、WA、SA、Tasmania、ACT、NT legislation registers；
- commencement、amendment、repeal和historical versions；
- Fair Work Act/Regulations/NES；
-州和领地employment、industrial relations及long-service-leave基础法；
- Bills/Acts之间的稳定identity关系。

这是所有答案日期过滤的底座。

### Wave 2：Industrial instruments and payroll rules

- FWC modern awards；
- award variations、orders和pay data；
- enterprise agreements；
- agreement approval/variation/replacement/termination；
- Fair Work Ombudsman guidance；
- ATO PAYG、STP、FBT；
- superannuation与Payday Super；
- 八个payroll-tax authorities；
- classification、rates、allowances和coverage clauses。

这部分直接支持最早的payroll/HR platform客户和Coverage Navigator。

### Wave 3：Courts and tribunals

- High Court；
- Federal Court和Full Court；
- FCFCOA；
- FWC decisions和Full Bench；
- 各州/领地官方caselaw、court和tribunal portals；
- neutral citation；
- appeal/correction/treatment relationships；
- regulator decision summaries和impact materials。

只使用官方来源；商业headnotes不采集。

### Wave 4：Employment-adjacent regimes

按八州/领地覆盖：

- WHS/OHS regulators和legislation；
- discrimination/equal opportunity；
- workers compensation；
- labour hire licensing；
- portable long-service leave；
- workplace surveillance和employment privacy；
- whistleblowing；
- child employment；
- public-sector employment；
- migration/right-to-work；
-相关official guidance。

### Wave 5：Future and proposed law

- Commonwealth和州/领地Bills；
- explanatory memoranda；
- enacted-not-in-force amendments；
- consultations和draft instruments；
- commencement proclamations；
- proposed-law alerts。

它们进入同一LegalDocument/LegalEvent模型，但默认不参与current-law答案。

### 顺序不等于削减范围

这些wave是adapter和验证依赖顺序，不是v1、v2产品裁剪。MVP发布前五组都要达到active或明确受限状态。

### Source Coverage Registry 字段

每个官方入口记录：

- authority；
- jurisdiction；
- official URLs/domains；
- document types；
- available date range；
- full-text/metadata capability；
- history/version capability；
- change-detection method；
- licence status；
- adapter status/version；
- last discovery/reconciliation；
- expected/actual counts；
- known gaps；
- customer-visible coverage status。

### 发布声明

产品不应宣传：

&gt; Every Australian employment law document is included.

建议宣传：

&gt; AustraliaEmploymentRAG covers the agreed Commonwealth, state and territory employment-law source categories through a published official-source coverage registry, with visible currency, licensing and known limitations.

这仍然是完整范围的产品，但不做无法证明的绝对完整性保证。

### Release gate

MVP发布前：

- 每个mandatory source group都有owner/adapter/status；
- 不能存在未披露的source gap；
- current/historical date范围已验证；
- source count有baseline；
- freshness状态可见；
- licensing策略已应用；
-至少一个对应evaluation subset通过；
-任何limited source都在Search/Ask中显示warning。

你接受五个implementation waves、全部属于MVP，以及用可审计coverage registry代替“绝对无遗漏”宣传吗？
</pre>

## 311 | User | 2026-08-03T02:33:22.312Z

<pre>
接受
</pre>

## 312 | Assistant | 2026-08-03T02:33:41.909Z

<pre>
接受，source catalogue冻结：五个waves都是同一个MVP的实施顺序，所有mandatory groups上线时必须active或公开说明限制；用coverage registry证明范围，不宣传无法验证的“绝对无遗漏”。下一项冻结trial和paid pilot的默认额度，确保免费用户不能吃掉整月预算。
</pre>

## 313 | Assistant | 2026-08-03T02:34:19.026Z

<pre>
建议把 system capacity、trial entitlement 和 paid pilot entitlement 分开。

### System capacity baseline

这不是客户套餐，而是 MVP 必须测试通过的总规模：

- 最多10个organizations；
- 最多100名human users；
- 每月5,000次Search；
- 每月1,000次Quick Answers；
- 每月100次Deep Research；
- 100个active watchlists；
- 每月10,000次API calls。

超过不是立即崩溃，而是未承诺/未评测的容量。

### B2B trial

邀请制14天：

- 最多5名用户；
- 1个service account；
- 1,000次Search；
- 20次Quick Answers；
- 2次Deep Research；
- 5个watchlists；
- 500次API calls；
- sandbox widget；
- 不支持平台付费overage；
- 到期后保留只读Research Records 30天，除非客户要求立即删除。

Trial只使用你A$12模型预算中的专用小额度；多个trial不能共同突破系统熔断。

### 默认 paid pilot

人工开通、人工invoice：

- 最多25名用户；
- 5个service accounts；
- 每月5,000次Search；
- 250次Quick Answers；
- 25次Deep Research；
- 25次Compare/Coverage高级任务；
- 100个watchlists；
- 每月10,000次API calls；
- Web、SDK、widget、exports、SSO和MFA；
- email/webhook alerts；
- customer BYOK或预付额外AI credits。

这组额度可以按首个客户合同人工调整，不需要先建复杂billing engine。

### Research credits

外部显示简单操作额度，内部继续按research credits结算：

- Quick：基础1 credit；
- Coverage：基础2 credits；
- Compare：按dimension和复杂度预估；
- Deep：基础10 credits；
- 超过普通上下文/检索上限时，提交前显示额外credit预估。

只有实际开始付费模型调用才扣除；clarification、系统失败和未发生provider cost的取消不扣生成额度。

### Founder-funded 与 customer-funded 分开

两个ledger：

```text
FOUNDER_PLATFORM_BUDGET
CUSTOMER_PREPAID_OR_BYOK
```

- free trial和内部测试受A$12 founder模型预算约束；
- paid pilot的额外模型使用必须已经预付或使用BYOK；
- 不能先产生供应商费用、月底再希望客户付款；
- customer-funded cost不占你的A$50自有资金上限；
- 未预付且没有BYOK时，达到平台额度就暂停生成。

### 并发与滥用限制

默认每组织：

- 2个并发Quick；
- 1个并发Deep；
- 1个并发export；
- API/search短时burst后限流；
- webhook独立队列；
-异常service account可以单独暂停。

并发限制不改变月度entitlement。

### 价格

本轮只冻结额度，不冻结最终售价。第一位客户的价格应通过paid-pilot协商验证，不需要现在猜一个自助SaaS定价页。

建议冻结为：

&gt; Entitlements limit product use; prepaid/BYOK ledgers limit who funds variable AI cost; a separate global founder-funded circuit breaker prevents trials or internal use from exceeding the A$50 operating budget.

你接受这些 trial、paid pilot 和双成本账本的默认额度吗？
</pre>

## 314 | User | 2026-08-03T02:47:02.702Z

<pre>
接受
</pre>

## 315 | Assistant | 2026-08-03T02:47:18.151Z

<pre>
接受，trial、paid pilot、research credits和双成本账本冻结：免费/内部使用受founder预算熔断，客户的额外变量成本必须BYOK或预付。审计只剩最后一项——如何保存旧TaxRAG模板并让新的英文PRD成为唯一权威文件。
</pre>

## 316 | Assistant | 2026-08-03T02:48:05.410Z

<pre>
建议最终文档结构这样处理：

```text
PRD.md
docs/
├── archive/
│   └── PRD-taxrag-original.md
└── discovery/
    └── decision-log-2026-08-02.md
```

### `PRD.md`

成为唯一权威的英文 PRD，标题：

```text
AustraliaEmploymentRAG
Product Requirements and Technical Implementation Specification
MVP v1.0
```

它将包含：

1. Executive summary；
2. Product vision和success criterion；
3. users、use cases和product surfaces；
4. complete agreed legal scope；
5. source coverage和licensing；
6. functional requirements；
7. Search、Ask、Deep、Compare、Coverage和Monitor；
8. evidence/refusal/correction rules；
9. privacy、security、retention和legal boundaries；
10. organisation、roles、SSO、MFA和service accounts；
11. non-functional requirements；
12. evaluation和launch gates；
13. canonical data model；
14. REST API contracts；
15. retrieval/generation trade-offs；
16. final architecture；
17. deployment、backup、observability和DR；
18. cost model；
19. eight-week implementation plan；
20. risks、known limitations和future triggers；
21. definition of done；
22. appendices with statuses、enums和key workflows。

### 旧 `PRD.md`

旧文件：

- 不删除；
- 原字节保留；
- 移到 `docs/archive/PRD-taxrag-original.md`；
- 明确标记为superseded legacy template；
- 不尝试修复乱码后继续使用，以免误把旧范围带进新PRD。

### Discovery log

当前decision log继续保留，作为：

- 设计过程记录；
- 决策来源；
- 后续核对依据。

它不是客户文档，也不是最终implementation contract。

### 文档语言

- 最终PRD全部英文；
- code、schema、API和UI terminology全部英文；
- 我们之间的后续讨论继续中文；
- PRD中不保留对话式“你接受吗”等内容。

### 仍为benchmark参数的项目

最终PRD不会伪造模型和索引数字，会明确区分：

- fixed requirements；
- accepted architecture；
- benchmark-selected configuration；
- post-revenue upgrade triggers。

这样agent可以实现明确边界，同时不会把未经测试的model alias或vector count写成永久需求。

你接受“归档旧PRD、用新的完整英文PRD取代根目录 `PRD.md`”吗？接受后，决策审计就全部完成，我们可以正式生成文档。
</pre>

## 317 | User | 2026-08-03T02:49:21.500Z

<pre>
接受，外加我们这个session所有对话原文保留到 docs/discovery/
</pre>

## 318 | Assistant | 2026-08-03T02:49:34.623Z

<pre>
可以，但“原文”必须来自客户端/session 的真实 transcript，不能用我的摘要反向伪造。当前上下文早期部分已经被压缩成摘要，所以我会先查找本机 Codex 是否保存了本次 session 的 JSONL/transcript；找到后复制到 `docs/discovery/` 并保留原始内容，找不到则明确告诉你缺少哪一部分。
</pre>

## 319 | Assistant | 2026-08-03T02:50:10.512Z

<pre>
找到了两段属于本次长会话的 Codex rollout JSONL（7月31日延续段和8月2日压缩后的延续段）。我不会把 system/developer 指令、工具调用或隐藏元数据复制进项目；会机械提取用户与助手可见消息，并保留时间、角色和原始文本。先确认 JSONL 的事件结构以及两段之间是否有重复。
</pre>

## 320 | Assistant | 2026-08-03T02:51:19.315Z

<pre>
确认最新 rollout 已经包含从最初图片/PRD请求到你刚才这条要求的全部可见消息。为了既“原文保留”又不泄露隐藏指令，我会保存两份：机器可读 JSONL（role、timestamp、原始 content）和可阅读 Markdown；同时保留一个导出脚本，最终 PRD 完成时再运行一次，把后续对话追加到同一 transcript。
</pre>

## 321 | Assistant | 2026-08-03T02:52:17.422Z

<pre>
原文存档已生成：

- `docs/discovery/conversation-transcript.jsonl`：320条可见消息的机器可读原文；
- `docs/discovery/conversation-transcript.md`：同内容的可阅读版本；
- `tools/export-visible-transcript.ps1`：最终完成时重新导出，纳入接下来的对话。

现在决策审计已经完成，我开始归档旧PRD并编写新的完整英文 `PRD.md`。
</pre>

## 322 | Assistant | 2026-08-03T02:52:54.149Z

<pre>
旧模板已经原样移到 `docs/archive/PRD-taxrag-original.md`。我正在按“产品要求是可验收的 MUST/SHOULD、技术选择与benchmark参数分开”的方式编写新PRD；先完成产品、语料、功能和行为要求，再补数据模型、API与架构。
</pre>

## 323 | Assistant | 2026-08-03T02:55:09.953Z

<pre>
产品与法律行为部分已经落入新PRD，包括完整范围、Search/Ask/Coverage/Compare/Monitor、匿名化、licensing、freshness和correction。接下来补可量化非功能指标、600条评测、canonical data model和API contract。
</pre>

## 324 | Assistant | 2026-08-03T02:56:25.059Z

<pre>
评测、数据模型和API contract已经写入。最后一部分正在补检索/生成管线、单节点部署、双object-store边界、备份/observability、安全、预算、八周计划和Definition of Done。
</pre>

## 325 | Assistant | 2026-08-03T02:58:42.590Z

<pre>
我会做最后一轮一致性审计：检查新 PRD 是否有遗漏、矛盾、占位符或非英文内容；随后更新 discovery 状态，并在交付前重新导出本 session 的可见对话原文。
</pre>

## 326 | Assistant | 2026-08-03T02:58:58.670Z

<pre>
初步检查通过：新 PRD 无 TODO/TBD、乱码、中文或旧 TaxRAG 残留；旧模板也已原样归档。现在我会把 discovery log 的“尚未完成”状态收口，并执行结构与关键决策的机器检查。
</pre>

## 327 | Assistant | 2026-08-03T02:59:33.455Z

<pre>
关键决策都已找到，刚才显示的“缺失”只是精确字符串差异（如 `B2B only`、财年使用 en dash、成功标准采用完整句子），不是内容遗漏。结构检查和 JSONL 逐行解析也通过。接下来只剩最终对话快照与文件清单核验。
</pre>

## 328 | Assistant | 2026-08-03T02:59:49.657Z

<pre>
导出脚本要求显式指定输入与输出路径，刚才因此没有刷新旧快照；文件本身未受损。终端尾部的中文乱码来自 Windows PowerShell 5 对无 BOM UTF-8 的显示方式，我会用脚本规定的参数重新导出，并按 UTF-8 显式验证内容。
</pre>

## 329 | Assistant | 2026-08-03T03:01:02.226Z

<pre>
最终审计已全部通过：PRD 为纯英文、无占位符、Markdown 代码块成对；discovery 已正式关闭；对话归档包含 328 条可见 user/assistant 消息，覆盖最初请求与本次“保留原文”要求，JSONL 可逐行解析。还修复了 Windows PowerShell 5 导出 Markdown 时的分隔符编码问题。
</pre>

## 330 | Assistant | 2026-08-03T03:01:16.855Z

<pre>
已完成并通过一致性检查：

- [正式英文 PRD](/C:/Users/HoraceHou/project/personal/taxrag/PRD.md)
- [Discovery 决策记录](/C:/Users/HoraceHou/project/personal/taxrag/docs/discovery/decision-log-2026-08-02.md)
- [可阅读的完整对话记录](/C:/Users/HoraceHou/project/personal/taxrag/docs/discovery/conversation-transcript.md)
- [机器可读 JSONL 原文](/C:/Users/HoraceHou/project/personal/taxrag/docs/discovery/conversation-transcript.jsonl)
- [旧 TaxRAG PRD 归档](/C:/Users/HoraceHou/project/personal/taxrag/docs/archive/PRD-taxrag-original.md)
- [对话重新导出脚本](/C:/Users/HoraceHou/project/personal/taxrag/tools/export-visible-transcript.ps1)

对话归档现包含 328 条可见 user/assistant 消息；系统指令、隐藏推理、工具调用及环境元数据未写入。正式 PRD 已取代旧模板，Discovery 阶段已标记完成。
</pre>

## 331 | User | 2026-08-03T03:13:05.970Z

<pre>
how to set model effort in codex
</pre>

## 332 | Assistant | 2026-08-03T03:13:11.125Z

<pre>
I’m using the OpenAI documentation skill because this is a Codex configuration question and the available settings can change between releases. I’ll check the local Codex manual first.
</pre>

## 333 | Assistant | 2026-08-03T03:13:49.331Z

<pre>
You can set reasoning effort in three ways:

1. **Codex app / IDE:** Click the model selector below the prompt box, open **Advanced**, then choose the reasoning effort.

2. **Interactive CLI:** Run:

```text
/model
```

Then select the model and effort.

3. **Persistent configuration:** Add this to either your global `~/.codex/config.toml` or the project’s `.codex/config.toml`:

```toml
model = &quot;gpt-5.6&quot;
model_reasoning_effort = &quot;high&quot;
```

Common effort values are:

```text
minimal
low
medium
high
xhigh
```

Support depends on the selected model. For a one-off CLI invocation:

```powershell
codex -c &#39;model_reasoning_effort=&quot;high&quot;&#39;
```

My recommendation: use `medium` normally, `high` for implementation and debugging, and `xhigh` for architecture, difficult investigations, or major reviews. Higher effort takes longer and consumes more tokens. [Codex configuration documentation](https://developers.openai.com/codex/config-reference/)
</pre>

## 334 | User | 2026-08-03T03:20:33.498Z

<pre>
其它的我都很满意，就是这个PRD还是不够具体，一眼看过去比较虚，或者high level文字描述比较多，老板无法直接了解很多具体的信息。我要是老板，我觉得看file:///c:/Users/HoraceHou/project/personal/taxrag/docs/discovery/conversation-transcript.md 更能明白这个项目的需求，关键决策，项目架构等等。PRD有时不仅仅是一份完美文档，更是工程师进入这个项目的入口。就像一份产品手册，长不怕，我们可以有table检索，分块处理，但是一本维修手册大部分都是高级文字，换谁都很难理解。
</pre>

## 335 | Assistant | 2026-08-03T03:20:46.643Z

<pre>
你说得对。现在这份 PRD 更像一份“已经作出哪些决定”的规范摘要，而不是工程师可以拿来定位模块、理解数据流、建立任务并验收的项目入口。缺的不是更多形容词，而是把抽象要求展开成可查的事实：用户操作、页面字段、状态机、接口样例、数据表、任务边界、失败路径、来源清单、验收用例和实施映射。

我会保留现有决策作为规范层，在同一份 PRD 中增加一层“维修手册式”的实现说明，并先完整审阅现有文档与项目文件，避免机械堆字或重复 discovery transcript。
</pre>

## 336 | Assistant | 2026-08-03T03:21:28.263Z

<pre>
审阅结果印证了你的判断：现文档虽有 1,240 行，但只有 2 个示例、1 个 JSON 样例、没有 requirement ID、没有页面字段表、没有端到端用户案例，也没有“需求 → 模块 → API → 数据 → 测试”的追踪关系。工程师能知道方向，却仍要重新发明大量细节。

我会把它改成两层结构：前半部分让老板在十几分钟内看清“产品到底长什么样、客户怎么用、系统怎么工作、钱花在哪里”；后半部分让工程师按编号直接查页面、字段、状态、接口、表、队列、错误和验收标准。现有高层规范会保留，不会丢失。
</pre>

## 337 | Assistant | 2026-08-03T03:23:16.952Z

<pre>
为了把“完整法律范围”落到可执行层，我还会把 Source Coverage Registry 写成有编号的官方来源组，而不是继续写“覆盖各州和领地”。这部分会核对官方入口；它会直接决定 adapter、数据量、freshness 和验收，而不是作为装饰性参考链接。
</pre>

## 338 | Assistant | 2026-08-03T03:24:12.826Z

<pre>
我已经把改写边界定下来：不把 transcript 原样塞回 PRD，也不再重复高层愿景；而是把 transcript 中的决定编译成可执行手册。特别会明确当前真实状态——现在仓库只有规范和 discovery 文档，产品尚未实现——这样老板不会把“要求已定义”误读成“功能已完成”。
</pre>

## 339 | Assistant | 2026-08-03T03:27:28.753Z

<pre>
第一批具体化已经写入：现在 PRD 顶部先展示真实产品旅程、当前项目状态和系统图；后部增加了 48 个可追踪 requirement ID、完整路由表、页面字段合同、Research Record 状态转换，以及 Search、Answer、Clarification、Source Change、Widget 五条端到端流程。下一步是把“API 列表”和“Entity 名称”展开成真实请求/响应与字段级数据字典。
</pre>

## 340 | Assistant | 2026-08-03T03:31:27.643Z

<pre>
API 和数据层现在也已经从“endpoint/entity 清单”展开：加入了 Search、Answer、SSE、Coverage、Compare、Research Record、Webhook 的实际 JSON contract，统一错误码，以及 corpus/app/ephemeral 三套数据库的字段级逻辑表和八条不可破坏的数据 invariant。接下来我会写运行时资源预算、官方来源组和 adapter 验收，这两部分会让架构与“覆盖全澳”真正可估算。
</pre>

## 341 | Assistant | 2026-08-03T03:34:02.257Z

<pre>
“架构”和“覆盖范围”现在也落地了：已写明 2GB 主机每个进程的内存上限、磁盘路径、网络访问矩阵、队列优先级、部署步骤；官方来源被拆成 Wave 1–5 的编号 roster，包括九个立法注册库、FWC/FWO/ATO、八套 payroll tax、联邦与州法院/tribunal、邻接监管体系。每一组当前都明确是 `NOT_STARTED`，并有 12 项 adapter 完成条件，不再用一句“覆盖八州”掩盖工作量。
</pre>

## 342 | Assistant | 2026-08-03T03:36:51.168Z

<pre>
这版已经具备“工程入口”骨架：增加了 32 个手工验收脚本、8 分钟老板演示脚本、首个付费客户 onboarding、健康/告警/备份/事故/kill-switch/cost 手册、600 条用例的精确分类配额，以及 E01–E34 的八周工作分解和新工程师/agent 的入场清单。

我现在进入审计阶段，重点找内部矛盾、无效 JSON、错误章节引用、表格结构和仍然含糊的合并项，而不是只检查字数。
</pre>

## 343 | Assistant | 2026-08-03T03:39:03.371Z

<pre>
审计发现并准备修正三类真正的问题：一是 `SAVE` 到底如何绑定 Research Record 还不够明确；二是 metadata/link-only 来源不一定允许保存原文件，`r2_key` 不能强制非空；三是我新增的 Docker Compose 生产基线与之前已接受的“localhost-only search process”有冲突。为了忠于现有架构和 2GB 成本目标，我会把生产运行方式收敛为 systemd/cgroup 管理的本机进程，Compose 只用于本地开发。
</pre>

## 344 | Assistant | 2026-08-03T03:40:40.305Z

<pre>
矛盾已收敛：生产环境改回 systemd 管理的本机进程，Search 只监听 `127.0.0.1`；`SAVE` 现在明确要求“已有或同事务新建”Research Record；metadata/link-only 来源允许 `r2_key` 为空。还增加了老板可直接读的项目 fact sheet 和术语表。

文档现约 3,400 行、25,000 词、52 个正式 requirement ID。现在进行最后一轮跨章节与格式验证，并刷新本 session 对话归档。
</pre>

## 345 | Assistant | 2026-08-03T03:41:52.647Z

<pre>
最终 PRD 校验脚本已加入并通过：45 个编号章节、52 个正式需求、52 个强制官方来源组、14 个可解析 JSON 样例，表格、代码块、纯英文、关键不变量与 600 条分配都通过。以后工程师修改 PRD 可直接运行 `tools/validate-prd.ps1`，避免这份长文档逐渐失去一致性。

我会再更新一次对话原文归档，然后给你指出这次修改后最值得先看的入口。
</pre>

