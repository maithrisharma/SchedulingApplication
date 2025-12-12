import { createContext, useContext, useState, useEffect } from "react";

const ScenarioContext = createContext();

export function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(
    () => localStorage.getItem("selectedScenario") || ""
  );

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
    }
  }, [scenario]);

  // Keep selectedOrder bound to current scenario
  useEffect(() => {
    const storedScenarioForOrder = localStorage.getItem(
      "selectedOrderScenario"
    );

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

  return (
    <ScenarioContext.Provider
      value={{ scenario, setScenario, selectedOrder, setSelectedOrder }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
