# sgx-ui cookie 契约（主站写，博客 / 书库只读）

博客是沉浸式 app，没有自己的语言、深浅色、配色开关；这些都在主站 `https://styrigx.com/settings/` 设置，
主站把结果镜像到一个共享 cookie，博客在 `<head>` 里**首帧前同步读取**（`web/layouts/partials/sgx-inherit.html`），不闪屏。

> 任务里暂称 `sgx-prefs` 的东西就是这个已有的 `sgx-ui`：沿用主站 `web/assets/js/lib/ui-cookie.js` 已经在写的 cookie，
> 只是加了 `lang`、`accent` 两个字段，没有另起一个 cookie。

## 写法

```
sgx-ui=<base64url(UTF-8 JSON)>; Domain=styrigx.com; Path=/; Max-Age=34560000; SameSite=Lax; Secure
```

- 不加 HttpOnly（子站要用 JS 读）。只放 UI 设置，**不放任何凭证 / 会话信息**。
- base64url：`btoa(unescape(encodeURIComponent(json)))`，`+`→`-`，`/`→`_`，去掉末尾 `=`。
- 解析失败、字段缺失或取值不合法时，该字段按“没设置”处理，不会抛错。

## 博客读取的字段

| 字段     | 取值                                                                                                                              | 没有 / 不合法时                                                                       | 博客怎么用                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`      | `2`                                                                                                                               | —                                                                                     | 版本号，博客不校验                                                                                                                                                           |
| `mode`   | `light` \| `dark` \| `system`                                                                                                     | 跟系统 `prefers-color-scheme`                                                         | `<html data-theme>`、`color-scheme`；`system` 时跟随系统变化                                                                                                                 |
| `theme`  | 同 `mode`                                                                                                                         | —                                                                                     | `mode` 的别名（`mode` 优先）                                                                                                                                                 |
| `lang`   | `zh` \| `en`                                                                                                                      | 旧行为：只有中文首页 `/` 按 `localStorage['styrigx-blog-lang']` / 浏览器语言跳 `/en/` | 和当前页语言不同、且本页确有另一语言版本时 `location.replace` 过去（保留 `#hash`）。爬虫不跳。没有译文的文章留在原页                                                         |
| `pal`    | 色板 id：`lake`（默认）`forest` `terra` `violet` `rose` `cherry` `tangerine` `amber` `matcha` `teal` `indigo` `orchid` `graphite` | `lake`                                                                                | `<html data-palette>`，换整套 `--m-*` 色（主站共享外壳 `web/assets/css/sgx-shell.css`）                                                                                                        |
| `accent` | 色板 id（同上）或 `#rrggbb`                                                                                                       | 跟 `pal`（= `--m-primary`）                                                           | 只换强调色 `--sgx-accent` / `--sgx-on-accent`：色板 id → `<html data-accent>`（浅色 / 深色各一组，共享外壳）；`#rrggbb` → 内联变量，文字色按亮度自动选白 / 深 |
| `fs`     | `small` \| `standard` \| `large`                                                                                                  | `standard`                                                                            | 根字号 87.5% / 100% / 112.5%                                                                                                                                                 |
| `rm`     | `1` \| `0`                                                                                                                        | `0`                                                                                   | `<html class="reduced-motion">`，关掉滑块 / 抽屉 / 面板动画（系统减弱动效同样生效）                                                                                          |
| `mat`    | 毫秒时间戳                                                                                                                        | —                                                                                     | 旧字段（博客原来能自己切深浅色时用来比先后）；博客已不再使用，主站可继续写                                                                                                   |

主站其他字段（`tz1` `tz2` `h12` `clock` `wx` `unit` `loc` `city` `precise`）博客忽略。

## 强调色用在哪

`--sgx-accent` / `--sgx-on-accent`：列表页分段滑块的指示器、导航抽屉的当前项、文章页长条底边的阅读进度细线、抽屉目录的当前节、
专题里选中的筛选芯片、文章的「第 n / N 篇」徽标。

## 主站要做的（还没做）

在 `syncUiCookie()` 的 payload 里加：

```js
lang: ls('sgx-lang') === 'en' ? 'en' : 'zh',          // 主站语言设置
accent: /^([a-z]{2,16}|#[0-9a-f]{6})$/i.test(ls('sgx-accent') || '') ? ls('sgx-accent') : undefined,
```

（`sgx-lang` / `sgx-accent` 是主站本地键的建议名，以主站实际实现为准。）

## 博客清掉的旧本地键

`navfolio-theme`、`sgx-theme-at`（原博客主题开关留下的，会盖过主站设置）在每次加载时删除。
