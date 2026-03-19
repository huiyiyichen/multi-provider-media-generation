# multi-provider-media-generation

一个面向 Codex 的多后端图像 / 视频生成 skill。

它通过统一的 `media-skill` CLI 对外提供能力，内部用显式能力矩阵、字段白名单和 provider adapter 来路由请求，避免把统一输入错误地透传给不同后端。

它也支持一套“可选的 Donmai / Danbooru tag 校对流程”：

- 普通生图时，可以直接按 NAI / Danbooru 风格整理 tag。
- 需要校对标准 tag 名、别名、画师名、角色名时，可以再查 Donmai API。
- 需要看 tag 含义、歧义说明时，再看 Donmai wiki。

## 支持范围

| provider | model / style | txt2img | img2img | img2video |
| --- | --- | --- | --- | --- |
| `novelai_official` | `official` | Yes | No | No |
| `novelai_compatible` | `oai_images` | Yes | No | No |
| `novelai_compatible` | `nai_compatible` | Yes | No | No |
| `novelai_compatible` | `wrapped` | Yes | No | No |
| `nanobanana` | 配置内允许的模型 | Yes | Yes | No |
| `grok_imagine` | `grok-imagine-1.0` | Yes | No | No |
| `grok_imagine` | `grok-imagine-1.0-edit` | No | Yes | No |
| `grok_imagine` | `grok-imagine-1.0-video` | No | No | Yes |

## 快速开始

先安装依赖并编译：

```bash
npm install
npm run build
```

如果你在 Windows PowerShell 下遇到执行策略限制，可以改用：

```powershell
npm.cmd install
npm.cmd run build
```

本项目设计的统一命令名是 `media-skill`。

在本地仓库里，如果你还没有把它安装成全局命令，就直接把：

```bash
media-skill ...
```

理解成：

```powershell
node dist\cli.js ...
```

## 配置 provider

最简单的方式是交互式配置：

```powershell
node dist\cli.js config set
```

程序会依次让你输入：

- `provider`
- `url`
- `apikey`
- `model`

说明：

- `provider` 可以输入编号，也可以输入完整名称。
- `model` 支持一次输入多个值，多个模型用英文逗号分隔。
- 第一个模型会保存为 `default_model`。
- 整组模型会保存为 `allowed_models`。
- 交互模式下 `auth_strategy` 固定默认 `bearer`。
- 交互模式下 `timeout_ms` 固定默认 `300000`，也就是 `300s`。

同一个 skill 会分别保存每个 provider 的配置：

- 再次执行 `config set --provider nanobanana`，只会覆盖 `nanobanana` 的配置。
- 不会影响 `grok_imagine`、`novelai_official`、`novelai_compatible` 已保存的配置。

## 保存 NovelAI 常用档案

如果你想把常用的画师串和负面提示词长期保存下来，用 `profile`。

例如把你常用的一套保存成默认档案：

```powershell
node dist\cli.js profile upsert --name anime-default --positive "artist:alpha, artist:beta, masterpiece, best quality" --negative "lowres, blurry, bad anatomy" --default
```

常用命令：

```powershell
node dist\cli.js profile list
node dist\cli.js profile get --name anime-default
node dist\cli.js profile default --name anime-default
node dist\cli.js profile disable --name anime-default
node dist\cli.js profile enable --name anime-default
```

说明：

- `positive` 里适合放你常用的画师串、质量串、风格串。
- `negative` 里适合放你长期复用的 NAI 负面词。
- 生成时如果不显式写 `profile_name`，就会自动使用默认 profile。

## 如何选择不同模型

如果某个 provider 配置里有多个 `allowed_models`，生成时就在输入 JSON 里显式传 `model`。

例如 `nanobanana` 同时配置了：

```json
[
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview"
]
```

那么生成时可以这样指定：

```json
{
  "provider": "nanobanana",
  "operation": "txt2img",
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "一个未来感物流仓库，电影感，写实风格"
}
```

## NovelAI 推荐工作流

如果你是要给 Codex 用，建议这样理解：

1. 先把常用画师串和负面词存成默认 profile。
2. 以后你只要说“按我平时那套 NAI 风格生图”，Codex 就应该先把你的自然语言要求整理成标签串。
3. 然后调用这个 skill，把标签放进 `prompt`，让默认 profile 自动补上保存的正面串和负面词。

一个 `novelai_compatible + nai_compatible` 的示例：

```powershell
node dist\cli.js config set --provider novelai_compatible --json "{\"api_key\":\"YOUR_KEY\",\"base_url\":\"https://example.com\",\"auth_strategy\":\"bearer\",\"request_style\":\"nai_compatible\",\"style_templates\":{\"nai_compatible\":{\"endpoint\":\"/v1/chat/completions\",\"supports_size\":true,\"supports_width_height\":true}}}"
```

