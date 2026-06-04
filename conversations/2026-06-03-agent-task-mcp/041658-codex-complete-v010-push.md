# 交接记录 — 041658 · codex · complete-v010-push

## 继承的上下文

此前已经完成 Sidekick MCP 的 `ask_<agent>` tool-side `effort` 参数、README MCP client setup 文档、以及 release workflow 调整。用户随后确认 fork 后的新 npm 包版本应从 `0.1.0` 开始。

## 本次完成的工作

- [x] 将 package version 改为 `0.1.0`，同步 `package-lock.json`。
- [x] 确认 README 已包含 Claude Code、Gemini CLI、Codex CLI、OpenCode 的 npx-based MCP 配置。
- [x] 添加 `.npmignore`，修复 npm tarball 因 `.gitignore` 忽略 `dist/` 而缺少编译产物的问题。
- [x] release workflow 的 tag 步骤改为 idempotent，已有 `v${version}` tag 时复用。
- [x] 本地验证并推送 main / `v0.1.0`。
- [x] 检查 GitHub Actions 发布结果。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `README.md` | 增加四个 MCP client 的 npx 配置说明。 |
| `package.json` / `package-lock.json` | 版本为 `0.1.0`。 |
| `.npmignore` | 保证 npm 包包含 `dist/`。 |
| `.github/workflows/release.yml` | tag 已存在时不失败。 |
| `tasks/todo.md` | 记录验证、push、CI publish blocker。 |

本地验证通过：

- `npm run lint`
- `npm test` (14 files / 118 tests)
- `npm run build`
- `npm run test:e2e`
- `npm pack --dry-run`，确认包含 `dist/index.js`
- `git diff --check`

远端状态：

- `main` 已推到 `56e827d`。
- `v0.1.0` 已在 origin，指向 release commit `1bd799b`。

GitHub Actions：

- `Release & Publish` run `26941634411` 的 Node 20/22/24 tests 全部通过。
- publish job 失败在 `npm publish --provenance`，错误为 `ENEEDAUTH`。
- `gh secret list --repo hrz6976/multicli` 返回无 entries，因此 `secrets.NPM_TOKEN` 不存在。
- `@hrz6976/sidekick-mcp@0.1.0` 当前仍未发布到 npm。

## 下一个 Agent 的待办事项

1. 用户需要创建 npm automation token，并配置到 GitHub secret `NPM_TOKEN`，或在 npm 配置 trusted publishing。
2. 配置后运行：`gh workflow run release.yml --repo hrz6976/multicli`。
3. 发布成功后确认：
   - `npm view @hrz6976/sidekick-mcp@0.1.0 version`
   - GitHub Release `v0.1.0`

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 使用 `0.1.0` | fork 后的新 package identity，不应继承旧包 `1.5.x` 的成熟版本语义。 |
| 不 force-update `v0.1.0` | tag 已在远端并指向 release commit；后续只推任务记录，不改 release tag。 |
| 不再推 README 发布说明 | README 路径会触发 release workflow；在缺少 npm auth 的情况下会制造另一个必失败 run。 |

## 阻塞项

- npm 发布需要外部账户授权。当前 repo 没有 `NPM_TOKEN` secret，本地 npm 也未登录。

## 建议下一步

先配置 npm auth，再 rerun `Release & Publish` workflow。
