# 本机 ComfyUI 只读审查（2026-09-26）

## 结论

- 本机部署目录是 `D:\AI\ComfyUI_windows_portable`，ComfyUI 核心仓库版本为 `v0.37.0`（commit `73c9bad`，2026-09-20）。检查时没有 ComfyUI/Python 服务进程，`8188` 无监听；API 需要先启动本机服务。
- **Qwen-Image-2.1 文生图有成功运行证据**：`ComfyUI\output` 下有五张当日生成的 PNG，PNG `prompt` 元数据记录完整的 9 节点 API 图；其中 int8 版实际产出 `1024×1024` 与 `2048×2048`。下文的 Qwen API 图直接采用成功输出中的节点和参数。
- **MiniMax H3 生视频只有模型文件和工作流，未见本机生成的视频文件**。保存的两个 H3 工作流顶层引用缺失文件名，直接排队前必须替换；其运行时间、显存、画质和是否能在该机器上完成生成均未验证。

## 启动、硬件和地址

| 项目 | 核查结果 |
|---|---|
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU，8188 MiB 显存；检查时空闲约 6904 MiB；驱动 `610.88`。|
| RAM | 总约 15.6 GiB，检查时空闲约 4.6 GiB；系统页文件分配 20 GiB。|
| 磁盘 | `D:` 检查时剩余约 108.7 GiB。|
| 默认监听 | 核心参数为 `--listen 127.0.0.1 --port 8188`；本机脚本均未覆盖这两个参数。浏览器/API 根地址 `http://127.0.0.1:8188`。|
| 安全启动 | `D:\AI\ComfyUI_windows_portable\start_comfyui_safe.bat` 或 `启动ComfyUI.bat`，执行 `python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --auto-launch`。|
| 加速启动 | `D:\AI\ComfyUI_windows_portable\start_comfyui.bat`，在上述命令基础上增加 `--fast fp16_accumulation --use-ck-attention`；该组合未在本次审查中运行验证。|

H3 主模型 19.52 GiB、文本编码器 14.61 GiB、视频/音频 VAE 合计约 3.18 GiB，已显著超过 8 GiB 显存；依赖动态卸载/系统内存/页文件。机器总内存也低于 H3 全套权重大小，故不能把“文件已存在”等同于“可以稳定生成”。本次未启动生成任务。

## 实际模型文件

