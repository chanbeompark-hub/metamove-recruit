import { Link, Route, Routes } from 'react-router-dom';
import { MobileApplyBar } from '../components/public/MobileApplyBar';
import { PublicFooter } from '../components/public/PublicFooter';
import { PublicHeader } from '../components/public/PublicHeader';

export function App() {
  return (
    <>
      <PublicHeader />
      <Routes>
        <Route
          path="/"
          element={(
            <main id="main-content" tabIndex={-1}>
              <h1>좋은 트레이너가 오래 성장하는 시스템.</h1>
              <Link to="/apply">지원서 작성하기</Link>
            </main>
          )}
        />
        <Route path="/apply" element={<main id="main-content" tabIndex={-1}><h1>지원서</h1></main>} />
      </Routes>
      <PublicFooter />
      <MobileApplyBar />
    </>
  );
}
