import { Link, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={(
          <main>
            <h1>좋은 트레이너가 오래 성장하는 시스템.</h1>
            <Link to="/apply">지원서 작성하기</Link>
          </main>
        )}
      />
      <Route path="/apply" element={<main><h1>지원서</h1></main>} />
    </Routes>
  );
}
