import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireHamakiUser(request);
    const body = await request.json().catch(() => ({}));

    const districtId = String(body?.district_id || "").trim();
    const cityName = String(body?.city_name || "").trim();

    if (districtId) {
      const result = await koombiyoJson("/cities", {
        district_id: districtId,
        city_name: cityName || undefined,
      });

      return Response.json({
        ok: true,
        cities: result?.data?.cities || [],
      });
    }

    const result = await koombiyoJson("/districts");

    return Response.json({
      ok: true,
      districts: result?.data?.districts || [],
    });
  } catch (error) {
    return apiError(error);
  }
}
