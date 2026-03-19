# Danbooru / Donmai 可选查询流程

## 适用时机

- 用户明确要求“按 Danbooru tag 来写”。
- 用户要求“查 wiki”、“查 Donmai”、“查 Danbooru API”。
- 你需要校对画师名、角色名、版权名、别名或冷门 tag。
- 你怀疑当前 tag 更像经验写法，而不是 Donmai 标准名。

如果只是普通 NAI 生图，且主体 / 构图 / 场景词都很常见，可以直接按实战经验整理 tag，不必每次都查。

## 查询优先级

1. 先把用户需求拆成候选 tag。
2. 如果只是常见外观、动作、场景词，直接整理成 Danbooru / NAI 风格标签。
3. 如果涉及标准名校对，优先查 Donmai API。
4. 如果需要解释、歧义说明、使用场景，再看 Donmai wiki。
5. 最终发给 NAI 时，以“能稳定出图的标签串”为准，不必机械复制 wiki 句子。

## Donmai 本地配置

如果存在这个文件：

`data/config/donmai.json`

说明已经保存了 Donmai 查询配置。建议结构如下：

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

- `base_url` 用于 API。
- `wiki_url` 用于打开 wiki 页面。
- `preferred_mode` 设为 `api` 时，默认优先走 API 查 tag。
- 这个文件属于本地运行数据，应放在 `data/` 下，不提交到 Git。

## API 与 wiki 的分工

优先用 API 的场景：

- 查 tag 标准名。
- 查别名是否归并到主 tag。
- 看 tag 分类。
- 看 tag 热度或常用程度。
- 批量补全候选 tag。

优先看 wiki 的场景：

- 查 tag 的语义解释。
- 区分相近 tag 的使用边界。
- 查某些人物 / 版权 / 设定词的说明。

## 输出规则

- 给用户最终展示时，可以分成两套：
  - `Danbooru 标准版`
  - `NAI 实战版`
- 如果某个词是“经验上更好出图，但不完全是 Donmai 标准名”，要明确说明这是实战改写，不是假装它来自站内标准 tag。
- 如果没有实际查 API / wiki，就直接说“这是按经验整理的 Danbooru / NAI 风格 tag”。

## 推荐工作流

1. 先读用户需求，确定主体、动作、服装、场景、光影、构图。
2. 先写一版简洁的 Danbooru / NAI 风格候选 tag。
3. 如果涉及冷门名词、画师串、角色名、版权名，再查 API 做校对。
4. 如果遇到歧义，再补看 wiki。
5. 最终把稳定出图所需的 tag 发给 `novelai_compatible` 或其他目标 provider。
