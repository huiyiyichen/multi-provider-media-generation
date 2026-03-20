# multi-provider-media-generation

面向 Codex 的多后端图像与视频生成 skill。

项目通过统一的 `media-skill` CLI 提供配置管理、能力解析与生成执行能力，内部采用固定流程处理请求：输入归一化、能力矩阵解析、字段白名单校验、provider 适配、请求发送与结果落盘。该实现用于限制跨 provider 的字段误透传，并为不同接口风格提供受控映射。

## 功能

- 统一命令入口：`media-skill`
- 支持 `NovelAI`、`nanobanana`、`grok`
- 兼容格式：`oai_images`、`nai_compatible`、`wrapped`、`openai chat completions`
- 支持 provider 配置管理、能力查询与统一生成入口
- 支持为 `NovelAI` 持久化保存常用正面提示词与负面提示词
- 支持 `nanobanana` 的 `txt2img`、`img2img`
- 支持 `grok` 的生图、改图与图生视频
- 支持可选的 `Donmai / Danbooru` tag 标准化校对流程

## 安装

```bash
npm install
npm run build
```

Windows PowerShell：

```powershell
npm.cmd install
npm.cmd run build
```

## 安装到 Codex

项目提供 `scripts/install-codex-skill.ps1` 用于将当前仓库同步到 Codex 的 skill 目录。

执行前请先完成构建：

```powershell
npm.cmd run build
```

