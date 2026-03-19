# JSON 示例

## provider 配置示例

### nanobanana，多模型配置

```json
{
  "provider": "nanobanana",
  "api_key": "sk-example",
  "base_url": "https://example.com/v1",
  "auth_strategy": "bearer",
  "default_model": "gemini-3-pro-image-preview",
  "allowed_models": [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview"
  ],
  "fixed_fields": {
    "temperature": 0.7,
    "top_p": 0.98
  }
}
```

### NovelAI 兼容接口，聊天补全风格

```json
{
  "provider": "novelai_compatible",
  "api_key": "sk-example",
  "base_url": "https://example.com",
  "request_style": "nai_compatible",
  "auth_strategy": "bearer",
  "style_templates": {
    "nai_compatible": {
      "endpoint": "/v1/chat/completions",
      "supports_size": true,
      "supports_width_height": true
    }
  }
}
```

## NovelAI profile 示例

```json
{
  "name": "anime-default",
  "positive_prompt": "artist:alpha, artist:beta, masterpiece, best quality",
  "negative_prompt": "lowres, blurry, bad anatomy"
}
```

## 生成输入示例

### NovelAI，使用默认 profile 自动补全正负词

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

### NovelAI，显式指定某个 profile

```json
{
  "provider": "novelai_compatible",
  "operation": "txt2img",
  "prompt_mode": "raw",
  "profile_name": "anime-default",
  "model": "nai-diffusion-4-5-full",
  "prompt": "1girl, thick eyebrows, bags under eyes, messy hair, very long hair",
  "size": "1024:1024",
  "steps": 28,
  "cfg_scale": 6,
  "sampler": "Euler Ancestral"
}
```

### nanobanana 文生图，并选择指定模型

```json
{
  "provider": "nanobanana",
  "operation": "txt2img",
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "一个未来感物流仓库，电影感，写实风格"
}
```

### nanobanana 图生图，直接读取当前剪贴板图片

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

### nanobanana 图生图，读取本地图片

```json
{
  "provider": "nanobanana",
  "operation": "img2img",
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "改成夜景霓虹风格",
  "source_image": {
    "type": "path",
    "value": "D:\\图片\\a.png"
  }
}
```

### NovelAI official，composed 模式

```json
{
  "provider": "novelai_official",
  "operation": "txt2img",
  "prompt_mode": "composed",
  "content_prompt": "1girl, thick eyebrows, messy hair",
  "artist_preset": "painterly",
  "style_preset": "cinematic",
  "negative_preset": "safe-negative",
  "extra_positive": "ethereal glow"
}
```

### Grok 图生视频

```json
{
  "provider": "grok_imagine",
  "operation": "img2video",
  "model": "grok-imagine-1.0-video",
  "prompt": "Turn the still image into a slow camera push with drifting clouds.",
  "source_image": {
    "type": "base64",
    "value": "aGVsbG8=",
    "mime_type": "image/png",
    "filename": "source.png"
  }
}
```
