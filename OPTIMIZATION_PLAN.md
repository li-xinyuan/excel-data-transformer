# 项目优化计划

## 已完成 ✅

### v2.0.0 (2026-03-26)
- ✅ 新增默认值设置功能
- ✅ 新增逻辑规则功能
- ✅ 双击连线删除映射
- ✅ 右键菜单优化
- ✅ 字段状态颜色指示
- ✅ 配置保存/加载优化
- ✅ CSS 样式修复
- ✅ 操作提示精简

## 待优化事项 📋

### 高优先级 🔴

#### 1. 清理调试日志
**文件**: `src/public/js/app.js`
**问题**: 生产环境包含大量 console.log
**建议**: 
- 移除或注释掉调试日志
- 或者添加日志级别控制（开发/生产环境）

**需要移除的日志**:
- L1550-1624: `[RenderTargetFields]` 相关日志（15 处）
- L3179-3212: `[LoadConfig]` 相关日志（10 处）
- 其他调试日志

#### 2. 清理备份文件
**文件**: 
- `src/dataTransformer.js.backup`
- `src/dataTransformer.js.backup2`
- `src/public/js/app.js.backup`
- `src/public/js/app.js.backup2`
- `src/server.js.backup`
- `src/server.js.backup2`
- `src/public/css/style.css.backup2`

**建议**: 
```bash
rm src/*.backup src/*.backup2
rm src/public/js/*.backup src/public/js/*.backup2
rm src/public/css/*.backup2
```

#### 3. 更新 package.json 版本
**文件**: `package.json`
**当前**: `"version": "1.9.3"`
**应该**: `"version": "2.0.0"`

#### 4. 添加 .env.example
**文件**: `.env.example`
**内容**:
```bash
# 服务器端口
PORT=3456

# 日志级别 (debug, info, warn, error)
LOG_LEVEL=info

# 生产环境设置
NODE_ENV=production
```

### 中优先级 🟡

#### 5. 代码模块化拆分
**文件**: `src/public/js/app.js` (3658 行)

**建议拆分**:
```
src/public/js/
├── app.js                 # 主入口（初始化、事件监听）
├── mapping/               # 映射相关
│   ├── mappingManager.js  # 映射管理
│   ├── mappingCanvas.js   # 画布绘制
│   └── mappingUI.js       # UI 渲染
├── fields/                # 字段管理
│   ├── fieldRenderer.js   # 字段渲染
│   ├── fieldStates.js     # 字段状态管理
│   └── fieldContextMenu.js # 右键菜单
├── modals/                # 弹窗管理
│   ├── defaultValueModal.js
│   ├── logicRuleModal.js
│   └── configModal.js
├── utils/                 # 工具函数
│   ├── helpers.js
│   └── validators.js
└── storage/               # 存储管理
    ├── localStorage.js
    └── configManager.js
```

#### 6. 错误处理增强
**位置**: 
- 文件上传处理
- 配置保存/加载
- 网络请求

**示例**:
```javascript
// 当前
fetch('/api/...')
  .then(res => res.json())
  .then(data => {...});

// 改进后
fetch('/api/...')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {...})
  .catch(err => {
    console.error('请求失败:', err);
    showError('网络请求失败，请重试');
  });
```

#### 7. 添加单元测试
**测试框架**: Jest (已配置)

**测试文件**:
```
tests/
├── unit/
│   ├── dataTransformer.test.js
│   ├── fieldMapper.test.js
│   └── utils.test.js
├── integration/
│   └── api.test.js
└── e2e/
    └── workflow.test.js
```

### 低优先级 🟢

#### 8. CSS 优化
**检查**:
- 移除未使用的样式
- 合并重复的样式规则
- 考虑使用 CSS 预处理器（Sass/Less）

#### 9. 性能优化
**建议**:
- 启用 gzip 压缩
- 添加静态资源缓存
- 优化大文件上传（分片上传）
- 虚拟滚动（如果数据量很大）

#### 10. 文档完善
**添加**:
- API 文档
- 部署指南
- 开发环境搭建指南
- 常见问题 FAQ

#### 11. 安全性增强
**检查**:
- 文件上传大小限制
- 文件类型验证
- XSS 防护（已有部分）
- CSRF 保护

## 立即执行计划 🚀

### 第一步：清理工作（5 分钟）
```bash
# 1. 删除备份文件
rm src/*.backup src/*.backup2
rm src/public/js/*.backup src/public/js/*.backup2  
rm src/public/css/*.backup2

# 2. 删除测试文件
rm test_transform.js test_transform_rules.js
```

### 第二步：更新版本（2 分钟）
- 更新 `package.json` 版本为 `2.0.0`
- 添加 `.env.example`

### 第三步：移除调试日志（10 分钟）
- 移除 `app.js` 中的 `[RenderTargetFields]` 和 `[LoadConfig]` 日志
- 保留关键错误日志

### 第四步：提交新版本（3 分钟）
```bash
git add .
git commit -m "chore: v2.0.1 - 清理调试日志和备份文件"
git push
```

## 长期改进计划 📅

### v2.1.0 (计划)
- [ ] 代码模块化重构
- [ ] 添加单元测试
- [ ] 错误处理增强

### v2.2.0 (计划)
- [ ] 性能优化
- [ ] CSS 重构
- [ ] 文档完善

### v3.0.0 (未来)
- [ ] TypeScript 迁移
- [ ] 前端框架迁移（Vue/React）
- [ ] 批量文件处理
- [ ] 云端存储支持
