# signpad-free

**手写签名板 / Signature pad / 手書きサイン** — draw your signature in the browser, export a transparent PNG. Free, no upload, no watermark, no account.

> **中文** — 免费在线手写签名板:鼠标、手指或触控笔书写,自动笔锋(写快变细、写慢变粗、自动平滑),一键导出**透明底 PNG**(可直接贴进 Word/PDF 合同)或白底 JPEG。签名不上传服务器,全程浏览器本地处理。**[立即使用](https://w1977-0.github.io/signpad-free/)**
>
> **English** — Free online signature pad with a real pen feel: strokes run thin when fast, thick when slow, jitter is smoothed away. Export as a transparent PNG (drop straight into Word/PDF contracts) or a white-background JPEG. Nothing is uploaded; everything runs in your browser. **[Try it](https://w1977-0.github.io/signpad-free/)**
>
> **日本語** — 無料の手書きサインパッド。ペンの速度に応じて線の太さが変わるリアルな書き心地、透過PNG(Word・PDFにそのまま貼れる)または白背景JPEGで保存。アップロード不要・ブラウザ内だけで動作。**[使ってみる](https://w1977-0.github.io/signpad-free/)**

## Why

- **Every "free" signature site wants something** — an account, an email, a watermark-free upgrade. This page is one HTML file on GitHub Pages: there is no server, so there is nothing to pay for and nothing that could store your signature.
- **Signatures are personal.** The page makes zero network requests after load; your signature never leaves the device.
- **The pen feel is the product.** Pointer jitter is low-pass filtered, width follows velocity (fast = thin, slow = thick — the Square signature-pad recipe, 70% velocity weight), segments render as filled quad strips with round caps. Stylus pressure is used when the device reports it.

## Features

- 撤销 / 重做 / 清空 — undo, redo, clear
- 墨色与笔触粗细 — ink colour, three nib sizes
- 透明 PNG 导出(自动裁紧笔迹+呼吸边距) · 白底 JPEG 一键切换
- 手机/平板/触控笔/鼠标全支持(touch-action + pointer capture)

## How it works

```
pointer events → min-distance jitter filter → low-pass smoothing → velocity-aware width
              → quad-strip geometry (round caps) → canvas render → tight transparent export
```

`signmath.js` is the testable core (pure functions, dual-environment): smoothing, width law, strip geometry, ink bounds. `test/signmath.test.js` pins the mathematics with Node's built-in runner:

```
node --test test/signmath.test.js
```

## License

MIT
