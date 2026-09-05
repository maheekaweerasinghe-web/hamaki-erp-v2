import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireHamakiUser(request);

    const result = await koombiyoJson("/districts");
    const districts = result?.data?.districts || [];

    return Response.json({
      ok: true,
      message: "Koombiyo Client API v2 connection successful",
      district_count: Array.isArray(districts) ? districts.length : 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
