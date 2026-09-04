import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

type InviteBody = {
  organizationId?: unknown;
  email?: unknown;
  role?: unknown;
  displayName?: unknown;
};

type Json = string | number | boolean | null | {
  [key: string]: Json | undefined;
} | Json[];

type InviteDatabase = {
  public: {
    Tables: {
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: string;
          status: string;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: string;
          status?: string;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: string;
          status?: string;
          joined_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          email: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_events: {
        Row: never;
        Insert: {
          organization_id: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function namedKey(environmentName: string) {
  const value = Deno.env.get(environmentName);
  if (!value) throw new Error(`${environmentName} is not configured`);
  const keys = JSON.parse(value) as Record<string, unknown>;
  const key = keys.default;
  if (typeof key !== "string" || !key) {
    throw new Error(`${environmentName}.default is not configured`);
  }
  return key;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS");
const secretKey = namedKey("SUPABASE_SECRET_KEYS");

async function inviteHandler(request: Request) {
  if (request.method !== "POST") {
    return json({ error: "POST 요청만 허용됩니다." }, 405);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken || accessToken === authorization) {
    return json({ error: "로그인이 필요합니다." }, 401);
  }

  const supabase = createClient<InviteDatabase>(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const supabaseAdmin = createClient<InviteDatabase>(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return json({ error: "로그인 세션을 확인할 수 없습니다." }, 401);
  }

  let body: InviteBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const organizationId = typeof body.organizationId === "string"
    ? body.organizationId.trim()
    : "";
  const email = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  const role = typeof body.role === "string"
    ? body.role.trim().toLowerCase()
    : "";
  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim().slice(0, 100)
    : "";
  const actorId = user.id;

  if (!actorId || !organizationId) {
    return json({ error: "로그인과 조직 정보가 필요합니다." }, 401);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "올바른 이메일 주소를 입력해 주세요." }, 400);
  }
  if (!["owner", "expert"].includes(role)) {
    return json({ error: "관리자 또는 전문가만 초대할 수 있습니다." }, 400);
  }

  const { data: callerMembership, error: callerError } = await supabase
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", actorId)
    .maybeSingle();

  if (
    callerError ||
    callerMembership?.role !== "owner" ||
    callerMembership.status !== "active"
  ) {
    return json({ error: "활성 관리자만 계정을 초대할 수 있습니다." }, 403);
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("user_id,email")
    .ilike("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("invite profile lookup failed", profileError.message);
    return json({ error: "계정 확인 중 오류가 발생했습니다." }, 500);
  }

  let targetUserId = existingProfile?.user_id ?? null;
  let invitationSent = false;
  let membershipStatus: "invited" | "active" = "active";

  if (!targetUserId) {
    const inviteOptions: {
      data: Record<string, string>;
      redirectTo?: string;
    } = {
      data: {
        name: displayName || email.split("@")[0],
        invited_role: role,
        invited_organization_id: organizationId,
      },
    };
    const configuredRedirect = Deno.env.get("INVITE_REDIRECT_URL")?.trim();
    if (configuredRedirect) inviteOptions.redirectTo = configuredRedirect;

    const { data, error } = await supabaseAdmin.auth.admin
      .inviteUserByEmail(
        email,
        inviteOptions,
      );
    if (error || !data.user) {
      console.error("invite email failed", error?.message ?? "missing user");
      return json(
        {
          error: "초대 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        502,
      );
    }
    targetUserId = data.user.id;
    membershipStatus = "invited";
    invitationSent = true;
  }

  const { error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: targetUserId,
        role,
        status: membershipStatus,
        joined_at: membershipStatus === "active"
          ? new Date().toISOString()
          : null,
      },
      { onConflict: "organization_id,user_id" },
    );

  if (membershipError) {
    console.error("invite membership save failed", membershipError.message);
    return json({ error: "초대 권한을 저장하지 못했습니다." }, 500);
  }

  const { error: auditError } = await supabaseAdmin.from(
    "audit_events",
  ).insert({
    organization_id: organizationId,
    actor_user_id: actorId,
    action: invitationSent
      ? "organization.member_invited"
      : "organization.member_connected",
    entity_type: "organization_member",
    entity_id: targetUserId,
    metadata: { email, role, invitation_sent: invitationSent },
  });
  if (auditError) {
    console.error("invite audit save failed", auditError.message);
  }

  return json({
    ok: true,
    userId: targetUserId,
    email,
    role,
    status: membershipStatus,
    invitationSent,
  });
}

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return inviteHandler(request);
});
