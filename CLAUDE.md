# 开发入口

开发前先读 [项目规格](docs/SPEC.md)，遵守第 1 节工作规则。每次只推进一个里程碑，引擎改动配套测试。

使用 Node.js 24 LTS 和 npm，在本目录运行：

- `npm ci` 安装锁定依赖
- `npm run dev` 启动本地开发服务器
- `npm test` 运行全部测试
- `npm run build` 类型检查并生成 dist/
- `npm run lint` 检查代码，`npm run format` 格式化源码
- `npm run simulate` 运行四颗星球的连续模拟，生成各星球的 CSV 时间线

