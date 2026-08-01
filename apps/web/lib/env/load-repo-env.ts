/**
 * Next 由 next.config.ts 加载仓库根目录环境变量；Sites 等生产环境由平台注入。
 * 不在请求路径中扫描磁盘，避免 standalone 构建追踪整个项目甚至打包本地文件。
 */
export function ensureRepoEnvLoaded(): void {
  // Kept as a compatibility hook for the provider factories.
}
