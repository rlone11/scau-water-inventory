/**
 * 钉钉扫码登录 —— Supabase Edge Function
 *
 * 前端用 DTFrameLogin 拿到 authCode 后调这里，换回一组可以拿去
 * signInWithPassword 的凭据，从而得到一个**真正的 Supabase 会话**。
 *
 * 为什么绕这一圈：换 token 必须用 AppSecret，而网站是公开的静态页面，
 * 密钥放进浏览器等于公开泄露。所以只能在服务端换，再把结果交给前端。
 *
 * 为什么是「随机密码」而不是自签 JWT：
 *   自签 JWT 要拿到项目的 JWT 密钥，属非官方支持路径，以后升级会踩坑。
 *   createUser + signInWithPassword 全是文档明载的公开接口，稳。
 *   密码每次登录都重新生成、从不下发给人，只是换取会话的一次性凭据。
 *
 * 角色来源：staff_roles 表。每个扫码进来过的人都会在那里留一行
 * （默认 internal），把 role 改成 'admin' 就是管理员。
 *
 * 密钥来源：Supabase Edge Function 环境变量（与 sync-dingtalk 共用）
 *   DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET
 * SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自动注入。
 *
 * 安全说明：authCode 是钉钉签发的一次性授权码、5 分钟即失效、无法重放，
 * 所以这个接口无法被用来伪造别人的身份 —— 必须真的用学院钉钉扫码。
 * 未做节流：伪造的 authCode 会被钉钉拒绝，只在极端刷接口时才会消耗额度。
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Sb = ReturnType<typeof createClient>;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TIMEOUT_MS = 20_000;

/** 用 authCode 换用户级 token */
const USER_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
/** 用用户级 token 换个人信息 */
const USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';

/**
 * 合成邮箱的域名后缀。钉钉不保证返回邮箱，只能拿 openId 造一个。
 * 这个地址从不发信、也从不给人看，纯当账号主键用。
 */
const EMAIL_DOMAIN = 'dingtalk.local';

// ────────────────────────────────────────────── 基础工具

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** 统一的请求封装：从不抛异常，一律返回 { status, text } */
async function requestJson(
  url: string,
  payload?: unknown,
  token = '',
  method = 'GET',
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-acs-dingtalk-access-token'] = token;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 0, text: `请求异常: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 每次登录都换一把的一次性密码。不引入额外依赖。 */
function randomPassword(): string {
  return (
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  );
}

/** 合成邮箱：openId 里可能有非字母数字字符，清掉免得邮箱格式不合法 */
function emailFor(openId: string): string {
  return `dd-${openId.replace(/[^a-zA-Z0-9]/g, '')}@${EMAIL_DOMAIN}`;
}

/**
 * 翻页找邮箱对应的用户 id。
 * 只在「账号已存在于 auth.users，但 staff_roles 没记下 id」这个罕见分支走到 ——
 * 比如之前建号时登记表写入失败。正常路径永远不会执行到这里。
 */
async function findUserIdByEmail(sb: Sb, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;

    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    // 没取满一页说明到底了
    if (data.users.length < 1000) return null;
  }
  return null;
}

// ────────────────────────────────────────────── 入口

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => null);
    const authCode: unknown = body?.authCode;
    if (!authCode || typeof authCode !== 'string') {
      return json({ ok: false, error: '缺少 authCode' }, 400);
    }

    const clientId = Deno.env.get('DINGTALK_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('DINGTALK_CLIENT_SECRET') ?? '';
    if (!clientId || !clientSecret) {
      return json({ ok: false, error: '服务端缺少钉钉配置' }, 500);
    }

    // ── 1. authCode → 用户级 token
    // 注意字段名是 clientId/clientSecret/grantType（跟换企业 token 的
    // appKey/appSecret 不一样，别抄错）
    const tokenRes = await requestJson(
      USER_TOKEN_URL,
      { clientId, clientSecret, code: authCode, grantType: 'authorization_code' },
      '',
      'POST',
    );
    const userToken: string | undefined = parseJson(tokenRes.text)?.accessToken;
    if (!userToken) {
      return json(
        { ok: false, error: `换 token 失败：${tokenRes.text.slice(0, 200)}` },
        400,
      );
    }

    // ── 2. 用户级 token → 个人信息
    const infoRes = await requestJson(USERINFO_URL, undefined, userToken, 'GET');
    const info = parseJson(infoRes.text);
    const openId: string = info?.openId ?? '';
    if (!openId) {
      return json(
        { ok: false, error: `取用户信息失败：${infoRes.text.slice(0, 200)}` },
        400,
      );
    }
    const nick: string = info?.nick ?? '未命名';

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 3. 定角色：在名单里且标了 admin 的才是管理员，其余一律 internal
    const { data: staff } = await sb
      .from('staff_roles')
      .select('role, auth_user_id')
      .eq('dingtalk_open_id', openId)
      .maybeSingle();

    const role: 'admin' | 'internal' = staff?.role === 'admin' ? 'admin' : 'internal';

    // ── 4. 建号 / 改号
    const email = emailFor(openId);
    const password = randomPassword();
    const appMetadata = { scau_role: role, dingtalk_open_id: openId, name: nick };

    let userId: string | null = (staff?.auth_user_id as string | null) ?? null;

    if (userId) {
      const { error } = await sb.auth.admin.updateUserById(userId, {
        password,
        app_metadata: appMetadata,
      });
      // 账号可能已被删掉，回退到重新创建
      if (error) userId = null;
    }

    if (!userId) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
      });

      if (created?.user) {
        userId = created.user.id;
      } else {
        // 多半是「该邮箱已存在」—— 之前建过号但登记表没记下 id，翻页找回来
        userId = await findUserIdByEmail(sb, email);
        if (userId) {
          await sb.auth.admin.updateUserById(userId, {
            password,
            app_metadata: appMetadata,
          });
        } else {
          return json(
            { ok: false, error: `建号失败：${error?.message ?? '未知原因'}` },
            500,
          );
        }
      }
    }

    // ── 5. 登记 / 更新名单
    await sb.from('staff_roles').upsert(
      {
        dingtalk_open_id: openId,
        role,
        auth_user_id: userId,
        name: nick,
      },
      { onConflict: 'dingtalk_open_id' },
    );

    return json({ ok: true, email, password, role, name: nick });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
