// Cover a circle (center, radiusM) with square tiles of side tileSizeM. Each
// tile carries a search radius circumscribing the square (side*sqrt(2)/2) so the
// union covers the area. A tile is kept if its centre is within
// radiusM + tileRadius of the area centre.
const M_PER_DEG_LAT = 111320;

export function tileCircle(center, radiusM, tileSizeM) {
  if (!Number.isFinite(tileSizeM) || tileSizeM <= 0) {
    throw new RangeError('tileSizeM must be a positive finite number');
  }

  const tileRadius = (tileSizeM * Math.SQRT2) / 2;
  const half = Math.max(0, Math.ceil((radiusM - tileSizeM / 2) / tileSizeM));
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const tiles = [];
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const dLat = (row * tileSizeM) / M_PER_DEG_LAT;
      const dLng = (col * tileSizeM) / mPerDegLng;
      const offsetM = Math.hypot(row * tileSizeM, col * tileSizeM);
      if (offsetM > radiusM + tileRadius) continue;
      tiles.push({
        tile_id: `${row}_${col}`,
        lat: center.lat + dLat,
        lng: center.lng + dLng,
        radius: Math.round(tileRadius),
      });
    }
  }
  return tiles;
}
