/**
 * 检查头像URL是否有效
 * 过滤掉Figma资源路径等无效URL
 */
export function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  
  // 只接受 data:image/ 开头的Base64 URL或 http/https URL
  return url.startsWith('data:image/') || url.startsWith('http');
}

/**
 * 获取有效的头像URL，如果无效则返回undefined
 */
export function getValidAvatarUrl(url: string | undefined): string | undefined {
  return isValidAvatarUrl(url) ? url : undefined;
}
