# 浮生 · A Fleeting Life

剧情向像素跑酷游戏：小满在学堂与旧日回忆之间奔跑，四个正常结局点亮回廊尽头的四盏灯后，墙会裂开，通向真正的终局。

## 仓库内容

- **游戏工程**：[`A Fleeting Life/game`](A%20Fleeting%20Life/game) —— Cocos Creator 3.8.8 + TypeScript，第一章可游玩，后四章保留未开放入口
- **设计文档**（仓库根目录）：
  - `浮生_游戏设计总案_S1.docx` / `浮生_游戏设计概要_S1_最终逻辑修订版(1).docx` / `浮生_细节设定_S1.docx`
  - `浮生_美术任务清单_A-H2.docx`、`浮生_结局视频提示词_S1.md`
  - 美术风格审计：`art_audit_comfy.md`、`art_audit_game.md`、`art_audit_references.md`
- **参考资源**：`A Fleeting Life/资源`

## 运行游戏

```bash
cd "A Fleeting Life/game"
node scripts/serve.cjs
# 打开 http://127.0.0.1:4318/preview/（无需联网、无需安装 npm 包）
```

也可双击 `A Fleeting Life/game/启动游戏.cmd`。操作说明、动作/障碍/结局规则与构建方法详见 [game/README.md](A%20Fleeting%20Life/game/README.md)。

## 本仓库不含的大体积内容

以下目录合计 10GB+，超出 GitHub 仓库容量，仅在本地保存，未纳入版本库：

| 本地目录 | 内容 |
| --- | --- |
| `BGM交付_20260930/` | BGM 成片交付（约 1.9GB） |
| `美术交付_20260926/` | 美术交付（约 800MB） |
| `A Fleeting Life/game/build/`、`dist/` | Cocos 构建产物（可用构建脚本重新生成） |
| `A Fleeting Life/android/` | Android 构建工作区（约 3.8GB） |
| `A Fleeting Life/需要的软件/` | 引擎与工具安装包（约 4.3GB） |
| `A Fleeting Life/game.zip` | 工程打包备份（约 2.2GB） |

## 开发

- `npm test`：规则、剧情、动作、障碍、存档、媒体控制及宿主回归
- `python scripts/validate-xiaoman-rig.py` 等校验脚本见 game/README.md
