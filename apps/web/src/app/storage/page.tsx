"use client";

import React, { useState, useEffect } from "react";
import type { VaultHierarchyWithOccupancy } from "@jewelcore/shared";
import { StorageDirectoryView } from "../../components/storage/StorageDirectoryView";

// Sample initial storage hierarchy demonstrating Scenario 1 & 2
const SAMPLE_STORAGE_HIERARCHY: VaultHierarchyWithOccupancy[] = [
  {
    id: "0192e350-0001-7000-8000-000000000001",
    storeId: "0192e300-0001-7000-8000-000000000001",
    code: "VLT-MAIN-01",
    name: "Downtown Treasury Vault",
    vaultType: "MAIN_VAULT",
    accessLevelRequired: "STORE_MANAGER",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lockers: [
      {
        id: "0192e350-0002-7000-8000-000000000001",
        vaultId: "0192e350-0001-7000-8000-000000000001",
        storeId: "0192e300-0001-7000-8000-000000000001",
        code: "LCK-01",
        name: "High Value Diamond Safe",
        lockerNumber: "SAFE-A1",
        capacityRating: "100kg",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        compartments: [
          {
            id: "0192e350-0003-7000-8000-000000000001",
            lockerId: "0192e350-0002-7000-8000-000000000001",
            storeId: "0192e300-0001-7000-8000-000000000001",
            code: "COMP-01A",
            name: "Solitaire Engagement Trays",
            compartmentNumber: "TRAY-01",
            maxWeightCapacityGrams: 500,
            maxItemCapacity: 10,
            occupiedItemCount: 5,
            occupancyPercentage: 50,
            status: "AVAILABLE",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "0192e350-0003-7000-8000-000000000002",
            lockerId: "0192e350-0002-7000-8000-000000000001",
            storeId: "0192e300-0001-7000-8000-000000000001",
            code: "COMP-01B",
            name: "Eternity Diamond Bands",
            compartmentNumber: "TRAY-02",
            maxWeightCapacityGrams: 400,
            maxItemCapacity: 12,
            occupiedItemCount: 11,
            occupancyPercentage: 92,
            status: "NEAR_CAPACITY",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "0192e350-0003-7000-8000-000000000003",
            lockerId: "0192e350-0002-7000-8000-000000000001",
            storeId: "0192e300-0001-7000-8000-000000000001",
            code: "COMP-01C",
            name: "High Carat Certified Gems",
            compartmentNumber: "TRAY-03",
            maxWeightCapacityGrams: 300,
            maxItemCapacity: 8,
            occupiedItemCount: 8,
            occupancyPercentage: 100,
            status: "FULL",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
      {
        id: "0192e350-0002-7000-8000-000000000002",
        vaultId: "0192e350-0001-7000-8000-000000000001",
        storeId: "0192e300-0001-7000-8000-000000000001",
        code: "LCK-02",
        name: "Gold & Platinum Bangles Safe",
        lockerNumber: "SAFE-A2",
        capacityRating: "150kg",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        compartments: [
          {
            id: "0192e350-0003-7000-8000-000000000004",
            lockerId: "0192e350-0002-7000-8000-000000000002",
            storeId: "0192e300-0001-7000-8000-000000000001",
            code: "COMP-02A",
            name: "22K Solid Gold Bangles",
            compartmentNumber: "TRAY-04",
            maxWeightCapacityGrams: 2000,
            maxItemCapacity: 20,
            occupiedItemCount: 4,
            occupancyPercentage: 20,
            status: "AVAILABLE",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ],
  },
];

export default function StoragePage() {
  const [vaults, setVaults] = useState<VaultHierarchyWithOccupancy[]>(
    SAMPLE_STORAGE_HIERARCHY,
  );

  useEffect(() => {
    // Optionally fetch live hierarchy if API is accessible in client environment
    async function loadLiveHierarchy() {
      try {
        const res = await fetch("/api/v1/storage/hierarchy", {
          credentials: "omit",
        });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.data) && body.data.length > 0) {
            setVaults(body.data);
          }
        }
      } catch {
        // Fallback to sample data for visual demonstration
      }
    }
    loadLiveHierarchy();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        padding: "1rem",
      }}
    >
      <StorageDirectoryView
        storeName="Flagship Retail Store"
        storeCode="TOR-FLAG-01"
        vaults={vaults}
      />
    </main>
  );
}
