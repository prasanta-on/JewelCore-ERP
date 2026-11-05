import React from "react";
import type { VaultHierarchyWithOccupancy } from "@jewelcore/shared";
import { LockerSection } from "./LockerSection";

interface VaultSectionProps {
  vault: VaultHierarchyWithOccupancy;
}

export function VaultSection({ vault }: VaultSectionProps) {
  const totalLockers = vault.lockers.length;
  const totalCompartments = vault.lockers.reduce(
    (acc, l) => acc + l.compartments.length,
    0,
  );
  const totalPieces = vault.lockers.reduce(
    (acc, l) =>
      acc + l.compartments.reduce((cAcc, c) => cAcc + c.occupiedItemCount, 0),
    0,
  );

  return (
    <div
      data-testid={`vault-section-${vault.code}`}
      style={{
        border: "1px solid #94a3b8",
        borderRadius: "10px",
        backgroundColor: "#ffffff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        marginBottom: "2rem",
        overflow: "hidden",
      }}
    >
      {/* Vault Header Card */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "#0f172a",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>{vault.name}</span>
            <span
              style={{
                fontSize: "0.75rem",
                backgroundColor: "#334155",
                padding: "0.2rem 0.5rem",
                borderRadius: "4px",
                color: "#e2e8f0",
              }}
            >
              {vault.code}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
            Type: {vault.vaultType} • Required Clearance: {vault.accessLevelRequired}
          </div>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
          <div>
            <strong>{totalLockers}</strong> Lockers
          </div>
          <div>
            <strong>{totalCompartments}</strong> Compartments
          </div>
          <div>
            <strong style={{ color: "#38bdf8" }}>{totalPieces}</strong> Active Pieces
          </div>
        </div>
      </div>

      {/* Lockers Inside Vault */}
      <div style={{ padding: "1.25rem" }}>
        {vault.lockers.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: "0.9rem", fontStyle: "italic", textAlign: "center" }}>
            No lockers provisioned inside this vault.
          </div>
        ) : (
          vault.lockers.map((locker) => (
            <LockerSection key={locker.id} locker={locker} />
          ))
        )}
      </div>
    </div>
  );
}
