// src/context/GlobalFiltersContext.jsx
import { createContext, useContext, useState } from "react";

const GlobalFiltersContext = createContext();

export function GlobalFiltersProvider({ children }) {
  const [filters, setFilters] = useState({
    machines: [],        // MULTI-SELECT (empty = Top-10 default)
    priority: "all",
    outsourcing: "all",
    deadline: "all",
    dateStart: null,
    dateEnd: null,
  });

  const [machineList, setMachineList] = useState([]);

  const applyFilters = (newValues) => {
    setFilters((prev) => ({ ...prev, ...newValues }));
  };

  return (
    <GlobalFiltersContext.Provider
      value={{
        filters,
        applyFilters,
        machineList,
        setMachineList,
      }}
    >
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export const useGlobalFilters = () => useContext(GlobalFiltersContext);
