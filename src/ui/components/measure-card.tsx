"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Category } from "@/contracts";

/** Hover is a preview; the disclosure button also works by touch and keyboard. */
export function MeasureCard({
  category,
  chosen,
  name,
  heading,
  description,
  children,
}: {
  category: Category;
  chosen: boolean;
  name: string;
  heading: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  const descriptionId = useId();
  const [hovered, setHovered] = useState(false);
  const [opened, setOpened] = useState(false);
  const expanded = hovered || opened;

  return (
    <article
      className={`measure-card ${chosen ? "chosen" : ""} ${expanded ? "expanded" : ""}`}
      data-category={category}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setHovered(false);
          setOpened(false);
        }
      }}
    >
      {heading}
      {children}
      <button
        type="button"
        className="measure-disclosure"
        aria-expanded={expanded}
        aria-controls={descriptionId}
        aria-label={`${expanded ? "Скрыть" : "Показать"} описание: ${name}`}
        onClick={() => {
          setOpened(!expanded);
          setHovered(false);
        }}
      >
        <span>{expanded ? "Скрыть описание" : "Подробнее о решении"}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div
        id={descriptionId}
        className="measure-description"
        aria-hidden={!expanded}
      >
        <div>{description}</div>
      </div>
    </article>
  );
}