以下均位于 `D:\AI\ComfyUI_windows_portable\ComfyUI\models\`。大小为 GiB 近似值。对大型 `.safetensors` 只读检查了头部 JSON、张量数量及末尾数据偏移与文件长度一致；这能排除明显截断，**不是哈希校验或推理验证**。

| 用途 | 相对路径 | GiB | 状态 |
|---|---|---:|---|
| H3 主模型 | `diffusion_models\minimax_h3_fl2va_pruned_fp8_scaled.safetensors` | 19.52 | 在；结构检查通过 |
| H3 文本编码器 | `text_encoders\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 14.61 | 在；结构检查通过 |
| H3 视频 VAE | `vae\minimax_h3_video_vae_int8_convrot.safetensors` | 2.62 | 在；结构检查通过 |
| H3 音频 VAE | `vae\minimax_h3_audio_vae_fp32.safetensors` | 0.56 | 在；结构检查通过 |
| H3 8 步 LoRA | `loras\minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1.82 | 在；结构检查通过 |
| H3 4 步 LoRA | `loras\minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors` | 1.82 | 在；结构检查通过 |
| H3 超清放大 | `upscale_models\4x-UltraSharp.pth` | 0.06 | 在；超清工作流确实引用 |
| Qwen 主模型 | `diffusion_models\qwen_image_2.1_int8_convrot.safetensors` | 6.76 | 在；有成功产图证据 |
| Qwen 低内存主模型 | `diffusion_models\qwen_image_2.1_int4_convrot.safetensors` | 3.42 | 在；有成功产图证据 |
| Qwen 文本编码器 | `text_encoders\qwen3vl_8b_w4a8.safetensors` | 5.88 | 在；有成功产图证据 |
| Qwen VAE | `vae\qwen_image_2.1_vae_bf16.safetensors` | 0.63 | 在；有成功产图证据 |

未找到本机工作流引用的 `minimax_h3_fl2va_pruned_int8_convrot.safetensors`、`minimax_h3_video_vae_fp16.safetensors`、`qwen3vl_8b_int8_convrot.safetensors` 和可选的提示词扩写模型 `qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors`。`D:\AI\downloads` 下也没有这些文件。

## 已保存工作流审查

工作流目录：`D:\AI\ComfyUI_windows_portable\ComfyUI\user\default\workflows\`。

| 工作流 | 实际结构与问题 |
|---|---|
| `Qwen-Image-2.1\Qwen Image 2.1 文生图（快速版）.json` | 选择器为约 `1024×1024`，25 步，主模型 int8。顶层文本编码器选中了本机 `qwen3vl_8b_w4a8.safetensors`。子图内有旧 `widgets_values_named` 和不存在的可选提示词扩写模型；扩写开关默认 `false`，直接 API 应省略整个扩写分支。|
| `Qwen-Image-2.1\Qwen Image 2.1 文生图（高清版）.json` | 选择器为约 `2048×2048`，40 步；其余注意事项同上。本机已有对应规格的成功输出。|
| `MiniMax H3 文生视频 低显存版.json` | 选择器约 `864×480`，没有超清放大节点。顶层子图模型下拉仍是缺失的 H3 int8 主模型和 fp16 视频 VAE，须改成本机 fp8 主模型与 int8 视频 VAE。`turbo_mode=false` 时，经 `ComfySwitchNode` 选择的是无 LoRA 的 **20 步**；只有设为 `true` 才会使用 8 步 LoRA 与 `turbo_steps=8`。|
| `MiniMax H3 超清加速版.json` | 选择器约 `1344×768`；子图内有 `4x-UltraSharp` 放大后 `ImageScaleBy(scale_by=0.5)`，最终约 `2688×1536`，但会增加内存和时间。模型文件名与 20/8 步开关问题同上。|

H3 节点 `MiniMaxH3ImageToVideo` 把 `length` 当作**帧数**，以 24 fps 向上对齐至 `17k+5` 帧。保存的工作流用算式把秒转换为帧。以 2 秒为例，48 帧会向上对齐为 56 帧，实际约 2.33 秒。工作流中的顶层旧文件名与子图内部更新过的 `widgets_values` 不一致，建议以节点图实际选择结果复核后再排队。

## 本机 ComfyUI HTTP/WebSocket 接口

服务启动后，代码 `ComfyUI\server.py` 明确提供：

| 方法与路径 | 用途 |
|---|---|
| `GET /system_stats` | 服务和设备信息；适合先做存活检查。|
| `GET /object_info`、`GET /object_info/{node_class}` | 当前节点可用性与输入 schema；提交前可查询 `TextEncodeQwenImage21`、`MiniMaxH3ImageToVideo`。|
| `POST /prompt` | 请求体 `{"prompt": {"节点ID": {"class_type": "...", "inputs": {...}}}, "client_id": "可选UUID"}`；成功返回 `prompt_id`、`number`、`node_errors`，无效节点/输入返回 HTTP 400。此处 `prompt` 是 **API 格式节点图**，不能把编辑器导出的 UI JSON 整份直接提交。|
| `GET /queue` | 当前排队/运行状态。|
| `GET /history/{prompt_id}` | 已完成任务及输出文件信息。|
| `GET /view?filename=<文件名>&type=output&subfolder=<子目录>` | 读取输出；参数应来自 `history`。|
| `GET /ws?clientId=<UUID>` | 任务进度 WebSocket；`clientId` 的大小写由服务代码确定。|
| `POST /upload/image` | 图生视频时上传输入图；文生图/文生视频最小图不需要。|

### 已有成功记录的 Qwen 最小 API 节点图

下面 9 节点来自 `ComfyUI\output\Qwen21_int8_1024_00001_.png` 的 `prompt` 元数据。它使用当前本机存在的文件；改变文案只需改节点 `4.inputs.prompt`，改变分辨率需同时改节点 `4.inputs.resolution` 与 `6.inputs.width/height`。先启动服务，再将整个对象作为 `POST /prompt` 请求体中的 `prompt` 字段。`QwenImage21Cache` 是成功记录中使用的配置；更省节点时可省略节点 `5` 并让节点 `7.inputs.model=["1",0]`，但这个删减版本没有本机生成记录。

```json
{
  "1": {"class_type":"UNETLoader","inputs":{"unet_name":"qwen_image_2.1_int8_convrot.safetensors","weight_dtype":"default"}},
  "2": {"class_type":"CLIPLoader","inputs":{"clip_name":"qwen3vl_8b_w4a8.safetensors","type":"qwen_image","device":"default"}},
  "3": {"class_type":"VAELoader","inputs":{"vae_name":"qwen_image_2.1_vae_bf16.safetensors"}},
  "4": {"class_type":"TextEncodeQwenImage21","inputs":{"clip":["2",0],"prompt":"A cute orange tabby cat sitting on a wooden table, warm afternoon sunlight through a window, photorealistic, shallow depth of field","negative_prompt":"","resolution":1024,"images":[]}},
  "5": {"class_type":"QwenImage21Cache","inputs":{"model":["1",0],"device":"auto","dtype":"default"}},
  "6": {"class_type":"EmptyLatentImage","inputs":{"width":1024,"height":1024,"batch_size":1}},
  "7": {"class_type":"KSampler","inputs":{"model":["5",0],"positive":["4",0],"negative":["4",1],"latent_image":["6",0],"seed":42,"steps":25,"cfg":1.0,"sampler_name":"euler","scheduler":"simple","denoise":1.0}},
  "8": {"class_type":"VAEDecode","inputs":{"samples":["7",0],"vae":["3",0]}},
  "9": {"class_type":"SaveImage","inputs":{"images":["8",0],"filename_prefix":"Qwen21_int8_1024"}}
}
```

### H3 文生视频的最低节点链（静态核对，未执行）

使用**本机实际文件名**时，最低链为：

`UNETLoader(fp8 H3)` → `BasicGuider` 与 `BasicScheduler`；`CLIPLoader(type=minimax)` + `VAELoader(视频 int8)` → `MiniMaxH3ImageToVideo(prompt,864,480,56帧)` → `SamplerCustomAdvanced`；同时 `RandomNoise`、`KSamplerSelect(res_multistep)` 接入采样器；采样器输出分别经 `VAEDecode(视频 VAE)` 与 `VAEDecodeAudio(音频 VAE)` → `CreateVideo(fps=24)` → `SaveVideo`。基础流程可用 20 步，不必加载 LoRA；若要 8 步，再在主模型后接 `LoraLoaderModelOnly(8step LoRA,strength_model=1)`，并同步把 `BasicScheduler.steps` 改成 8。**不要只把步数改为 8 却不接 LoRA。**

关键节点参数可按以下表连接；方括号为 `[上游节点ID, 输出序号]`。这是从本机工作流节点 schema 与连线提取的 API 图，尚无本机 H3 成功输出，提交前建议用 `GET /object_info/{node_class}` 复核。

| ID | `class_type` | 关键 `inputs` |
|---:|---|---|
| 1 | `UNETLoader` | `unet_name=minimax_h3_fl2va_pruned_fp8_scaled.safetensors`, `weight_dtype=default` |
| 2 | `CLIPLoader` | `clip_name=qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`, `type=minimax`, `device=default` |
| 3 | `VAELoader` | `vae_name=minimax_h3_video_vae_int8_convrot.safetensors` |
| 4 | `VAELoader` | `vae_name=minimax_h3_audio_vae_fp32.safetensors` |
| 5 | `MiniMaxH3ImageToVideo` | `clip=[2,0]`, `vae=[3,0]`, `prompt=<画面和声音描述>`, `width=864`, `height=480`, `length=56` |
| 6 | `RandomNoise` | `noise_seed=<整数>` |
| 7 | `BasicGuider` | `model=[1,0]`, `conditioning=[5,0]` |
| 8 | `KSamplerSelect` | `sampler_name=res_multistep` |
| 9 | `BasicScheduler` | `model=[1,0]`, `scheduler=simple`, `steps=20`, `denoise=1` |
| 10 | `SamplerCustomAdvanced` | `noise=[6,0]`, `guider=[7,0]`, `sampler=[8,0]`, `sigmas=[9,0]`, `latent_image=[5,1]` |
| 11 | `VAEDecode` | `samples=[10,0]`, `vae=[3,0]` |
| 12 | `VAEDecodeAudio` | `samples=[10,0]`, `vae=[4,0]` |
| 13 | `CreateVideo` | `images=[11,0]`, `audio=[12,0]`, `fps=24`, `bit_depth=8` |
| 14 | `SaveVideo` | `video=[13,0]`, `filename_prefix=video/MiniMax_H3`, `format=auto` |

## 核查边界

本次只读检查了进程/监听、启动脚本、模型文件及结构、核心节点代码、工作流 JSON、已有 PNG 元数据。没有启动 ComfyUI、提交 API 任务或运行大型生成；因此 Qwen 的“可用”证据来自已有成功输出，H3 只具备静态依赖和节点链证据。外部模型下载、升级与部署文件修改均未执行。
