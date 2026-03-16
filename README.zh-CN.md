# Recordly

语言: [English](README.md) | 简体中文

<p align="center">
  <img src="https://i.postimg.cc/tRnL8gHp/Frame-5.png" width="220" alt="Recordly logo">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-111827?style=for-the-badge" alt="macOS Windows Linux" />
  <img src="https://img.shields.io/badge/open%20source-MIT-2563eb?style=for-the-badge" alt="MIT license" />
</p>

### 创建精致、专业级的屏幕录制视频
[Recordly](https://www.recordly.dev) 是一款**开源的录屏与视频编辑器**，用于制作**演示、教程、产品讲解和工作流视频**。

**FAQ**：这个项目与 **Openscreen** 有什么区别？
答：Recordly 增加了完整的光标动画/渲染管线、Mac 和 Windows 原生录制能力、更贴近 Screen Studio 的缩放动画、光标循环、更平滑的平移行为，以及更多底层改进。

> 该分支存在的原因是：原维护者不计划引入这些需要调整架构才能实现的能力（例如不同的录制管线）。

> [!NOTE]
> 非常感谢 **tadees** 对项目的支持！这笔捐助直接帮助支付 Apple Developer 账户费用，以便 Recordly 在 macOS 上签名与公证。
[**支持项目**](https://ko-fi.com)

<p align="center">
  <img src="./recordlydemo.gif" width="750" alt="Recordly demo video">
</p>

---

## Recordly 是什么？

Recordly 可以录制屏幕，并自动将内容转换为更精致的视频。它会自动放大关键操作、平滑光标抖动，让你的演示默认看起来更专业。

Recordly 支持：

- **macOS**
- **Windows**
- **Linux**

Linux 当前使用 Electron 捕获路径，因此录制时系统光标不一定总能被隐藏。

---

# 功能

### 录制

- 录制整屏或单个窗口
- 录制结束后可直接进入编辑器
- 支持麦克风和系统音频录制
- Windows / Linux 使用 Chromium 捕获 API
- macOS 使用原生 **ScreenCaptureKit**
- Windows 提供原生 WGC 录制辅助（屏幕与应用窗口）以及 WASAPI 系统/麦克风音频能力

### 智能运动

- 类 Apple 风格缩放动画
- 基于光标活动自动建议缩放区域
- 支持手动添加缩放区域
- 区域之间平滑过渡

### 光标控制

- 可调节光标大小
- 光标平滑
- 运动模糊
- 点击弹跳动画
- macOS 风格光标素材

### 光标循环

<p>
  <img src="./CursorLoop.gif" width="450" alt="Recordly demo video">
</p>

- 在视频/GIF 结尾冻结帧中让光标回到原始位置（默认关闭）

### 编辑工具

- 时间线裁剪
- 变速区域
- 注释
- 缩放片段
- 项目保存与重新打开（`.recordly` 文件）

### 画面样式

- 壁纸
- 渐变
- 纯色背景
- 内边距
- 圆角
- 模糊
- 阴影

### 导出

- MP4 导出
- GIF 导出
- 画幅比例控制
- 质量选项

---

# 截图

<p align="center">
  <img src="https://i.postimg.cc/d0t09ypT/Screenshot-2026-03-09-at-8-10-08-pm.png" width="700" alt="Recordly editor screenshot">
</p>

<p align="center">
  <img src="https://i.postimg.cc/YSgdbvFj/Screenshot-2026-03-09-at-8-49-14-pm.png" width="700" alt="Recordly recording interface screenshot">
</p>

---

# 安装

## 下载预编译版本

发布页面：

https://github.com/webadderall/Recordly/releases

## Homebrew（Cask）

Recordly 是图形应用，因此通过 cask 安装。

```bash
brew tap webadderall/tap
brew install --cask recordly
```

## 从源码构建

```bash
git clone https://github.com/webadderall/Recordly.git recordly
cd recordly
npm install
npm run dev
```

## macOS：提示“无法打开应用”

Recordly 默认未签名，本地构建后的应用可能被 macOS 隔离。

```bash
xattr -rd com.apple.quarantine /Applications/Recordly.app
```

---

# 使用方法

## 录制

1. 启动 Recordly
2. 选择屏幕或窗口
3. 选择音频录制选项
4. 开始录制
5. 停止录制并进入编辑器

## 编辑

在编辑器中你可以：

- 手动添加缩放区域
- 使用自动缩放建议
- 调整光标行为
- 裁剪视频
- 添加变速片段
- 添加注释
- 调整画面样式

你可以随时将工程保存为 `.recordly` 项目文件。

## 导出

导出选项：

- **MP4**（高质量视频）
- **GIF**（轻量分享）

可调整参数：

- 画幅比例
- 输出分辨率
- 质量设置

---

# 限制

### Linux 光标捕获

Electron 的桌面捕获 API 不允许在录制时隐藏系统光标。

如果启用动画光标图层，录制结果中可能会出现**双光标**。

欢迎贡献以改进跨平台光标捕获体验。

### 系统音频

系统音频捕获能力取决于平台支持。

**Windows**
- 开箱即用

**Linux**
- 需要 PipeWire（Ubuntu 22.04+、Fedora 34+）
- 较旧的 PulseAudio 环境可能不支持系统音频

**macOS**
- 需要 macOS 12.3+
- 使用 ScreenCaptureKit 辅助程序

---

# 工作原理

Recordly 是一个**桌面视频编辑器**，核心是渲染驱动的运动管线 + 平台特定捕获层。

**捕获层**
- Electron 负责录制流程编排
- macOS 使用原生辅助程序处理 ScreenCaptureKit 和光标遥测
- Windows 使用原生 WGC 进行屏幕捕获

**运动层**
- 缩放区域
- 光标追踪
- 变速
- 时间线编辑

**渲染层**
- 场景组合由 **PixiJS** 处理

**导出层**
- 使用同一渲染场景逐帧输出
- 编码为 MP4 或 GIF

**项目文件**
- `.recordly` 文件保存源视频路径与编辑状态

---

# 贡献

欢迎所有贡献者参与！
