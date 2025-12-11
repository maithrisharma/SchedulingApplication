import { createContext, useContext, useState, useEffect } from "react";

const ScenarioContext = createContext();

export function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(
    localStorage.getItem("selectedScenario") || ""
  );

  useEffect(() => {
    if (scenario) {
      localStorage.setItem("selectedScenario", scenario);
    }
  }, [scenario]);

  return (
    <ScenarioContext.Provider value={{ scenario, setScenario }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