然后生成：

```json
{
  "provider": "novelai_compatible",
  "operation": "txt2img",
  "request_style": "nai_compatible",
  "prompt_mode": "raw",
  "model": "nai-diffusion-4-5-full",
  "prompt": "1girl, thick eyebrows, bags under eyes, messy hair, very long hair",
  "size": "1024:1024",
  "steps": 28,
  "cfg_scale": 6,
  "sampler": "Euler Ancestral"
}
```

这时 skill 会自动把默认 profile 的：

- 正面画师串追加到 `prompt`
- 负面词追加到 `negative_prompt`
- 并把请求映射成 `/v1/chat/completions` 兼容形态

如果你想显式换另一套档案，可以加：

```json
{
  "profile_name": "another-style"
}
```

## 可选：Danbooru / Donmai 查询流程

如果你之后希望 Codex 在新会话里也知道“什么时候该查 Danbooru / Donmai”，现在这套 skill 已经把这部分写进流程了。

建议理解成：

- 普通常见词：
  直接按经验整理成 Danbooru / NAI 风格 tag。
- 冷门词、角色名、画师名、版权名、别名校对：
  优先查 Donmai API。
- 需要解释 tag 含义或区别：
  再看 Donmai wiki。

本地可选配置文件：

`data/config/donmai.json`

示例：

```json
{
  "base_url": "https://danbooru.donmai.us",
  "wiki_url": "https://donmai.moe",
  "login": "your_login",
  "api_key": "your_api_key",
  "preferred_mode": "api"
}
```

说明：

- 这个文件放在 `data/` 下，本仓库的 `.gitignore` 会忽略它，不会跟代码一起上传。
- 如果文件存在，我后面就默认可以按这份配置决定优先走 API 还是只按经验出词。
- 如果文件不存在，我就只按已有知识整理 Danbooru / NAI 风格 tag，不会假装自己查过站内数据。


## 图生图：直接用粘贴图片

`nanobanana` 已支持把当前系统剪贴板里的图片直接作为 `img2img` 输入。

在 Windows 下，如果你刚刚复制了图片，或者把图片粘贴到 Codex 对话框时系统剪贴板里仍然是这张图，就可以用下面的 JSON：

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

保存成 `input.json` 后执行：

```powershell
node dist\cli.js generate --file input.json
```

## 其他生成示例

`nanobanana` 文生图：

```powershell
node dist\cli.js generate --json "{\"provider\":\"nanobanana\",\"operation\":\"txt2img\",\"model\":\"gemini-3-pro-image-preview\",\"prompt\":\"一个未来感物流仓库，电影感，写实风格\"}"
```

NovelAI official，composed 模式：

```powershell
node dist\cli.js generate --json "{\"provider\":\"novelai_official\",\"operation\":\"txt2img\",\"prompt_mode\":\"composed\",\"content_prompt\":\"1girl, thick eyebrows, messy hair\",\"artist_preset\":\"painterly\",\"style_preset\":\"cinematic\",\"negative_preset\":\"safe-negative\",\"extra_positive\":\"ethereal glow\"}"
```

Grok 图生视频：

```powershell
node dist\cli.js generate --json "{\"provider\":\"grok_imagine\",\"operation\":\"img2video\",\"model\":\"grok-imagine-1.0-video\",\"prompt\":\"animate this image\",\"source_image\":{\"type\":\"base64\",\"value\":\"aGVsbG8=\"}}"
```

## 输出结果

每次成功执行后，结果会直接保存到：

`data/runs/<yyyy-mm-dd>/`

这个目录里通常包含：

- 生成出的图片或视频文件
- 如果输入里设置了 `save_raw_response: true`，还会额外保存原始响应文件

现在不会再给每张图片单独建立文件夹，也不会再额外生成每张图的 `metadata.json`。

## 常见错误

`UNSUPPORTED_OPERATION`

表示目标 provider 或 model 不支持当前操作类型。

`UNSUPPORTED_FIELD`

表示你传入了目标 provider 不允许的字段，比如给 `nanobanana` 传 `negative_prompt`。

`SOURCE_IMAGE_REQUIRED`

表示当前操作必须提供源图，比如 `nanobanana` 的 `img2img`、`grok-imagine-1.0-edit`、`grok-imagine-1.0-video`。

`CLIPBOARD_IMAGE_UNAVAILABLE`

表示当前系统剪贴板里没有可读取的图片，或者当前环境无法访问系统剪贴板。

## 开发与测试

编译：

```bash
npm run build
```

运行测试：

```bash
npm test
```

## 文档

- [SKILL.md](./SKILL.md)
- [CLI 用法](./references/cli-usage.md)
- [JSON 示例](./references/examples.md)
- [Provider 能力矩阵](./references/provider-capabilities.md)
