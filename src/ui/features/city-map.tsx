import { dataset } from "@/data";
import type { ScenarioReport } from "@/contracts";
const shapes = [
  {
    id: "saryarka",
    d: "M 62 62 L 244 42 L 317 164 L 230 283 L 74 239 L 34 134 Z",
    x: 163,
    y: 159,
  },
  {
    id: "baikonur",
    d: "M 261 43 L 472 42 L 481 195 L 333 234 L 331 168 Z",
    x: 385,
    y: 132,
  },
  {
    id: "almaty",
    d: "M 490 43 L 655 89 L 720 229 L 649 299 L 493 239 L 500 196 Z",
    x: 593,
    y: 174,
  },
  {
    id: "esil",
    d: "M 241 301 L 342 254 L 480 255 L 635 317 L 610 419 L 402 446 L 243 417 L 162 352 Z",
    x: 432,
    y: 346,
  },
  {
    id: "nura",
    d: "M 60 259 L 217 302 L 143 351 L 221 434 L 394 466 L 327 510 L 92 467 L 38 352 Z",
    x: 124,
    y: 387,
  },
];
export function CityMap({
  selected,
  onSelect,
  report,
}: {
  selected: string;
  onSelect: (id: string) => void;
  report: ScenarioReport;
}) {
  return (
    <div className="map-wrap">
      <svg
        viewBox="0 0 760 548"
        role="group"
        aria-label="Условная карта пяти районов Астаны"
      >
        <defs>
          <pattern
            id="grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="#b8c4bb" opacity=".38" />
          </pattern>
          <pattern
            id="blocks"
            width="35"
            height="28"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <rect
              x="4"
              y="4"
              width="24"
              height="17"
              rx="3"
              fill="none"
              stroke="#719380"
              strokeWidth=".6"
              opacity=".22"
            />
          </pattern>
        </defs>
        <rect width="760" height="548" fill="url(#grid)" />
        <path
          d="M 10 230 C 100 254 173 267 222 283 S 323 227 402 241 S 550 296 750 309"
          fill="none"
          stroke="#b1d1db"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M 10 230 C 100 254 173 267 222 283 S 323 227 402 241 S 550 296 750 309"
          fill="none"
          stroke="#d9e8ec"
          strokeWidth="4"
        />
        {shapes.map((s) => {
          const district = report.districts.find((d) => d.id === s.id)!;
          const original = report.baseline.districts.find(
            (d) => d.id === s.id,
          )!;
          const delta = district.score - original.score;
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected === s.id}
              aria-label={`Район ${district.name}`}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              className={`district-shape ${selected === s.id ? "selected" : ""}`}
            >
              <path d={s.d} className="district-fill" />
              <path d={s.d} fill="url(#blocks)" pointerEvents="none" />
              <circle
                cx={s.x}
                cy={s.y - 30}
                r="5"
                fill={s.id === "nura" ? "#c27c46" : "#417c66"}
              />
              <text
                x={s.x}
                y={s.y}
                textAnchor="middle"
                className="district-name"
              >
                {district.name}
              </text>
              <text
                x={s.x}
                y={s.y + 26}
                textAnchor="middle"
                className="district-score"
              >
                {district.score.toFixed(1)}
                {delta > 0 ? `  +${delta.toFixed(1)}` : ""}
              </text>
            </g>
          );
        })}
        <g transform="translate(689 420)" className="compass">
          <path d="M 0 -25 L -7 0 L 0 -4 L 7 0 Z" fill="#6c7f71" />
          <text x="0" y="-34" textAnchor="middle">
            С
          </text>
          <circle r="34" fill="none" stroke="#bec9c0" />
        </g>
        <text
          x="533"
          y="284"
          className="river-label"
          transform="rotate(14 533 284)"
        >
          Есиль
        </text>
      </svg>
      <div className="map-note">
        <span className="dot" /> Условная схема · синтетические данные
      </div>
      <div className="map-legend">
        <span>Качество среды</span>
        <i />
        <span>0 — 100</span>
      </div>
    </div>
  );
}
export const districtName = (id: string | null) =>
  dataset.districts.find((d) => d.id === id)?.name ?? "Весь город";
