import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type ApplicationLayoutProps = {
  children: ReactNode;
};

export function ApplicationLayout({ children }: ApplicationLayoutProps) {
  return (
    <div className="application-layout">
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <header className="application-header">
        <Link className="application-header__brand" to="/" aria-label="메타무브짐 홈">
          메타무브짐
        </Link>
      </header>
      {children}
    </div>
  );
}
