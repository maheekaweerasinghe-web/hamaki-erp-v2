import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireHamakiUser(request);
    const body = await request.json();
    const waybillId = String(body?.waybill_id || "").trim();

    if (!waybillId) {
      return Response.json(
        { ok: false, message: "Waybill ID is required" },
        { status: 400 }
      );
    }

    const [details, timeline] = await Promise.all([
      koombiyoJson("/order_details", { waybill_id: waybillId }),
      koombiyoJson("/order_timeline", { waybill_id: waybillId }).catch((error) => ({
        status: 404,
        message: error instanceof Error ? error.message : "No timeline",
        data: { timeline: [] },
      })),
    ]);

    return Response.json({
      ok: true,
      details: details?.data || null,
      timeline: timeline?.data?.timeline || [],
    });
  } catch (error) {
    return apiError(error);
  }
}
