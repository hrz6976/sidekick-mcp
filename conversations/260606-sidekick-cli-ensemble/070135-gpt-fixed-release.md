# 交接记录 — 070135 · gpt · fixed-release

## 继承的上下文

上一个交接 `070126-gpt-released-v012.md` 记录了 standalone `sidekick` CLI、trajectory export、`effort` 命名统一和 `v0.1.2` tag 发布。用户随后指出 GitHub Actions release 逻辑不应再创建 version bump PR，并进一步明确：release 只应在 git tag push 时触发，必须检查 tag 版本和 `package.json` 版本一致，一致才发布；不再需要 decide action。

## 本次完成的工作

- [x] 重写 `.github/workflows/release.yml` 为 tag-only workflow。
- [x] 删除 main push / `workflow_dispatch` release 触发。
- [x] 删除 npm 查询式 decide action。
- [x] 删除 automated version bump PR job 和 GitHub App token 依赖。
- [x] 增加 `validate` job，校验 `github.ref_name` 等于 `v${package.json.version}`。
- [x] 保留 reusable `tests.yml` matrix，publish 依赖 `validate` 和 `test`。
- [x] publish checkout 使用当前 tag ref，不再从 workflow 内创建 tag。
- [x] 更新 `AGENTS.md` release 规则、`tasks/lessons.md` 和 `tasks/todo.md`。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `.github/workflows/release.yml` | 只在 `push.tags: ['v*']` 触发；validate tag/package version；test；publish；create GitHub Release。 |
| `AGENTS.md` | Release 规则改为人工 bump package version、commit、push matching tag；无 bump PR。 |
| `tasks/lessons.md` | 记录 tag 是 release intent，不从 main push 推断 release action。 |
| `tasks/todo.md` | 新增 Tag-Only Release Workflow 小节和验证结果。 |

验证已通过：

- `git diff --check -- .github/workflows/release.yml AGENTS.md tasks/lessons.md tasks/todo.md`
- Node workflow text check confirmed:
  - tag trigger exists
  - no `workflow_dispatch`
  - no main branch release trigger
  - no decide job
  - no bump PR path
  - reads `package.json` version
  - compares actual tag to expected tag
  - publish depends on tests

## 下一个 Agent 的待办事项

1. 如果用户要发布这些 workflow 修改，提交并 push 到 `main`。
2. 下一次 release 流程应为：更新 `package.json` / `package-lock.json` 到目标版本，提交，push main，创建并 push匹配 tag，例如 `v0.1.3`。
3. 若 GitHub Actions 发布失败，优先检查 npm trusted publishing / OIDC / existing npm version；不要恢复 bump PR 逻辑。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 只在 tag push 触发 release | 用户明确要求 tag 是 release intent。 |
| 校验 `v${package.json.version}` | 防止 tag 和 package 版本错配导致错误 npm publish。 |
| 移除 decide action | 用户明确说现在不用 decide action。 |
| 移除 bump PR job | 用户明确说不要 create version bump PR。 |

## 阻塞项

- 无。

## 建议下一步

下一步如果要落库，直接提交这 5 个文件并 push；无需打新 tag，除非要触发一次实际发布。
