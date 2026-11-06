import React, { useState } from "react";
import type { LockerHierarchyWithOccupancy } from "@jewelcore/shared";
import { CompartmentCard } from "./CompartmentCard";

interface LockerSectionProps {
  locker: LockerHierarchyWithOccupancy;
}

export function LockerSection({ locker }: LockerSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const totalPieces = locker.compartments.reduce(
    (acc, c) => acc + c.occupiedItemCount,
    0,
  );
  const totalCapacity = locker.compartments.reduce(
    (acc, c) => acc + (c.maxItemCapacity ?? 0),
    0,
  );

  return (
    <div
      data-testid={`locker-section-${locker.code}`}
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        backgroundColor: "#f8fafc",
        marginBottom: "1rem",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "0.75rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          backgroundColor: "#f1f5f9",
          borderBottom: isOpen ? "1px solid #cbd5e1" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "#1e293b" }}>
            {isOpen ? "▼" : "▶"} {locker.name} ({locker.code})
          </span>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Cabinet #{locker.lockerNumber}
            {locker.capacityRating ? ` • Rating: ${locker.capacityRating}` : ""}
          </span>
        </div>

        <div style={{ fontSize: "0.85rem", color: "#475569" }}>
          <span>
            {locker.compartments.length} Trays • {totalPieces} pieces
            {totalCapacity > 0 ? ` / ${totalCapacity} capacity` : ""}
          </span>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: "1rem" }}>
          {locker.compartments.length === 0 ? (
            <div
              style={{
                color: "#94a3b8",
                fontSize: "0.875rem",
                fontStyle: "italic",
              }}
            >
              No compartments configured in this locker.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {locker.compartments.map((comp) => (
                <CompartmentCard key={comp.id} compartment={comp} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
