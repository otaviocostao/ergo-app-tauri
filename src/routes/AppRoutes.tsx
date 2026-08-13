import { Routes, Route } from "react-router-dom";
import MainLayout from "../components/MainLayout";
import Home from "../pages/Home";
import Reminders from "../pages/Reminders";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/settings" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
