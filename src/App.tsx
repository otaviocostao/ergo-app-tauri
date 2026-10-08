import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import "./App.css";
import { AuthProvider } from "./auth/AuthContext";
import ReminderAlerts from "./components/Reminder/ReminderAlerts";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ReminderAlerts />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

