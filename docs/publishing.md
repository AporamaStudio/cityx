# CityX 发布与手机试玩

## 日常使用

在手机／iPad 上远程连接 MacBook，继续在 `/Users/yhan/cityx_2609` 开发。修改完成后对助手说：

> 发布 CityX，把这轮修改上线，告诉我版本号和试玩链接。

也可以明确调用 `$cityx-publish`。助手检查差异、选择本轮文件，调用发布脚本，确认上线后给出链接。手机／iPad 打开或刷新 https://aporamastudio.github.io/cityx/ 即可试玩。

这套流程不负责搭建远程连接；需要你已有可用的远程操作方式。执行开发和推送时 MacBook 需联网、运行；发布成功后由 GitHub 托管，MacBook 关机不影响已发布版本。

## 文件与服务的职责

| 位置 | 职责 |
| --- | --- |
| `src/`、`index.html`、`style.css` | 游戏逻辑与画面，在玩家浏览器执行 |
| `scripts/publish.py` | 在 MacBook 上检查、提交指定文件、推送并查询部署 |
| `scripts/publish.json` | 仓库、分支、试玩地址和提交身份配置 |
| `scripts/build-pages.mjs` | 收集网页运行文件到 `.pages-dist/`，添加资源版本号 |
| `.github/workflows/pages.yml` | GitHub 收到 main 推送后，测试、打包并部署 Pages |
| 个人 skill `cityx-publish` | 理解发布请求、审阅范围、调用脚本，不复制发布实现 |

开发 → 明确要求发布 → 本地检查 → 提交并推送 → GitHub 测试并部署 → 确认线上版本 → 手机刷新。

公开仓库为 https://github.com/AporamaStudio/cityx 。Pages 使用 GitHub Actions，不是官网的分支发布配置。原 `cityx-prototype` 已改名为 `cityx`；请更新旧试玩收藏，Pages 旧网址不保证跳转。工作室官网及其仓库不参与这个流程。

## 脚本命令

在项目目录执行，支持 Python 3 和 Node.js，无需安装第三方 Python 包或 GitHub CLI。

```sh
# 仅检查现有测试、差异格式和网页打包；不提交、推送或访问网络
python3 scripts/publish.py check

# 示例：用户要求发布后，只提交经过审阅的指定文件并推送
python3 scripts/publish.py publish --message 'fix: 改善地图拖动体验' --files src/app.js style.css

# 所需改动已提交且工作区干净时，发布已有提交
python3 scripts/publish.py publish

# 查看当前 HEAD 是否上线；最多等待 45 秒，可重复查询
python3 scripts/publish.py status --wait-seconds 45
```

`--files` 接受项目相对文件路径，不接受整个目录；列出新增、修改或删除的每个文件。脚本不使用 `git add -A`，未指定的未跟踪文件不会提交，例如个人 `docs/daily.md`。已有暂存内容、未纳入发布的已跟踪改动、分支或远程地址不符时会停止；由助手检查原因并处理，不能为绕过检查而丢弃用户改动。

发布会先检查，再 fetch 并确认远端 main 是本地 HEAD 的祖先；远端领先或分叉则停止，不自动合并、不 reset、不强推。提交失败时保留现场；推送失败可能留下本地提交，排除原因后再发布即可，不重复造提交。脚本使用现有 Git 凭据，不保存或打印 Token。身份固定为 `Aporama Studio <dev@aporamastudio.com>`，同时用于作者和提交者。

退出码：`0` 表示命令成功（check 只代表本地检查通过）；`1` 表示失败或被保护检查阻止；`2` 表示发布尚未确认，继续调用 status。status 只在当前 HEAD 对应的 Actions 成功，且网站 HTML 显示同一个提交号时报告“已上线”；查询不会重新提交或推送。网络/API 限流失败也不表示游戏部署一定失败，可稍后重查。

Node 优先从 PATH 查找，其次使用当前 Mac 的 Codex 内置路径；换机器时可设置 `CITYX_NODE`。Git 凭据仍须具备向仓库和 workflow 推送的权限。助手在受限环境运行发布命令时可能需要工具的网络／文件写入授权，但不需要用户再重复批准已明确要求的发布。

## 手机上确认更新

1. 收到“已上线”和提交号后刷新页面，核对地图底部的版本号。
2. 若仍是旧版，关闭该页面再打开；也可在网址后加 `?release=提交号` 强制换一个入口地址。
3. 脚本给 CSS、JavaScript 及模块依赖统一添加提交号，减少新旧资源缓存混用。已经打开的游戏不会自动热更新，刷新会清空本局进度。
4. 首次及遇到访问异常时，关闭代理，分别测试 Wi-Fi 和移动网络。桌面浏览器检查不能代替中国大陆网络和 iPhone/iPad 真机触控测试。

## 发布边界与回退

只有明确的“发布／上线／推送”请求才运行 publish。日常写代码、测试和本地提交不会自动更新网站；每次 main 推送会触发部署，所以普通备份也不能擅自推送 main。

网页只部署运行文件，不包含文档与测试；公开仓库仍能看到已提交的开发文件和历史。页面添加 noindex 以表达不希望被搜索收录，不构成访问控制，也不保证无公开记录。

想回到旧玩法时，先审阅并恢复指定版本的相关文件，产生一个新的回退提交，再按相同流程发布。不要为了回退网页而强推或重写历史。要撤下试玩页，则关闭该仓库 Pages；这属于单独的明确请求。
