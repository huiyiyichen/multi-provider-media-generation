# Provider 能力矩阵

运行时会按 `provider + model + operation + request_style` 解析能力。
内部 `provider` 绝不会被当作远端请求里的 `model` 发送。

## 支持的组合

| provider | 请求风格 / model | operation | 说明 |
| --- | --- | --- | --- |
| `novelai_official` | `official` | `txt2img` | 支持 NovelAI 提示词预设、profile，以及 raw/composed 两种 prompt 模式。 |
| `novelai_compatible` | `oai_images` | `txt2img` | 需要在配置中提供对应的 style template。 |
| `novelai_compatible` | `nai_compatible` | `txt2img` | 按已知规则映射为 `/v1/chat/completions` 请求体。 |
| `novelai_compatible` | `wrapped` | `txt2img` | 需要在配置中提供对应的 style template。 |
| `nanobanana` | provider-level | `txt2img` | 属于最小输入 provider。 |
| `nanobanana` | provider-level | `img2img` | 属于最小输入 provider。 |
| `grok_imagine` | `grok-imagine-1.0` | `txt2img` | 支持 `n` 批量生成。 |
| `grok_imagine` | `grok-imagine-1.0-edit` | `img2img` | 必须且只能传入 1 张源图。 |
| `grok_imagine` | `grok-imagine-1.0-video` | `img2video` | 必须且只能传入 1 张源图。 |

## NovelAI 允许字段

### `novelai_official`

允许：

- `prompt` / `content_prompt`
- `prompt_mode`
- `profile_name`
- `model`
- `negative_prompt`
- `width` / `height`
- `steps`
- `cfg_scale`
- `seed`
- `sampler`
- `artist_preset` / `style_preset` / `negative_preset`
- `extra_positive` / `extra_negative`

### `novelai_compatible / oai_images`

允许：

- `prompt` / `content_prompt`
- `prompt_mode`
- `profile_name`
- `model`
- `negative_prompt`
- `size`
- `artist_preset` / `style_preset` / `negative_preset`
- `extra_positive` / `extra_negative`
- 只有 style template 显式声明时才允许 `n`、`response_format`

### `novelai_compatible / nai_compatible`

允许：

- `prompt` / `content_prompt`
- `prompt_mode`
- `profile_name`
- `model`
- `negative_prompt`
- `size`
- `width` / `height`
- `steps`
- `cfg_scale`
- `seed`
- `sampler`
- `artist_preset` / `style_preset` / `negative_preset`
- `extra_positive` / `extra_negative`

其中已知映射关系是：

- `prompt` 或组合后的正面提示词 -> `messages[0].content`
- `negative_prompt` -> `negative_prompt`
- `cfg_scale` -> `scale`
- `size` -> 同时映射到 `size` 和 `image_size`

## 白名单规则

- 在真正构建请求前，先拒绝不支持的操作类型。
- 只要用户传入了不在当前能力描述里的字段，就直接报错。
- `nanobanana` 和 `grok_imagine` 默认按最小输入 provider 处理。
- 只有在显式配置或 style template 明确支持时，才允许 `n` 或 `response_format`。
- NovelAI 的 profile 与预设只对 `novelai_official` 和 `novelai_compatible` 开启。

## 最小输入 provider 禁止字段

对于 `nanobanana` 和 `grok_imagine`，除非未来通过明确的 capability override 开启，否则用户传入以下字段时必须直接拒绝：

- `negative_prompt`
- `width`
- `height`
- `size`
- `steps`
- `cfg_scale`
- `seed`
- `sampler`
- `response_format`
- `extra_params`
