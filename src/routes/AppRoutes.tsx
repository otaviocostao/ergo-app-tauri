import { Routes, Route } from "react-router-dom";
import MainLayout from "../components/MainLayout";
import Home from "../pages/Home";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
