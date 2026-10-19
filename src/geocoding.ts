import { z } from 'zod';
import { readFile } from 'node:fs/promises';
export const coordinatesSchema = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .strict();
export const originSchema = z
  .object({ address: z.string().trim().min(1).max(300), coordinates: coordinatesSchema.optional() })
  .strict();
export type Point = z.infer<typeof coordinatesSchema>;
export type GeoResolution = {
  status: 'resolved' | 'needs_address' | 'unavailable';
  address: string;
  point: Point | null;
  basis: 'user_coordinates' | 'census_address_range' | 'census_zcta_reference' | null;
  sourceUrl: string | null;
  observedAt: string;
  matchedAddress?: string;
  warnings: string[];
};
export function distanceMiles(a: Point, b: Point) {
  coordinatesSchema.parse(a);
  coordinatesSchema.parse(b);
  const rad = (v: number) => (v * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function censusMatch(
  address: string,
  data: unknown,
  sourceUrl: string,
  now = new Date().toISOString(),
): GeoResolution {
  const failed = (warning: string): GeoResolution => ({
    status: 'unavailable',
    address,
    point: null,
    basis: null,
    sourceUrl,
    observedAt: now,
    warnings: [warning],
  });
  const parsed = z
    .object({
      result: z.object({
        addressMatches: z.array(
          z.object({
            matchedAddress: z.string(),
            coordinates: z.object({ x: z.number(), y: z.number() }),
            addressComponents: z
              .object({
                fromAddress: z.string().optional(),
                toAddress: z.string().optional(),
                zip: z.string().optional(),
              })
              .optional(),
          }),
        ),
      }),
    })
    .safeParse(data);
  if (!parsed.success || parsed.data.result.addressMatches.length !== 1)
    return failed('Census did not return one unambiguous address match.');
  const match = parsed.data.result.addressMatches[0]!;
  const number = address.match(/^\s*(\d+)/)?.[1];
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (
    !number ||
    match.matchedAddress.match(/^\s*(\d+)/)?.[1] !== number ||
    (zip && match.addressComponents?.zip !== zip)
  )
    return failed('Census match did not preserve the requested street number and ZIP.');
  const street = (v: string) =>
    v
      .split(',')[0]!
      .toUpperCase()
      .replace(/\b(?:SUITE|UNIT|APT)\b.*$/, '')
      .replace(/\./g, '')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\s+/g, ' ')
      .trim();
  if (street(address) !== street(match.matchedAddress))
    return failed(
      'Census matched a different or unsupported street form; manual review is required.',
    );
  const point = coordinatesSchema.safeParse({
    latitude: match.coordinates.y,
    longitude: match.coordinates.x,
  });
  if (!point.success) return failed('Census returned invalid coordinates.');
  return {
    status: 'resolved',
    address,
    point: point.data,
    basis: 'census_address_range',
    sourceUrl,
    observedAt: now,
    matchedAddress: match.matchedAddress,
    warnings: [
      'Coordinates are interpolated along a Census address range; this does not verify a building or entrance.',
    ],
  };
}
export async function resolveLocation(
  raw: z.infer<typeof originSchema>,
  fetcher: typeof fetch = fetch,
): Promise<GeoResolution> {
  const input = originSchema.parse(raw),
    now = new Date().toISOString();
  if (input.coordinates)
    return {
      status: 'resolved',
      address: input.address,
      point: input.coordinates,
      basis: 'user_coordinates',
      sourceUrl: null,
      observedAt: now,
      warnings: [
        'Coordinates supplied by the user; address correspondence is not independently verified.',
      ],
    };
  const zip = input.address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (!/^\d+\s+\S+/.test(input.address) || /^\d{5}$/.test(input.address)) {
    if (zip === '22201' && /^(?:Arlington\s*,?\s*(?:VA|Virginia)\s*)?22201$/i.test(input.address)) {
      const data = JSON.parse(await readFile('data/arlington-zcta.json', 'utf8'));
      const point = coordinatesSchema.parse({
        latitude: Number(data.record.INTPTLAT),
        longitude: Number(data.record.INTPTLONG),
      });
      return {
        status: 'resolved',
        address: input.address,
        point,
        basis: 'census_zcta_reference',
        sourceUrl: data.sourceUrl,
        observedAt: data.retrievedAt,
        warnings: [
          'Approximate distance from a Census ZIP Code Tabulation Area reference point, not the job site. ZCTAs approximate ZIP areas.',
        ],
      };
    }
    return {
      status: 'needs_address',
      address: input.address,
      point: null,
      basis: null,
      sourceUrl: null,
      observedAt: now,
      warnings: [
        'Provide a full street address or coordinates. Only the reviewed Arlington 22201 area reference is bundled.',
      ],
    };
  }
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search = new URLSearchParams({
    address: input.address,
    benchmark: 'Public_AR_Current',
    format: 'json',
  }).toString();
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Census unavailable');
    const text = await response.text();
    if (text.length > 200000) throw new Error('Census response too large');
    return censusMatch(input.address, JSON.parse(text), url.href);
  } catch {
    return {
      status: 'unavailable',
      address: input.address,
      point: null,
      basis: null,
      sourceUrl: url.href,
      observedAt: now,
      warnings: [
        'Census address lookup failed. No paid geocoding fallback is enabled. Supply coordinates or retry.',
      ],
    };
  }
}