安装命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-codex-skill.ps1
```

脚本默认安装到以下目录：

- 设置了 `CODEX_HOME` 时：`$CODEX_HOME/skills/multi-provider-media-generation`
- 未设置 `CODEX_HOME` 时：`%USERPROFILE%\.codex\skills\multi-provider-media-generation`

安装脚本会执行以下校验：

- 以 UTF-8 无 BOM 写入 `SKILL.md`、`README.md`、`agents/openai.yaml`
- 校验安装后的 `SKILL.md` 文件头必须以 `---` 开始
- 校验安装后的 `agents/openai.yaml` 必须包含 `interface:` 顶层块
- 同步 `assets/`、`dist/`、`references/`、`scripts/` 等运行所需目录
## 命令入口

对外统一命令名为 `media-skill`。

未进行全局安装时，请使用本地 CLI：

```powershell
node dist\cli.js <command>
```

示例：

```powershell
node dist\cli.js config list
node dist\cli.js generate --file input.json
```

## 支持范围

- 支持 `NovelAI`、`nanobanana`、`grok`
- 兼容格式：`oai_images`、`nai_compatible`、`wrapped`、`openai chat completions`

## Provider 配置

交互式配置命令：

```powershell
node dist\cli.js config set
```

配置项：

- `provider`
- `url`
- `apikey`
- `model`

配置规则：

- `provider` 支持编号或完整名称
- `model` 支持多个值，多个模型以英文逗号分隔
- 第一个模型保存为 `default_model`
- 所有模型保存到 `allowed_models`
- `auth_strategy` 默认值为 `bearer`
- `timeout_ms` 默认值为 `300000`

各 provider 的配置相互独立，更新单个 provider 不会覆盖其他 provider 的已保存配置。

常用命令：

```powershell
node dist\cli.js config get --provider nanobanana
node dist\cli.js config list
node dist\cli.js config validate --provider novelai_compatible
```

## NovelAI Profile

`profile` 用于持久化保存常用正面提示词与负面提示词。

创建或更新 profile：

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

- `positive` 适用于画师串、质量串、风格串
- `negative` 适用于长期复用的 NovelAI 负面提示词
- 未显式提供 `profile_name` 时，默认使用当前默认 profile

## NovelAI 生成规则

推荐输入：

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

处理规则：

- 默认 profile 的正面提示词会追加到 `prompt`
- 默认 profile 的负面提示词会追加到 `negative_prompt`
- `nai_compatible` 风格映射到 `/v1/chat/completions`

显式指定 profile：

```json
{
  "profile_name": "another-style"
}
```

## NovelAI 尺寸策略

默认尺寸策略为 `normal + 1:1`，对应 `1024:1024`。

尺寸级别映射：

- 小图：`small`
- 大图：`large`
- 超大图、超高分辨率、壁纸：`wallpaper`
- 未指定尺寸级别：`normal`

长宽比映射：

- 未指定横竖方向：`1:1`
- 横图：landscape
- 竖图：portrait

尺寸表：

- `small`：`640:640` / `768:512` / `512:768`
- `normal`：`1024:1024` / `1216:832` / `832:1216`
- `large`：`1472:1472` / `1536:1024` / `1024:1536`
- `wallpaper`：`1920:1088` / `1088:1920`

补充说明：

- `wallpaper` 不提供正方形尺寸
- 当请求仅指定“超大图”或“壁纸”但未指定横竖方向时，需要结合场景选择横版或竖版尺寸
- 用户已明确给出尺寸时，以用户输入为准

## 模型选择

当某个 provider 配置了多个 `allowed_models` 时，生成请求必须显式提供 `model`。

示例：

```json
{
  "provider": "nanobanana",
  "operation": "txt2img",
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "一个未来感物流仓库，电影感，写实风格"
}
```

## nanobanana 图生图

`nanobanana` 支持以剪贴板图片作为 `img2img` 输入。

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

执行命令：

```powershell
node dist\cli.js generate --file input.json
```

## 生成示例

`nanobanana` 文生图：

```powershell
node dist\cli.js generate --json "{\"provider\":\"nanobanana\",\"operation\":\"txt2img\",\"model\":\"gemini-3-pro-image-preview\",\"prompt\":\"一个未来感物流仓库，电影感，写实风格\"}"
```

`NovelAI official` 的 `composed` 模式：

```powershell
node dist\cli.js generate --json "{\"provider\":\"novelai_official\",\"operation\":\"txt2img\",\"prompt_mode\":\"composed\",\"content_prompt\":\"1girl, thick eyebrows, messy hair\",\"artist_preset\":\"painterly\",\"style_preset\":\"cinematic\",\"negative_preset\":\"safe-negative\",\"extra_positive\":\"ethereal glow\"}"
```

`grok` 图生视频：

```powershell
node dist\cli.js generate --json "{\"provider\":\"grok_imagine\",\"operation\":\"img2video\",\"model\":\"grok-imagine-1.0-video\",\"prompt\":\"animate this image\",\"source_image\":{\"type\":\"base64\",\"value\":\"aGVsbG8=\"}}"
```

## Donmai / Danbooru 流程

项目支持可选的 `Donmai / Danbooru` tag 标准化流程，适用于角色名、画师名、版权名、别名及冷门 tag 的校对。

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

## 输出目录

生成结果统一写入 `data/runs/<yyyy-mm-dd>/`。

目录内容包括：

- 图片或视频文件
- 可选的原始响应文件（启用 `save_raw_response: true` 时）

当前实现不会为单个资产创建额外子目录，也不会为每张图片单独生成 `metadata.json`。

## 常见错误

`UNSUPPORTED_OPERATION`

目标 provider 或 model 不支持当前操作。

`UNSUPPORTED_FIELD`

输入中包含目标 provider 不允许的字段，例如向 `nanobanana` 传入 `negative_prompt`。

`SOURCE_IMAGE_REQUIRED`

当前操作必须提供源图，例如 `nanobanana` 的 `img2img`、`grok-imagine-1.0-edit`、`grok-imagine-1.0-video`。

`CLIPBOARD_IMAGE_UNAVAILABLE`

当前环境无法从系统剪贴板读取图片。

## 开发与测试

```bash
npm run build
npm test
```

## 文档

- [SKILL.md](./SKILL.md)
- [CLI 用法](./references/cli-usage.md)
- [JSON 示例](./references/examples.md)
- [Provider 能力矩阵](./references/provider-capabilities.md)
- [NovelAI 尺寸规则](./references/novelai-size-policy.md)
- [Danbooru / Donmai 流程](./references/danbooru-workflow.md)
