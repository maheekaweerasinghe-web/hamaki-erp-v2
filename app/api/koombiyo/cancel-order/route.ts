import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, appUser } = await requireHamakiUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.order_id || "").trim();

    if (!orderId) {
      return Response.json(
        { ok: false, message: "Hamaki order ID is required" },
        { status: 400 }
      );
    }

    const { data: rawOrder, error: orderError } = await supabase.rpc(
      "get_pending_order_details",
      { p_order_id: orderId }
    );

    if (orderError) {
      throw new Error(orderError.message);
    }

    const order: any = rawOrder || {};

    if (order.status !== "PENDING") {
      return Response.json(
        {
          ok: false,
          message: "Only a pending Hamaki order can be cancelled from this screen.",
        },
        { status: 400 }
      );
    }

    const waybillId = String(order.koombiyo_waybill_id || "").trim();

    if (!waybillId) {
      return Response.json(
        {
          ok: false,
          message: "This order does not have a Koombiyo waybill.",
        },
        { status: 400 }
      );
    }

    /*
      Koombiyo only deletes an order while it is still in its deletable/pending
      state. If Koombiyo rejects this call, NOTHING is changed in Hamaki.
    */
    try {
      await koombiyoJson("/delete_order", {
        waybill_id: waybillId,
      });
    } catch (error: any) {
      return Response.json(
        {
          ok: false,
          code: "KOOMBIYO_NOT_CANCELLABLE",
          message:
            error?.message ||
            "Koombiyo no longer allows this shipment to be cancelled.",
          waybill_id: waybillId,
        },
        { status: 409 }
      );
    }

    /*
      Only after Koombiyo confirms deletion do we cancel the Hamaki order.
      The database function calls the existing update_order_status function,
      which is the same stock-return path Hamaki already uses for cancellations.
    */
    const { data: localResult, error: localError } = await supabase.rpc(
      "finalize_cancelled_koombiyo_order",
      {
        p_order_id: orderId,
        p_waybill_id: waybillId,
        p_action_by_user_id: appUser.id,
      }
    );

    if (localError) {
      console.error(
        "CRITICAL: Koombiyo shipment deleted but Hamaki cancellation failed",
        {
          orderId,
          waybillId,
          error: localError.message,
        }
      );

      return Response.json(
        {
          ok: false,
          code: "HAMAKI_RECONCILIATION_REQUIRED",
          message:
            `Koombiyo waybill ${waybillId} was deleted, but Hamaki could not finish the local cancellation. Do not recreate this shipment until the order is checked.`,
          waybill_id: waybillId,
        },
        { status: 500 }
      );
    }

    const result = Array.isArray(localResult) ? localResult[0] : localResult;

    return Response.json({
      ok: true,
      order_no: result?.order_no || order.order_no,
      waybill_id: waybillId,
      status: "CANCELLED",
      stock_returned: true,
    });
  } catch (error) {
    return apiError(error);
  }
}
