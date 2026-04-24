import { Routes, Route } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { HelpWidget } from "./components/help/HelpWidget";
import { BoardPage } from "./pages/BoardPage";
import { StatsPage } from "./pages/StatsPage";
import { FilesPage } from "./pages/FilesPage";

function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<BoardPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/files" element={<FilesPage />} />
          </Routes>
        </main>
        <Sidebar />
      </div>
      <HelpWidget />
    </div>
  );
}

export default App;
