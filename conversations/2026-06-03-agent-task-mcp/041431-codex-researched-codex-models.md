# 交接记录 — 041431 · codex · researched-codex-models

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/041407-codex-updated-setup.md` 及后续进度/结果清理记录：Sidekick 的 `setup` 常驻暴露，用于检查 runner/model availability 并生成/更新 `~/.sidekick/config.json`。已有经验要求不要把 fallback/static model list 称作“当前可用模型”。

本次用户要求：调研 Codex CLI / OpenAI Codex 如何获取模型列表，重点回答稳定 CLI 命令、bundled vs remote refreshed catalog、entitlement 语义、Sidekick setup 的安全调用和命名；不要改源码；结论写到指定 research markdown。

## 本次完成的工作

- [x] 检查本机 `codex-cli 0.136.0` 的 `--help`、`exec --help`、`debug --help`、`debug models --help`。
- [x] 运行并比较 `codex debug models --bundled` 与 `codex debug models` 的轻量字段。
- [x] 使用 `openai-docs` helper 确认 `/tmp/openai-docs-cache/codex-manual.md` 已是 current。
- [x] 拉取 OpenAI Codex 官方源码到 `/tmp/openai-codex-source`，并 fetch tag `rust-v0.136.0` 对齐本机 CLI 版本。
- [x] 检查 `run_debug_models_command`、`ModelsManager`、cache、remote `/models` endpoint、app-server `model/list` 和 protocol model types。
- [x] 写入研究报告：`conversations/2026-06-03-agent-task-mcp/model-discovery-research/codex-model-discovery.md`。
- [x] 更新 `tasks/todo.md` 的 Codex Model Discovery Research checklist 和 results。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/codex-model-discovery.md` | 新增 Codex 模型发现调研结论 |
| `tasks/todo.md` | 新增并完成本轮 research checklist/review |
| `conversations/2026-06-03-agent-task-mcp/041431-codex-researched-codex-models.md` | 本交接记录 |

未修改 `src/`、测试或构建配置。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 不建议把 `codex debug models` 当稳定 setup 依赖 | Manual/CLI reference 将该命令标为 experimental，且在 `debug` 子命令下 |
| 默认只建议 `codex debug models --bundled` 或配置值作为 hints | `--bundled` 不触发 remote refresh，setup 应保持轻量安全 |
| 远端 `codex debug models` 只能作为 best-effort diagnostic | 默认走 `OnlineIfUncached`，可能读 cache 或打 `/models`，结果受 auth/provider/override 影响 |
| 结果命名用 `codexCatalog` / `codexVisibleCatalog` / `modelHints` | 避免把 catalog snapshot 误称为账号 entitlement 或 guaranteed availability |

## 阻塞项

- 无。

## 建议下一步

一句话：如果后续要实现 Codex catalog discovery，先改字段命名和 prompt 语义，再以短 timeout、failure-tolerant 的方式接入 `codex debug models --bundled`，不要默认 online refresh。
