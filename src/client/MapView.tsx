import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Day } from "../worker/schema";
const colors = ["#245c4d", "#ca7947", "#52749b", "#97677c", "#a48b40"];
export default function MapView({ days }: { days: Day[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current).setView([25, 10], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const points: L.LatLngExpression[] = [];
    days.forEach((day, i) => {
      const dayPoints: L.LatLngExpression[] = [];
      day.activities.forEach((a, j) => {
        if (a.lat === null || a.lng === null) return;
        const point: [number, number] = [a.lat, a.lng];
        points.push(point);
        dayPoints.push(point);
        const marker = L.marker(point, {
          icon: L.divIcon({
            className: "map-marker",
            html: `<span style="background:${colors[i % colors.length]}">${j + 1}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).addTo(map);
        const content = document.createElement("div"),
          strong = document.createElement("strong"),
          p = document.createElement("p");
        strong.textContent = a.title;
        p.textContent = `Day ${i + 1} · ${a.time} · ${a.location}`;
        content.append(strong, p);
        marker.bindPopup(content);
      });
      if (dayPoints.length > 1)
        L.polyline(dayPoints, {
          color: colors[i % colors.length],
          weight: 2,
          dashArray: "6,8",
        }).addTo(map);
    });
    if (points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    return () => {
      map.remove();
    };
  }, [days]);
  return (
    <div className="map-wrapper">
      <div
        ref={ref}
        className="map-canvas"
        aria-label="Interactive itinerary map"
      />
      {!days.some((d) =>
        d.activities.some((a) => a.lat !== null && a.lng !== null),
      ) && (
        <div className="map-empty-note">
          Add activities with coordinates to see your journey on the map.
        </div>
      )}
      <div className="map-legend">
        {days.map((d, i) => (
          <span key={d.id}>
            <i style={{ background: colors[i % colors.length] }} />
            {d.title}
          </span>
        ))}
      </div>
    </div>
  );
}
