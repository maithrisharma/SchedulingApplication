// src/context/SelectionContext.jsx
import { createContext, useContext, useState, useEffect } from "react";

const SelectionContext = createContext();

const STORAGE_KEY = "machineContextSelection";

export function SelectionProvider({ children }) {
  const [selection, setSelection] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });

  const [ganttZoom, setGanttZoom] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ganttZoom")) || null;
    } catch {
      return null;
    }
  });

  /* Persist selection */
  useEffect(() => {
    if (selection) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    }
  }, [selection]);

  /* Persist zoom */
  useEffect(() => {
    if (ganttZoom) {
      localStorage.setItem("ganttZoom", JSON.stringify(ganttZoom));
    }
  }, [ganttZoom]);

  return (
    <SelectionContext.Provider
      value={{
        selection,
        setSelection,
        ganttZoom,
        setGanttZoom,
        clearSelection: () => setSelection(null),
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  return useContext(SelectionContext);
}
