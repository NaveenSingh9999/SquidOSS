import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlEmail(
  inviterName: string,
  inviterEmail: string,
  workspaceName: string,
  role: string,
  acceptUrl: string,
): string {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center">
              <h1 style="color:#ffffff;margin:0;font-size:22px">Workspace Invitation</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6">
                <strong>${escapeHtml(inviterName)}</strong> (${escapeHtml(inviterEmail)}) has invited you to join
                <strong>${escapeHtml(workspaceName)}</strong> as a
                <strong>${roleLabel}</strong>.
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
                Click the button below to accept and start collaborating.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto">
                <tr>
                  <td>
                    <a href="${acceptUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center">
                Or copy this URL:<br>
                <span style="color:#6366f1;word-break:break-all">${acceptUrl}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
              <p style="margin:0;color:#9ca3af;font-size:11px">CloudBliss Storage</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildRfc2822Message(
  fromEmail: string,
  fromName: string,
  toEmail: string,
  replyTo: string,
  subject: string,
  textBody: string,
  htmlBody: string,
): string {
  const boundary = `----=${Date.now().toString(36)}`;
  const lines: string[] = [];

  lines.push(`From: ${fromName} <${fromEmail}>`);
  lines.push(`To: ${toEmail}`);
  lines.push(`Reply-To: ${replyTo}`);
  lines.push(`Subject: ${subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(textBody);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(htmlBody);
  lines.push("");
  lines.push(`--${boundary}--`);

  return lines.join("\r\n");
}

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OAuth2 token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { invitee_email, workspace_name, role, token: inviteToken, app_origin } = body;

    if (!invitee_email || !inviteToken || !workspace_name || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("GMAIL_CLIENT_ID");
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
    const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");
    const senderEmail = Deno.env.get("GMAIL_SENDER_EMAIL");

    if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
      return new Response(JSON.stringify({ error: "Gmail API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviterName = user.user_metadata?.full_name || user.email;
    const baseUrl = app_origin || Deno.env.get("PUBLIC_APP_URL") || "https://cloudbliss.app";
    const acceptUrl = `${baseUrl}/workspace/invite/${encodeURIComponent(inviteToken)}`;

    const htmlBody = buildHtmlEmail(inviterName, user.email, workspace_name, role, acceptUrl);
    const textBody = `You've been invited to ${workspace_name} as ${role}.\n\nAccept here: ${acceptUrl}`;

    const rawMessage = buildRfc2822Message(
      senderEmail,
      `${inviterName} via CloudBliss`,
      invitee_email,
      user.email,
      `${inviterName} invited you to ${workspace_name}`,
      textBody,
      htmlBody,
    );

    const accessToken = await getGmailAccessToken(clientId, clientSecret, refreshToken);

    const encoder = new TextEncoder();
    const encoded = base64url(encoder.encode(rawMessage));

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      },
    );

    if (!sendRes.ok) {
      const errBody = await sendRes.text().catch(() => "");
      throw new Error(`Gmail API error ${sendRes.status}: ${errBody}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-workspace-invite error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
