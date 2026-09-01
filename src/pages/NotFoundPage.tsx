import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="route-not-found" id="main-content" tabIndex={-1}>
      <h1>페이지를 찾을 수 없습니다</h1>
      <Link to="/">홈으로 돌아가기</Link>
    </main>
  );
}
