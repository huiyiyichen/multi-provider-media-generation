# CLI 用法

所有操作都通过 `media-skill` 执行。

在当前仓库本地运行时，把：

```bash
media-skill ...
```

理解成：

```powershell
node dist\cli.js ...
```

## provider 配置

```bash
media-skill config set
media-skill config set --provider nanobanana --file provider.json
media-skill config set --provider nanobanana --json '{"api_key":"YOUR_KEY","base_url":"https://example.com/v1","auth_strategy":"bearer","default_model":"gemini-3-pro-image-preview"}'
media-skill config get --provider nanobanana
media-skill config list
media-skill config validate --provider nanobanana
```

`config set` 支持三种输入方式：

- 直接执行 `media-skill config set`，然后按提示输入
- `--file <json>`
- `--json '<object>'`

交互模式下：

- `provider` 可以输入编号，也可以输入完整名称
- `model` 一行里如果输入多个值，请用英文逗号分隔
- 第一个模型会保存为 `default_model`
- 整组模型会保存到 `allowed_models`
- `auth_strategy` 默认固定为 `bearer`
- `timeout_ms` 默认固定为 `300000` 毫秒，也就是 `300s`

## 小片段预设

只有 NovelAI 路径会用到 `preset`：

```bash
media-skill preset upsert --type artist --name painterly --content "artist:example" --default
media-skill preset list
media-skill preset disable --type artist --name painterly
media-skill preset enable --type artist --name painterly
```

## NovelAI 常用档案

如果你要长期保存整段画师串和负面词，用 `profile`：

```bash
media-skill profile upsert --name anime-default --positive "artist:alpha, artist:beta, masterpiece" --negative "lowres, blurry, bad anatomy" --default
media-skill profile list
media-skill profile get --name anime-default
media-skill profile disable --name anime-default
media-skill profile enable --name anime-default
media-skill profile default --name anime-default
```

说明：

- `--positive` 适合放你常用的正面画师串、质量串、风格串
- `--negative` 适合放你常用的 NAI 负面提示词
- 生成时如果不传 `profile_name`，会自动使用默认 profile

## 能力矩阵

```bash
media-skill capabilities --provider grok_imagine --operation img2video --model grok-imagine-1.0-video
media-skill capabilities --provider novelai_compatible --operation txt2img --request-style oai_images
media-skill capabilities --provider novelai_compatible --operation txt2img --request-style nai_compatible --model nai-diffusion-4-5-full
```

## 执行生成

```bash
media-skill generate --file input.json
media-skill generate --json '{"provider":"nanobanana","operation":"txt2img","prompt":"hello"}'
cat input.json | media-skill generate
```

`generate` 输入支持：

- `provider`
- `operation`
- 可选 `model`
- provider 白名单内允许的字段
- `profile_name`，用于显式选择某个 NovelAI profile
- `source_image.type` 支持 `path`、`url`、`base64`、`clipboard`

## NovelAI 推荐输入

如果你已经把常用画师串和负面词存成默认 profile，那么推荐这样生成：

```json
{
  "provider": "novelai_compatible",
  "operation": "txt2img",
  "prompt_mode": "raw",
  "model": "nai-diffusion-4-5-full",
  "prompt": "1girl, thick eyebrows, bags under eyes, messy hair, very long hair",
  "size": "1024:1024",
  "steps": 28,
  "cfg_scale": 6,
  "sampler": "Euler Ancestral"
}
```

说明：

- skill 会自动把默认 profile 的正面串追加到 `prompt`
- skill 会自动把默认 profile 的负面词追加到 `negative_prompt`
- 对于 `nai_compatible` 风格，会映射为 `/v1/chat/completions` 请求形态

当你要在 Windows 上把当前剪贴板图片直接用于 `nanobanana img2img` 时，用：

```json
{
  "provider": "nanobanana",
  "operation": "img2img",
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "改成夜景霓虹风格",
  "source_image": {
    "type": "clipboard",
    "value": "current"
  }
}
```

## 输出目录

`generate` 会把生成出的文件直接写入：

`data/runs/<yyyy-mm-dd>/`

说明：

- 不再为每张图片单独建立文件夹
- 不再生成每张图的 `metadata.json`
- 如果输入里设置了 `save_raw_response: true`，会额外保存原始响应文件
