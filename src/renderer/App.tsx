import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import HubLibrary from "./screens/HubLibrary";
import LiveRun from "./screens/LiveRun";
import Report from "./screens/Report";

function App(): JSX.Element {
	return (
		<HashRouter>
			<div className="otl-app">
				<Sidebar />
				<main className="otl-main">
					<Routes>
						<Route path="/" element={<Navigate to="/scenarios" replace />} />
						<Route path="/scenarios" element={<HubLibrary />} />
						<Route path="/run/:runId" element={<LiveRun />} />
						<Route path="/report/:runId" element={<Report />} />
					</Routes>
				</main>
			</div>
		</HashRouter>
	);
}

export default App;
