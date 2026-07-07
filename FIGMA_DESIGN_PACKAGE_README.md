# D3 Finance - Figma 完整设计资源包

## 📦 资源包内容

本资源包包含完整的D3 Finance设计系统，可直接用于Figma设计。

### 包含文件

1. **FIGMA_DESIGN_SPEC.md** - 完整设计规范
   - VI色系定义（OKLCH值、RGB值）
   - 字体系统规范
   - 组件库概览
   - 页面结构说明
   - 交互规范
   - 响应式设计规则

2. **FIGMA_COMPONENTS_GUIDE.md** - 详细组件库指南
   - 按钮组件（Primary、Secondary、Outline）
   - 卡片组件（Data、Premium、Comparison）
   - 徽章组件（Wine、Gold、Status）
   - 输入框、表格、模态框
   - 导航组件、分隔符
   - 栅格系统
   - 颜色系统详解
   - 字体系统详解
   - 阴影系统
   - 动画系统
   - Figma实现步骤
   - 设计检查清单

3. **FIGMA_PAGE_ANNOTATIONS.md** - 页面标注与交互
   - Landing Page 完整标注（11个Section）
   - Portal Page 完整标注
   - D3-Fi 应用标注
   - 交互流程图
   - 响应式断点标注

---

## 🎨 快速开始

### 第一步：创建颜色系统

在Figma中创建以下颜色样式：

**主色系**
```
Primary-700: oklch(0.35 0.18 350)  [深酒红 - 主色]
Primary-600: oklch(0.40 0.17 350)
Primary-500: oklch(0.45 0.16 350)  [浅酒红]
```

**金色系**
```
Gold-700: oklch(0.68 0.12 70)  [金色 - 装饰色]
```

**中性色**
```
Gray-900: oklch(0.12 0.01 280)  [文字]
Gray-500: oklch(0.55 0.02 280)  [次文字]
Gray-100: oklch(0.92 0.004 286.32)  [边框]
Gray-50: oklch(0.97 0.01 70)  [背景]
White: oklch(1 0 0)
```

### 第二步：创建字体样式

**标题字体**
- Playfair Display 700 (56px, 48px, 32px, 24px, 20px)

**正文字体**
- Noto Sans SC 400/600 (16px, 14px, 12px)

### 第三步：创建主组件

按照 FIGMA_COMPONENTS_GUIDE.md 中的规范创建：

1. Button/Primary (Small, Medium, Large)
2. Button/Secondary
3. Button/Outline
4. Card/Data
5. Card/Premium
6. Card/Comparison
7. Badge/Wine
8. Badge/Gold
9. Input/Text
10. Input/Select
11. Table/Data
12. Dialog/Modal
13. NavBar
14. SideBar

### 第四步：创建页面框架

根据 FIGMA_PAGE_ANNOTATIONS.md 中的标注创建：

1. Landing Page
2. Portal Page
3. D3-Fi Dashboard
4. D3-Fi Assets
5. D3-Fi Enter
6. D3-Fi Vote
7. D3-Fi Bribe
8. D3-Fi Dividends
9. D3-Fi Network
10. D3-Fi Safety
11. D3-Fi Help

---

## 📐 设计系统核心数据

### 颜色速查表

| 用途 | OKLCH值 | RGB值 | 使用场景 |
|------|--------|-------|---------|
| 主色 | oklch(0.35 0.18 350) | #6B1B47 | 按钮、标题、强调 |
| 浅色 | oklch(0.45 0.16 350) | #9B3D6B | 渐变、次级 |
| 金色 | oklch(0.68 0.12 70) | #D4A574 | 装饰、边框 |
| 背景 | oklch(0.97 0.01 70) | #F8F6F3 | 卡片、背景 |
| 文字 | oklch(0.12 0.01 280) | #1F1F2E | 正文 |

### 字体速查表

| 用途 | 字体 | 大小 | 权重 | 行高 |
|------|------|------|------|------|
| H1 | Playfair Display | 56-72px | 700 | 1.2 |
| H2 | Playfair Display | 40-48px | 700 | 1.3 |
| H3 | Playfair Display | 24-32px | 700 | 1.4 |
| Body | Noto Sans SC | 16px | 400 | 1.6 |
| Small | Noto Sans SC | 14px | 400 | 1.5 |

