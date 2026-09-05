import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

function money(value: unknown) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(2)));
}

export async function POST(request: Request) {
  let createdWaybill = "";

  try {
    const { supabase } = await requireHamakiUser(request);
    const body = await request.json();
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

    if (orderError) throw new Error(orderError.message);

    const order: any = rawOrder || {};

    if (order.status !== "PENDING") {
      return Response.json(
        { ok: false, message: "Only a pending Hamaki order can be sent to Koombiyo" },
        { status: 400 }
      );
    }

    if (order.koombiyo_waybill_id) {
      return Response.json({
        ok: true,
        already_created: true,
        waybill_id: order.koombiyo_waybill_id,
      });
    }

    if (!order.koombiyo_district_id || !order.koombiyo_city_id) {
      return Response.json(
        { ok: false, message: "Select Koombiyo district and city before creating shipment" },
        { status: 400 }
      );
    }

    const phone = String(order.phone_primary || order.phone_secondary || "").trim();
    if (!phone) {
      return Response.json(
        { ok: false, message: "Customer phone number is required" },
        { status: 400 }
      );
    }

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
      return Response.json(
        { ok: false, message: "Order has no items" },
        { status: 400 }
      );
    }

    const description = items
      .map((item: any) =>
        [
          item.product_type_snapshot,
          item.material_snapshot,
          item.color_snapshot,
          item.size_snapshot,
          `x${money(item.qty)}`,
        ]
          .filter(Boolean)
          .join(" ")
      )
      .join(", ")
      .slice(0, 500);

    let active: any;
    try {
      active = await koombiyoJson("/active_waybills");
    } catch (error: any) {
      throw new Error(
        "No active Koombiyo waybill is available. Request/activate waybills in Koombiyo first. " +
          (error?.message || "")
      );
    }

    const waybills = Array.isArray(active?.data?.waybills)
      ? active.data.waybills
      : [];

    const waybillId = String(waybills[0]?.waybill_id || "").trim();

    if (!waybillId) {
      return Response.json(
        { ok: false, message: "No active Koombiyo waybill is available" },
        { status: 409 }
      );
    }

    const payload = {
      cod_amount: money(order.balance),
      customer_address: String(order.address_snapshot || "").trim(),
      customer_city_id: String(order.koombiyo_city_id),
      customer_city_name: String(order.koombiyo_city_name || order.city_snapshot || "").trim(),
      customer_district_id: String(order.koombiyo_district_id),
      customer_name: String(order.customer_name_snapshot || "").trim(),
      customer_phone: phone,
      description,
      order_number: String(order.order_no),
      product_value: money(order.subtotal),
      special_note: "",
      waybill_id: waybillId,
    };

    await koombiyoJson("/add_order", payload);
    createdWaybill = waybillId;

    const { data: attached, error: attachError } = await supabase.rpc(
      "attach_koombiyo_waybill",
      {
        p_order_id: orderId,
        p_waybill_id: waybillId,
        p_city_id: String(order.koombiyo_city_id),
        p_city_name: String(order.koombiyo_city_name || order.city_snapshot || ""),
        p_district_id: String(order.koombiyo_district_id),
        p_district_name: String(order.koombiyo_district_name || ""),
      }
    );

    if (attachError) {
      try {
        await koombiyoJson("/delete_order", { waybill_id: waybillId });
        createdWaybill = "";
      } catch (rollbackError) {
        console.error(
          "CRITICAL: Koombiyo order created but Hamaki attach failed and rollback failed",
          rollbackError
        );
        throw new Error(
          `CRITICAL RECONCILIATION REQUIRED: Koombiyo waybill ${waybillId} was created, but Hamaki could not save it. Do not retry this order until checked.`
        );
      }

      throw new Error(
        "Koombiyo shipment was rolled back because Hamaki could not save the waybill: " +
          attachError.message
      );
    }

    const result = Array.isArray(attached) ? attached[0] : attached;

    return Response.json({
      ok: true,
      waybill_id: result?.waybill_id || waybillId,
      order_no: result?.order_no || order.order_no,
    });
  } catch (error) {
    if (createdWaybill) {
      console.error("Koombiyo create route failed after waybill creation:", createdWaybill);
    }
    return apiError(error);
  }
}
