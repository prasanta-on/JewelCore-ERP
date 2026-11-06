import React, { useState } from "react";
import type {
  VaultHierarchyWithOccupancy,
  CompartmentOccupancyStatus,
} from "@jewelcore/shared";
import { VaultSection } from "./VaultSection";

interface StorageDirectoryViewProps {
  storeName?: string;
  storeCode?: string;
  vaults: VaultHierarchyWithOccupancy[];
}

export function StorageDirectoryView({
  storeName = "Store Branch",
  storeCode = "STORE-01",
  vaults,
}: StorageDirectoryViewProps) {
  const [filterStatus, setFilterStatus] = useState<
    CompartmentOccupancyStatus | "ALL"
  >("ALL");

  // Calculate summary metrics across the whole store
  const totalVaults = vaults.length;
  let totalLockers = 0;
  let totalCompartments = 0;
  let totalOccupiedPieces = 0;
  let totalCapacity = 0;

  for (const vault of vaults) {
    totalLockers += vault.lockers.length;
    for (const locker of vault.lockers) {
      totalCompartments += locker.compartments.length;
      for (const comp of locker.compartments) {
        totalOccupiedPieces += comp.occupiedItemCount;
        if (comp.maxItemCapacity) {
          totalCapacity += comp.maxItemCapacity;
        }
      }
    }
  }

  const overallUtilization =
    totalCapacity > 0
      ? Math.round((totalOccupiedPieces / totalCapacity) * 100)
      : 0;

  // Filter compartments if status filter is applied
  const filteredVaults = vaults.map((vault) => ({
    ...vault,
    lockers: vault.lockers.map((locker) => ({
      ...locker,
      compartments:
        filterStatus === "ALL"
          ? locker.compartments
          : locker.compartments.filter((c) => c.status === filterStatus),
    })),
  }));

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Branch Header & Context */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              margin: 0,
              color: "#0f172a",
            }}
          >
            Storage Hierarchy Directory
          </h1>
          <p
            style={{
              margin: "4px 0 0 0",
              color: "#64748b",
              fontSize: "0.95rem",
            }}
          >
            Branch: <strong style={{ color: "#334155" }}>{storeName}</strong> (
            {storeCode})
          </p>
        </div>

        {/* Filter Chips */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["ALL", "AVAILABLE", "NEAR_CAPACITY", "FULL"] as const).map(
            (status) => {
              const isSelected = filterStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  style={{
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: isSelected
                      ? "1px solid #2563eb"
                      : "1px solid #cbd5e1",
                    backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                    color: isSelected ? "#1d4ed8" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  {status.replace("_", " ")}
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* Aggregate Metric Dashboard Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Vaults</div>
          <div style={metricValueStyle}>{totalVaults}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Lockers</div>
          <div style={metricValueStyle}>{totalLockers}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Compartments</div>
          <div style={metricValueStyle}>{totalCompartments}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Resident Pieces</div>
          <div style={{ ...metricValueStyle, color: "#2563eb" }}>
            {totalOccupiedPieces}
          </div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Capacity Utilization</div>
          <div
            style={{
              ...metricValueStyle,
              color: overallUtilization > 85 ? "#ef4444" : "#10b981",
            }}
          >
            {overallUtilization}%
          </div>
        </div>
      </div>

      {/* Vault Tree List */}
      {filteredVaults.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
          }}
        >
          No storage vaults configured for this store branch.
        </div>
      ) : (
        filteredVaults.map((vault) => (
          <VaultSection key={vault.id} vault={vault} />
        ))
      )}
    </div>
  );
}

const metricCardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "1rem",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 500,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const metricValueStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#0f172a",
  marginTop: "0.25rem",
};
