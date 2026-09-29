import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { RecordPage } from './pages/RecordPage.jsx';
import { SetupNotice } from './components/SetupNotice.jsx';

export function App() {
  const onHistory = useMatch('/history');

  return (
    <div className={onHistory ? 'shell wide' : 'shell'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventory exit</p>
          <p className="brand">Transactions</p>
        </div>
        <NavLink className="navlink" to={onHistory ? '/' : '/history'}>
          {onHistory ? 'New entry' : 'History'}
        </NavLink>
      </header>
      <main>
        <SetupNotice />
        <Routes>
          <Route path="/" element={<RecordPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
