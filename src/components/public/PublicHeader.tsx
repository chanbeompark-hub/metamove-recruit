import { Link } from 'react-router-dom';

const navigationItems = [
  { label: '메타무브짐', href: '/#metamove' },
  { label: '성장과 비전', href: '/#vision' },
  { label: '대표 소개', href: '/#representatives' },
  { label: '혜택·규정', href: '/#benefits-rules' },
  { label: '채용 포지션', href: '/#positions' },
] as const;

export function PublicHeader() {
  return (
    <header className="public-header">
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <div className="public-header__inner">
        <a className="public-header__brand" href="/#metamove" aria-label="메타무브짐 홈">
          메타무브짐
        </a>
        <nav className="public-nav" aria-label="주요 메뉴">
          <div className="public-nav__sections">
            {navigationItems.map((item) => (
              <a
                className="public-nav__section-link"
                href={item.href}
                key={item.href}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
              >
                {item.label}
              </a>
            ))}
          </div>
          <Link className="public-header__apply" to="/apply">지원하기</Link>
        </nav>
      </div>
    </header>
  );
}
