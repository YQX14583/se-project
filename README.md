# 悲伤消消乐

一款以深夜情绪为主题的本地单机三消游戏，使用 **Cocos Creator 3.8.8 + TypeScript** 开发。当前版本更新于 **2026-11-10**。

## 当前版本

- 失眠、失落、委屈、释怀、告别五章，共 75 关；每页都有随剧情推进的心声标题。
- 普通关卡 3～11 步。同一关连续失败 3 次后，下一局进入温柔模式，增加 10 步、最多记 2 星。
- 四种“帮助”先说明、预览再确认，每局合计最多使用 2 次，失败或放弃会退还本局帮助。
- 共鸣改为同色小物一起稍微放大、提亮、轻抖后同步消除；保留逐波消除、连击反馈和角色动作。
- 手绘房间、卡通字体、动态窗雨与随雨势变化的雨声，以及钢琴背景音乐；暂停时琴雨继续。
- 继续／重开确认、夜间日记选关、六页玩法引导、自动存档和离线游玩。

## 直接游玩（Windows x64）

下载根目录的 [悲伤消消乐-Windows-x64-免安装版.zip](./悲伤消消乐-Windows-x64-免安装版.zip)，**完整解压**后双击 `开始游戏.cmd`。包内已带运行环境，无需安装 Cocos 或 Node.js；使用现代 Edge 或 Chrome 浏览器。

浏览器会打开 `http://localhost:17456/`。游玩期间保留启动窗口，退出时关闭游戏页与启动窗口。不要直接在 ZIP 内运行，也不要只复制启动文件。

进度保存在当前电脑、当前浏览器的本地数据中，不跨设备同步；清除站点数据会删除存档。开发预览的 `7456` 与免安装包的 `17456` 是不同存档来源。进行中的旧局保留原预算，重开后使用当前规则。

## 源码开发

在 Cocos Dashboard 中导入仓库根目录，以 **Creator 3.8.8** 打开 `assets/scenes/Main.scene`。引擎首次打开时会自动生成 `library`、`temp` 等目录。

本地构建与测试需要 Node.js（当前验证版本 24）及 Creator 3.8.8。没有额外的 npm 依赖。在 PowerShell 中执行：

```powershell
# 改成自己的 Creator 3.8.8 安装路径；测试使用引擎自带的 TypeScript。
$env:COCOS_CREATOR_HOME = 'D:\_Cocos Games\Creator\3.8.8'
npm test

# 构建网页并生成离线缓存清单。
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1 -CreatorHome $env:COCOS_CREATOR_HOME
npm run serve
```

开发预览地址为 `http://localhost:7456/`。保持服务运行，不直接双击构建目录中的 HTML。

重新生成 Windows 包时，先完成网页构建，再指定本机 Node 与新的输出目录，避免覆盖旧包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/portable/package.ps1 -CreatorHome $env:COCOS_CREATOR_HOME -NodeExe 'D:\Program Files\nodejs\node.exe' -OutputDirectory '.\release\latest'
```

## 项目结构

- `assets/`：场景、规则、UI、音频、字体及资源元数据。
- `settings/`、`.creator/`：共享项目设置；`build-templates/`：网页与离线模板。
- `tests/`：玩法、存档、动画、音频与布局回归测试。
- `tools/`：构建、预览、打包和验证脚本。
- `simulation/`：保留测试需要的当前与历史关卡配置；大型模拟样本及报告不提交。

引擎缓存、临时构建、机器配置、日志和重复发行目录由 `.gitignore` 排除。字体许可位于 `assets/resources/fonts/OFL.txt`，免安装包的 `licenses/` 包含随包运行环境、引擎与字体许可。
