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
        {
          ok: false,
          message: "Select Koombiyo district and city before creating shipment",
        },
        { status: 400 }
      );
    }

    const phone = String(
      order.phone_primary || order.phone_secondary || ""
    ).trim();

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

    // Keep extra addon text in the Koombiyo order description too.
    // Example: "Wall Net Plain Pink 6x8ft x1 + Door Opening"
    const description = items
      .map((item: any) => {
        const base = [
          item.product_type_snapshot,
          item.material_snapshot,
          item.color_snapshot,
          item.size_snapshot,
          `x${money(item.qty)}`,
        ]
          .filter(Boolean)
          .join(" ");

        const addon = String(item.extra_addon || "").trim();
        return addon ? `${base} + ${addon}` : base;
      })
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

    const activeWaybills = Array.isArray(active?.data?.waybills)
      ? active.data.waybills
          .map((row: any) => String(row?.waybill_id || "").trim())
          .filter(Boolean)
      : [];

    if (!activeWaybills.length) {
      return Response.json(
        { ok: false, message: "No active Koombiyo waybill is available" },
        { status: 409 }
      );
    }

    /*
      Defensive local reservation check.

      Koombiyo can return a previously used waybill as ACTIVE again after a
      shipment is deleted. Hamaki must never choose a waybill still attached
      to any current order record.

      The SQL migration also clears waybills from old CANCELLED orders after
      archiving them, but this filter protects us from any other stale/local
      linkage as well.
    */
    /*
      IMPORTANT:
      Do NOT use `.in("koombiyo_waybill_id", activeWaybills)` here.
      Supabase encodes .in() in the URL, which caused the 414 error.

      Also do NOT check dozens of small .in() batches sequentially; if Koombiyo
      has hundreds/thousands of active waybills that makes shipment creation
      appear to hang.

      This RPC sends the entire waybill array in a POST JSON body and lets
      PostgreSQL compare it locally in one query.
    */
    const { data: reservedRows, error: reservedError } = await supabase.rpc(
      "get_reserved_koombiyo_waybills",
      {
        p_waybill_ids: activeWaybills,
      }
    );

    if (reservedError) {
      throw new Error(
        "Could not verify available Koombiyo waybills against Hamaki: " +
          reservedError.message
      );
    }

    const reserved = new Set(
      (reservedRows || [])
        .map((row: any) => String(row?.waybill_id || "").trim())
        .filter(Boolean)
    );

    const candidateWaybills = activeWaybills.filter(
      (waybillId: string) => !reserved.has(waybillId)
    );

    if (!candidateWaybills.length) {
      return Response.json(
        {
          ok: false,
          message:
            "Koombiyo returned active waybills, but all of them are still linked to Hamaki orders. Run the waybill reuse repair SQL or request additional waybills.",
        },
        { status: 409 }
      );
    }

    /*
      Try candidates in order. This also protects against a small race where
      another workstation creates an order using the same active waybill just
      before this request reaches Koombiyo.
    */
    let lastCreateError = "";

    for (const waybillId of candidateWaybills) {
      const payload = {
        cod_amount: money(order.balance),
        customer_address: String(order.address_snapshot || "").trim(),
        customer_city_id: String(order.koombiyo_city_id),
        customer_city_name: String(
          order.koombiyo_city_name || order.city_snapshot || ""
        ).trim(),
        customer_district_id: String(order.koombiyo_district_id),
        customer_name: String(order.customer_name_snapshot || "").trim(),
        customer_phone: phone,
        description,
        order_number: String(order.order_no),
        product_value: money(order.subtotal),
        special_note: "",
        waybill_id: waybillId,
      };

      try {
        await koombiyoJson("/add_order", payload);
        createdWaybill = waybillId;
      } catch (error: any) {
        lastCreateError = error?.message || "Koombiyo add_order failed";

        // If this candidate was taken concurrently, try the next active waybill.
        if (
          /already exists|already used|waybill.*exist|duplicate/i.test(
            lastCreateError
          )
        ) {
          continue;
        }

        throw error;
      }

      const { data: attached, error: attachError } = await supabase.rpc(
        "attach_koombiyo_waybill",
        {
          p_order_id: orderId,
          p_waybill_id: waybillId,
          p_city_id: String(order.koombiyo_city_id),
          p_city_name: String(
            order.koombiyo_city_name || order.city_snapshot || ""
          ),
          p_district_id: String(order.koombiyo_district_id),
          p_district_name: String(order.koombiyo_district_name || ""),
        }
      );

      if (attachError) {
        /*
          Never leave a real Koombiyo shipment orphaned if Hamaki failed to
          attach it. Roll Koombiyo back first.
        */
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

        /*
          A stale local conflict should not normally happen after the SQL fix.
          If it does, continue to another active waybill rather than trapping
          the whole operation on the same released waybill.
        */
        if (
          /already linked|already exists|duplicate|waybill/i.test(
            attachError.message
          )
        ) {
          lastCreateError = attachError.message;
          continue;
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
    }

    return Response.json(
      {
        ok: false,
        message:
          "Koombiyo could not allocate a usable waybill for this order. " +
          (lastCreateError || "Please retry or request more active waybills."),
      },
      { status: 409 }
    );
  } catch (error) {
    if (createdWaybill) {
      console.error(
        "Koombiyo create route failed after waybill creation:",
        createdWaybill
      );
    }

    return apiError(error);
  }
}
