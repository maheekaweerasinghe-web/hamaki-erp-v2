import { apiError, koombiyoPdf, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireHamakiUser(request);
    const body = await request.json();
    const ids = Array.isArray(body?.waybill_ids)
      ? body.waybill_ids.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      return Response.json(
        { ok: false, message: "At least one waybill ID is required" },
        { status: 400 }
      );
    }

    const pdf = await koombiyoPdf("/bulk_pods", {
      format: "THERMAL",
      waybill_ids: ids,
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="koombiyo-labels.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
