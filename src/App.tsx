import { Route, Routes } from 'react-router-dom';

import { NavBar } from './components/NavBar';
import { About } from './routes/About';
import { Atlas } from './routes/Atlas';
import { Garage } from './routes/Garage';
import { Pumps } from './routes/Pumps';
import { Report } from './routes/Report';
import { SignIn } from './routes/SignIn';
import { StationDetail } from './routes/StationDetail';

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Pumps />} />
          <Route path="/atlas" element={<Atlas />} />
          <Route path="/report" element={<Report />} />
          <Route path="/garage" element={<Garage />} />
          <Route path="/station/:id" element={<StationDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="*" element={<Pumps />} />
        </Routes>
      </main>
    </div>
  );
}
