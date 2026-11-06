import React from "react";
import type { CompartmentWithOccupancy } from "@jewelcore/shared";

interface CompartmentCardProps {
  compartment: CompartmentWithOccupancy;
}

export function CompartmentCard({ compartment }: CompartmentCardProps) {
  const {
    code,
    name,
    compartmentNumber,
    maxItemCapacity,
    maxWeightCapacityGrams,
    occupiedItemCount,
    occupancyPercentage,
    status,
    id,
  } = compartment;

  // Determine status chip styling
  let badgeColor = "#10b981"; // Green (AVAILABLE)
  let badgeBg = "#ecfdf5";
  let statusLabel = "Available";

  if (status === "FULL") {
    badgeColor = "#ef4444"; // Red (FULL)
    badgeBg = "#fef2f2";
    statusLabel = "Full";
  } else if (status === "NEAR_CAPACITY") {
    badgeColor = "#f59e0b"; // Amber (NEAR_CAPACITY)
    badgeBg = "#fffbeb";
    statusLabel = "Near Capacity";
  } else if (status === "UNLIMITED") {
    badgeColor = "#6366f1";
    badgeBg = "#eef2ff";
    statusLabel = "Unlimited";
  }

  const percentage = occupancyPercentage ?? 0;

  return (
    <div
      data-testid={`compartment-card-${code}`}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span
            style={{ fontWeight: 600, fontSize: "0.95rem", color: "#0f172a" }}
          >
            {code}
          </span>
          <span
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.8rem",
              color: "#64748b",
            }}
          >
            (Tray #{compartmentNumber})
          </span>
        </div>
        <span
          data-testid="status-chip"
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: badgeColor,
            backgroundColor: badgeBg,
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            textTransform: "uppercase",
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div style={{ fontSize: "0.85rem", color: "#334155" }}>{name}</div>

      {/* Real-Time Occupancy Visualizer Bar */}
      <div style={{ marginTop: "0.25rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            color: "#475569",
          }}
        >
          <span>Occupancy:</span>
          <span data-testid="occupancy-count" style={{ fontWeight: 600 }}>
            {occupiedItemCount}{" "}
            {maxItemCapacity ? `/ ${maxItemCapacity} pieces` : "pieces"}
            {occupancyPercentage !== null ? ` (${occupancyPercentage}%)` : ""}
          </span>
        </div>
        {maxItemCapacity && (
          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: "#f1f5f9",
              borderRadius: "3px",
              overflow: "hidden",
              marginTop: "4px",
            }}
          >
            <div
              data-testid="occupancy-progress-bar"
              style={{
                width: `${percentage}%`,
                height: "100%",
                backgroundColor: badgeColor,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        )}
      </div>

      {maxWeightCapacityGrams && (
        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
          Max Weight Rating: {maxWeightCapacityGrams}g
        </div>
      )}

      {/* Link to resident inventory items */}
      <div
        style={{
          marginTop: "0.5rem",
          borderTop: "1px solid #f1f5f9",
          paddingTop: "0.5rem",
        }}
      >
        <a
          href={`/inventory?compartmentId=${id}`}
          data-testid="resident-items-link"
          style={{
            fontSize: "0.8rem",
            color: "#2563eb",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          View Resident Items &rarr;
        </a>
      </div>
    </div>
  );
}
