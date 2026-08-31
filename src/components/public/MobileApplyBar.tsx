import { Link } from 'react-router-dom';

export function MobileApplyBar() {
  return (
    <aside className="mobile-apply-bar" aria-label="지원 안내">
      <Link className="mobile-apply-bar__link" to="/apply">지원하기</Link>
    </aside>
  );
}
