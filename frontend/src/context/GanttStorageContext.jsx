// frontend/src/context/GanttStorageContext.jsx
import { createContext, useContext } from "react";

const GanttStorageContext = createContext();

const STORAGE_KEY_DRAFT = "gantt_draft_plan";
const STORAGE_KEY_DIRTY = "gantt_dirty_map";
const STORAGE_KEY_OVERRIDES = "gantt_saved_overrides";

export function GanttStorageProvider({ children }) {
  const saveDraftToStorage = (scenario, draftPlan, dirtyMap, savedOverrideCount) => {
    if (!scenario) {
      console.warn("[GanttStorage] No scenario provided, skipping save");
      return;
    }

    try {
      const draftKey = `${STORAGE_KEY_DRAFT}_${scenario}`;
      const dirtyKey = `${STORAGE_KEY_DIRTY}_${scenario}`;
      const overrideKey = `${STORAGE_KEY_OVERRIDES}_${scenario}`;

      sessionStorage.setItem(draftKey, JSON.stringify(draftPlan));
      sessionStorage.setItem(dirtyKey, JSON.stringify(dirtyMap));
      sessionStorage.setItem(overrideKey, String(savedOverrideCount));

      console.log("[GanttStorage] Saved draft:", {
        scenario,
        draftCount: draftPlan.length,
        dirtyCount: Object.keys(dirtyMap).length,
        savedOverrides: savedOverrideCount
      });
    } catch (e) {
      console.error("[GanttStorage] Failed to save draft:", e);
    }
  };

  const loadDraftFromStorage = (scenario) => {
    if (!scenario) {
      console.warn("[GanttStorage] No scenario provided, skipping load");
      return null;
    }

    try {
      const draftKey = `${STORAGE_KEY_DRAFT}_${scenario}`;
      const dirtyKey = `${STORAGE_KEY_DIRTY}_${scenario}`;
      const overrideKey = `${STORAGE_KEY_OVERRIDES}_${scenario}`;

      const draftPlanStr = sessionStorage.getItem(draftKey);
      const dirtyMapStr = sessionStorage.getItem(dirtyKey);
      const savedOverrideCountStr = sessionStorage.getItem(overrideKey);

      if (!draftPlanStr) {
        console.log("[GanttStorage] No draft found for scenario:", scenario);
        return null;
      }

      const result = {
        draftPlan: draftPlanStr ? JSON.parse(draftPlanStr) : null,
        dirtyMap: dirtyMapStr ? JSON.parse(dirtyMapStr) : {},
        savedOverrideCount: savedOverrideCountStr ? parseInt(savedOverrideCountStr, 10) : 0,
      };

      console.log("[GanttStorage] Loaded draft:", {
        scenario,
        draftCount: result.draftPlan?.length || 0,
        dirtyCount: Object.keys(result.dirtyMap).length,
        savedOverrides: result.savedOverrideCount
      });

      return result;
    } catch (e) {
      console.error("[GanttStorage] Failed to load draft:", e);
      return null;
    }
  };

  const clearDraftFromStorage = (scenario) => {
    if (!scenario) {
      console.warn("[GanttStorage] No scenario provided, skipping clear");
      return;
    }

    try {
      const draftKey = `${STORAGE_KEY_DRAFT}_${scenario}`;
      const dirtyKey = `${STORAGE_KEY_DIRTY}_${scenario}`;
      const overrideKey = `${STORAGE_KEY_OVERRIDES}_${scenario}`;

      sessionStorage.removeItem(draftKey);
      sessionStorage.removeItem(dirtyKey);
      sessionStorage.removeItem(overrideKey);

      console.log("[GanttStorage] Cleared draft for scenario:", scenario);
    } catch (e) {
      console.error("[GanttStorage] Failed to clear draft:", e);
    }
  };

  const hasDraftInStorage = (scenario) => {
    if (!scenario) return false;

    try {
      const draftKey = `${STORAGE_KEY_DRAFT}_${scenario}`;
      return sessionStorage.getItem(draftKey) !== null;
    } catch (e) {
      console.error("[GanttStorage] Failed to check draft:", e);
      return false;
    }
  };

  const clearAllGanttStorage = () => {
    try {
      const keys = Object.keys(sessionStorage);
      let cleared = 0;

      for (const key of keys) {
        if (
          key.startsWith(STORAGE_KEY_DRAFT) ||
          key.startsWith(STORAGE_KEY_DIRTY) ||
          key.startsWith(STORAGE_KEY_OVERRIDES)
        ) {
          sessionStorage.removeItem(key);
          cleared++;
        }
      }

      console.log("[GanttStorage] Cleared all Gantt storage:", cleared, "keys");
    } catch (e) {
      console.error("[GanttStorage] Failed to clear all storage:", e);
    }
  };

  const value = {
    saveDraftToStorage,
    loadDraftFromStorage,
    clearDraftFromStorage,
    hasDraftInStorage,
    clearAllGanttStorage,
  };

  return (
    <GanttStorageContext.Provider value={value}>
      {children}
    </GanttStorageContext.Provider>
  );
}

export function useGanttStorage() {
  const context = useContext(GanttStorageContext);
  if (!context) {
    throw new Error("useGanttStorage must be used within a GanttStorageProvider");
  }
  return context;
}