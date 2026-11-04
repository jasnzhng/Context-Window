// Where the visitor really is, and how much of that the house still knows.
// The browser asks for an exact fix once (GPS on a phone, Wi-Fi positioning
// on a laptop), the server turns it into a street address, and then each
// room is told a vaguer version: a street, a city, a state, a country, a
// hemisphere, a planet. The exact address only ever reaches room 1.

// Resolves to { lat, lon, accuracy, place } or null if the visitor (or the
// browser) says no. `place` is null if the address lookup fails.
export function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const where = {
          lat: coords.latitude,
          lon: coords.longitude,
          accuracy: Math.round(coords.accuracy),
          place: null,
        };
        try {
          const response = await fetch(
            `/api/place?lat=${where.lat}&lon=${where.lon}`,
          );
          if (response.ok) where.place = await response.json();
        } catch {
          // Coordinates alone still work; placeAt() falls back to them.
        }
        resolve(where);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

const join = (...parts) => parts.filter(Boolean).join(", ");

// Coordinates with fewer decimals as context runs out: 5 decimals is about a
// meter, 2 is a neighborhood, 0 is a hundred kilometers.
function roughly({ lat, lon }, context) {
  const digits = Math.max(0, Math.round(context * 5));
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

// What the house knows about where the visitor is, given how much context is
// left (1 -> 0). The thresholds follow context(): with halfLife 4, rooms 1-2
// get the street address, 3 the street, 4 the city, 5 the state, 6 the
// country, 7 the hemisphere, and after that, the planet.
export function placeAt(where, context) {
  if (!where) return null;
  const p = where.place ?? {};
  const town = p.city ?? p.town ?? p.village ?? p.county;
  const hemisphere = `the ${where.lat >= 0 ? "northern" : "southern"} hemisphere`;

  if (!where.place) {
    if (context > 0.02) return `near ${roughly(where, context)}`;
    return "Earth, probably";
  }
  if (context > 0.9) {
    // Nominatim names the building or business, when there is one.
    const inside =
      p.amenity ?? p.shop ?? p.leisure ?? p.tourism ?? p.office ?? p.building;
    const street = join(
      inside && `inside ${inside}`,
      [p.house_number, p.road].filter(Boolean).join(" "),
      p.neighbourhood ?? p.suburb,
      town,
      p.state,
      p.postcode,
    );
    return `${street} (${roughly(where, 1)}, ±${where.accuracy}m)`;
  }
  if (context > 0.6) return join(p.road && `near ${p.road}`, town);
  if (context > 0.3) return join(town, p.state);
  if (context > 0.15) return `somewhere in ${p.state ?? p.country}`;
  if (context > 0.05) return `somewhere in ${p.country ?? hemisphere}`;
  if (context > 0.02) return hemisphere;
  return "Earth, probably";
}