### 间距速查表

```
4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px, 96px
```

### 圆角速查表

```
4px (sm)
8px (md)
12px (lg)
16px (xl)
20px (2xl)
```

### 阴影速查表

```
Shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08)
Shadow-md: 0 8px 16px rgba(0, 0, 0, 0.12)
Shadow-lg: 0 12px 32px rgba(107, 27, 71, 0.3)
Shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.3)
```

---

## 🔧 Figma 工作流程建议

### 1. 组织结构

```
D3 Finance Design System
├── 📋 Design Tokens
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   ├── Shadows
│   └── Radius
├── 🎨 Components
│   ├── Button
│   ├── Card
│   ├── Badge
│   ├── Input
│   ├── Table
│   ├── Dialog
│   ├── Navigation
│   └── Layout
├── 📄 Pages
│   ├── Landing Page
│   ├── Portal Page
│   └── D3-Fi App
└── 📸 Assets
    ├── Icons
    ├── Illustrations
    └── Patterns
```

### 2. 命名规范

**颜色样式**
```
Color/Primary-700
Color/Gold-700
Color/Gray-900
```

**字体样式**
```
Typography/H1
Typography/Body
Typography/Small
```

**组件**
```
Button/Primary/Small
Button/Primary/Medium
Button/Primary/Large
Card/Data
Badge/Wine
```

### 3. 协作建议

- 使用Figma的Team Library功能共享设计系统
- 定期更新组件库
- 使用版本控制追踪变更
- 在组件中添加详细的使用说明

---

## ✅ 设计质量检查清单

完成设计后，请检查以下项目：

### 颜色与对比度
- [ ] 所有文字对比度 ≥ 4.5:1（WCAG AA标准）
- [ ] 所有颜色使用了样式变量
- [ ] 没有硬编码的颜色值

### 字体与排版
- [ ] 所有字体使用了样式变量
- [ ] 标题使用Playfair Display
- [ ] 正文使用Noto Sans SC
- [ ] 行高遵循规范（1.2-1.6）

### 间距与布局
- [ ] 所有间距都是4px的倍数
- [ ] 容器宽度遵循响应式规则
- [ ] 网格间距一致

### 组件与交互
- [ ] 所有交互元素都有Hover状态
- [ ] 所有按钮宽度 ≥ 44px（移动端）
- [ ] 所有输入框有Focus状态
- [ ] 所有模态框有进入/退出动画

### 响应式设计
- [ ] 在Mobile (375px) 上测试过
- [ ] 在Tablet (768px) 上测试过
- [ ] 在Desktop (1280px) 上测试过
- [ ] 所有断点上的布局都正确

### 可访问性
- [ ] 所有交互元素都有清晰的焦点状态
- [ ] 所有图标都有标签或替代文本
- [ ] 所有表单都有标签
- [ ] 颜色不是唯一的信息传达方式

---

## 📚 参考资源

### 相关文档
- FIGMA_DESIGN_SPEC.md - 完整设计规范
- FIGMA_COMPONENTS_GUIDE.md - 详细组件库指南
- FIGMA_PAGE_ANNOTATIONS.md - 页面标注与交互

### 外部资源
- [Figma官方文档](https://help.figma.com/)
- [WCAG 2.1 无障碍指南](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design系统](https://material.io/design/)
- [OKLCH颜色空间](https://oklch.com/)\n\n---\n\n## 🎯 设计原则\n\n### 一致性\n- 所有元素遵循统一的设计系统\n- 相同功能的元素外观一致\n- 颜色、字体、间距都有规范\n\n### 可读性\n- 充足的颜色对比度\n- 清晰的字体层级\n- 合理的间距和留白\n\n### 可用性\n- 清晰的交互反馈\n- 易于理解的界面\n- 无障碍设计\n\n### 响应性\n- 在所有设备上都能正常显示\n- 灵活的布局系统\n- 适应不同的屏幕尺寸\n\n### 性能\n- 避免过度装饰\n- 优化动画性能\n- 保持文件大小合理\n\n---\n\n## 📞 支持与反馈\n\n如有任何问题或建议，请联系设计团队。\n\n**文档版本**：v1.0\n**最后更新**：2026年7月7日\n**维护者**：D3 Finance UI Team
