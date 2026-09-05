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

    // Use Koombiyo's full POD shipping-label layout.
    // This is the layout that includes structured fields such as
    // FROM, TO, PHONE, DESCRIPTION, ORDER NO, COD AMOUNT, WEIGHT,
    // NOTE, DATE and barcode sections.
    const pdf = await koombiyoPdf("/bulk_pods", {
      format: "POD",
      waybill_ids: ids,
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="koombiyo-shipping-labels.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
