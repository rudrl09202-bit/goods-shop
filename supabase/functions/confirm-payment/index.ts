// 토스 결제 승인 (시크릿 키는 여기서만 사용)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 로그인한 사용자 확인
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ message: "로그인이 필요합니다." }, 401);

  const { paymentKey, orderId, amount } = await req.json();

  // 주문 확인: 본인 주문 + 금액 일치
  const { data: order } = await admin
    .from("orders")
    .select("*, products(price)")
    .eq("order_id", orderId)
    .single();
  if (!order || order.user_id !== user.id) {
    return json({ message: "주문을 찾을 수 없습니다." }, 404);
  }
  if (order.status === "paid") return json({ message: "이미 결제된 주문입니다.", order });
  if (Number(amount) !== order.amount || order.amount !== order.products.price) {
    return json({ message: "결제 금액이 올바르지 않습니다." }, 400);
  }

  // 토스 결제 승인 요청
  const secretKey = Deno.env.get("TOSS_SECRET_KEY")!;
  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(secretKey + ":"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
  });
  const toss = await res.json();

  if (!res.ok) {
    await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
    return json({ message: toss.message ?? "결제 승인에 실패했습니다." }, 400);
  }

  const { data: paid } = await admin
    .from("orders")
    .update({ status: "paid", payment_key: paymentKey, paid_at: new Date().toISOString() })
    .eq("id", order.id)
    .select()
    .single();

  return json({ message: "결제가 완료되었습니다.", order: paid });
});
