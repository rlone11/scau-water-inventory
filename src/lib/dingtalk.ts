/**
 * 钉钉扫码登录的公开配置。
 *
 * ⚠️ Client ID 是**公开信息** —— 它本来就出现在用户浏览器地址栏的授权 URL 里，
 * 硬编码在这里不会泄露任何东西。真正的密钥（Client Secret）只存在于
 * Supabase Edge Function 的环境变量中，永远不进浏览器。
 *
 * 这样安排还有一个好处：不用为三个部署平台各配一遍环境变量。
 */

export const DINGTALK_CLIENT_ID = 'dingabilrwycrqh0avys';

/** 钉钉登录 JSSDK。放在阿里 CDN（g.alicdn.com），国内直连很快。 */
export const DINGTALK_SDK_URL =
  'https://g.alicdn.com/dingding/h5-dingtalk-login/0.21.0/ddlogin.js';

/**
 * 扫码成功后的回调地址。
 *
 * ⚠️ 必须与钉钉开发者后台「开发配置 → 安全设置 → 重定向URL」里登记的
 * 完全一致（协议、域名、路径都要对上），差一个字符就报
 * 「redirect_uri 与回调域名不一致」。
 *
 * 内嵌二维码还要求**嵌入页面与它同源**，所以这里用当前页面的源而非写死域名 ——
 * 本地开发（localhost:5173）和线上（rlone11.github.io）各自对得上，
 * 前提是这两个地址都在钉钉后台登记过。
 */
export function dingtalkRedirectUri(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
