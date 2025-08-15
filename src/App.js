import { Routes, Route } from "react-router-dom";
import OverviewDashboard from "./components/Overviewdashboard";
import Uploadpage from "./components/Uploadpage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Uploadpage />} />
      <Route path="/overview" element={<OverviewDashboard />} />
    </Routes>
  );
}
