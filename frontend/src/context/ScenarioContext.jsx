import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiGet } from "../api";

const ScenarioContext = createContext();

export function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(
    () => localStorage.getItem("selectedScenario") || ""
  );

  // ✅ global scenario list (used by TopNav + ScenarioListPage)
  const [scenarios, setScenarios] = useState([]);

  // Globally selected order (for Gantt ↔ Auftragsrouting)
  const [selectedOrder, setSelectedOrder] = useState(() => {
    const storedOrder = localStorage.getItem("selectedOrder") || "";
    const storedOrderScenario = localStorage.getItem("selectedOrderScenario");
    const storedScenario = localStorage.getItem("selectedScenario");

    if (
      storedOrder &&
      storedOrderScenario &&
      storedScenario &&
      storedOrderScenario === storedScenario
    ) {
      return storedOrder;
    }
    return "";
  });

  // Persist scenario
  useEffect(() => {
    if (scenario) {
      localStorage.setItem("selectedScenario", scenario);
    } else {
      localStorage.removeItem("selectedScenario");
    }
  }, [scenario]);

  // Keep selectedOrder bound to current scenario
  useEffect(() => {
    const storedScenarioForOrder = localStorage.getItem("selectedOrderScenario");

    if (!scenario) {
      setSelectedOrder("");
      localStorage.removeItem("selectedOrder");
      localStorage.removeItem("selectedOrderScenario");
      return;
    }

    if (storedScenarioForOrder && storedScenarioForOrder !== scenario) {
      // Scenario changed → reset order
      setSelectedOrder("");
      localStorage.removeItem("selectedOrder");
    }

    localStorage.setItem("selectedOrderScenario", scenario);
  }, [scenario]);

  // Persist selectedOrder
  useEffect(() => {
    if (selectedOrder && scenario) {
      localStorage.setItem("selectedOrder", selectedOrder);
      localStorage.setItem("selectedOrderScenario", scenario);
    } else {
      localStorage.removeItem("selectedOrder");
    }
  }, [selectedOrder, scenario]);

  // ✅ reload scenarios from backend (used by pages + topnav)
  const refreshScenarios = useCallback(async () => {
    const res = await apiGet("/scenarios/list");
    const list = res.scenarios || [];
    setScenarios(list);

    // if active scenario no longer exists, reset it
    if (scenario && !list.includes(scenario)) {
      setScenario("");
    }

    return list;
  }, [scenario]);

  // initial load
  useEffect(() => {
    refreshScenarios().catch(() => {});
  }, [refreshScenarios]);

  return (
    <ScenarioContext.Provider
      value={{
        scenario,
        setScenario,
        scenarios,
        setScenarios,
        refreshScenarios,
        selectedOrder,
        setSelectedOrder,
      }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
