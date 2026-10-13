# 开门音效来源

- 当前游戏使用：[mixkit-creaky-door-open-195.wav](mixkit-creaky-door-open-195.wav)，Mixkit 音效“Creaky door open”（编号 195）。
- 来源页：[Mixkit Doors](https://mixkit.co/free-sound-effects/doors/)，下载页：[Sound effect 195](https://mixkit.co/free-sound-effects/download/195/)。
- 许可：Mixkit Sound Effects Free License，许可说明见 [Mixkit License](https://mixkit.co/license/)。
- 加工：保留单次开门录音，整体音量压低，前置 0.08 秒并做短淡入，末尾轻淡出；没有混入其他门声或关门撞击。可用 `python scripts/import-door-audio.py` 重建运行时的 `audio/door.wav`。

旧版 PDSounds 片段仍保留在本目录作历史记录；它们不再参与当前门声音轨。
