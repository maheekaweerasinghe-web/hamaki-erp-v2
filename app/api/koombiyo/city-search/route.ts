import { apiError, koombiyoJson, requireHamakiUser } from "../_lib/server";

export const dynamic = "force-dynamic";

type IndexedCity = {
  city_id: string;
  city_name: string;
  postal_code?: string | null;
  district_id: string;
  district_name: string;
};

let cityCache: IndexedCity[] | null = null;
let cacheExpiresAt = 0;
let cachePromise: Promise<IndexedCity[]> | null = null;

async function buildCityIndex(): Promise<IndexedCity[]> {
  const districtsResult = await koombiyoJson("/districts");
  const districts = Array.isArray(districtsResult?.data?.districts)
    ? districtsResult.data.districts
    : [];

  const batches = await Promise.all(
    districts.map(async (district: any) => {
      const districtId = String(district?.district_id || "");
      const districtName = String(district?.district_name || "");

      if (!districtId) return [];

      const result = await koombiyoJson("/cities", {
        district_id: districtId,
      });

      const cities = Array.isArray(result?.data?.cities)
        ? result.data.cities
        : [];

      return cities.map((city: any) => ({
        city_id: String(city?.city_id || ""),
        city_name: String(city?.city_name || ""),
        postal_code: city?.postal_code ? String(city.postal_code) : null,
        district_id: districtId,
        district_name: districtName,
      }));
    })
  );

  const index = batches
    .flat()
    .filter((x) => x.city_id && x.city_name && x.district_id);

  cityCache = index;
  cacheExpiresAt = Date.now() + 6 * 60 * 60 * 1000;
  return index;
}

async function getCityIndex() {
  if (cityCache && Date.now() < cacheExpiresAt) return cityCache;

  if (!cachePromise) {
    cachePromise = buildCityIndex().finally(() => {
      cachePromise = null;
    });
  }

  return cachePromise;
}

export async function POST(request: Request) {
  try {
    await requireHamakiUser(request);

    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim().toLowerCase();

    if (query.length < 2) {
      return Response.json({ ok: true, cities: [] });
    }

    const cities = await getCityIndex();

    const prefix: IndexedCity[] = [];
    const contains: IndexedCity[] = [];

    for (const city of cities) {
      const name = city.city_name.toLowerCase();

      if (name.startsWith(query)) prefix.push(city);
      else if (name.includes(query)) contains.push(city);

      if (prefix.length + contains.length >= 60) break;
    }

    const results = [...prefix, ...contains]
      .sort((a, b) => a.city_name.localeCompare(b.city_name))
      .slice(0, 30);

    return Response.json({ ok: true, cities: results });
  } catch (error) {
    return apiError(error);
  }
}
